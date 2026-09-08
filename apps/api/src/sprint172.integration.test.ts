import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 172 acceptance tests: machine gateway (DEV-013/014) — edge
 * gateways authenticate as registered devices and push machine events
 * through the shop-floor public interface, idempotently.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 172 — machine gateway', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s172a', subject: 'idp|s172-admin' });

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
      slug: 'test-s172a',
      name: 'Sprint172 Tenant',
      initialAdmin: {
        email: 'admin@s172a.example',
        displayName: 'S172 Admin',
        idpSubject: 'idp|s172-admin',
      },
    });
    lampId = await makeSku('LAMP172', 'Lamp172');
    bulbId = await makeSku('BULB172', 'Bulb172');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-172',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH172',
      name: 'Sprint172 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s172-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let gatewayToken = '';

  it('DEV-013/014: a device-authenticated gateway pushes machine events', async () => {
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'CNC-172',
      name: 'CNC 172',
    });
    const gateway = await api('POST', '/api/v1/devices', tokenA, {
      code: 'GW-172',
      name: 'Gateway 172',
      deviceType: 'OTHER',
    });
    gatewayToken = gateway.body.enrollmentToken as string;
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: gatewayToken,
      appVersion: '1.0.0',
    });

    const count = await api('POST', '/api/v1/devices/machine-events', tokenA, {
      enrollmentToken: gatewayToken,
      workCenterCode: 'CNC-172',
      eventId: 'gw-001',
      eventType: 'COUNT',
      value: 12,
    });
    expect(count.status).toBe(201);
    expect(count.body.duplicate).toBe(false);

    const replay = await api('POST', '/api/v1/devices/machine-events', tokenA, {
      enrollmentToken: gatewayToken,
      workCenterCode: 'CNC-172',
      eventId: 'gw-001',
      eventType: 'COUNT',
      value: 12,
    });
    expect(replay.body.duplicate).toBe(true);

    const counters = await api('GET', '/api/v1/shopfloor/machine-counters', tokenA);
    const row = (counters.body.counters as Array<Record<string, unknown>>).find(
      (c) => c.workCenter === 'CNC-172',
    );
    expect(row?.count).toBe(12);
  });

  it('DEV-013/014: DOWN signals from the gateway book downtime', async () => {
    const down = await api('POST', '/api/v1/devices/machine-events', tokenA, {
      enrollmentToken: gatewayToken,
      workCenterCode: 'CNC-172',
      eventId: 'gw-002',
      eventType: 'DOWN',
      value: 30,
    });
    expect(down.status).toBe(201);
    expect(down.body.downtimeMinutes).toBe(30);
  });

  it('DEV-013/014: unknown tokens are refused', async () => {
    const denied = await api('POST', '/api/v1/devices/machine-events', tokenA, {
      enrollmentToken: 'xxxxxxxxxxxx',
      workCenterCode: 'CNC-172',
      eventId: 'gw-003',
      eventType: 'UP',
    });
    expect(denied.status).toBe(401);
  });
});
