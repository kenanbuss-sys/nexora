import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 211 acceptance tests: general-ledger core (FIN-023/024/025/
 * 026, ADR-020) — chart of accounts per legal entity, draft → posted
 * journal entries with per-entity numbering, opening-balance guard,
 * period lock and mirrored storno.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 211 — general ledger', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s211a', subject: 'idp|s211-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s211b', subject: 'idp|s211b-admin' });

  let leOne = '';
  let leTwo = '';
  let acc4320 = '';
  let acc2110 = '';
  let draftId = '';
  let postedNo = 0;

  async function api(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
      ['test-s211a', 'idp|s211-admin'],
      ['test-s211b', 'idp|s211b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint211 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: `Admin ${slug}`,
          idpSubject: subj,
        },
      });
    }
    const one = await api('POST', '/api/v1/organization/legal-entities', tokenA, {
      name: 'Firma Jedan d.o.o.',
    });
    leOne = one.body.id as string;
    const two = await api('POST', '/api/v1/organization/legal-entities', tokenA, {
      name: 'Firma Dva d.o.o.',
    });
    leTwo = two.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIN-024: 8-digit accounts per legal entity; duplicates conflict; copy works', async () => {
    const bad = await api('POST', '/api/v1/ledger/accounts', tokenA, {
      legalEntityId: leOne,
      code: '432',
      name: 'Prekratko',
    });
    expect(bad.status).toBe(400);

    const supplier = await api('POST', '/api/v1/ledger/accounts', tokenA, {
      legalEntityId: leOne,
      code: '43200001',
      name: 'Dobavljači u zemlji',
    });
    expect(supplier.status).toBe(201);
    acc4320 = supplier.body.id as string;
    expect(supplier.body.class).toBe('4');

    const customer = await api('POST', '/api/v1/ledger/accounts', tokenA, {
      legalEntityId: leOne,
      code: '21100001',
      name: 'Kupci u zemlji',
    });
    acc2110 = customer.body.id as string;

    const dup = await api('POST', '/api/v1/ledger/accounts', tokenA, {
      legalEntityId: leOne,
      code: '43200001',
      name: 'Duplikat',
    });
    expect(dup.status).toBe(409);

    // Copy into the second legal entity; the two plans stay separate.
    const copied = await api('POST', `/api/v1/ledger/accounts/${acc4320}/copy`, tokenA, {
      targetLegalEntityId: leTwo,
    });
    expect(copied.status).toBe(201);
    const planTwo = await api('GET', `/api/v1/ledger/accounts?legalEntityId=${leTwo}`, tokenA);
    expect((planTwo.body.accounts as unknown[]).length).toBe(1);
  });

  it('FIN-024: lazy partner analytics from the MDM party register', async () => {
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Partner Alfa d.o.o.',
    });
    const first = await api('POST', '/api/v1/ledger/accounts/partner', tokenA, {
      legalEntityId: leOne,
      partnerId: party.body.id,
      side: 'supplier',
      partnerName: 'Partner Alfa d.o.o.',
    });
    expect(first.status).toBe(201);
    expect(first.body.code).toBe('43200002'); // 43200001 already exists
    const again = await api('POST', '/api/v1/ledger/accounts/partner', tokenA, {
      legalEntityId: leOne,
      partnerId: party.body.id,
      side: 'supplier',
      partnerName: 'Partner Alfa d.o.o.',
    });
    expect(again.body.id).toBe(first.body.id); // idempotent
  });

  it('FIN-023: drafts validate lines; unbalanced drafts cannot post', async () => {
    const oneSided = await api('POST', '/api/v1/ledger/entries', tokenA, {
      legalEntityId: leOne,
      entryType: 'MANUAL',
      bookingDate: '2026-09-10',
      description: 'Stavka na obje strane',
      lines: [
        { accountId: acc4320, debit: 10, credit: 10 },
        { accountId: acc2110, debit: 10, credit: 0 },
      ],
    });
    expect(oneSided.status).toBe(400);

    const draft = await api('POST', '/api/v1/ledger/entries', tokenA, {
      legalEntityId: leOne,
      entryType: 'MANUAL',
      bookingDate: '2026-09-10',
      description: 'Neuravnotežen nalog',
      lines: [
        { accountId: acc4320, debit: 100, credit: 0 },
        { accountId: acc2110, debit: 0, credit: 90 },
      ],
    });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe('DRAFT');
    expect(draft.body.entryNo).toBeNull();

    const blocked = await api('POST', `/api/v1/ledger/entries/${draft.body.id}/post`, tokenA);
    expect(blocked.status).toBe(409);

    const removed = await api('DELETE', `/api/v1/ledger/entries/${draft.body.id}`, tokenA);
    expect(removed.status).toBe(200);
  });

  it('FIN-025: booking before the opening date is refused, except opening types', async () => {
    await api('POST', '/api/v1/ledger/control/opening-date', tokenA, {
      legalEntityId: leOne,
      openingDate: '2026-06-01',
    });

    const early = await api('POST', '/api/v1/ledger/entries', tokenA, {
      legalEntityId: leOne,
      entryType: 'MANUAL',
      bookingDate: '2026-05-15',
      description: 'Prije reza',
      lines: [
        { accountId: acc4320, debit: 50, credit: 0 },
        { accountId: acc2110, debit: 0, credit: 50 },
      ],
    });
    const earlyPost = await api('POST', `/api/v1/ledger/entries/${early.body.id}/post`, tokenA);
    expect(earlyPost.status).toBe(409);

    const opening = await api('POST', '/api/v1/ledger/entries', tokenA, {
      legalEntityId: leOne,
      entryType: 'OPENING_BALANCE',
      bookingDate: '2026-05-31',
      description: 'Početno stanje',
      lines: [
        { accountId: acc2110, debit: 1000, credit: 0 },
        { accountId: acc4320, debit: 0, credit: 1000 },
      ],
    });
    const openingPost = await api('POST', `/api/v1/ledger/entries/${opening.body.id}/post`, tokenA);
    expect(openingPost.status).toBe(201);
    expect(openingPost.body.entryNo).toBe(1);
  });

  it('FIN-023: posting numbers entries per legal entity; posting is idempotent', async () => {
    const draft = await api('POST', '/api/v1/ledger/entries', tokenA, {
      legalEntityId: leOne,
      entryType: 'MANUAL',
      bookingDate: '2026-09-10',
      description: 'Faktura dobavljača',
      lines: [
        { accountId: acc2110, debit: 250, credit: 0 },
        { accountId: acc4320, debit: 0, credit: 250 },
      ],
    });
    draftId = draft.body.id as string;
    const posted = await api('POST', `/api/v1/ledger/entries/${draftId}/post`, tokenA);
    expect(posted.status).toBe(201);
    postedNo = posted.body.entryNo as number;
    expect(postedNo).toBe(2);

    // Idempotent re-post keeps the same number.
    const again = await api('POST', `/api/v1/ledger/entries/${draftId}/post`, tokenA);
    expect(again.body.entryNo).toBe(postedNo);

    // The second legal entity numbers independently from 1.
    const accTwo = await api('GET', `/api/v1/ledger/accounts?legalEntityId=${leTwo}`, tokenA);
    const accTwoId = (accTwo.body.accounts as Array<{ id: string }>)[0]?.id as string;
    const other = await api('POST', '/api/v1/ledger/accounts', tokenA, {
      legalEntityId: leTwo,
      code: '21100001',
      name: 'Kupci',
    });
    const draftTwo = await api('POST', '/api/v1/ledger/entries', tokenA, {
      legalEntityId: leTwo,
      entryType: 'MANUAL',
      bookingDate: '2026-09-10',
      description: 'Prvi nalog druge firme',
      lines: [
        { accountId: other.body.id, debit: 10, credit: 0 },
        { accountId: accTwoId, debit: 0, credit: 10 },
      ],
    });
    const postedTwo = await api('POST', `/api/v1/ledger/entries/${draftTwo.body.id}/post`, tokenA);
    expect(postedTwo.body.entryNo).toBe(1);
  });

  it('FIN-023/026: posted entries are immutable; storno is the only correction', async () => {
    const del = await api('DELETE', `/api/v1/ledger/entries/${draftId}`, tokenA);
    expect(del.status).toBe(409);

    const storno = await api('POST', `/api/v1/ledger/entries/${draftId}/storno`, tokenA, {
      reason: 'Pogrešan iznos fakture',
    });
    expect(storno.status).toBe(201);
    expect(storno.body.entryType).toBe('STORNO');
    expect(storno.body.stornoOfId).toBe(draftId);
    // Mirror: debit and credit swapped.
    const lines = storno.body.lines as Array<{ debit: string; credit: string }>;
    expect(lines[0]?.credit).toBe('250.00');
    expect(lines[1]?.debit).toBe('250.00');

    const doubleStorno = await api('POST', `/api/v1/ledger/entries/${draftId}/storno`, tokenA, {
      reason: 'Još jednom isto',
    });
    expect(doubleStorno.status).toBe(409);
  });

  it('FIN-025: the period lock blocks posting into locked dates', async () => {
    await api('POST', '/api/v1/ledger/control/period-lock', tokenA, {
      legalEntityId: leOne,
      lockedThrough: '2026-09-30',
    });
    const draft = await api('POST', '/api/v1/ledger/entries', tokenA, {
      legalEntityId: leOne,
      entryType: 'MANUAL',
      bookingDate: '2026-09-15',
      description: 'U zaključanom periodu',
      lines: [
        { accountId: acc2110, debit: 5, credit: 0 },
        { accountId: acc4320, debit: 0, credit: 5 },
      ],
    });
    const blocked = await api('POST', `/api/v1/ledger/entries/${draft.body.id}/post`, tokenA);
    expect(blocked.status).toBe(409);

    const control = await api('GET', `/api/v1/ledger/control?legalEntityId=${leOne}`, tokenA);
    expect(control.body.lockedThrough).toBe('2026-09-30');
    expect(control.body.openingDate).toBe('2026-06-01');
  });

  it('AUTHZ + TENANT: no permission → denied; cross-tenant → not found', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s211a', subject: 'idp|s211-nobody' });
    const denied = await api('POST', '/api/v1/ledger/accounts', stranger, {
      legalEntityId: leOne,
      code: '10000001',
      name: 'X',
    });
    expect([401, 403]).toContain(denied.status);

    const cross = await api('GET', `/api/v1/ledger/accounts?legalEntityId=${leOne}`, tokenB);
    expect([403, 404]).toContain(cross.status);
    const crossEntry = await api('POST', `/api/v1/ledger/entries/${draftId}/storno`, tokenB, {
      reason: 'Tuđi nalog storno',
    });
    expect([403, 404]).toContain(crossEntry.status);
  });

  it('AUDIT: postings and stornos leave audit records', async () => {
    const posts = await prisma.auditEvent.count({ where: { action: 'gl.entry.post' } });
    const stornos = await prisma.auditEvent.count({ where: { action: 'gl.entry.storno' } });
    expect(posts).toBeGreaterThanOrEqual(3);
    expect(stornos).toBe(1);
  });
});
