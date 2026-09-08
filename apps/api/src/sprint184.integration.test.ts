import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 184 acceptance tests: semantic layer, report builder and
 * drill-through (BI-004/005/007) — ad-hoc reports run only over the
 * governed model, and grouped rows drill to their records.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 184 — semantic reports', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s184a', subject: 'idp|s184-admin' });

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
      slug: 'test-s184a',
      name: 'Sprint184 Tenant',
      initialAdmin: {
        email: 'admin@s184a.example',
        displayName: 'S184 Admin',
        idpSubject: 'idp|s184-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH184',
      name: 'Sprint184 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK184',
      name: 'PAK184 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK184-STD',
      name: 'PAK184 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s184',
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

  it('BI-004/005: reports run over modeled dimensions and measures only', async () => {
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

    const model = await api('GET', '/api/v1/analytics/semantic-model', tokenA);
    expect(model.status).toBe(200);
    expect(
      (model.body.model as Record<string, { dimensions: string[] }>).orders?.dimensions,
    ).toContain('channel');

    const byChannel = await api('POST', '/api/v1/analytics/reports', tokenA, {
      dataset: 'orders',
      groupBy: 'channel',
      measure: 'sum:total',
    });
    expect(byChannel.status).toBe(201);
    const rows = byChannel.body.rows as Array<{ group: string; value: number }>;
    expect(rows.find((r) => r.group === 'webshop')?.value).toBe(50);
    expect(rows.find((r) => r.group === 'direct')?.value).toBe(10);

    const counts = await api('POST', '/api/v1/analytics/reports', tokenA, {
      dataset: 'orders',
      groupBy: 'status',
      measure: 'count',
    });
    const total = (counts.body.rows as Array<{ value: number }>).reduce(
      (acc, r) => acc + r.value,
      0,
    );
    expect(total).toBe(2);

    const unmodeled = await api('POST', '/api/v1/analytics/reports', tokenA, {
      dataset: 'orders',
      groupBy: 'accountId',
      measure: 'count',
    });
    expect(unmodeled.status).toBe(400);
    const badMeasure = await api('POST', '/api/v1/analytics/reports', tokenA, {
      dataset: 'orders',
      groupBy: 'channel',
      measure: 'sum:createdBy',
    });
    expect(badMeasure.status).toBe(400);
  });

  it('BI-007: drill-through returns the records behind one grouped row', async () => {
    const drill = await api('POST', '/api/v1/analytics/reports/drill', tokenA, {
      dataset: 'orders',
      groupBy: 'channel',
      groupValue: 'webshop',
    });
    expect(drill.status).toBe(201);
    const rows = drill.body.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe('webshop');
    expect(rows[0]?.orderNumber).toContain('SO-');
  });

  it('AUTHZ: reports need analytics.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s184a', subject: 'idp|s184-nobody' });
    const denied = await api('POST', '/api/v1/analytics/reports', stranger, {
      dataset: 'orders',
      groupBy: 'channel',
      measure: 'count',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
