import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 245 acceptance tests: CSM-011 case-to-order linkage. Link a case
 * to an order (account inherited / mismatch refused, switching refused
 * while lines are recorded); affected lines with quantity and issue type
 * (validated against the order and csm.orderIssueTypes; audited); order
 * context on the case (lines, fulfilment, timeline, returns, other cases);
 * cases listed per order; RMA opened from the case through OMS for
 * returnable issues only, idempotent per request key (also concurrently);
 * concurrent case creation gets unique numbers; tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 245 — case-to-order linkage (CSM-011)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s245a', subject: 'idp|s245-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s245b', subject: 'idp|s245b-admin' });

  let tenantAId = '';
  let wh = '';
  let accountId = '';
  let otherAccountId = '';
  let sku1 = '';
  let sku2 = '';
  let orderId = '';
  let line1 = '';
  let line2 = '';
  let caseId = '';

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

  const createCase = (body: Record<string, unknown>, token = tokenA) =>
    api('POST', '/api/v1/support-cases', token, { subject: 'Reklamacija isporuke', ...body });

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "support_case_return", "support_case_order_item", "support_case",
       "return_order_line", "return_order", "stock_reservation", "stock_movement",
       "sales_order_line", "sales_order", "order_event",
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
      ['test-s245a', 'idp|s245-admin'],
      ['test-s245b', 'idp|s245b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint245 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s245a' } }))!.id;
    wh = (await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH1', name: 'Centralno' })).body
      .id as string;
    sku1 = await makeSku('PLOCICE');
    sku2 = await makeSku('LJEPILO');
    await receive(sku1, 50);
    await receive(sku2, 50);
    for (const [company, set] of [
      ['Gradnja d.o.o.', (v: string) => (accountId = v)],
      ['Drugi kupac d.o.o.', (v: string) => (otherAccountId = v)],
    ] as const) {
      const lead = await api('POST', '/api/v1/crm/leads', tokenA, { name: company, company });
      set(
        (await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {})).body
          .accountId as string,
      );
    }
    orderId = await order([
      { skuId: sku1, quantity: 10 },
      { skuId: sku2, quantity: 4 },
    ]);
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
    await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    const lines = await prisma.salesOrderLine.findMany({ where: { orderId } });
    line1 = lines.find((l) => l.skuId === sku1)!.id;
    line2 = lines.find((l) => l.skuId === sku2)!.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('LINK: a case inherits the order account; another customer is refused', async () => {
    const c = await createCase({});
    caseId = c.body.id as string;
    const linked = await api('POST', `/api/v1/support-cases/${caseId}/order`, tokenA, { orderId });
    expect(linked.body).toMatchObject({ orderId, changed: true });
    expect((await prisma.supportCase.findUnique({ where: { id: caseId } }))?.accountId).toBe(
      accountId,
    );
    const same = await api('POST', `/api/v1/support-cases/${caseId}/order`, tokenA, { orderId });
    expect(same.body).toMatchObject({ changed: false });

    const foreignCustomer = await createCase({ accountId: otherAccountId });
    const refused = await api(
      'POST',
      `/api/v1/support-cases/${foreignCustomer.body.id}/order`,
      tokenA,
      { orderId },
    );
    expect(refused.status).toBe(400);
  });

  it('ITEMS: affected lines are validated against the order and the issue types', async () => {
    const put = (items: unknown[]) =>
      api('PUT', `/api/v1/support-cases/${caseId}/order-items`, tokenA, { items });
    expect((await put([{ orderLineId: line1, quantity: 11, issueType: 'DAMAGED' }])).status).toBe(
      400,
    );
    expect(
      (await put([{ orderLineId: line1, quantity: 2, issueType: 'BROKEN_GLASS' }])).status,
    ).toBe(400);
    expect(
      (await put([{ orderLineId: randomUUID(), quantity: 1, issueType: 'DAMAGED' }])).status,
    ).toBe(400);
    const ok = await put([
      { orderLineId: line1, quantity: 3, issueType: 'DAMAGED', note: 'Polomljene pri istovaru' },
      { orderLineId: line2, quantity: 4, issueType: 'LATE' },
    ]);
    expect(ok.status).toBe(200);
    expect((ok.body.items as unknown[]).length).toBe(2);
    expect(
      await prisma.auditEvent.count({
        where: { tenantId: tenantAId, action: 'csm.case.order.items', objectId: caseId },
      }),
    ).toBe(1);
    // Switching to another order is refused while lines are recorded.
    const other = await order([{ skuId: sku1, quantity: 1 }]);
    const sw = await api('POST', `/api/v1/support-cases/${caseId}/order`, tokenA, {
      orderId: other,
    });
    expect(sw.status).toBe(409);
  });

  it('CONTEXT: the case shows the order, fulfilment, timeline and other cases; the order lists its cases', async () => {
    const second = await createCase({ orderId, subject: 'Pitanje o računu' });
    const ctx = await api('GET', `/api/v1/support-cases/${caseId}/order-context`, tokenA);
    expect(ctx.status).toBe(200);
    const order = ctx.body.order as {
      orderNumber: string;
      status: string;
      lines: Array<{ id: string; fulfilledQty: string }>;
      timeline: unknown[];
    };
    expect(order.status).toBe('FULFILLED');
    expect(order.lines.find((l) => l.id === line1)?.fulfilledQty).toBe('10');
    expect(order.timeline.length).toBeGreaterThan(0);
    expect((ctx.body.otherCases as Array<{ id: string }>).map((c) => c.id)).toEqual([
      second.body.id,
    ]);
    expect(ctx.body.returnableIssueTypes).toEqual(['DAMAGED', 'WRONG_ITEM', 'QUALITY']);

    const byOrder = await api('GET', `/api/v1/support-cases/by-order/${orderId}`, tokenA);
    const cases = byOrder.body.cases as Array<{ id: string; items: unknown[] }>;
    expect(cases.map((c) => c.id).sort()).toEqual([caseId, second.body.id].sort());
    expect(cases.find((c) => c.id === caseId)?.items).toHaveLength(2);
  });

  it('RETURN: an RMA opens for returnable lines only, idempotently (also concurrently)', async () => {
    const key = `rma-${randomUUID()}`;
    const [r1, r2] = await Promise.all([
      api('POST', `/api/v1/support-cases/${caseId}/returns`, tokenA, { requestKey: key }),
      api('POST', `/api/v1/support-cases/${caseId}/returns`, tokenA, { requestKey: key }),
    ]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(r1.body.returnId).toBe(r2.body.returnId);
    const rma = await prisma.returnOrder.findUnique({
      where: { id: r1.body.returnId as string },
      include: { lines: true },
    });
    // Only the DAMAGED line (3 units) — the LATE line is not returned.
    expect(rma?.lines.map((l) => [l.orderLineId, l.quantity.toString()])).toEqual([[line1, '3']]);
    expect(await prisma.returnOrder.count({ where: { tenantId: tenantAId } })).toBe(1);
    expect(await prisma.supportCaseReturn.count({ where: { caseId } })).toBe(1);

    const ctx = await api('GET', `/api/v1/support-cases/${caseId}/order-context`, tokenA);
    expect((ctx.body.caseReturns as Array<{ rmaNumber: string }>)[0]?.rmaNumber).toBe(
      rma?.rmaNumber,
    );
    expect((ctx.body.returns as unknown[]).length).toBe(1);

    // A case with only non-returnable issues cannot open an RMA.
    const lateOnly = await createCase({ orderId, subject: 'Kasni isporuka' });
    await api('PUT', `/api/v1/support-cases/${lateOnly.body.id}/order-items`, tokenA, {
      items: [{ orderLineId: line2, quantity: 1, issueType: 'LATE' }],
    });
    const refused = await api('POST', `/api/v1/support-cases/${lateOnly.body.id}/returns`, tokenA, {
      requestKey: `rma-${randomUUID()}`,
    });
    expect(refused.status).toBe(409);
  });

  it('NUMBERS + TENANT: parallel cases get unique numbers; another tenant sees nothing', async () => {
    const many = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createCase({ subject: `Upit ${i}` })),
    );
    expect(many.every((r) => r.status === 201)).toBe(true);
    expect(new Set(many.map((r) => r.body.caseNumber)).size).toBe(5);

    expect((await api('GET', `/api/v1/support-cases/${caseId}/order-context`, tokenB)).status).toBe(
      404,
    );
    expect((await api('GET', `/api/v1/support-cases/by-order/${orderId}`, tokenB)).status).toBe(
      404,
    );
    const foreign = await createCase({}, tokenB);
    expect(
      (await api('POST', `/api/v1/support-cases/${foreign.body.id}/order`, tokenB, { orderId }))
        .status,
    ).toBe(404);
    expect(
      (
        await api('POST', `/api/v1/support-cases/${caseId}/returns`, tokenB, {
          requestKey: `rma-${randomUUID()}`,
        })
      ).status,
    ).toBe(404);
  });
});
