import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 118 acceptance tests: reconciliation (INT-014) — published
 * outbox events compared against webhook fan-out and delivery
 * outcomes per event type.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 118 — reconciliation', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s118a', subject: 'idp|s118-admin' });

  async function api(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string,
    payload?: unknown,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${token}`,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });
    return { status: response.statusCode, body: response.json() as Record<string, unknown> };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "rfq_quote", "rfq",
       "webhook_delivery", "webhook_subscription",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
       "stock_reservation", "stock_movement", "warehouse_location", "warehouse",
       "uom_conversion", "barcode", "sku", "product",
       "party_external_identity", "party",
       "processed_event", "rule_version", "rule_definition",
       "workflow_instance", "workflow_version", "workflow_definition",
       "approval", "task", "notification", "terminology_entry",
       "module_activation", "custom_field_definition",
       "document_template_version", "document_template",
       "outbox_event", "audit_event", "user_role_assignment", "role_permission",
       "role", "user", "branch", "factory", "business_unit", "legal_entity",
       "tenant_configuration_version", "tenant" CASCADE`,
    );
    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s118a',
      name: 'Sprint118 Tenant',
      initialAdmin: {
        email: 'admin@s118a.example',
        displayName: 'S118 Admin',
        idpSubject: 'idp|s118-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'shop-main', kind: 'commerce', adapter: 'noop', config: {} },
            { key: 'acct-main', kind: 'accounting', adapter: 'noop', config: {} },
          ],
        },
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH118',
      name: 'Sprint118 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'CHN118',
      name: 'CHN118 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'CHN118-STD',
      name: 'CHN118 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 15,
      idempotencyKey: 'receipt-s118',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('INT-014: the report counts published, fanned-out and outcome per event type', async () => {
    // A business action publishes an outbox event.
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Rekon Kupac',
      company: 'Rekon d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const warehouses = await api('GET', '/api/v1/warehouses', tokenA);
    await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: (warehouses.body.warehouses as Array<{ id: string }>)[0]?.id,
      currency: 'EUR',
    });

    // A subscription to an unreachable endpoint: fan-out happens, delivery cannot.
    await api('POST', '/api/v1/integrations/webhooks', tokenA, {
      name: 'Nedostupan sistem',
      url: 'http://127.0.0.1:9/hook',
      eventTypes: ['order.created'],
    });
    await api('POST', '/api/v1/integrations/process', tokenA);

    const report = await api('GET', '/api/v1/integrations/reconciliation?days=7', tokenA);
    expect(report.status).toBe(200);
    const rows = report.body.report as Array<{
      eventType: string;
      published: number;
      fannedOut: number;
      delivered: number;
      failed: number;
      pending: number;
    }>;
    const orderCreated = rows.find((r) => r.eventType === 'order.created');
    expect(orderCreated?.published).toBe(1);
    expect(orderCreated?.fannedOut).toBe(1);
    expect(orderCreated?.delivered).toBe(0);
    expect((orderCreated?.failed ?? 0) + (orderCreated?.pending ?? 0)).toBe(1);
  });

  it('AUTHZ: reconciliation needs integration.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s118a', subject: 'idp|s118-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko118@primjer.example',
      displayName: 'Niko118',
      idpSubject: 'idp|s118-nobody',
    });
    const denied = await api('GET', '/api/v1/integrations/reconciliation', stranger);
    expect(denied.status).toBe(403);
  });
});
