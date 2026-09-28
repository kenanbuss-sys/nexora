import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 232 acceptance tests: FIN-028 KUF/KIF books + VAT periods (BiH
 * localization pack). Effective-dated rates, server-side VAT, exactly one
 * posted KUF/KIF ledger entry per book entry, idempotent/concurrent
 * recording, duplicates, storno (negative mirror + ledger storno, filed
 * period unchanged), VAT return filing (one settlement entry + outbox
 * event, period closed), payment status, GL lock, race guards, authz and
 * tenant isolation. Book dates are fixed 2025 months; storno rows land
 * in TODAY's month by design.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const TODAY = new Date().toISOString().slice(0, 10);

integration('Sprint 232 — KUF/KIF + PDV (FIN-028)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s232a', subject: 'idp|s232-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s232b', subject: 'idp|s232b-admin' });
  const viewer = identity.signToken({ tenantSlug: 'test-s232a', subject: 'idp|s232-viewer' });

  let tenantAId = '';
  let le = '';
  let le2 = '';
  let customer = '';
  let supplier = '';
  const acc: Record<string, string> = {};
  let kifId = '';
  let kifKey = '';

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

  const entry = (over: Record<string, unknown> = {}) => ({
    legalEntityId: le,
    bookType: 'KIF',
    requestKey: `k-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    documentNumber: `IF-${Math.random().toString(36).slice(2, 8)}`,
    documentDate: '2025-03-10',
    bookingDate: '2025-03-10',
    partnerId: customer,
    vatRateCode: 'S17',
    netAmount: 100,
    currency: 'BAM',
    counterAccountId: acc.revenue,
    ...over,
  });

  async function glLines(entryId: string) {
    const lines = await prisma.glJournalLine.findMany({
      where: { entryId },
      include: { account: true },
      orderBy: { seq: 'asc' },
    });
    return lines.map((l) => `${l.account.code}:${l.debit.toFixed(2)}/${l.credit.toFixed(2)}`);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "vat_book_entry", "vat_period", "vat_rate",
       "compensation_line", "compensation",
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
      ['test-s232a', 'idp|s232-admin'],
      ['test-s232b', 'idp|s232b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint232 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: `Admin ${slug}`,
          idpSubject: subj,
        },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s232a' } }))!.id;
    le = (await api('POST', '/api/v1/organization/legal-entities', tokenA, { name: 'PDV d.o.o.' }))
      .body.id as string;
    le2 = (
      await api('POST', '/api/v1/organization/legal-entities', tokenA, { name: 'Bez konta d.o.o.' })
    ).body.id as string;
    customer = (
      await api('POST', '/api/v1/parties', tokenA, {
        partyType: 'ORGANIZATION',
        name: 'Kupac Alfa d.o.o.',
      })
    ).body.id as string;
    supplier = (
      await api('POST', '/api/v1/parties', tokenA, {
        partyType: 'ORGANIZATION',
        name: 'Dobavljač Beta d.o.o.',
      })
    ).body.id as string;

    for (const [key, code, name] of [
      ['revenue', '61000000', 'Prihodi od usluga'],
      ['expense', '55000000', 'Troškovi usluga'],
      ['vatOut', '47000000', 'Obaveze za izlazni PDV'],
      ['vatIn', '27000000', 'Ulazni PDV'],
      ['settle', '47900000', 'Obračunati PDV'],
    ] as const) {
      const res = await api('POST', '/api/v1/ledger/accounts', tokenA, {
        legalEntityId: le,
        code,
        name,
      });
      acc[key] = res.body.id as string;
    }
    for (const [roleKey, key] of [
      ['vat.output', 'vatOut'],
      ['vat.input', 'vatIn'],
      ['vat.settlement', 'settle'],
    ] as const) {
      await api('POST', '/api/v1/ledger/system-accounts', tokenA, {
        legalEntityId: le,
        roleKey,
        accountId: acc[key],
      });
    }
    acc.le2Revenue = (
      await api('POST', '/api/v1/ledger/accounts', tokenA, {
        legalEntityId: le2,
        code: '61000000',
        name: 'Prihodi',
      })
    ).body.id as string;

    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 's232-viewer',
      permissions: ['finance.ledger.read'],
    });
    const invited = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'viewer@s232.example',
      displayName: 'Viewer',
      idpSubject: 'idp|s232-viewer',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: invited.body.id,
      roleId: role.body.id,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('BiH pack installs default rates idempotently; rate versions are effective-dated', async () => {
    const first = await api('POST', '/api/v1/vat/pack/bih', tokenA, { legalEntityId: le });
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(2);
    const again = await api('POST', '/api/v1/vat/pack/bih', tokenA, { legalEntityId: le });
    expect(again.body.created).toBe(0);

    await api('POST', '/api/v1/vat/rates', tokenA, {
      legalEntityId: le,
      code: 'T10',
      name: 'Test stopa',
      ratePct: 10,
      validFrom: '2020-01-01',
    });
    await api('POST', '/api/v1/vat/rates', tokenA, {
      legalEntityId: le,
      code: 'T10',
      name: 'Test stopa (nova)',
      ratePct: 12,
      validFrom: '2025-06-01',
    });
    const dup = await api('POST', '/api/v1/vat/rates', tokenA, {
      legalEntityId: le,
      code: 'T10',
      name: 'Dupla verzija',
      ratePct: 13,
      validFrom: '2025-06-01',
    });
    expect(dup.status).toBe(409);

    const before = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({ vatRateCode: 'T10', documentDate: '2025-05-31', bookingDate: '2025-05-31' }),
    );
    const after = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({ vatRateCode: 'T10', documentDate: '2025-06-01', bookingDate: '2025-06-01' }),
    );
    expect(before.body.vatAmount).toBe('10.00');
    expect(after.body.vatAmount).toBe('12.00');
    expect(after.body.ratePct).toBe('12.00');

    const none = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({ documentDate: '2004-12-31', bookingDate: '2025-03-01' }),
    );
    expect(none.status).toBe(400);
    expect(String(none.body.message)).toContain('No VAT rate');
  });

  it('KIF: server-side VAT and exactly one posted KIF ledger entry, audited', async () => {
    const payload = entry({ documentNumber: 'IF-0001' });
    kifKey = payload.requestKey;
    const res = await api('POST', '/api/v1/vat/entries', tokenA, payload);
    expect(res.status).toBe(201);
    kifId = res.body.id as string;
    expect(res.body).toMatchObject({
      bookType: 'KIF',
      year: 2025,
      bookNo: 3, // two KIF rows of 2025 were booked by the rate-version test
      status: 'RECORDED',
      netAmount: '100.00',
      vatAmount: '17.00',
      grossAmount: '117.00',
      partnerName: 'Kupac Alfa d.o.o.',
    });
    const gl = await prisma.glJournalEntry.findFirst({ where: { id: res.body.glEntryId as string } });
    expect(gl).toMatchObject({ entryType: 'KIF', status: 'POSTED' });
    const lines = await glLines(gl!.id);
    expect(lines[1]).toBe('47000000:0.00/17.00');
    expect(lines[2]).toBe('61000000:0.00/100.00');
    expect(lines[0]).toMatch(/^2110\d{4}:117\.00\/0\.00$/);
    const audit = await prisma.auditEvent.count({
      where: { tenantId: tenantAId, action: 'fin.vat.entry.record', objectId: kifId },
    });
    expect(audit).toBe(1);
  });

  it('KUF: input VAT on the debit side, supplier credited gross; cent rounding', async () => {
    const res = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({
        bookType: 'KUF',
        documentNumber: 'UF-77',
        partnerId: supplier,
        netAmount: 10.05,
        counterAccountId: acc.expense,
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ bookNo: 1, vatAmount: '1.71', grossAmount: '11.76' });
    const lines = await glLines(res.body.glEntryId as string);
    expect(lines[0]).toBe('55000000:10.05/0.00');
    expect(lines[1]).toBe('27000000:1.71/0.00');
    expect(lines[2]).toMatch(/^4320\d{4}:0\.00\/11\.76$/);
  });

  it('IDEMPOTENCY: replay returns the same entry; changed payload → 409; concurrent → one entry', async () => {
    const replay = await api('POST', '/api/v1/vat/entries', tokenA, {
      ...entry({ documentNumber: 'IF-0001' }),
      requestKey: kifKey,
    });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(kifId);
    const changed = await api('POST', '/api/v1/vat/entries', tokenA, {
      ...entry({ documentNumber: 'IF-0001', netAmount: 101 }),
      requestKey: kifKey,
    });
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe('CONFLICT');

    const payload = entry({ documentNumber: 'IF-0002', netAmount: 200 });
    const results = await Promise.all(
      [1, 2, 3].map(() => api('POST', '/api/v1/vat/entries', tokenA, payload)),
    );
    const ok = results.filter((r) => r.status === 201);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of results) expect([201, 409]).toContain(r.status);
    const rows = await prisma.vatBookEntry.findMany({
      where: { tenantId: tenantAId, requestKey: payload.requestKey },
    });
    expect(rows).toHaveLength(1);
    const final = await api('POST', '/api/v1/vat/entries', tokenA, payload);
    expect(final.body.status).toBe('RECORDED');
    const glCount = await prisma.glJournalEntry.count({
      where: { tenantId: tenantAId, description: { contains: 'IF-0002' } },
    });
    expect(glCount).toBe(1);
  });

  it('DUPLICATES and validation: same partner document twice, invoice mismatch, unmapped VAT account', async () => {
    const dup = await api('POST', '/api/v1/vat/entries', tokenA, entry({ documentNumber: 'IF-0001' }));
    expect(dup.status).toBe(409);
    expect(String(dup.body.message)).toContain('already in KIF');

    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenantAId,
        invoiceNumber: 'INV-232-1',
        invoiceType: 'CUSTOMER',
        partyRefId: customer,
        orderRefId: supplier,
        currency: 'BAM',
        total: 117,
      },
    });
    const wrongType = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({
        bookType: 'KUF',
        partnerId: customer,
        counterAccountId: acc.expense,
        invoiceId: invoice.id,
      }),
    );
    expect(wrongType.status).toBe(400);
    const wrongAmount = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({ netAmount: 99, invoiceId: invoice.id }),
    );
    expect(wrongAmount.status).toBe(400);
    const linked = await api('POST', '/api/v1/vat/entries', tokenA, entry({ invoiceId: invoice.id }));
    expect(linked.status).toBe(201);
    const twice = await api('POST', '/api/v1/vat/entries', tokenA, entry({ invoiceId: invoice.id }));
    expect(twice.status).toBe(409);

    await api('POST', '/api/v1/vat/pack/bih', tokenA, { legalEntityId: le2 });
    const unmapped = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({ legalEntityId: le2, counterAccountId: acc.le2Revenue }),
    );
    expect(unmapped.status).toBe(409);
    expect(String(unmapped.body.message)).toContain('vat.output');
    expect(await prisma.vatBookEntry.count({ where: { legalEntityId: le2 } })).toBe(0);
  });

  it('BOOK + PERIOD: KIF/KUF totals for the month reconcile with the ledger VAT accounts', async () => {
    const kif = await api(
      'GET',
      `/api/v1/vat/books?legalEntityId=${le}&bookType=KIF&year=2025&month=3`,
      tokenA,
    );
    expect(kif.status).toBe(200);
    // IF-0001 (100), IF-0002 (200), invoice-linked (100)
    expect(kif.body.totals).toEqual({ net: '400.00', vat: '68.00', gross: '468.00' });
    const summary = await api(
      'GET',
      `/api/v1/vat/periods/summary?legalEntityId=${le}&year=2025&month=3`,
      tokenA,
    );
    expect(summary.body).toMatchObject({
      status: 'OPEN',
      outputVat: '68.00',
      inputVat: '1.71',
      payableVat: '66.29',
      pendingEntries: 0,
      ledger: { outputVat: '68.00', inputVat: '1.71', reconciled: true },
    });
  });

  it('FILING: one settlement entry + one outbox event; idempotent; the period closes', async () => {
    const filed = await api('POST', '/api/v1/vat/periods/file', tokenA, {
      legalEntityId: le,
      year: 2025,
      month: 3,
    });
    expect(filed.status).toBe(201);
    expect(filed.body).toMatchObject({ status: 'FILED', payableVat: '66.29' });
    const settlementId = filed.body.settlementEntryId as string;
    const settlement = await prisma.glJournalEntry.findFirst({ where: { id: settlementId } });
    expect(settlement).toMatchObject({ entryType: 'ACCRUAL', status: 'POSTED' });
    expect(settlement!.bookingDate.toISOString().slice(0, 10)).toBe('2025-03-31');
    expect(await glLines(settlementId)).toEqual([
      '47000000:68.00/0.00',
      '27000000:0.00/1.71',
      '47900000:0.00/66.29',
    ]);

    const again = await api('POST', '/api/v1/vat/periods/file', tokenA, {
      legalEntityId: le,
      year: 2025,
      month: 3,
    });
    expect(again.body.settlementEntryId).toBe(settlementId);
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: tenantAId, eventType: 'vat.return.filed' },
      }),
    ).toBe(1);

    const late = await api('POST', '/api/v1/vat/entries', tokenA, entry());
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('INVALID_STATE');
    expect(String(late.body.message)).toContain('filed');
  });

  it('STORNO: negative mirror in the current period + ledger storno; filed snapshot unchanged; idempotent', async () => {
    const res = await api('POST', `/api/v1/vat/entries/${kifId}/storno`, tokenA, {
      reason: 'Pogrešan iznos na fakturi',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'STORNO',
      stornoOfId: kifId,
      netAmount: '-100.00',
      vatAmount: '-17.00',
      grossAmount: '-117.00',
      bookingDate: TODAY,
    });
    const original = await prisma.vatBookEntry.findFirst({ where: { id: kifId } });
    expect(original!.status).toBe('STORNOED');
    const origGl = await prisma.glJournalEntry.findFirst({ where: { id: original!.glEntryId! } });
    expect(origGl!.stornoedById).toBe(res.body.glEntryId);

    const again = await api('POST', `/api/v1/vat/entries/${kifId}/storno`, tokenA, {
      reason: 'Pogrešan iznos na fakturi',
    });
    expect(again.body.id).toBe(res.body.id);
    expect(
      await prisma.glJournalEntry.count({ where: { tenantId: tenantAId, stornoOfId: origGl!.id } }),
    ).toBe(1);
    const stornoOfStorno = await api(
      'POST',
      `/api/v1/vat/entries/${res.body.id as string}/storno`,
      tokenA,
      { reason: 'Storno storna' },
    );
    expect(stornoOfStorno.status).toBe(409);

    const march = await api(
      'GET',
      `/api/v1/vat/periods/summary?legalEntityId=${le}&year=2025&month=3`,
      tokenA,
    );
    expect(march.body).toMatchObject({ status: 'FILED', outputVat: '68.00', payableVat: '66.29' });
    const [y, m] = TODAY.split('-').map(Number);
    const current = await api(
      'GET',
      `/api/v1/vat/books?legalEntityId=${le}&bookType=KIF&year=${y}&month=${m}`,
      tokenA,
    );
    expect((current.body.rows as Array<{ id: string }>).some((r) => r.id === res.body.id)).toBe(
      true,
    );
  });

  it('PAYMENT STATUS: only a filed period; idempotent; conflicting data refused', async () => {
    const open = await api('POST', '/api/v1/vat/periods/paid', tokenA, {
      legalEntityId: le,
      year: 2025,
      month: 4,
      paidAt: '2025-05-10',
      reference: 'UPL-1',
    });
    expect(open.status).toBe(409);
    const paid = await api('POST', '/api/v1/vat/periods/paid', tokenA, {
      legalEntityId: le,
      year: 2025,
      month: 3,
      paidAt: '2025-04-10',
      reference: 'UPL-03',
    });
    expect(paid.body).toMatchObject({ paidAt: '2025-04-10', paidReference: 'UPL-03' });
    const same = await api('POST', '/api/v1/vat/periods/paid', tokenA, {
      legalEntityId: le,
      year: 2025,
      month: 3,
      paidAt: '2025-04-10',
      reference: 'UPL-03',
    });
    expect(same.status).toBe(201);
    const other = await api('POST', '/api/v1/vat/periods/paid', tokenA, {
      legalEntityId: le,
      year: 2025,
      month: 3,
      paidAt: '2025-04-11',
      reference: 'UPL-X',
    });
    expect(other.status).toBe(409);
  });

  it('RACE GUARDS: a FILING period refuses entries; a PENDING entry blocks filing and reopens the period', async () => {
    await prisma.vatPeriod.create({
      data: { tenantId: tenantAId, legalEntityId: le, year: 2025, month: 7, status: 'FILING' },
    });
    const blocked = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({ documentDate: '2025-07-02', bookingDate: '2025-07-02' }),
    );
    expect(blocked.status).toBe(409);
    expect(
      await prisma.vatBookEntry.count({
        where: { tenantId: tenantAId, bookingDate: new Date('2025-07-02') },
      }),
    ).toBe(0);

    await prisma.vatBookEntry.create({
      data: {
        tenantId: tenantAId,
        legalEntityId: le,
        bookType: 'KIF',
        year: 2025,
        bookNo: 900,
        status: 'PENDING',
        documentNumber: 'PEND-1',
        documentDate: new Date('2025-08-05'),
        bookingDate: new Date('2025-08-05'),
        partnerId: customer,
        partnerName: 'Kupac Alfa d.o.o.',
        vatRateCode: 'S17',
        ratePct: 17,
        netAmount: 10,
        vatAmount: 1.7,
        grossAmount: 11.7,
        currency: 'BAM',
        counterAccountId: acc.revenue,
        requestKey: 'pending-key-0001',
        requestHash: 'x',
      },
    });
    const refused = await api('POST', '/api/v1/vat/periods/file', tokenA, {
      legalEntityId: le,
      year: 2025,
      month: 8,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('CONFLICT');
    const period = await prisma.vatPeriod.findFirst({ where: { legalEntityId: le, month: 8 } });
    expect(period!.status).toBe('OPEN');
    expect(period!.settlementEntryId).toBeNull();
  });

  it('CONCURRENT FILING: exactly one settlement entry and one event', async () => {
    await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({ documentNumber: 'IF-MAY', documentDate: '2025-05-15', bookingDate: '2025-05-15' }),
    );
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        api('POST', '/api/v1/vat/periods/file', tokenA, { legalEntityId: le, year: 2025, month: 5 }),
      ),
    );
    for (const r of results) expect([201, 409]).toContain(r.status);
    const final = await api('POST', '/api/v1/vat/periods/file', tokenA, {
      legalEntityId: le,
      year: 2025,
      month: 5,
    });
    expect(final.body.status).toBe('FILED');
    expect(
      await prisma.glJournalEntry.count({
        where: { tenantId: tenantAId, description: 'PDV prijava 05/2025' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: tenantAId, eventType: 'vat.return.filed' },
      }),
    ).toBe(2);
  });

  it('GL PERIOD LOCK: recording in a locked period is refused before any write', async () => {
    await api('POST', '/api/v1/ledger/control/period-lock', tokenA, {
      legalEntityId: le,
      lockedThrough: '2025-04-30',
    });
    const before = await prisma.vatBookEntry.count({ where: { tenantId: tenantAId } });
    const locked = await api(
      'POST',
      '/api/v1/vat/entries',
      tokenA,
      entry({ documentDate: '2025-04-20', bookingDate: '2025-04-20' }),
    );
    expect(locked.status).toBe(409);
    expect(String(locked.body.message)).toContain('locked');
    expect(await prisma.vatBookEntry.count({ where: { tenantId: tenantAId } })).toBe(before);
  });

  it('AUTHZ + TENANT: read-only user cannot post or file; cross-tenant is not found', async () => {
    const read = await api(
      'GET',
      `/api/v1/vat/books?legalEntityId=${le}&bookType=KIF&year=2025&month=3`,
      viewer,
    );
    expect(read.status).toBe(200);
    const post = await api('POST', '/api/v1/vat/entries', viewer, entry());
    expect(post.status).toBe(403);
    const file = await api('POST', '/api/v1/vat/periods/file', viewer, {
      legalEntityId: le,
      year: 2025,
      month: 6,
    });
    expect(file.status).toBe(403);
    const rate = await api('POST', '/api/v1/vat/rates', viewer, {
      legalEntityId: le,
      code: 'X1',
      name: 'x',
      ratePct: 1,
      validFrom: '2025-01-01',
    });
    expect(rate.status).toBe(403);
    const stranger = identity.signToken({ tenantSlug: 'test-s232a', subject: 'idp|s232-nobody' });
    const denied = await api('GET', `/api/v1/vat/rates?legalEntityId=${le}`, stranger);
    expect([401, 403]).toContain(denied.status);

    const crossView = await api('GET', `/api/v1/vat/entries/${kifId}`, tokenB);
    expect(crossView.status).toBe(404);
    const crossBook = await api(
      'GET',
      `/api/v1/vat/books?legalEntityId=${le}&bookType=KIF&year=2025&month=3`,
      tokenB,
    );
    expect(crossBook.status).toBe(404);
    const crossStorno = await api('POST', `/api/v1/vat/entries/${kifId}/storno`, tokenB, {
      reason: 'Tuđi tenant',
    });
    expect(crossStorno.status).toBe(404);
    const crossFile = await api('POST', '/api/v1/vat/periods/file', tokenB, {
      legalEntityId: le,
      year: 2025,
      month: 6,
    });
    expect(crossFile.status).toBe(404);
  });
});
