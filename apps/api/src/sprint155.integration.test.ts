import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 155 acceptance tests: machine hooks (MES-025) — machines
 * report counts and state per work center, idempotently per event id;
 * DOWN signals book breakdown downtime automatically.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 155 — machine hooks', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s155a', subject: 'idp|s155-admin' });

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
      slug: 'test-s155a',
      name: 'Sprint155 Tenant',
      initialAdmin: {
        email: 'admin@s155a.example',
        displayName: 'S155 Admin',
        idpSubject: 'idp|s155-admin',
      },
    });
    lampId = await makeSku('LAMP155', 'Lamp155');
    bulbId = await makeSku('BULB155', 'Bulb155');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-155',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH155',
      name: 'Sprint155 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s155-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MES-025: COUNT events accumulate per center, idempotently', async () => {
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'CNC-155',
      name: 'CNC 155',
    });
    const first = await api('POST', '/api/v1/shopfloor/machine-events', tokenA, {
      workCenterCode: 'CNC-155',
      eventId: 'evt-001',
      eventType: 'COUNT',
      value: 25,
    });
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const retry = await api('POST', '/api/v1/shopfloor/machine-events', tokenA, {
      workCenterCode: 'CNC-155',
      eventId: 'evt-001',
      eventType: 'COUNT',
      value: 25,
    });
    expect(retry.body.duplicate).toBe(true);

    await api('POST', '/api/v1/shopfloor/machine-events', tokenA, {
      workCenterCode: 'CNC-155',
      eventId: 'evt-002',
      eventType: 'COUNT',
      value: 15,
    });
    const counters = await api('GET', '/api/v1/shopfloor/machine-counters', tokenA);
    const row = (counters.body.counters as Array<Record<string, unknown>>).find(
      (c) => c.workCenter === 'CNC-155',
    );
    expect(row?.count).toBe(40);
    expect(row?.events).toBe(2);
  });

  it('MES-025: DOWN signals book breakdown downtime', async () => {
    const down = await api('POST', '/api/v1/shopfloor/machine-events', tokenA, {
      workCenterCode: 'CNC-155',
      eventId: 'evt-003',
      eventType: 'DOWN',
      value: 45,
    });
    expect(down.status).toBe(201);
    expect(down.body.downtimeMinutes).toBe(45);

    const downtime = await api('GET', '/api/v1/shopfloor/downtime', tokenA);
    const rows = downtime.body.downtime as Array<Record<string, unknown>>;
    expect(rows.some((d) => d.category === 'BREAKDOWN' && d.minutes === 45)).toBe(true);
  });

  it('MES-025: validation — unknown centers and bad counts', async () => {
    const ghost = await api('POST', '/api/v1/shopfloor/machine-events', tokenA, {
      workCenterCode: 'GHOST-1',
      eventId: 'evt-009',
      eventType: 'COUNT',
      value: 1,
    });
    expect(ghost.status).toBe(404);

    const bad = await api('POST', '/api/v1/shopfloor/machine-events', tokenA, {
      workCenterCode: 'CNC-155',
      eventId: 'evt-010',
      eventType: 'COUNT',
      value: 0,
    });
    expect(bad.status).toBe(400);
  });

  it('AUTHZ: machine hooks need production.execute', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s155a', subject: 'idp|s155-nobody' });
    const denied = await api('POST', '/api/v1/shopfloor/machine-events', stranger, {
      workCenterCode: 'CNC-155',
      eventId: 'evt-011',
      eventType: 'UP',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
