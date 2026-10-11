import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 242 acceptance tests: QMS-005 material-review dispositions on
 * quarantine holds. Lot- and NCR-scoped holds; holds cannot over-commit
 * stock (also concurrently); split dispositions USE_AS_IS / SCRAP /
 * RETURN_TO_SUPPLIER / REGRADE / REWORK with exact ledger effects;
 * partial decisions keep the rest blocked; validation; idempotent replay;
 * concurrent decisions (incl. legacy release vs scrap) have exactly one
 * effect; failed posting is retried without double effects; audit;
 * tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 242 — quarantine dispositions (QMS-005)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s242a', subject: 'idp|s242-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s242b', subject: 'idp|s242b-admin' });

  let tenantAId = '';
  let wh1 = '';
  let a = '';
  let b = '';
  let lotSku = '';

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
       "stock_reservation", "stock_movement", "quarantine_disposition_line", "quarantine_disposition", "quarantine_hold", "ncr", "wms_order_line", "wms_order",
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
      ['test-s242a', 'idp|s242-admin'],
      ['test-s242b', 'idp|s242b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint242 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s242a' } }))!.id;
    wh1 = (await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH1', name: 'Centralno' })).body
      .id as string;
    a = await makeSku('LIM', 'NONE');
    b = await makeSku('LIM-B', 'NONE');
    lotSku = await makeSku('BOJA', 'NONE');
    await api('POST', `/api/v1/skus/${lotSku}/lot-policy`, tokenA, { lotTracked: true });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const position = async (skuId: string) =>
    (await api('GET', `/api/v1/stock/position?warehouseId=${wh1}&skuId=${skuId}`, tokenA)).body as {
      onHand: string;
      available: string;
    };

  const held = async (skuId: string) => {
    const agg = await prisma.quarantineHold.aggregate({
      where: { tenantId: tenantAId, warehouseId: wh1, skuId, status: 'ACTIVE' },
      _sum: { remainingQuantity: true },
    });
    return Number(agg._sum.remainingQuantity ?? 0);
  };

  const hold = async (body: Record<string, unknown>, token = tokenA) =>
    api('POST', '/api/v1/quarantine', token, {
      warehouseId: wh1,
      reason: 'Ogrebotine na limu',
      ...body,
    });

  const dispose = (holdId: string, body: Record<string, unknown>, token = tokenA) =>
    api('POST', `/api/v1/quarantine/${holdId}/dispositions`, token, {
      requestKey: `disp-${randomUUID()}`,
      ...body,
    });

  it('HOLD: lot- and NCR-scoped holds are validated and cannot over-commit stock (also concurrently)', async () => {
    await move({ warehouseId: wh1, skuId: a, movementType: 'RECEIPT', quantity: 300 });
    await move({
      warehouseId: wh1,
      skuId: lotSku,
      movementType: 'RECEIPT',
      quantity: 40,
      lotNumber: 'L-01',
    });
    await move({
      warehouseId: wh1,
      skuId: lotSku,
      movementType: 'RECEIPT',
      quantity: 60,
      lotNumber: 'L-02',
    });

    const notLotSku = await hold({ skuId: a, quantity: 1, lotNumber: 'L-01' });
    expect(notLotSku.status).toBe(400);
    const tooMuchLot = await hold({ skuId: lotSku, quantity: 41, lotNumber: 'L-01' });
    expect(tooMuchLot.status).toBe(409);
    const lotHold = await hold({ skuId: lotSku, quantity: 40, lotNumber: 'L-01' });
    expect(lotHold.status).toBe(201);
    expect(lotHold.body).toMatchObject({ lotNumber: 'L-01', remainingQuantity: '40' });

    const ncr = await api('POST', '/api/v1/qc/ncrs', tokenA, {
      skuId: a,
      description: 'Ogrebotine',
    });
    const wrongSku = await hold({ skuId: b, quantity: 1, ncrId: ncr.body.id });
    expect(wrongSku.status).toBe(400);

    // Concurrent: two holds of 200 on 300 un-held units — exactly one fits.
    const [h1, h2] = await Promise.all([
      hold({ skuId: a, quantity: 200, ncrId: ncr.body.id }),
      hold({ skuId: a, quantity: 200 }),
    ]);
    expect([h1.status, h2.status].sort()).toEqual([201, 409]);
    const winner = h1.status === 201 ? h1 : h2;
    expect(await held(a)).toBe(200);
    // Clean up the big hold so later tests start from known numbers.
    await dispose(winner.body.id as string, {
      note: 'Ogrebotine su kozmetičke, odobreno odstupanje',
      lines: [{ type: 'USE_AS_IS', quantity: 200 }],
    });
    expect(await held(a)).toBe(0);
  });

  it('SPLIT: one decision across all five dispositions books exact ledger effects', async () => {
    const h = await hold({ skuId: a, quantity: 100 });
    const holdId = h.body.id as string;
    const before = Number((await position(a)).onHand);
    const result = await dispose(holdId, {
      note: 'Komisija za neusaglašenost 11.10.',
      lines: [
        { type: 'USE_AS_IS', quantity: 50 },
        { type: 'SCRAP', quantity: 20 },
        { type: 'RETURN_TO_SUPPLIER', quantity: 10, supplierRef: 'Dobavljač Čelik, NBN-0042' },
        { type: 'REGRADE', quantity: 10, targetSkuId: b, targetQuantity: 10 },
        { type: 'REWORK', quantity: 10 },
      ],
    });
    expect(result.status).toBe(201);
    expect(result.body.status).toBe('POSTED');
    const lines = result.body.lines as Array<{
      type: string;
      movementId: string | null;
      reworkHoldId: string | null;
      targetMovementId: string | null;
    }>;
    expect(lines.find((l) => l.type === 'SCRAP')?.movementId).toBeTruthy();
    expect(lines.find((l) => l.type === 'REGRADE')?.targetMovementId).toBeTruthy();
    expect(lines.find((l) => l.type === 'USE_AS_IS')?.movementId).toBeNull();
    const reworkHoldId = lines.find((l) => l.type === 'REWORK')?.reworkHoldId;
    expect(reworkHoldId).toBeTruthy();

    expect(Number((await position(a)).onHand)).toBe(before - 40);
    expect(Number((await position(b)).onHand)).toBe(10);
    const parent = await prisma.quarantineHold.findUnique({ where: { id: holdId } });
    expect(parent).toMatchObject({ status: 'DISPOSED' });
    expect(parent?.remainingQuantity.toString()).toBe('0');
    const child = await prisma.quarantineHold.findUnique({ where: { id: reworkHoldId! } });
    expect(child).toMatchObject({ status: 'ACTIVE', parentHoldId: holdId });
    // Rework stays blocked.
    expect(await held(a)).toBe(10);
    // After re-inspection the rework passes.
    const reworked = await dispose(reworkHoldId!, {
      note: 'Dorađeno i ponovo pregledano — ispravno',
      lines: [{ type: 'USE_AS_IS', quantity: 10 }],
    });
    expect(reworked.body.status).toBe('POSTED');
    expect((await prisma.quarantineHold.findUnique({ where: { id: reworkHoldId! } }))?.status).toBe(
      'RELEASED',
    );
    expect(
      await prisma.auditEvent.count({
        where: { tenantId: tenantAId, action: 'wms.quarantine.dispose', objectId: holdId },
      }),
    ).toBe(1);
  });

  it('PARTIAL + VALIDATION: the rest stays blocked; bad lines are refused before any effect', async () => {
    const h = await hold({ skuId: a, quantity: 30 });
    const holdId = h.body.id as string;
    expect((await dispose(holdId, { lines: [{ type: 'USE_AS_IS', quantity: 5 }] })).status).toBe(
      400,
    );
    expect((await dispose(holdId, { lines: [{ type: 'REGRADE', quantity: 5 }] })).status).toBe(400);
    expect(
      (await dispose(holdId, { lines: [{ type: 'REGRADE', quantity: 5, targetSkuId: a }] })).status,
    ).toBe(400);
    expect(
      (await dispose(holdId, { lines: [{ type: 'RETURN_TO_SUPPLIER', quantity: 5 }] })).status,
    ).toBe(400);
    expect((await dispose(holdId, { lines: [{ type: 'SCRAP', quantity: 31 }] })).status).toBe(409);

    const part = await dispose(holdId, { lines: [{ type: 'SCRAP', quantity: 10 }] });
    expect(part.status).toBe(201);
    const row = await prisma.quarantineHold.findUnique({ where: { id: holdId } });
    expect(row).toMatchObject({ status: 'ACTIVE' });
    expect(row?.remainingQuantity.toString()).toBe('20');
    expect(await held(a)).toBe(20);
    const rest = await dispose(holdId, { lines: [{ type: 'SCRAP', quantity: 20 }] });
    expect(rest.status).toBe(201);
    expect((await prisma.quarantineHold.findUnique({ where: { id: holdId } }))?.status).toBe(
      'SCRAPPED',
    );
    const listed = await api('GET', `/api/v1/quarantine/${holdId}/dispositions`, tokenA);
    expect((listed.body.dispositions as unknown[]).length).toBe(2);
  });

  it('IDEMPOTENCY + CONCURRENCY: replay is a no-op; competing decisions have exactly one effect', async () => {
    const h = await hold({ skuId: a, quantity: 10 });
    const holdId = h.body.id as string;
    const key = `disp-${randomUUID()}`;
    const first = await dispose(holdId, {
      requestKey: key,
      lines: [{ type: 'SCRAP', quantity: 4 }],
    });
    const onHandAfter = Number((await position(a)).onHand);
    const replay = await dispose(holdId, {
      requestKey: key,
      lines: [{ type: 'SCRAP', quantity: 4 }],
    });
    expect(replay.body).toMatchObject({ id: first.body.id, duplicate: true });
    expect(Number((await position(a)).onHand)).toBe(onHandAfter);

    const other = await hold({ skuId: a, quantity: 5 });
    const keyReuse = await dispose(other.body.id as string, {
      requestKey: key,
      lines: [{ type: 'SCRAP', quantity: 1 }],
    });
    expect(keyReuse.status).toBe(409);

    // Two different decisions for the remaining 6 at once.
    const [x, y] = await Promise.all([
      dispose(holdId, { lines: [{ type: 'SCRAP', quantity: 6 }] }),
      dispose(holdId, {
        note: 'Pušteno uz odstupanje br. 7',
        lines: [{ type: 'USE_AS_IS', quantity: 6 }],
      }),
    ]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    const scrapped = x.status === 201;
    expect(Number((await position(a)).onHand)).toBe(scrapped ? onHandAfter - 6 : onHandAfter);

    // Legacy endpoint: concurrent release vs scrap — one wins, status matches the ledger.
    const legacy = await hold({ skuId: a, quantity: 3 });
    const legacyId = legacy.body.id as string;
    const beforeLegacy = Number((await position(a)).onHand);
    const [r, s] = await Promise.all([
      api('POST', `/api/v1/quarantine/${legacyId}/decide`, tokenA, { decision: 'RELEASE' }),
      api('POST', `/api/v1/quarantine/${legacyId}/decide`, tokenA, { decision: 'SCRAP' }),
    ]);
    expect([r.status, s.status].filter((c) => c === 201)).toHaveLength(1);
    const final = await prisma.quarantineHold.findUnique({ where: { id: legacyId } });
    const delta = beforeLegacy - Number((await position(a)).onHand);
    expect(final?.status === 'SCRAPPED' ? 3 : 0).toBe(delta);
  });

  it('RETRY: a failed posting keeps the claim and finishes once, without double effects', async () => {
    await move({ warehouseId: wh1, skuId: b, movementType: 'RECEIPT', quantity: 5 });
    const h = await hold({ skuId: b, quantity: 5 });
    const holdId = h.body.id as string;
    // Stock leaves outside quality's control (the ledger allows it; holds only block promising).
    const onHandB = Number((await position(b)).onHand);
    await move({ warehouseId: wh1, skuId: b, movementType: 'ISSUE', quantity: onHandB });
    const failed = await dispose(holdId, { lines: [{ type: 'SCRAP', quantity: 5 }] });
    expect(failed.status).toBe(409);
    const row = await prisma.quarantineDisposition.findFirst({ where: { holdId } });
    expect(row).toMatchObject({ status: 'FAILED' });
    expect(row?.lastError).toContain('Insufficient');
    // The claim holds: no other decision can take the same quantity.
    expect((await dispose(holdId, { lines: [{ type: 'SCRAP', quantity: 1 }] })).status).toBe(409);

    await move({ warehouseId: wh1, skuId: b, movementType: 'RECEIPT', quantity: 5 });
    const retried = await api('POST', `/api/v1/quarantine/dispositions/${row!.id}/retry`, tokenA);
    expect(retried.body.status).toBe('POSTED');
    const again = await api('POST', `/api/v1/quarantine/dispositions/${row!.id}/retry`, tokenA);
    expect(again.body.status).toBe('POSTED');
    expect(Number((await position(b)).onHand)).toBe(0);
  });

  it('TENANT: another tenant cannot place, see or decide holds', async () => {
    const h = await hold({ skuId: a, quantity: 1 });
    const holdId = h.body.id as string;
    expect(
      (await dispose(holdId, { lines: [{ type: 'SCRAP', quantity: 1 }] }, tokenB)).status,
    ).toBe(404);
    expect((await api('GET', `/api/v1/quarantine/${holdId}/dispositions`, tokenB)).status).toBe(
      404,
    );
    expect((await hold({ skuId: a, quantity: 1 }, tokenB)).status).toBe(404);
    const list = await api('GET', '/api/v1/quarantine', tokenB);
    expect((list.body.holds as unknown[]).length).toBe(0);
  });
});
