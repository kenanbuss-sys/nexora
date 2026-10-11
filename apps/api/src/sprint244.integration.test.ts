import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 244 acceptance tests: PLAN-015 promise-date engine. Stock first,
 * then open purchase supply at its expected date, cumulative across lines;
 * earlier confirmed backorders claim supply first; capable-to-promise from
 * routing + work-center capacity; lead-time fallback with configurable
 * defaults; working calendar; reserved lines; committing the promise onto
 * the order (audited, timeline, outbox); read-only engine; tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const DAY = 86_400_000;

type Line = {
  lineId: string;
  skuId: string;
  source: string;
  days: number;
  availableNow: number;
  promisedAt: string;
  explanation: string;
  sources: Array<{ kind: string; reference: string | null; quantity: number }>;
};

integration('Sprint 244 — promise-date engine (PLAN-015)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s244a', subject: 'idp|s244-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s244b', subject: 'idp|s244b-admin' });

  let tenantAId = '';
  let wh = '';
  let accountId = '';
  let supplierId = '';
  let stocked = '';
  let bought = '';
  let made = '';
  let bare = '';

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

  async function makeSku(code: string) {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
  }

  const receive = (skuId: string, quantity: number) =>
    api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: wh,
      skuId,
      movementType: 'RECEIPT',
      quantity,
      idempotencyKey: `mv-${randomUUID()}`,
    });

  async function order(lines: Array<{ skuId: string; quantity: number }>) {
    const o = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId: wh,
      currency: 'EUR',
    });
    for (const l of lines) {
      await api('POST', `/api/v1/orders/${o.body.id}/lines`, tokenA, { ...l, unitPrice: 10 });
    }
    return o.body.id as string;
  }

  const promise = async (orderId: string, token = tokenA) => {
    const r = await api('GET', `/api/v1/orders/${orderId}/promise`, token);
    return { status: r.status, body: r.body, lines: (r.body.lines ?? []) as Line[] };
  };

  const daysFromNow = (iso: string) => Math.round((Date.parse(iso) - Date.now()) / DAY);

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "stock_reservation", "stock_movement", "quarantine_disposition_line",
       "quarantine_disposition", "quarantine_hold", "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "sales_order_line", "sales_order", "order_event",
       "work_order_operation", "work_order", "routing_operation", "routing", "planning_policy",
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
      ['test-s244a', 'idp|s244-admin'],
      ['test-s244b', 'idp|s244b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint244 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s244a' } }))!.id;
    wh = (await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH1', name: 'Centralno' })).body
      .id as string;
    stocked = await makeSku('VIJCI');
    bought = await makeSku('LEZAJ');
    made = await makeSku('NOSAC');
    bare = await makeSku('BRTVA');
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac',
      company: 'Metalprom d.o.o.',
    });
    accountId = (await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {})).body
      .accountId as string;
    supplierId = (
      await api('POST', '/api/v1/suppliers', tokenA, { name: 'Ležajevi d.o.o.', leadTimeDays: 7 })
    ).body.id as string;

    await receive(stocked, 10);
    await receive(bought, 5);
    // Open PO: 20 units of the bought SKU expected in 5 days.
    const req = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${req.body.id}/lines`, tokenA, {
      skuId: bought,
      quantity: 20,
      estUnitPrice: 3,
    });
    await api('POST', `/api/v1/requisitions/${req.body.id}/submit`, tokenA);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId: req.body.id,
      supplierId,
      warehouseId: wh,
      expectedAt: new Date(Date.now() + 5 * DAY).toISOString(),
    });
    expect(po.status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('STOCK + PO: lines consume stock first, then the open PO at its expected date', async () => {
    const id = await order([
      { skuId: stocked, quantity: 4 },
      { skuId: bought, quantity: 5 },
      { skuId: bought, quantity: 7 },
    ]);
    const p = await promise(id);
    expect(p.status).toBe(200);
    const [a, b, c] = p.lines;
    expect(a).toMatchObject({ source: 'STOCK', days: 1, availableNow: 4 });
    expect(b).toMatchObject({ source: 'STOCK', days: 1, availableNow: 5 });
    // Cumulative: the 5 in stock went to line 2, line 3 waits for the PO.
    expect(c).toMatchObject({ source: 'PURCHASE_ORDER', days: 6, availableNow: 0 });
    expect(c!.sources[0]?.reference).toMatch(/^PO/);
    expect(daysFromNow(p.body.orderPromise as string)).toBe(6);
  });

  it('BACKORDERS: an earlier confirmed backorder claims the PO first', async () => {
    const earlier = await order([{ skuId: bought, quantity: 25 }]);
    const confirmed = await api('POST', `/api/v1/orders/${earlier}/confirm`, tokenA, {
      allowBackorder: true,
    });
    expect(confirmed.status).toBe(201);
    // 25 > 5 in stock: the whole line is backordered and claims stock + PO (5 + 20).
    const later = await order([{ skuId: bought, quantity: 3 }]);
    const p = await promise(later);
    expect(p.lines[0]).toMatchObject({ source: 'LEAD_TIME', availableNow: 0 });
    expect(p.lines[0]!.explanation).toContain('Short 3');

    // The engine is read-only: nothing was reserved or posted by promising.
    expect(
      await prisma.stockReservation.count({ where: { tenantId: tenantAId, skuId: bought } }),
    ).toBe(0);
  });

  it('CTP: a make SKU is promised from routing time and work-center capacity', async () => {
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: made });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Rezanje',
      workCenter: 'REZANJE',
      setupMinutes: 60,
      runMinutesPerUnit: 10,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Zavarivanje',
      workCenter: 'ZAVARIVANJE',
      runMinutesPerUnit: 4,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        plan: {
          capacity: [
            { workCenter: 'REZANJE', minutesPerDay: 480 },
            { workCenter: 'ZAVARIVANJE', minutesPerDay: 480 },
          ],
          promise: { handlingDays: 2, defaultLeadTimeDays: 4 },
        },
      },
    });
    // 90 units: REZANJE 60 + 900 = 960 min = 2 days; ZAVARIVANJE 360 min = 1 day; +2 handling.
    const id = await order([{ skuId: made, quantity: 90 }]);
    const p = await promise(id);
    expect(p.lines[0]).toMatchObject({ source: 'PRODUCTION_CAPACITY', days: 5 });
    expect(p.lines[0]!.explanation).toContain('REZANJE 2d');

    // Buy SKU without policy: configured default 4 days + 2 handling.
    const b = await promise(await order([{ skuId: bare, quantity: 1 }]));
    expect(b.lines[0]).toMatchObject({ source: 'LEAD_TIME', days: 6 });
  });

  it('CALENDAR: promises land on working days only', async () => {
    const today = new Date();
    const holiday = new Date(today.getTime() + 2 * DAY).toISOString().slice(0, 10);
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        plan: { calendar: { workingDays: [1, 2, 3, 4, 5], holidays: [holiday] } },
      },
    });
    const p = await api('POST', '/api/v1/planning/promise', tokenA, {
      lines: [{ skuId: bare, quantity: 1 }],
    });
    expect(p.status).toBe(201);
    const line = (p.body.lines as Line[])[0]!;
    const date = new Date(line.promisedAt);
    expect([0, 6]).not.toContain(date.getUTCDay());
    expect(line.promisedAt.slice(0, 10)).not.toBe(holiday);
    // 2 default lead + 1 handling working days can never be fewer calendar days.
    expect(daysFromNow(line.promisedAt)).toBeGreaterThanOrEqual(3);
  });

  it('RESERVED + COMMIT: reserved lines ship after handling; the promise is committed onto the order', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, { config: {} });
    const id = await order([{ skuId: stocked, quantity: 2 }]);
    await api('POST', `/api/v1/orders/${id}/confirm`, tokenA, {});
    const p = await promise(id);
    expect(p.lines[0]).toMatchObject({ source: 'RESERVED', days: 1 });

    const committed = await api('POST', `/api/v1/orders/${id}/promise/commit`, tokenA);
    expect(committed.status).toBe(201);
    const row = await prisma.salesOrder.findUnique({ where: { id }, include: { lines: true } });
    expect(row?.promisedAt?.toISOString()).toBe(committed.body.promisedAt);
    expect(row?.lines[0]?.promisedAt).not.toBeNull();
    expect(
      await prisma.orderEvent.count({ where: { orderId: id, eventType: 'PROMISE_COMMITTED' } }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: tenantAId, eventType: 'order.promise.committed', aggregateId: id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { tenantId: tenantAId, action: 'order.promise.commit' },
      }),
    ).toBe(1);
    const again = await promise(id);
    expect(again.lines[0] as unknown as { committedPromise: string }).toMatchObject({
      committedPromise: committed.body.promisedAt,
    });

    await api('POST', `/api/v1/orders/${id}/cancel`, tokenA, { reason: 'Kupac odustao' });
    const cancelled = await prisma.salesOrder.findUnique({ where: { id } });
    if (cancelled?.status === 'CANCELLED') {
      expect((await api('POST', `/api/v1/orders/${id}/promise/commit`, tokenA)).status).toBe(409);
    }
  });

  it('TENANT: another tenant sees neither the order nor the supply', async () => {
    const id = await order([{ skuId: stocked, quantity: 1 }]);
    expect((await promise(id, tokenB)).status).toBe(404);
    expect((await api('POST', `/api/v1/orders/${id}/promise/commit`, tokenB)).status).toBe(404);
    const foreign = await api('POST', '/api/v1/planning/promise', tokenB, {
      lines: [{ skuId: stocked, quantity: 1 }],
    });
    expect((foreign.body.lines as Line[])[0]).toMatchObject({
      availableNow: 0,
      source: 'LEAD_TIME',
    });
  });
});
