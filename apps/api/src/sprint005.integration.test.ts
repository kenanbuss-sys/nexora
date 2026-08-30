import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 005 acceptance tests (docs/implementation/SPRINT_005_DEVICE_WMS.md):
 * device registry + enrollment + health, verification envelope with
 * idempotent offline replay, and WMS execution documents (receiving,
 * transfer, count, pick) posting through the inventory ledger.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 005 — devices, verification, WMS execution', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s5a', subject: 'idp|s5-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s5b', subject: 'idp|s5b-admin' });

  let tenantAId = '';
  let warehouseId = '';
  let warehouse2Id = '';
  let skuId = '';
  let deviceToken = '';
  let deviceId = '';

  async function api(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string | null,
    payload?: unknown,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
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
      `TRUNCATE TABLE "wms_order_line", "wms_order", "scan_event", "device",
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

    const a = await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s5a',
      name: 'Sprint5 Tenant A',
      initialAdmin: {
        email: 'admin@s5a.example',
        displayName: 'S5 Admin',
        idpSubject: 'idp|s5-admin',
      },
    });
    tenantAId = (a.body.tenant as { id: string }).id;
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s5b',
      name: 'Sprint5 Tenant B',
      initialAdmin: {
        email: 'admin@s5b.example',
        displayName: 'S5B Admin',
        idpSubject: 'idp|s5b-admin',
      },
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCAN-01',
      name: 'Scannable',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'SCAN-01-STD',
      name: 'Scannable Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/barcodes', tokenA, { skuId, value: '3859890000012' });

    const wh1 = await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH1', name: 'Main' });
    warehouseId = wh1.body.id as string;
    const wh2 = await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH2', name: 'Backup' });
    warehouse2Id = wh2.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('DEV: register -> enroll -> heartbeat lifecycle with one-time token', async () => {
    const registered = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-01',
      name: 'Handheld 1',
      deviceType: 'SCANNER',
    });
    expect(registered.status).toBe(201);
    deviceToken = registered.body.enrollmentToken as string;
    deviceId = registered.body.id as string;
    expect(deviceToken.length).toBeGreaterThan(16);
    expect(registered.body.status).toBe('ENROLLED');

    // The physical device claims its identity — no user session.
    const enrolled = await api('POST', '/api/v1/devices/enroll', null, {
      enrollmentToken: deviceToken,
      capabilities: { barcode: true, camera: false },
    });
    expect(enrolled.status).toBe(201);
    expect(enrolled.body.deviceId).toBe(deviceId);

    const beat = await api('POST', '/api/v1/devices/heartbeat', null, {
      enrollmentToken: deviceToken,
    });
    expect(beat.status).toBe(201);

    const list = await api('GET', '/api/v1/devices', tokenA);
    const device = (list.body.devices as Array<Record<string, unknown>>).find(
      (d) => d.id === deviceId,
    );
    expect(device?.status).toBe('ACTIVE');
    expect(device?.lastSeenAt).toBeTruthy();
    // The one-time token is never listed back.
    expect(device?.enrollmentToken).toBeUndefined();

    const badBeat = await api('POST', '/api/v1/devices/heartbeat', null, {
      enrollmentToken: 'not-a-real-token-123',
    });
    expect(badBeat.status).toBe(401);
  });

  it('VER: offline envelope is exactly-once under replay; barcodes resolve to SKUs', async () => {
    const envelope = {
      enrollmentToken: deviceToken,
      events: [
        {
          clientEventId: 'evt-00000001',
          kind: 'BARCODE',
          value: '3859890000012',
          capturedAt: new Date().toISOString(),
        },
        {
          clientEventId: 'evt-00000002',
          kind: 'QR',
          value: 'wf:pick:123',
          capturedAt: new Date().toISOString(),
          correlationId: 'pick-123',
        },
      ],
    };
    const first = await api('POST', '/api/v1/scan-events', null, envelope);
    expect(first.status).toBe(201);
    expect(first.body.accepted).toBe(2);
    expect(first.body.duplicates).toBe(0);

    // Replay after a simulated offline period: acknowledged, zero effect.
    const replay = await api('POST', '/api/v1/scan-events', null, envelope);
    expect(replay.body.accepted).toBe(0);
    expect(replay.body.duplicates).toBe(2);

    const stored = await prisma.scanEvent.count({
      where: { tenantId: tenantAId, deviceId },
    });
    expect(stored).toBe(2);

    const audit = await api('GET', '/api/v1/scan-events', tokenA);
    const events = audit.body.events as Array<Record<string, unknown>>;
    const barcodeEvent = events.find((e) => e.clientEventId === 'evt-00000001');
    expect(barcodeEvent?.resolvedSkuId).toBe(skuId);
  });

  it('WMS: receiving order posts to the ledger; per-line retries are exactly-once', async () => {
    const created = await api('POST', '/api/v1/wms/orders', tokenA, {
      orderType: 'RECEIVING',
      warehouseId,
      reference: 'ASN-100',
      lines: [{ skuId, expectedQty: 50 }],
    });
    expect(created.status).toBe(201);
    const orderId = created.body.id as string;
    const lineId = (created.body.lines as Array<{ id: string }>)[0]?.id as string;

    await api('POST', `/api/v1/wms/orders/${orderId}/start`, tokenA);
    const processed = await api(
      'POST',
      `/api/v1/wms/orders/${orderId}/lines/${lineId}/process`,
      tokenA,
      { quantity: 50, idempotencyKey: `recv-${orderId}-1` },
    );
    expect(processed.status).toBe(201);

    // Scanner retry with the same key: no double receipt, no double progress.
    const retried = await api(
      'POST',
      `/api/v1/wms/orders/${orderId}/lines/${lineId}/process`,
      tokenA,
      { quantity: 50, idempotencyKey: `recv-${orderId}-1` },
    );
    const retriedLine = (retried.body.lines as Array<{ processedQty: string }>)[0];
    expect(retriedLine?.processedQty).toBe('50');

    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(position.body.onHand).toBe('50');

    const completed = await api('POST', `/api/v1/wms/orders/${orderId}/complete`, tokenA);
    expect(completed.body.status).toBe('COMPLETED');
    const again = await api('POST', `/api/v1/wms/orders/${orderId}/complete`, tokenA);
    expect(again.status).toBe(409);
  });

  it('WMS: transfer moves stock between warehouses', async () => {
    const created = await api('POST', '/api/v1/wms/orders', tokenA, {
      orderType: 'TRANSFER',
      warehouseId,
      toWarehouseId: warehouse2Id,
      lines: [{ skuId, expectedQty: 20 }],
    });
    const orderId = created.body.id as string;
    const lineId = (created.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/wms/orders/${orderId}/start`, tokenA);
    await api('POST', `/api/v1/wms/orders/${orderId}/lines/${lineId}/process`, tokenA, {
      quantity: 20,
      idempotencyKey: `tr-${orderId}-1`,
    });
    await api('POST', `/api/v1/wms/orders/${orderId}/complete`, tokenA);

    const source = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    const destination = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouse2Id}&skuId=${skuId}`,
      tokenA,
    );
    expect(source.body.onHand).toBe('30');
    expect(destination.body.onHand).toBe('20');
  });

  it('WMS: cycle count adjusts the ledger to the counted quantity', async () => {
    const created = await api('POST', '/api/v1/wms/orders', tokenA, {
      orderType: 'COUNT',
      warehouseId,
      lines: [{ skuId, expectedQty: 27 }],
    });
    const orderId = created.body.id as string;
    const lineId = (created.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/wms/orders/${orderId}/start`, tokenA);
    // Counted 27 against 30 on hand -> ADJUSTMENT_OUT of 3.
    await api('POST', `/api/v1/wms/orders/${orderId}/lines/${lineId}/process`, tokenA, {
      quantity: 27,
      idempotencyKey: `cnt-${orderId}-1`,
    });
    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(position.body.onHand).toBe('27');
    const adjustments = await prisma.stockMovement.count({
      where: {
        tenantId: tenantAId,
        movementType: 'ADJUSTMENT_OUT',
        reason: `cycle-count:${orderId}`,
      },
    });
    expect(adjustments).toBe(1);
  });

  it('WMS: a pick can never drive stock negative', async () => {
    const created = await api('POST', '/api/v1/wms/orders', tokenA, {
      orderType: 'PICK',
      warehouseId,
      lines: [{ skuId, expectedQty: 500 }],
    });
    const orderId = created.body.id as string;
    const lineId = (created.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/wms/orders/${orderId}/start`, tokenA);
    const tooMuch = await api(
      'POST',
      `/api/v1/wms/orders/${orderId}/lines/${lineId}/process`,
      tokenA,
      { quantity: 500, idempotencyKey: `pick-${orderId}-1` },
    );
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.code).toBe('INVALID_STATE');
  });

  it('ISOLATION: devices, events and orders are invisible across tenants', async () => {
    const foreignDevices = await api('GET', '/api/v1/devices', tokenB);
    expect((foreignDevices.body.devices as unknown[]).length).toBe(0);
    const foreignEvents = await api('GET', '/api/v1/scan-events', tokenB);
    expect((foreignEvents.body.events as unknown[]).length).toBe(0);
    const foreignOrders = await api('GET', '/api/v1/wms/orders', tokenB);
    expect((foreignOrders.body.orders as unknown[]).length).toBe(0);
  });
});
