import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 214 acceptance tests: FIN-032 compensation — open-item
 * selection, partial amounts, explicit confirmation with ONE linked
 * COMPENSATION ledger entry and no duplicated closure, over-closing
 * control, repeated and concurrent confirmation, controlled cancel
 * (payment release + storno) with audit, period lock, tenant bounds.
 * Dates are deterministic (fixed past dates and TODAY-derived bounds).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const TODAY = new Date().toISOString().slice(0, 10);

integration('Sprint 214 — compensation (FIN-032)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s214a', subject: 'idp|s214-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s214b', subject: 'idp|s214b-admin' });

  let tenantAId = '';
  let le = '';
  let partnerId = '';
  let invCustomer = ''; // total 200
  let invSupplier = ''; // total 120
  let comp1 = '';
  let comp2 = '';

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

  async function paid(invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId } });
    return { paid: invoice!.paidAmount.toString(), status: invoice!.status };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "compensation_line", "compensation",
       "payment_allocation", "bank_statement_line", "bank_statement",
       "payment", "invoice",
       "gl_journal_line", "gl_journal_entry", "gl_account",
       "gl_system_account", "gl_opening_balance_date", "gl_period_lock",
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

    for (const [slug, subj] of [
      ['test-s214a', 'idp|s214-admin'],
      ['test-s214b', 'idp|s214b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint214 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: `Admin ${slug}`,
          idpSubject: subj,
        },
      });
    }
    const tenantA = await prisma.tenant.findFirst({ where: { slug: 'test-s214a' } });
    tenantAId = tenantA!.id;
    const entity = await api('POST', '/api/v1/organization/legal-entities', tokenA, {
      name: 'Kompenzacije d.o.o.',
    });
    le = entity.body.id as string;
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Partner Gama d.o.o.',
    });
    partnerId = party.body.id as string;

    const customer = await prisma.invoice.create({
      data: {
        tenantId: tenantAId,
        invoiceNumber: 'INV-C-0001',
        invoiceType: 'CUSTOMER',
        partyRefId: partnerId,
        orderRefId: randomUUID(),
        currency: 'EUR',
        total: 200,
      },
    });
    invCustomer = customer.id;
    // The supplier invoice needs a RECEIVED purchase order so the
    // FIN-014 three-way match (PROC-014) allows closing it.
    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId: tenantAId,
        poNumber: 'PO-S214-001',
        supplierId: partnerId,
        warehouseId: randomUUID(),
        status: 'RECEIVED',
        currency: 'EUR',
        total: 120,
      },
    });
    await prisma.purchaseOrderLine.create({
      data: {
        tenantId: tenantAId,
        poId: po.id,
        skuId: randomUUID(),
        description: 'Usluga',
        quantity: 1,
        unitPrice: 120,
        lineTotal: 120,
        receivedQty: 1,
      },
    });
    const supplier = await prisma.invoice.create({
      data: {
        tenantId: tenantAId,
        invoiceNumber: 'INV-S-0001',
        invoiceType: 'SUPPLIER',
        partyRefId: partnerId,
        orderRefId: po.id,
        currency: 'EUR',
        total: 120,
      },
    });
    invSupplier = supplier.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIN-032: unbalanced sides and over-closing are refused', async () => {
    const unbalanced = await api('POST', '/api/v1/compensations', tokenA, {
      legalEntityId: le,
      partnerId,
      bookingDate: TODAY,
      receivables: [{ invoiceId: invCustomer, amount: 100 }],
      payables: [{ invoiceId: invSupplier, amount: 90 }],
    });
    expect(unbalanced.status).toBe(400);

    const over = await api('POST', '/api/v1/compensations', tokenA, {
      legalEntityId: le,
      partnerId,
      bookingDate: TODAY,
      receivables: [{ invoiceId: invCustomer, amount: 130 }],
      payables: [{ invoiceId: invSupplier, amount: 130 }], // supplier open = 120
    });
    expect(over.status).toBe(400);
    expect(JSON.stringify(over.body)).toContain('INV-S-0001');
  });

  it('FIN-032: open items list both sides; a balanced draft is created for review', async () => {
    const items = await api(
      'GET',
      `/api/v1/compensations/open-items?legalEntityId=${le}&partnerId=${partnerId}`,
      tokenA,
    );
    expect(items.status).toBe(200);
    const list = items.body.items as Array<{ side: string; open: string }>;
    expect(list.find((i) => i.side === 'RECEIVABLE')?.open).toBe('200.00');
    expect(list.find((i) => i.side === 'PAYABLE')?.open).toBe('120.00');

    const draft = await api('POST', '/api/v1/compensations', tokenA, {
      legalEntityId: le,
      partnerId,
      bookingDate: TODAY,
      receivables: [{ invoiceId: invCustomer, amount: 100 }],
      payables: [{ invoiceId: invSupplier, amount: 100 }],
    });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('DRAFT');
    expect(draft.body.compensationNumber).toBe('KOM-000001');
    comp1 = draft.body.id as string;
    // Review: nothing closed yet.
    expect((await paid(invCustomer)).paid).toBe('0');
  });

  it('FIN-032: explicit confirm closes both sides and posts EXACTLY ONE linked entry', async () => {
    const confirmed = await api('POST', `/api/v1/compensations/${comp1}/confirm`, tokenA);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.status).toBe('CONFIRMED');
    const glEntryId = confirmed.body.glEntryId as string;
    expect(glEntryId).toBeTruthy();

    expect(await paid(invCustomer)).toEqual({ paid: '100', status: 'PARTIALLY_PAID' });
    expect(await paid(invSupplier)).toEqual({ paid: '100', status: 'PARTIALLY_PAID' });

    const entry = await prisma.glJournalEntry.findFirst({ where: { id: glEntryId } });
    expect(entry?.status).toBe('POSTED');
    expect(entry?.entryType).toBe('COMPENSATION');
    const lines = await prisma.glJournalLine.findMany({ where: { entryId: glEntryId } });
    expect(lines.length).toBe(2);
    expect(lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)).toBe(0);

    const audits = await prisma.auditEvent.count({
      where: { tenantId: tenantAId, action: 'fin.compensation.confirm' },
    });
    expect(audits).toBe(1);
  });

  it('FIN-032: repeated confirmation duplicates nothing', async () => {
    const again = await api('POST', `/api/v1/compensations/${comp1}/confirm`, tokenA);
    expect(again.body.status).toBe('CONFIRMED');
    expect(await paid(invCustomer)).toEqual({ paid: '100', status: 'PARTIALLY_PAID' });
    const compEntries = await prisma.glJournalEntry.count({
      where: { tenantId: tenantAId, entryType: 'COMPENSATION' },
    });
    expect(compEntries).toBe(1);
  });

  it('FIN-032: concurrent confirmations of one draft never double-close', async () => {
    const draft = await api('POST', '/api/v1/compensations', tokenA, {
      legalEntityId: le,
      partnerId,
      bookingDate: TODAY,
      receivables: [{ invoiceId: invCustomer, amount: 20 }],
      payables: [{ invoiceId: invSupplier, amount: 20 }], // supplier open = 20
    });
    expect(draft.status).toBe(201);
    comp2 = draft.body.id as string;

    const results = await Promise.allSettled([
      api('POST', `/api/v1/compensations/${comp2}/confirm`, tokenA),
      api('POST', `/api/v1/compensations/${comp2}/confirm`, tokenA),
    ]);
    expect(results.length).toBe(2);
    // Converge with one more (idempotent) confirm, then verify integrity.
    const final = await api('POST', `/api/v1/compensations/${comp2}/confirm`, tokenA);
    expect(final.body.status).toBe('CONFIRMED');
    expect(await paid(invCustomer)).toEqual({ paid: '120', status: 'PARTIALLY_PAID' });
    expect(await paid(invSupplier)).toEqual({ paid: '120', status: 'PAID' });
    const compEntries = await prisma.glJournalEntry.count({
      where: { tenantId: tenantAId, entryType: 'COMPENSATION', status: 'POSTED' },
    });
    expect(compEntries).toBe(2); // comp1 + comp2, exactly once each
  });

  it('FIN-032: the printable document carries both sides and totals', async () => {
    const document = await api('GET', `/api/v1/compensations/${comp1}/document`, tokenA);
    expect(document.status).toBe(200);
    expect(document.body.title).toContain('KOM-000001');
    expect((document.body.receivables as unknown[]).length).toBe(1);
    expect((document.body.payables as unknown[]).length).toBe(1);
    expect(document.body.totalAmount).toBe('100');
  });

  it('FIN-032: controlled cancel releases payments, stornos the entry, audits the reason', async () => {
    const glBefore = await prisma.glJournalEntry.count();
    const cancelled = await api('POST', `/api/v1/compensations/${comp1}/cancel`, tokenA, {
      reason: 'Pogrešan obim kompenzacije',
    });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe('CANCELLED');

    // paidAmount rolled back by 100 on both sides — through append-only
    // negative mirror payments, never by deleting history.
    expect(await paid(invCustomer)).toEqual({ paid: '20', status: 'PARTIALLY_PAID' });
    expect(await paid(invSupplier)).toEqual({ paid: '20', status: 'PARTIALLY_PAID' });
    const releases = await prisma.payment.count({
      where: { tenantId: tenantAId, reversesPaymentId: { not: null } },
    });
    expect(releases).toBe(2);

    // The COMPENSATION entry is stornoed (mirror STORNO), not deleted.
    const view = await api('GET', `/api/v1/compensations/${comp1}`, tokenA);
    const entry = await prisma.glJournalEntry.findFirst({
      where: { id: view.body.glEntryId as string },
    });
    expect(entry?.stornoedById).toBeTruthy();
    expect(await prisma.glJournalEntry.count()).toBe(glBefore + 1); // + storno mirror

    const audits = await prisma.auditEvent.count({
      where: { tenantId: tenantAId, action: 'fin.compensation.cancel' },
    });
    expect(audits).toBe(1);

    // Repeated cancel: idempotent, no second release, no second storno.
    const again = await api('POST', `/api/v1/compensations/${comp1}/cancel`, tokenA, {
      reason: 'Ponovljeni zahtjev',
    });
    expect(again.body.status).toBe('CANCELLED');
    expect(
      await prisma.payment.count({
        where: { tenantId: tenantAId, reversesPaymentId: { not: null } },
      }),
    ).toBe(2);
  });

  it('FIN-032: a draft cannot be cancelled; a cancelled one cannot be confirmed', async () => {
    const draft = await api('POST', '/api/v1/compensations', tokenA, {
      legalEntityId: le,
      partnerId,
      bookingDate: TODAY,
      receivables: [{ invoiceId: invCustomer, amount: 5 }],
      payables: [{ invoiceId: invSupplier, amount: 5 }],
    });
    const cancelDraft = await api(
      'POST',
      `/api/v1/compensations/${draft.body.id as string}/cancel`,
      tokenA,
      { reason: 'Ne može — nacrt' },
    );
    expect(cancelDraft.status).toBe(409);
    const confirmCancelled = await api('POST', `/api/v1/compensations/${comp1}/confirm`, tokenA);
    expect(confirmCancelled.status).toBe(409);
  });

  it('FIN-032: a locked period refuses confirmation BEFORE any side effect', async () => {
    const draft = await api('POST', '/api/v1/compensations', tokenA, {
      legalEntityId: le,
      partnerId,
      bookingDate: '2026-08-15',
      receivables: [{ invoiceId: invCustomer, amount: 10 }],
      payables: [{ invoiceId: invSupplier, amount: 10 }],
    });
    await api('POST', '/api/v1/ledger/control/period-lock', tokenA, {
      legalEntityId: le,
      lockedThrough: '2026-08-31',
    });
    const paidBefore = await paid(invCustomer);
    const refused = await api(
      'POST',
      `/api/v1/compensations/${draft.body.id as string}/confirm`,
      tokenA,
    );
    expect(refused.status).toBe(409);
    // Financial integrity: no half-applied payments on a refused confirm.
    expect(await paid(invCustomer)).toEqual(paidBefore);
    const view = await api('GET', `/api/v1/compensations/${draft.body.id as string}`, tokenA);
    expect(view.body.status).toBe('DRAFT');
  });

  it('AUTHZ + TENANT: permission required; cross-tenant not found', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s214a', subject: 'idp|s214-nobody' });
    const denied = await api('GET', `/api/v1/compensations?legalEntityId=${le}`, stranger);
    expect([401, 403]).toContain(denied.status);
    const cross = await api('GET', `/api/v1/compensations/${comp1}`, tokenB);
    expect([403, 404]).toContain(cross.status);
    const crossConfirm = await api('POST', `/api/v1/compensations/${comp2}/cancel`, tokenB, {
      reason: 'Tuđi tenant',
    });
    expect([403, 404]).toContain(crossConfirm.status);
  });
});
