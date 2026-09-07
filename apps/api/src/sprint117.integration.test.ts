import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 117 acceptance tests: marketplace adapters (COM-005) — orders
 * pulled through the connector port land as DRAFT sales orders exactly
 * once per external reference.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 117 — marketplace import', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s117a', subject: 'idp|s117-admin' });

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
      slug: 'test-s117a',
      name: 'Sprint117 Tenant',
      initialAdmin: {
        email: 'admin@s117a.example',
        displayName: 'S117 Admin',
        idpSubject: 'idp|s117-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH117',
      name: 'Sprint117 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'MKT117',
      name: 'MKT117 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'MKT117-STD',
      name: 'MKT117 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Marketplace Kupac',
      company: 'Marketplace d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            {
              key: 'market-main',
              kind: 'commerce',
              adapter: 'noop',
              config: {
                accountId: converted.body.accountId,
                warehouseId: warehouse.body.id,
                sampleOrders: [
                  {
                    externalRef: 'MKT-1001',
                    lines: [{ code: 'MKT117-STD', quantity: 2 }],
                  },
                  {
                    externalRef: 'MKT-1002',
                    lines: [{ code: 'MKT117-STD', quantity: 5 }],
                  },
                ],
              },
            },
          ],
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('COM-005: pulled orders land as DRAFT sales orders exactly once', async () => {
    const first = await api('POST', '/api/v1/connectors/market-main/import-orders', tokenA);
    expect(first.status).toBe(201);
    expect(first.body.imported).toBe(2);
    expect(first.body.skipped).toBe(0);

    const orders = await api('GET', '/api/v1/orders', tokenA);
    const rows = orders.body.orders as Array<{ status: string }>;
    expect(rows.filter((o) => o.status === 'DRAFT')).toHaveLength(2);

    // Re-import: nothing duplicates.
    const again = await api('POST', '/api/v1/connectors/market-main/import-orders', tokenA);
    expect(again.body.imported).toBe(0);
    expect(again.body.skipped).toBe(2);
    const ordersAfter = await api('GET', '/api/v1/orders', tokenA);
    expect((ordersAfter.body.orders as unknown[]).length).toBe(2);
  });

  it('COM-005: non-commerce connectors refuse order import', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [{ key: 'acct-x', kind: 'accounting', adapter: 'noop', config: {} }],
        },
      },
    });
    const refused = await api('POST', '/api/v1/connectors/acct-x/import-orders', tokenA);
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: order import needs integration.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s117a', subject: 'idp|s117-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko117@primjer.example',
      displayName: 'Niko117',
      idpSubject: 'idp|s117-nobody',
    });
    const denied = await api('POST', '/api/v1/connectors/market-main/import-orders', stranger);
    expect(denied.status).toBe(403);
  });
});
