import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 194 acceptance tests: explainable AI insights
 * (AI-004/005/008/010/014) — demand forecast, stockout risk,
 * bottlenecks and anomalies, each with its method attached and every
 * run audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 194 — AI insights', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s194a', subject: 'idp|s194-admin' });

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
      slug: 'test-s194a',
      name: 'Sprint194 Tenant',
      initialAdmin: {
        email: 'admin@s194a.example',
        displayName: 'S194 Admin',
        idpSubject: 'idp|s194-admin',
      },
    });
    lampId = await makeSku('LAMP194', 'Lamp194');
    bulbId = await makeSku('BULB194', 'Bulb194');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-194',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH194',
      name: 'Sprint194 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s194-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('AI-004: demand forecast projects the 28-day ISSUE average', async () => {
    // Consume 14 bulbs over the window → 0.5/day.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'ISSUE',
      quantity: 14,
      idempotencyKey: 'ai-194-issue',
    });
    const forecast = await api('GET', `/api/v1/insights/demand/${bulbId}`, tokenA);
    expect(forecast.status).toBe(200);
    expect(forecast.body.avgDailyDemand).toBe('0.500');
    expect(forecast.body.forecast7).toBe('3.500');
    expect(forecast.body.explanation).toContain('moving average');

    const ghost = await api(
      'GET',
      '/api/v1/insights/demand/00000000-0000-0000-0000-000000000000',
      tokenA,
    );
    expect(ghost.status).toBe(404);
  });

  it('AI-005: stockout risk ranks SKUs by days of cover', async () => {
    const risk = await api('GET', '/api/v1/insights/stockout-risk', tokenA);
    expect(risk.status).toBe(200);
    const rows = risk.body.rows as Array<Record<string, unknown>>;
    const bulb = rows.find((r) => r.skuId === bulbId);
    // 20 received - 14 issued = 6 on hand; 0.5/day → 12 days cover → MEDIUM.
    expect(bulb?.onHand).toBe('6.000');
    expect(bulb?.daysOfCover).toBe('12.0');
    expect(bulb?.risk).toBe('MEDIUM');
  });

  it('AI-010: bottlenecks rank open operation queues per center', async () => {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 3,
    });
    expect(wo.status).toBe(201);
    const bottlenecks = await api('GET', '/api/v1/insights/bottlenecks', tokenA);
    expect(bottlenecks.status).toBe(200);
    const rows = bottlenecks.body.rows as Array<Record<string, unknown>>;
    expect(rows[0]?.workCenter).toBe('BENCH-194');
    expect(Number(rows[0]?.openOperations)).toBeGreaterThan(0);
  });

  it('AI-008/014: anomalies flag unusual volume and every insight is audited', async () => {
    const anomalies = await api('GET', '/api/v1/insights/anomalies', tokenA);
    expect(anomalies.status).toBe(200);
    expect(anomalies.body.explanation).toContain('baseline');

    const audits = await prisma.auditEvent.groupBy({
      by: ['objectId'],
      where: { action: 'ai.insight' },
      _count: { _all: true },
    });
    const kinds = audits.map((a) => a.objectId).sort();
    expect(kinds).toEqual(['anomalies', 'bottlenecks', 'demand_forecast', 'stockout_risk']);
  });
});
