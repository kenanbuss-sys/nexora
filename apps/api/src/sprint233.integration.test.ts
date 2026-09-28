import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 233 acceptance tests: FIN-033 precedent-based posting proposals,
 * draft-only. Deterministic proposal from POSTED precedents (partner or
 * keywords), confidence computed in code (≥3 HIGH, 1–2 MEDIUM, 0 LOW),
 * stornoed precedents ignored, only accounts of the legal entity's chart
 * (inactive ones flagged), amounts balanced to the cent, acceptance
 * creates a DRAFT only with audited provenance, KUF/KIF assist, authz
 * and tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 233 — posting proposals (FIN-033)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s233a', subject: 'idp|s233-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s233b', subject: 'idp|s233b-admin' });
  const viewer = identity.signToken({ tenantSlug: 'test-s233a', subject: 'idp|s233-viewer' });

  let tenantAId = '';
  let le = '';
  let leB = '';
  let supplier = '';
  let newcomer = '';
  let supplierAcc = '';
  const acc: Record<string, string> = {};
  const precedentIds: string[] = [];
  let foreignEntry = '';

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

  async function postEntry(
    token: string,
    legalEntityId: string,
    description: string,
    lines: Array<{ accountId: string; debit: number; credit: number; partnerId?: string }>,
    bookingDate = '2025-02-10',
  ) {
    const draft = await api('POST', '/api/v1/ledger/entries', token, {
      legalEntityId,
      entryType: 'MANUAL',
      bookingDate,
      description,
      lines,
    });
    const posted = await api(
      'POST',
      `/api/v1/ledger/entries/${draft.body.id as string}/post`,
      token,
    );
    expect(posted.body.status).toBe('POSTED');
    return draft.body.id as string;
  }

  type Line = { accountId: string | null; debit: string; credit: string; note?: string };

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
      ['test-s233a', 'idp|s233-admin'],
      ['test-s233b', 'idp|s233b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint233 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: `Admin ${slug}`,
          idpSubject: subj,
        },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s233a' } }))!.id;
    le = (
      await api('POST', '/api/v1/organization/legal-entities', tokenA, { name: 'Presedan d.o.o.' })
    ).body.id as string;
    leB = (
      await api('POST', '/api/v1/organization/legal-entities', tokenB, { name: 'Tuđa d.o.o.' })
    ).body.id as string;
    supplier = (
      await api('POST', '/api/v1/parties', tokenA, {
        partyType: 'ORGANIZATION',
        name: 'Zakupodavac Gama d.o.o.',
      })
    ).body.id as string;
    newcomer = (
      await api('POST', '/api/v1/parties', tokenA, {
        partyType: 'ORGANIZATION',
        name: 'Novi Partner d.o.o.',
      })
    ).body.id as string;
    for (const [key, code, name] of [
      ['rent', '55300000', 'Troškovi zakupa'],
      ['other', '55900000', 'Ostali troškovi'],
      ['vatIn', '27000000', 'Ulazni PDV'],
      ['revenue', '61000000', 'Prihodi'],
    ] as const) {
      acc[key] = (
        await api('POST', '/api/v1/ledger/accounts', tokenA, { legalEntityId: le, code, name })
      ).body.id as string;
    }
    supplierAcc = (
      await api('POST', '/api/v1/ledger/accounts/partner', tokenA, {
        legalEntityId: le,
        partnerId: supplier,
        side: 'supplier',
        partnerName: 'Zakupodavac Gama d.o.o.',
      })
    ).body.id as string;

    // Three rent precedents (same signature, different amounts) + one other.
    for (const [net, vat] of [
      [100, 17],
      [200, 34],
      [300, 51],
    ] as const) {
      precedentIds.push(
        await postEntry(tokenA, le, 'Najam kancelarije', [
          { accountId: acc.rent!, debit: net, credit: 0 },
          { accountId: acc.vatIn!, debit: vat, credit: 0 },
          { accountId: supplierAcc, debit: 0, credit: net + vat, partnerId: supplier },
        ]),
      );
    }
    await postEntry(tokenA, le, 'Sitni materijal', [
      { accountId: acc.other!, debit: 40, credit: 0 },
      { accountId: supplierAcc, debit: 0, credit: 40, partnerId: supplier },
    ]);

    const bAcc1 = (
      await api('POST', '/api/v1/ledger/accounts', tokenB, {
        legalEntityId: leB,
        code: '55300000',
        name: 'Zakup B',
      })
    ).body.id as string;
    const bAcc2 = (
      await api('POST', '/api/v1/ledger/accounts', tokenB, {
        legalEntityId: leB,
        code: '43200001',
        name: 'Dobavljač B',
      })
    ).body.id as string;
    foreignEntry = await postEntry(tokenB, leB, 'Najam kancelarije B', [
      { accountId: bAcc1, debit: 10, credit: 0 },
      { accountId: bAcc2, debit: 0, credit: 10 },
    ]);

    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 's233-viewer',
      permissions: ['finance.ledger.read'],
    });
    const invited = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'viewer@s233.example',
      displayName: 'Viewer',
      idpSubject: 'idp|s233-viewer',
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

  it('HIGH: partner precedents → most frequent signature, balanced to the cent, provenance listed', async () => {
    const res = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      partnerId: supplier,
      amount: 234,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      basis: 'partner',
      confidence: 'HIGH',
      matchingPrecedents: 3,
      consideredPrecedents: 4,
      entryType: 'MANUAL',
    });
    const lines = res.body.lines as Line[];
    const view = lines.map((l) => `${l.accountId}:${l.debit}/${l.credit}`);
    expect(view).toContain(`${acc.rent}:200.00/0.00`);
    expect(view).toContain(`${acc.vatIn}:34.00/0.00`);
    expect(view).toContain(`${supplierAcc}:0.00/234.00`);
    const precedents = (res.body.precedents as Array<{ entryId: string }>).map((p) => p.entryId);
    expect(precedents.sort()).toEqual([...precedentIds].sort());
  });

  it('Keywords narrow partner precedents; rounding keeps debit = credit', async () => {
    const res = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      partnerId: supplier,
      text: 'sitni materijal',
      amount: 33.33,
    });
    expect(res.body).toMatchObject({ confidence: 'MEDIUM', matchingPrecedents: 1 });
    const lines = res.body.lines as Line[];
    expect(lines.map((l) => `${l.accountId}:${l.debit}/${l.credit}`).sort()).toEqual(
      [`${acc.other}:33.33/0.00`, `${supplierAcc}:0.00/33.33`].sort(),
    );

    const odd = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      partnerId: supplier,
      amount: 0.07,
    });
    const l = odd.body.lines as Line[];
    const d = l.reduce((s, x) => s + Math.round(Number(x.debit) * 100), 0);
    const c = l.reduce((s, x) => s + Math.round(Number(x.credit) * 100), 0);
    expect(d).toBe(7);
    expect(c).toBe(7);
  });

  it('Text basis: another partner’s account is never proposed — the person must choose', async () => {
    const res = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      text: 'najam',
      amount: 117,
    });
    expect(res.body).toMatchObject({ basis: 'text', confidence: 'HIGH' });
    const lines = res.body.lines as Line[];
    const partnerLine = lines.find((x) => x.credit === '117.00')!;
    expect(partnerLine.accountId).toBeNull();
    expect(partnerLine.note).toBeTruthy();
    // Tenant B's "Najam kancelarije B" is never a precedent here.
    expect((res.body.precedents as Array<{ entryId: string }>).map((p) => p.entryId)).not.toContain(
      foreignEntry,
    );
  });

  it('LOW: no precedents → no lines and a warning; validation of inputs', async () => {
    const low = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      partnerId: newcomer,
      amount: 50,
    });
    expect(low.body).toMatchObject({ confidence: 'LOW', matchingPrecedents: 0, lines: [] });
    expect((low.body.warnings as string[]).length).toBeGreaterThan(0);
    const none = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      text: 'ab',
      amount: 50,
    });
    expect(none.status).toBe(400);
  });

  it('Stornoed precedents are ignored; inactive accounts are flagged, never proposed', async () => {
    await api('POST', `/api/v1/ledger/entries/${precedentIds[0]}/storno`, tokenA, {
      reason: 'Pogrešan iznos najma',
    });
    const after = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      partnerId: supplier,
      amount: 117,
    });
    expect(after.body).toMatchObject({ confidence: 'MEDIUM', matchingPrecedents: 2 });

    await api('POST', `/api/v1/ledger/accounts/${acc.vatIn}/active`, tokenA, { active: false });
    const inactive = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      partnerId: supplier,
      amount: 117,
    });
    const vatLine = (inactive.body.lines as Line[]).find((x) => x.debit === '17.00')!;
    expect(vatLine.accountId).toBeNull();
    expect(vatLine.note).toContain('neaktivno');
    await api('POST', `/api/v1/ledger/accounts/${acc.vatIn}/active`, tokenA, { active: true });
  });

  it('ACCEPT: creates a DRAFT only (never posts), audits provenance; unbalanced/foreign precedents refused', async () => {
    const proposal = await api('POST', '/api/v1/ledger/proposals', tokenA, {
      legalEntityId: le,
      partnerId: supplier,
      amount: 117,
    });
    const postedBefore = await prisma.glJournalEntry.count({
      where: { tenantId: tenantAId, status: 'POSTED' },
    });
    const lines = (proposal.body.lines as Line[]).map((l) => ({
      accountId: l.accountId!,
      debit: Number(l.debit),
      credit: Number(l.credit),
      ...(l.accountId === supplierAcc ? { partnerId: supplier } : {}),
    }));
    const precedentEntryIds = (proposal.body.precedents as Array<{ entryId: string }>).map(
      (p) => p.entryId,
    );
    const base = {
      legalEntityId: le,
      bookingDate: '2025-03-01',
      description: 'Najam mart (prijedlog)',
      proposalHash: proposal.body.proposalHash,
      confidence: proposal.body.confidence,
      precedentEntryIds,
    };
    const res = await api('POST', '/api/v1/ledger/proposals/draft', tokenA, { ...base, lines });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    const draft = await prisma.glJournalEntry.findFirst({
      where: { id: res.body.entryId as string },
    });
    expect(draft).toMatchObject({ status: 'DRAFT', entryNo: null });
    expect(
      await prisma.glJournalEntry.count({ where: { tenantId: tenantAId, status: 'POSTED' } }),
    ).toBe(postedBefore);
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'fin.posting_proposal.draft', objectId: draft!.id },
    });
    expect(audit?.newValues).toMatchObject({ aiRiskClass: 'draft', precedentEntryIds });

    const unbalanced = await api('POST', '/api/v1/ledger/proposals/draft', tokenA, {
      ...base,
      lines: [
        { accountId: acc.rent, debit: 100, credit: 0 },
        { accountId: supplierAcc, debit: 0, credit: 99, partnerId: supplier },
      ],
    });
    expect(unbalanced.status).toBe(400);
    const foreign = await api('POST', '/api/v1/ledger/proposals/draft', tokenA, {
      ...base,
      lines,
      precedentEntryIds: [foreignEntry],
    });
    expect(foreign.status).toBe(400);
  });

  it('KUF assist: counter account + VAT rate from the partner’s recorded KUF entries', async () => {
    await api('POST', '/api/v1/vat/pack/bih', tokenA, { legalEntityId: le });
    await api('POST', '/api/v1/ledger/system-accounts', tokenA, {
      legalEntityId: le,
      roleKey: 'vat.input',
      accountId: acc.vatIn,
    });
    for (const n of [1, 2, 3]) {
      const r = await api('POST', '/api/v1/vat/entries', tokenA, {
        legalEntityId: le,
        bookType: 'KUF',
        requestKey: `s233-kuf-${n}-key`,
        documentNumber: `UF-233-${n}`,
        documentDate: '2025-04-0' + n,
        bookingDate: '2025-04-0' + n,
        partnerId: supplier,
        vatRateCode: 'S17',
        netAmount: 100 * n,
        currency: 'BAM',
        counterAccountId: acc.rent,
      });
      expect(r.status).toBe(201);
    }
    const s = await api(
      'GET',
      `/api/v1/vat/suggest?legalEntityId=${le}&bookType=KUF&partnerId=${supplier}`,
      tokenA,
    );
    expect(s.body).toMatchObject({
      confidence: 'HIGH',
      matchingPrecedents: 3,
      counterAccountId: acc.rent,
      counterAccountCode: '55300000',
      vatRateCode: 'S17',
    });
    const none = await api(
      'GET',
      `/api/v1/vat/suggest?legalEntityId=${le}&bookType=KUF&partnerId=${newcomer}`,
      tokenA,
    );
    expect(none.body).toMatchObject({
      confidence: 'LOW',
      counterAccountId: null,
      vatRateCode: null,
    });
  });

  it('AUTHZ + TENANT: read-only may propose but not draft; cross-tenant legal entity is not found', async () => {
    const propose = await api('POST', '/api/v1/ledger/proposals', viewer, {
      legalEntityId: le,
      partnerId: supplier,
      amount: 10,
    });
    expect(propose.status).toBe(201);
    const draft = await api('POST', '/api/v1/ledger/proposals/draft', viewer, {
      legalEntityId: le,
      bookingDate: '2025-03-01',
      description: 'x',
      lines: [
        { accountId: acc.rent, debit: 1, credit: 0 },
        { accountId: supplierAcc, debit: 0, credit: 1 },
      ],
      proposalHash: 'abcdefgh',
      confidence: 'LOW',
      precedentEntryIds: [],
    });
    expect(draft.status).toBe(403);
    const stranger = identity.signToken({ tenantSlug: 'test-s233a', subject: 'idp|s233-nobody' });
    const denied = await api('POST', '/api/v1/ledger/proposals', stranger, {
      legalEntityId: le,
      text: 'najam',
      amount: 10,
    });
    expect([401, 403]).toContain(denied.status);
    const cross = await api('POST', '/api/v1/ledger/proposals', tokenB, {
      legalEntityId: le,
      text: 'najam',
      amount: 10,
    });
    expect(cross.status).toBe(404);
    const crossPartner = await api('POST', '/api/v1/ledger/proposals', tokenB, {
      legalEntityId: leB,
      partnerId: supplier,
      amount: 10,
    });
    expect(crossPartner.status).toBe(404);
    const crossSuggest = await api(
      'GET',
      `/api/v1/vat/suggest?legalEntityId=${le}&bookType=KUF&partnerId=${supplier}`,
      tokenB,
    );
    expect(crossSuggest.status).toBe(404);
  });
});
