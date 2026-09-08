import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 195 acceptance tests: cash projection, delay prediction,
 * process mining and replenishment (AI-006/007/009/011).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 195 — predictive insights', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s195a', subject: 'idp|s195-admin' });

  let lampId = '';
  let bulbId = '';
  let warehouseId = '';

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

  async function makeSku(code: string, name: string): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${name} Standard`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "rfq_quote", "rfq", "work_order_operation", "work_order",
       "mrp_suggestion", "mrp_run", "planning_policy",
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
       "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
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
      slug: 'test-s195a',
      name: 'Sprint195 Tenant',
      initialAdmin: {
        email: 'admin@s195a.example',
        displayName: 'S195 Admin',
        idpSubject: 'idp|s195-admin',
      },
    });
    lampId = await makeSku('LAMP195', 'Lamp195');
    bulbId = await makeSku('BULB195', 'Bulb195');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-195',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH195',
      name: 'Sprint195 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s195-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('AI-011: replenishment recommends covering 30 days of demand', async () => {
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'ISSUE',
      quantity: 14,
      idempotencyKey: 'ai-195-issue',
    });
    const recs = await api('GET', '/api/v1/insights/replenishment', tokenA);
    expect(recs.status).toBe(200);
    const row = (recs.body.rows as Array<Record<string, unknown>>).find((r) => r.skuId === bulbId);
    // 0.5/day → 15 needed for 30d, 6 on hand → suggest 9.
    expect(row?.risk).toBe('MEDIUM');
    expect(row?.suggestedQty).toBe('9');
  });

  it('AI-006: running work orders past their routed estimate predict late', async () => {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 2,
    });
    await api('POST', `/api/v1/work-orders/${wo.body.id}/release`, tokenA);
    await api('POST', `/api/v1/work-orders/${wo.body.id}/start`, tokenA);
    const delays = await api('GET', '/api/v1/insights/production-delays', tokenA);
    expect(delays.status).toBe(200);
    const rows = delays.body.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    // Just started: elapsed ≈ 0 < estimate (2 min/unit × 2) → not late yet.
    expect(rows[0]?.predictedLate).toBe(false);
  });

  it('AI-009: process mining ranks observed order-event paths', async () => {
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Rudar',
      company: 'Rudarstvo d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId: bulbId,
      quantity: 1,
      unitPrice: 5,
    });
    await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA, {});

    const paths = await api('GET', '/api/v1/insights/process-paths', tokenA);
    expect(paths.status).toBe(200);
    const rows = paths.body.paths as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(String(rows[0]?.path)).toContain('order.created');
  });

  it('AI-007: the cash projection buckets open positions by due date', async () => {
    const projection = await api('GET', '/api/v1/insights/cash-projection', tokenA);
    expect(projection.status).toBe(200);
    expect(projection.body.netOpen).toBe('0.00');
    expect((projection.body.buckets as unknown[]).length).toBe(4);
  });
});
