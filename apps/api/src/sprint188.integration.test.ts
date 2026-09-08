import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 188 acceptance tests: DR drill, support portal, status page
 * and cost observability (OPS-013/015/016/018).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 188 — ops hardening', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s188a', subject: 'idp|s188-admin' });

  let orderId = '';
  let accountId = '';
  let warehouseId = '';
  let skuId = '';

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
      `TRUNCATE TABLE "package_line", "package", "landed_cost", "rfq_quote", "rfq",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
       "wms_order_line", "wms_order", "scan_event", "device",
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
      slug: 'test-s188a',
      name: 'Sprint188 Tenant',
      initialAdmin: {
        email: 'admin@s188a.example',
        displayName: 'S188 Admin',
        idpSubject: 'idp|s188-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH188',
      name: 'Sprint188 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK188',
      name: 'PAK188 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK188-STD',
      name: 'PAK188 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s188',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stotri',
      company: 'Stotri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
    warehouseId = warehouse.body.id as string;
    skuId = sku.body.id as string;
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId,
      quantity: 2,
      unitPrice: 5,
    });
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('OPS-016: the public status endpoint reports component states', async () => {
    const status = await api('GET', '/status', tokenA);
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('operational');
    const components = status.body.components as Record<string, string>;
    expect(components.api).toBe('operational');
    expect(components.database).toBe('operational');
  });

  it('OPS-015: platform operators see open support cases across tenants', async () => {
    const created = await api('POST', '/api/v1/support-cases', tokenA, {
      subject: 'Skener ne radi',
      priority: 'HIGH',
      accountId,
    });
    expect(created.status).toBe(201);

    const portal = await api('GET', '/api/v1/platform/support/cases', platformToken);
    expect(portal.status).toBe(200);
    const rows = portal.body.cases as Array<Record<string, unknown>>;
    expect(rows.some((c) => c.subject === 'Skener ne radi' && c.tenant === 'test-s188a')).toBe(
      true,
    );

    const denied = await api('GET', '/api/v1/platform/support/cases', tokenA);
    expect(denied.status).toBe(403);
  });

  it('OPS-018: cost observability estimates per-tenant spend from usage', async () => {
    const costs = await api('GET', '/api/v1/platform/costs', platformToken);
    expect(costs.status).toBe(200);
    expect((costs.body.rates as Record<string, unknown>).perUser).toBe(1);
    const row = (costs.body.tenants as Array<Record<string, unknown>>).find(
      (t) => t.tenant === 'test-s188a',
    );
    expect(Number(row?.users)).toBeGreaterThan(0);
    expect(Number(row?.estimatedMonthly)).toBeGreaterThan(0);
  });
});
