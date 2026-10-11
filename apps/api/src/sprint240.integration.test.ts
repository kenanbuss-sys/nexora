import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 240 acceptance tests: PIM-005 barcodes/GTIN and PIM-007 units of
 * measure in stock transactions. GTIN check digit, barcode types, one scan
 * namespace across unit and pack barcodes (also concurrently), unified scan
 * resolver, list/remove (audited), entered UOM converted exactly to the
 * base UOM on the ledger, inexact/unknown UOM refused, serial count in base
 * units, idempotent replay, tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 240 — barcodes/GTIN + UOM in transactions (PIM-005/007)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s240a', subject: 'idp|s240-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s240b', subject: 'idp|s240b-admin' });

  let tenantAId = '';
  let wh1 = '';
  let pcs = '';
  let kg = '';
  let ser = '';

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

  async function makeSku(code: string, policy: 'NONE' | 'OPTIONAL' | 'REQUIRED', baseUom = 'pcs') {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom,
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

  const onHand = async (skuId: string) =>
    Number(
      (await api('GET', `/api/v1/stock/position?warehouseId=${wh1}&skuId=${skuId}`, tokenA)).body
        .onHand,
    );

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "serial_movement", "serial_position", "serial_number",
       "stock_reservation", "stock_movement", "barcode", "packaging_level", "uom_conversion", "wms_order_line", "wms_order",
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
      ['test-s240a', 'idp|s240-admin'],
      ['test-s240b', 'idp|s240b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint240 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s240a' } }))!.id;
    wh1 = (await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH1', name: 'Centralno' })).body
      .id as string;
    pcs = await makeSku('VIJAK', 'NONE');
    kg = await makeSku('BRASNO', 'NONE', 'kg');
    ser = await makeSku('BUSILICA', 'REQUIRED');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('GTIN: check digit enforced for type GTIN; other symbologies are free-form; unknown type refused', async () => {
    const bad = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: pcs,
      value: '3871234567892',
    });
    expect(bad.status).toBe(400);
    const wrongLength = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: pcs,
      value: '38712345678',
    });
    expect(wrongLength.status).toBe(400);
    const ean13 = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: pcs,
      value: '3871234567891',
    });
    expect(ean13.status).toBe(201);
    const ean8 = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: pcs,
      value: '96385074',
    });
    expect(ean8.status).toBe(201);
    const internal = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: pcs,
      value: 'VIJ-M8-INT',
      barcodeType: 'internal',
    });
    expect(internal.status).toBe(201);
    const unknownType = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: pcs,
      value: 'X-1234',
      barcodeType: 'MAGIC',
    });
    expect(unknownType.status).toBe(400);

    const list = await api('GET', `/api/v1/skus/${pcs}/barcodes`, tokenA);
    const rows = list.body.barcodes as Array<{ value: string; barcodeType: string }>;
    expect(rows.map((r) => r.value).sort()).toEqual(['3871234567891', '96385074', 'VIJ-M8-INT']);
    expect(rows.find((r) => r.value === 'VIJ-M8-INT')?.barcodeType).toBe('INTERNAL');

    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'sku.barcode.assign', objectId: pcs },
    });
    expect(audit).not.toBeNull();
  });

  it('NAMESPACE: unit and pack barcodes never collide, in either direction and concurrently', async () => {
    const packOnUnit = await api('POST', `/api/v1/skus/${pcs}/packaging`, tokenA, {
      name: 'Kutija',
      unitsPerPack: 100,
      barcodeValue: '3871234567891',
    });
    expect(packOnUnit.status).toBe(409);
    const pack = await api('POST', `/api/v1/skus/${pcs}/packaging`, tokenA, {
      name: 'Kutija',
      unitsPerPack: 100,
      barcodeValue: '13871234567898',
    });
    expect(pack.status).toBe(201);
    const unitOnPack = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: ser,
      value: '13871234567898',
    });
    expect(unitOnPack.status).toBe(409);

    // Concurrent: the same new code as a unit barcode and as a pack barcode.
    const code = 'RACE-0001';
    const [unit, packRace] = await Promise.all([
      api('POST', '/api/v1/barcodes', tokenA, { skuId: ser, value: code, barcodeType: 'CODE128' }),
      api('POST', `/api/v1/skus/${ser}/packaging`, tokenA, {
        name: 'Paleta',
        unitsPerPack: 40,
        barcodeValue: code,
      }),
    ]);
    expect([unit.status, packRace.status].sort()).toEqual([201, 409]);
    const [units, packs] = await Promise.all([
      prisma.barcode.count({ where: { tenantId: tenantAId, value: code } }),
      prisma.packagingLevel.count({ where: { tenantId: tenantAId, barcodeValue: code } }),
    ]);
    expect(units + packs).toBe(1);
  });

  it('SCAN: one resolver for unit barcode, pack barcode and SKU code; tenant-isolated', async () => {
    const unit = await api('GET', '/api/v1/barcodes/resolve/3871234567891', tokenA);
    expect(unit.status).toBe(200);
    expect(unit.body).toMatchObject({
      kind: 'UNIT',
      skuId: pcs,
      unitsPerScan: '1',
      baseUom: 'pcs',
    });
    const pack = await api('GET', '/api/v1/barcodes/resolve/13871234567898', tokenA);
    expect(pack.body).toMatchObject({
      kind: 'PACK',
      skuId: pcs,
      unitsPerScan: '100',
      packName: 'Kutija',
    });
    const byCode = await api('GET', '/api/v1/barcodes/resolve/BRASNO-STD', tokenA);
    expect(byCode.body).toMatchObject({ kind: 'SKU_CODE', skuId: kg, baseUom: 'kg' });
    const unknown = await api('GET', '/api/v1/barcodes/resolve/0000000000000', tokenA);
    expect(unknown.status).toBe(404);
    const otherTenant = await api('GET', '/api/v1/barcodes/resolve/3871234567891', tokenB);
    expect(otherTenant.status).toBe(404);
  });

  it('REMOVE: unassigning a barcode is audited and tenant-scoped', async () => {
    const foreign = await api('POST', '/api/v1/barcodes/96385074/remove', tokenB);
    expect(foreign.status).toBe(404);
    const removed = await api('POST', '/api/v1/barcodes/96385074/remove', tokenA);
    expect(removed.status).toBe(201);
    expect((await api('GET', '/api/v1/barcodes/resolve/96385074', tokenA)).status).toBe(404);
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'sku.barcode.remove', objectId: pcs },
    });
    expect(audit).not.toBeNull();
    // A freed code can be reused.
    const reuse = await api('POST', '/api/v1/barcodes', tokenA, { skuId: kg, value: '96385074' });
    expect(reuse.status).toBe(201);
  });

  it('UOM: entered quantity converts exactly to the base UOM; the ledger books base units', async () => {
    expect(
      (
        await api('PUT', `/api/v1/skus/${pcs}/uom-conversions`, tokenA, {
          fromUom: 'box',
          toUom: 'pcs',
          factor: 12,
        })
      ).status,
    ).toBe(200);
    const key = `mv-${randomUUID()}`;
    const boxes = await move({
      warehouseId: wh1,
      skuId: pcs,
      movementType: 'RECEIPT',
      quantity: 2,
      uom: 'box',
      idempotencyKey: key,
    });
    expect(boxes.status).toBe(201);
    const row = await prisma.stockMovement.findUnique({
      where: { id: boxes.body.movementId as string },
    });
    expect(row?.quantity.toString()).toBe('24');
    expect(row?.enteredUom).toBe('box');
    expect(row?.enteredQuantity?.toString()).toBe('2');
    expect(await onHand(pcs)).toBe(24);

    // Idempotent replay with the same key books nothing new.
    const replay = await move({
      warehouseId: wh1,
      skuId: pcs,
      movementType: 'RECEIPT',
      quantity: 2,
      uom: 'box',
      idempotencyKey: key,
    });
    expect(replay.body).toMatchObject({ movementId: boxes.body.movementId, duplicate: true });
    expect(await onHand(pcs)).toBe(24);

    // Base UOM explicitly: no entered trail.
    const base = await move({
      warehouseId: wh1,
      skuId: pcs,
      movementType: 'ISSUE',
      quantity: 4,
      uom: 'pcs',
    });
    expect(base.status).toBe(201);
    const baseRow = await prisma.stockMovement.findUnique({
      where: { id: base.body.movementId as string },
    });
    expect(baseRow?.enteredUom).toBeNull();
    expect(await onHand(pcs)).toBe(20);

    // Outbound in boxes beyond stock: 2 box = 24 > 20.
    const tooMuch = await move({
      warehouseId: wh1,
      skuId: pcs,
      movementType: 'ISSUE',
      quantity: 2,
      uom: 'box',
    });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.code).toBe('INVALID_STATE');

    // Inverse conversion (base -> uom): kg base, 1 kg = 1000 g.
    await api('PUT', `/api/v1/skus/${kg}/uom-conversions`, tokenA, {
      fromUom: 'kg',
      toUom: 'g',
      factor: 1000,
    });
    const grams = await move({
      warehouseId: wh1,
      skuId: kg,
      movementType: 'RECEIPT',
      quantity: 2500,
      uom: 'g',
    });
    expect(grams.status).toBe(201);
    expect(await onHand(kg)).toBe(2.5);

    const listed = await api('GET', `/api/v1/stock/movements?skuId=${kg}`, tokenA);
    const movements = listed.body as unknown as Array<{
      enteredUom: string | null;
      quantity: string;
    }>;
    const first = Array.isArray(movements)
      ? movements[0]
      : (listed.body.movements as typeof movements)[0];
    expect(first).toMatchObject({ enteredUom: 'g', quantity: '2.5' });
  });

  it('UOM: unknown or inexact conversions are refused, never rounded', async () => {
    const unknown = await move({
      warehouseId: wh1,
      skuId: pcs,
      movementType: 'RECEIPT',
      quantity: 1,
      uom: 'pallet',
    });
    expect(unknown.status).toBe(400);
    await api('PUT', `/api/v1/skus/${kg}/uom-conversions`, tokenA, {
      fromUom: 'kg',
      toUom: 'l',
      factor: 3,
    });
    const inexact = await move({
      warehouseId: wh1,
      skuId: kg,
      movementType: 'RECEIPT',
      quantity: 1,
      uom: 'l',
    });
    expect(inexact.status).toBe(400);
    expect(await onHand(kg)).toBe(2.5);
  });

  it('UOM + SERIALS: serial count is checked in base units', async () => {
    await api('PUT', `/api/v1/skus/${ser}/uom-conversions`, tokenA, {
      fromUom: 'set',
      toUom: 'pcs',
      factor: 3,
    });
    const short = await move({
      warehouseId: wh1,
      skuId: ser,
      movementType: 'RECEIPT',
      quantity: 1,
      uom: 'set',
      serials: ['B-1'],
    });
    expect(short.status).toBe(400);
    const ok = await move({
      warehouseId: wh1,
      skuId: ser,
      movementType: 'RECEIPT',
      quantity: 1,
      uom: 'set',
      serials: ['B-1', 'B-2', 'B-3'],
    });
    expect(ok.status).toBe(201);
    expect(await onHand(ser)).toBe(3);
  });

  it('TENANT: conversions and movements of another tenant are invisible', async () => {
    const foreign = await api('POST', '/api/v1/stock/movements', tokenB, {
      warehouseId: wh1,
      skuId: pcs,
      movementType: 'RECEIPT',
      quantity: 1,
      uom: 'box',
      idempotencyKey: `mv-${randomUUID()}`,
    });
    expect(foreign.status).toBe(404);
    const list = await api('GET', `/api/v1/skus/${pcs}/barcodes`, tokenB);
    expect(list.status).toBe(404);
  });
});
