import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 177 acceptance tests: profitability analytics (BI-008) —
 * revenue, estimated standard cost and margin per sales channel.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 177 — profitability analytics', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s177a', subject: 'idp|s177-admin' });

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
      slug: 'test-s177a',
      name: 'Sprint177 Tenant',
      initialAdmin: {
        email: 'admin@s177a.example',
        displayName: 'S177 Admin',
        idpSubject: 'idp|s177-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH177',
      name: 'Sprint177 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK177',
      name: 'PAK177 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK177-STD',
      name: 'PAK177 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s177',
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

  it('BI-008: profitability reports revenue, cost and margin per channel', async () => {
    await api('POST', `/api/v1/finance/valuation/skus/${skuId}/cost`, tokenA, { cost: 3 });
    const report = await api('GET', '/api/v1/analytics/profitability', tokenA);
    expect(report.status).toBe(200);
    const rows = report.body.rows as Array<Record<string, unknown>>;
    const direct = rows.find((r) => r.channel === 'direct');
    expect(direct?.orders).toBe(1);
    // Setup order: 2 pcs @ 5 = 10 revenue; cost 2 × 3 = 6 → margin 4 (40%).
    expect(Number(direct?.revenue)).toBe(10);
    expect(Number(direct?.estCost)).toBe(6);
    expect(Number(direct?.margin)).toBe(4);
    expect(direct?.marginPct).toBe('40.0');
  });

  it('BI-008: channels sort by revenue', async () => {
    const web = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      channel: 'webshop',
    });
    await api('POST', `/api/v1/orders/${web.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
      unitPrice: 5,
    });
    const report = await api('GET', '/api/v1/analytics/profitability', tokenA);
    const rows = report.body.rows as Array<Record<string, unknown>>;
    expect(rows[0]?.channel).toBe('webshop');
    expect(Number(rows[0]?.revenue)).toBe(50);
  });

  it('AUTHZ: profitability needs analytics.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s177a', subject: 'idp|s177-nobody' });
    const denied = await api('GET', '/api/v1/analytics/profitability', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
