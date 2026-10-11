import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 239 acceptance tests: WMS-018 serial control on the stock ledger.
 * Policy enforcement (REQUIRED / OPTIONAL / NONE), whole units and exact
 * count, a unit cannot be in stock twice (also concurrently), outbound only
 * from the warehouse that holds it, transfers move the position, serials
 * through PO receipt, WMS orders and sales fulfillment, onboarding of
 * existing unserialised stock, trace, PIM registry sync via the stock.moved
 * consumer (idempotent), tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 239 — serial control (WMS-018)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s239a', subject: 'idp|s239-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s239b', subject: 'idp|s239b-admin' });

  let tenantAId = '';
  let wh1 = '';
  let wh2 = '';
  let ser = '';
  let opt = '';
  let plain = '';
  let accountId = '';

  async function api(method: 'GET' | 'POST', url: string, token: string, payload?: unknown) {
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

  async function makeSku(code: string, policy: 'NONE' | 'OPTIONAL' | 'REQUIRED') {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    if (policy !== 'NONE') {
      await api('POST', `/api/v1/skus/${sku.body.id}/serial-policy`, tokenA, { policy });
    }
    return sku.body.id as string;
  }

  const move = (body: Record<string, unknown>) =>
    api('POST', '/api/v1/stock/movements', tokenA, {
      idempotencyKey: `mv-${randomUUID()}`,
      ...body,
    });

  async function position(skuId: string, serial: string) {
    return prisma.serialPosition.findFirst({ where: { tenantId: tenantAId, skuId, serial } });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "serial_movement", "serial_position", "serial_number",
       "stock_reservation", "stock_movement", "wms_order_line", "wms_order",
       "purchase_order_line", "purchase_order", "sales_order_line", "sales_order",
       "processed_event", "outbox_event", "audit_event",
       "rule_version", "rule_definition", "workflow_instance", "workflow_version", "workflow_definition",
       "approval", "task", "notification", "terminology_entry", "module_activation",
       "custom_field_definition", "document_template_version", "document_template",
       "user_role_assignment", "role_permission", "role", "user", "branch", "factory",
       "business_unit", "legal_entity", "tenant_configuration_version", "tenant" CASCADE`,
    );
    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    for (const [slug, subj] of [
      ['test-s239a', 'idp|s239-admin'],
      ['test-s239b', 'idp|s239b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint239 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s239a' } }))!.id;
    wh1 = (await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH1', name: 'Centralno' })).body
      .id as string;
    wh2 = (await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH2', name: 'Market Centar' }))
      .body.id as string;
    ser = await makeSku('LAPTOP', 'REQUIRED');
    opt = await makeSku('MONITOR', 'OPTIONAL');
    plain = await makeSku('KABL', 'NONE');
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac',
      company: 'Kupac d.o.o.',
    });
    accountId = (await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {})).body
      .accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('POLICY: REQUIRED needs one serial per whole unit; NONE refuses serials; OPTIONAL accepts both', async () => {
    const missing = await move({
      warehouseId: wh1,
      skuId: ser,
      movementType: 'RECEIPT',
      quantity: 2,
    });
    expect(missing.status).toBe(400);
    const wrongCount = await move({
      warehouseId: wh1,
      skuId: ser,
      movementType: 'RECEIPT',
      quantity: 2,
      serials: ['L-001'],
    });
    expect(wrongCount.status).toBe(400);
    const dupInList = await move({
      warehouseId: wh1,
      skuId: ser,
      movementType: 'RECEIPT',
      quantity: 2,
      serials: ['L-001', 'L-001'],
    });
    expect(dupInList.status).toBe(400);
    const fraction = await move({
      warehouseId: wh1,
      skuId: ser,
      movementType: 'RECEIPT',
      quantity: 1.5,
      serials: ['L-009'],
    });
    expect(fraction.status).toBe(400);
    const onPlain = await move({
      warehouseId: wh1,
      skuId: plain,
      movementType: 'RECEIPT',
      quantity: 1,
      serials: ['K-1'],
    });
    expect(onPlain.status).toBe(400);

    const ok = await move({
      warehouseId: wh1,
      skuId: ser,
      movementType: 'RECEIPT',
      quantity: 3,
      serials: ['L-001', 'L-002', 'L-003'],
    });
    expect(ok.status).toBe(201);
    expect(await position(ser, 'L-002')).toMatchObject({ inStock: true, warehouseId: wh1 });
    expect(
      (await move({ warehouseId: wh1, skuId: opt, movementType: 'RECEIPT', quantity: 2 })).status,
    ).toBe(201);
    expect(
      (
        await move({
          warehouseId: wh1,
          skuId: opt,
          movementType: 'RECEIPT',
          quantity: 1,
          serials: ['M-1'],
        })
      ).status,
    ).toBe(201);
  });

  it('ONE UNIT, ONE PLACE: a serial in stock cannot be received again — also concurrently', async () => {
    const again = await move({
      warehouseId: wh2,
      skuId: ser,
      movementType: 'RECEIPT',
      quantity: 1,
      serials: ['L-001'],
    });
    expect(again.status).toBe(409);
    const results = await Promise.all(
      [wh1, wh2, wh1].map((w) =>
        move({
          warehouseId: w,
          skuId: ser,
          movementType: 'RECEIPT',
          quantity: 1,
          serials: ['L-RACE'],
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of results) expect([201, 409]).toContain(r.status);
    const onHand = await prisma.stockMovement.count({
      where: { tenantId: tenantAId, skuId: ser, movementType: 'RECEIPT' },
    });
    expect(onHand).toBe(2); // the 3-unit receipt + exactly one race winner
  });

  it('OUTBOUND + TRANSFER: only from the holding warehouse; a transfer moves the position', async () => {
    const wrongWh = await move({
      warehouseId: wh2,
      skuId: ser,
      movementType: 'ADJUSTMENT_OUT',
      quantity: 1,
      serials: ['L-003'],
    });
    expect([400, 409]).toContain(wrongWh.status);
    const unknown = await move({
      warehouseId: wh1,
      skuId: ser,
      movementType: 'ADJUSTMENT_OUT',
      quantity: 1,
      serials: ['L-404'],
    });
    expect(unknown.status).toBe(409);

    const order = await api('POST', '/api/v1/wms/orders', tokenA, {
      orderType: 'TRANSFER',
      warehouseId: wh1,
      toWarehouseId: wh2,
      reference: 'TR-239',
      lines: [{ skuId: ser, expectedQty: 1 }],
    });
    expect(order.status).toBe(201);
    const orderId = order.body.id as string;
    const lineId = (order.body.lines as Array<{ id: string }>)[0]!.id;
    await api('POST', `/api/v1/wms/orders/${orderId}/start`, tokenA);
    const noSerial = await api(
      'POST',
      `/api/v1/wms/orders/${orderId}/lines/${lineId}/process`,
      tokenA,
      {
        quantity: 1,
        idempotencyKey: `tr-${orderId}-1`,
      },
    );
    expect(noSerial.status).toBe(400);
    const processed = await api(
      'POST',
      `/api/v1/wms/orders/${orderId}/lines/${lineId}/process`,
      tokenA,
      {
        quantity: 1,
        idempotencyKey: `tr-${orderId}-2`,
        serials: ['L-003'],
      },
    );
    expect(processed.status).toBe(201);
    expect(await position(ser, 'L-003')).toMatchObject({ inStock: true, warehouseId: wh2 });
    const trace = await api('GET', `/api/v1/stock/serials/${ser}/L-003`, tokenA);
    expect(
      (trace.body.movements as Array<{ movementType: string }>).map((m) => m.movementType),
    ).toEqual(['RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN']);
    const inWh2 = await api('GET', `/api/v1/stock/serials?skuId=${ser}&warehouseId=${wh2}`, tokenA);
    expect((inWh2.body.serials as Array<{ serial: string }>).map((s) => s.serial)).toEqual([
      'L-003',
    ]);
  });

  it('PO RECEIPT + SALES SHIPMENT carry serials through to the ledger', async () => {
    const supplier = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Dobavljač IT',
    });
    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId: tenantAId,
        poNumber: 'PO-239-1',
        supplierId: supplier.body.id as string,
        warehouseId: wh1,
        status: 'OPEN',
        currency: 'BAM',
        total: 2000,
      },
    });
    const poLine = await prisma.purchaseOrderLine.create({
      data: {
        tenantId: tenantAId,
        poId: po.id,
        skuId: ser,
        description: 'Laptop',
        quantity: 2,
        unitPrice: 1000,
        lineTotal: 2000,
        receivedQty: 0,
      },
    });
    const noSerial = await api('POST', `/api/v1/purchase-orders/${po.id}/receive`, tokenA, {
      receiptKey: 'rk-239-a',
      lines: [{ lineId: poLine.id, quantity: 2 }],
    });
    expect(noSerial.status).toBe(400);
    const received = await api('POST', `/api/v1/purchase-orders/${po.id}/receive`, tokenA, {
      receiptKey: 'rk-239-b',
      lines: [{ lineId: poLine.id, quantity: 2, serials: ['L-101', 'L-102'] }],
    });
    expect(received.status).toBe(201);
    expect(await position(ser, 'L-101')).toMatchObject({ inStock: true, warehouseId: wh1 });

    const quick = await api('POST', '/api/v1/orders/quick', tokenA, {
      accountId,
      warehouseId: wh1,
      currency: 'BAM',
      lines: [{ code: 'LAPTOP-STD', quantity: 1 }],
    });
    const order = quick.body.order as { id: string; lines: Array<{ id: string }> };
    const confirmed = await api('POST', `/api/v1/orders/${order.id}/confirm`, tokenA, {});
    expect(confirmed.status).toBe(201);
    const ship = await api('POST', `/api/v1/orders/${order.id}/fulfill-lines`, tokenA, {
      shipKey: 'ship-239-1',
      lines: [{ lineId: order.lines[0]!.id, quantity: 1, serials: ['L-101'] }],
    });
    expect(ship.status).toBe(201);
    expect(await position(ser, 'L-101')).toMatchObject({ inStock: false, warehouseId: null });
    const event = await prisma.outboxEvent.findFirst({
      where: {
        tenantId: tenantAId,
        eventType: 'stock.moved',
        payload: { path: ['movementType'], equals: 'ISSUE' },
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect((event!.payload as { serials?: string[] }).serials).toEqual(['L-101']);
  });

  it('ONBOARDING: serials for existing unserialised stock, never more than untracked on-hand', async () => {
    const legacy = await makeSku('TABLET', 'NONE');
    await move({ warehouseId: wh1, skuId: legacy, movementType: 'RECEIPT', quantity: 2 });
    await api('POST', `/api/v1/skus/${legacy}/serial-policy`, tokenA, { policy: 'REQUIRED' });
    const blocked = await move({
      warehouseId: wh1,
      skuId: legacy,
      movementType: 'ADJUSTMENT_OUT',
      quantity: 1,
      serials: ['T-1'],
    });
    expect(blocked.status).toBe(409);
    const tooMany = await api('POST', '/api/v1/stock/serials/onboard', tokenA, {
      warehouseId: wh1,
      skuId: legacy,
      serials: ['T-1', 'T-2', 'T-3'],
    });
    expect(tooMany.status).toBe(409);
    const ok = await api('POST', '/api/v1/stock/serials/onboard', tokenA, {
      warehouseId: wh1,
      skuId: legacy,
      serials: ['T-1', 'T-2'],
    });
    expect(ok.body).toEqual({ onboarded: 2, untrackedLeft: 0 });
    const out = await move({
      warehouseId: wh1,
      skuId: legacy,
      movementType: 'ADJUSTMENT_OUT',
      quantity: 1,
      serials: ['T-1'],
    });
    expect(out.status).toBe(201);
  });

  it('PIM REGISTRY: the stock.moved consumer reflects the life cycle, idempotently', async () => {
    const { SerialService } = await import('@nexora/domain-pim');
    const registry = new SerialService(prisma);
    const events = await prisma.outboxEvent.findMany({
      where: { tenantId: tenantAId, eventType: 'stock.moved' },
      orderBy: { occurredAt: 'asc' },
    });
    for (const e of events) await registry.applyStockMovedEvent(e);
    for (const e of events) await registry.applyStockMovedEvent(e); // redelivery
    const shipped = await prisma.serialNumber.findFirst({
      where: { tenantId: tenantAId, skuId: ser, serial: 'L-101' },
    });
    expect(shipped?.status).toBe('SHIPPED');
    const inStock = await prisma.serialNumber.findFirst({
      where: { tenantId: tenantAId, skuId: ser, serial: 'L-102' },
    });
    expect(inStock?.status).toBe('IN_STOCK');
    expect(
      await prisma.serialNumber.count({
        where: { tenantId: tenantAId, skuId: ser, serial: 'L-101' },
      }),
    ).toBe(1);
  });

  it('TENANT ISOLATION: another tenant cannot trace or list serials of tenant A', async () => {
    expect((await api('GET', `/api/v1/stock/serials/${ser}/L-003`, tokenB)).status).toBe(404);
    const list = await api('GET', `/api/v1/stock/serials?skuId=${ser}`, tokenB);
    expect(list.body.serials).toEqual([]);
    const onboard = await api('POST', '/api/v1/stock/serials/onboard', tokenB, {
      warehouseId: wh1,
      skuId: ser,
      serials: ['X-1'],
    });
    expect(onboard.status).toBe(404);
  });
});
