import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 212 acceptance tests: FIN-027 account/partner cards and
 * FIN-029 trial balance — read-only reports over posted entries,
 * consistent with the ledger; storno pairs hidden on cards by
 * default without changing balances.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 212 — ledger cards & trial balance', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s212a', subject: 'idp|s212-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s212b', subject: 'idp|s212b-admin' });

  let le = '';
  let accKupci = '';
  let accPrihod = '';
  let partnerId = '';
  let partnerAccId = '';
  let stornoTargetId = '';

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
    date: string,
    amount: number,
    description: string,
    debitAcc: string,
    creditAcc: string,
  ) {
    const draft = await api('POST', '/api/v1/ledger/entries', tokenA, {
      legalEntityId: le,
      entryType: 'MANUAL',
      bookingDate: date,
      description,
      lines: [
        { accountId: debitAcc, debit: amount, credit: 0 },
        { accountId: creditAcc, debit: 0, credit: amount },
      ],
    });
    const posted = await api('POST', `/api/v1/ledger/entries/${draft.body.id}/post`, tokenA);
    return posted.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "gl_journal_line", "gl_journal_entry", "gl_account",
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
      ['test-s212a', 'idp|s212-admin'],
      ['test-s212b', 'idp|s212b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint212 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: `Admin ${slug}`,
          idpSubject: subj,
        },
      });
    }
    const entity = await api('POST', '/api/v1/organization/legal-entities', tokenA, {
      name: 'Kartice d.o.o.',
    });
    le = entity.body.id as string;
    const kupci = await api('POST', '/api/v1/ledger/accounts', tokenA, {
      legalEntityId: le,
      code: '21100001',
      name: 'Kupci',
    });
    accKupci = kupci.body.id as string;
    const prihod = await api('POST', '/api/v1/ledger/accounts', tokenA, {
      legalEntityId: le,
      code: '61000001',
      name: 'Prihodi',
    });
    accPrihod = prihod.body.id as string;

    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Kupac Beta d.o.o.',
    });
    partnerId = party.body.id as string;
    const pa = await api('POST', '/api/v1/ledger/accounts/partner', tokenA, {
      legalEntityId: le,
      partnerId,
      side: 'customer',
      partnerName: 'Kupac Beta d.o.o.',
    });
    partnerAccId = pa.body.id as string;

    // Opening period (August): 100 on Kupci.
    await postEntry('2026-08-10', 100, 'August faktura', accKupci, accPrihod);
    // In period (September): 250 + 40 on partner account.
    stornoTargetId = await postEntry('2026-09-05', 250, 'Septembar faktura', accKupci, accPrihod);
    await postEntry('2026-09-12', 40, 'Partner faktura', partnerAccId, accPrihod);
    // Storno the 250 entry — the pair must not distort cards.
    await api('POST', `/api/v1/ledger/entries/${stornoTargetId}/storno`, tokenA, {
      reason: 'Pogrešan iznos',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIN-027: the account card shows opening, turnover and closing per entry', async () => {
    const card = await api(
      'GET',
      `/api/v1/ledger/reports/account-card?legalEntityId=${le}&accountId=${accKupci}&from=2026-09-01&to=2026-09-30`,
      tokenA,
    );
    expect(card.status).toBe(200);
    expect(card.body.openingBalance).toBe('100.00'); // August
    // Storno pair (250 + its mirror) hidden by default; no other rows on Kupci in September.
    expect((card.body.rows as unknown[]).length).toBe(0);
    expect(card.body.closingBalance).toBe('100.00');
  });

  it('FIN-027: includeStorno reveals the pair without changing the closing balance', async () => {
    const card = await api(
      'GET',
      `/api/v1/ledger/reports/account-card?legalEntityId=${le}&accountId=${accKupci}&from=2026-09-01&to=2026-09-30&includeStorno=true`,
      tokenA,
    );
    const rows = card.body.rows as Array<{ entryType: string; debit: string; credit: string }>;
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.entryType === 'STORNO')?.credit).toBe('250.00');
    expect(card.body.closingBalance).toBe('100.00'); // pair nets to zero
  });

  it('FIN-027: the partner card follows the partner analytic account', async () => {
    const card = await api(
      'GET',
      `/api/v1/ledger/reports/partner-card?legalEntityId=${le}&partnerId=${partnerId}&from=2026-09-01&to=2026-09-30`,
      tokenA,
    );
    expect(card.status).toBe(200);
    expect(card.body.accountName).toBe('Kupac Beta d.o.o.');
    expect((card.body.rows as unknown[]).length).toBe(1);
    expect(card.body.closingBalance).toBe('40.00');
  });

  it('FIN-029: the trial balance balances and reconciles with the cards', async () => {
    const tb = await api(
      'GET',
      `/api/v1/ledger/reports/trial-balance?legalEntityId=${le}&from=2026-09-01&to=2026-09-30`,
      tokenA,
    );
    expect(tb.status).toBe(200);
    const totals = tb.body.totals as Record<string, string>;
    // The whole ledger balances: closing totals net to zero, D turnover = P turnover.
    expect(totals.closing).toBe('0.00');
    expect(totals.opening).toBe('0.00');
    expect(totals.debit).toBe(totals.credit);
    const rows = tb.body.rows as Array<{ code: string; closing: string; debit: string }>;
    // Kupci closing matches the account card (storno pair included nets out).
    expect(rows.find((r) => r.code === '21100001')?.closing).toBe('100.00');
    expect(rows.find((r) => r.code === '21100002')?.closing).toBe('40.00');
    // Prihodi: -100 (PS) + storno par u prometu; closing = -(100+40)
    expect(rows.find((r) => r.code === '61000001')?.closing).toBe('-140.00');
  });

  it('READ-ONLY: reports never mutate the ledger', async () => {
    const before = await prisma.glJournalEntry.count();
    await api(
      'GET',
      `/api/v1/ledger/reports/trial-balance?legalEntityId=${le}&from=2026-01-01&to=2026-12-31`,
      tokenA,
    );
    await api(
      'GET',
      `/api/v1/ledger/reports/account-card?legalEntityId=${le}&accountId=${accPrihod}&from=2026-01-01&to=2026-12-31`,
      tokenA,
    );
    const after = await prisma.glJournalEntry.count();
    expect(after).toBe(before);
  });

  it('AUTHZ + TENANT: read permission required; cross-tenant not found', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s212a', subject: 'idp|s212-nobody' });
    const denied = await api(
      'GET',
      `/api/v1/ledger/reports/trial-balance?legalEntityId=${le}&from=2026-09-01&to=2026-09-30`,
      stranger,
    );
    expect([401, 403]).toContain(denied.status);

    const cross = await api(
      'GET',
      `/api/v1/ledger/reports/trial-balance?legalEntityId=${le}&from=2026-09-01&to=2026-09-30`,
      tokenB,
    );
    expect([403, 404]).toContain(cross.status);
  });
});
