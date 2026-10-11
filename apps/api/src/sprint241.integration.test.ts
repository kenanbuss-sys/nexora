import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 241 acceptance tests: MDM-005 duplicate detection/merge and MDM-002
 * product master governance. Candidates by name without legal form, tax ID
 * and e-mail; steward dismissal (idempotent, audited); merge preview;
 * hardened merge (survivorship, replay no-op, no redirect chains, external
 * identities move, party.merged outbox event, person/organisation refused,
 * concurrent opposite merges cannot form a cycle); publish readiness policy
 * (reports always, blocks only when enforced); change history per record;
 * tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

type Group = { reason: string; key: string; parties: Array<{ id: string; name: string }> };

integration('Sprint 241 — MDM duplicates/merge + product governance (MDM-005/002)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s241a', subject: 'idp|s241-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s241b', subject: 'idp|s241b-admin' });

  let tenantAId = '';
  const ids: Record<string, string> = {};

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

  async function party(
    key: string,
    body: { name: string; email?: string; taxId?: string; partyType?: string },
    token = tokenA,
  ) {
    const created = await api('POST', '/api/v1/parties', token, {
      partyType: 'ORGANIZATION',
      ...body,
    });
    expect(created.status).toBe(201);
    ids[key] = created.body.id as string;
    return ids[key]!;
  }

  const candidates = async (token = tokenA) =>
    (await api('GET', '/api/v1/parties/duplicate-candidates', token)).body.groups as Group[];

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "mdm_duplicate_dismissal", "master_data_request", "party_external_identity",
       "consent_record", "party", "barcode", "sku", "product",
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
      ['test-s241a', 'idp|s241-admin'],
      ['test-s241b', 'idp|s241b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint241 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s241a' } }))!.id;

    await party('mlin1', { name: 'Mlin Sarajevo d.o.o.' });
    await party('mlin2', { name: 'MLIN SARAJEVO DOO', email: 'nabavka@mlin.example' });
    await party('pek1', { name: 'Pekara Hana', taxId: '4200000000001' });
    await party('pek2', { name: 'Hana pekara i slasticarna', taxId: '42000-0000-0001' });
    await party('mail1', { name: 'Metal Kovanje', email: 'Ured@Kovanje.example' });
    await party('mail2', { name: 'Kovanje Metala', email: 'ured@kovanje.example' });
    await party('solo', { name: 'Drvo Promet' });
    await party('osoba', { name: 'Mlin Sarajevo', partyType: 'PERSON' });
    await party('b1', { name: 'Mlin Sarajevo d.o.o.' }, tokenB);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CANDIDATES: name without legal form, tax ID without separators, e-mail case-insensitive', async () => {
    const groups = await candidates();
    const byReason = (reason: string) => groups.filter((g) => g.reason === reason);
    const name = byReason('NAME').find((g) => g.key === 'mlin sarajevo');
    expect(name?.parties.map((p) => p.id).sort()).toEqual([ids.mlin1, ids.mlin2, ids.osoba].sort());
    const tax = byReason('TAX_ID')[0];
    expect(tax?.parties.map((p) => p.id).sort()).toEqual([ids.pek1, ids.pek2].sort());
    const mail = byReason('EMAIL')[0];
    expect(mail?.parties.map((p) => p.id).sort()).toEqual([ids.mail1, ids.mail2].sort());
    expect(groups.some((g) => g.parties.some((p) => p.id === ids.solo))).toBe(false);
    // Tenant B's identically named party never appears in A's queue.
    expect(groups.some((g) => g.parties.some((p) => p.id === ids.b1))).toBe(false);
    expect(await candidates(tokenB)).toEqual([]);
  });

  it('DISMISS: "not a duplicate" hides the pair; idempotent, audited, tenant-scoped', async () => {
    const foreign = await api('POST', '/api/v1/parties/duplicate-candidates/dismiss', tokenB, {
      partyAId: ids.mail1,
      partyBId: ids.mail2,
    });
    expect(foreign.status).toBe(404);
    const first = await api('POST', '/api/v1/parties/duplicate-candidates/dismiss', tokenA, {
      partyAId: ids.mail2,
      partyBId: ids.mail1,
      note: 'Dvije različite firme, zajednički računovodstveni servis',
    });
    expect(first.body).toMatchObject({ ok: true, duplicate: false });
    const again = await api('POST', '/api/v1/parties/duplicate-candidates/dismiss', tokenA, {
      partyAId: ids.mail1,
      partyBId: ids.mail2,
    });
    expect(again.body).toMatchObject({ ok: true, duplicate: true });
    expect((await candidates()).some((g) => g.reason === 'EMAIL')).toBe(false);
    expect(
      await prisma.auditEvent.count({
        where: { tenantId: tenantAId, action: 'mdm.duplicate.dismiss' },
      }),
    ).toBe(1);
    // Partially dismissed group (3 members, 1 pair dismissed) stays visible.
    await api('POST', '/api/v1/parties/duplicate-candidates/dismiss', tokenA, {
      partyAId: ids.mlin1,
      partyBId: ids.osoba,
    });
    expect((await candidates()).some((g) => g.key === 'mlin sarajevo')).toBe(true);
  });

  it('PREVIEW: shows differences, what moves and blockers before a merge', async () => {
    await api('POST', '/api/v1/parties/external-identities', tokenA, {
      partyId: ids.mlin2,
      sourceSystem: 'stari-erp',
      externalId: 'KUP-0042',
    });
    const preview = await api(
      'GET',
      `/api/v1/parties/merge-preview?winnerId=${ids.mlin1}&loserId=${ids.mlin2}`,
      tokenA,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.blockers).toEqual([]);
    expect(preview.body.moves).toMatchObject({ externalIdentities: 1, redirects: 0 });
    const fields = (preview.body.differences as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email']));
    const mixed = await api(
      'GET',
      `/api/v1/parties/merge-preview?winnerId=${ids.mlin1}&loserId=${ids.osoba}`,
      tokenA,
    );
    expect((mixed.body.blockers as string[]).length).toBe(1);
  });

  it('MERGE: survivorship, replay no-op, identities move, event in outbox; person/organisation refused', async () => {
    const mixed = await api('POST', '/api/v1/parties/merge', tokenA, {
      winnerId: ids.mlin1,
      loserId: ids.osoba,
    });
    expect(mixed.status).toBe(409);

    const merged = await api('POST', '/api/v1/parties/merge', tokenA, {
      winnerId: ids.mlin1,
      loserId: ids.mlin2,
      takeFromLoser: ['email'],
    });
    expect(merged.status).toBe(201);
    expect(merged.body).toMatchObject({
      id: ids.mlin1,
      email: 'nabavka@mlin.example',
      duplicate: false,
    });
    const replay = await api('POST', '/api/v1/parties/merge', tokenA, {
      winnerId: ids.mlin1,
      loserId: ids.mlin2,
    });
    expect(replay.body).toMatchObject({ id: ids.mlin1, duplicate: true });

    const loser = await prisma.party.findUnique({ where: { id: ids.mlin2! } });
    expect(loser).toMatchObject({ status: 'MERGED', mergedIntoId: ids.mlin1 });
    const resolved = await api('GET', '/api/v1/parties/resolve/stari-erp/KUP-0042', tokenA);
    expect(resolved.body.id).toBe(ids.mlin1);
    const events = await prisma.outboxEvent.findMany({
      where: { tenantId: tenantAId, eventType: 'party.merged' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ winnerId: ids.mlin1, loserId: ids.mlin2 });

    // A merged party cannot be the survivor of another merge.
    const intoMerged = await api('POST', '/api/v1/parties/merge', tokenA, {
      winnerId: ids.mlin2,
      loserId: ids.solo,
    });
    expect(intoMerged.status).toBe(409);
    // Cross-tenant merge is invisible.
    const foreign = await api('POST', '/api/v1/parties/merge', tokenB, {
      winnerId: ids.b1,
      loserId: ids.solo,
    });
    expect(foreign.status).toBe(404);
  });

  it('MERGE: earlier redirects are re-pointed — no chains', async () => {
    const x = await party('x', { name: 'Promet X' });
    const y = await party('y', { name: 'Promet Y' });
    const z = await party('z', { name: 'Promet Z' });
    await api('POST', '/api/v1/parties/merge', tokenA, { winnerId: y, loserId: x });
    await api('POST', '/api/v1/parties/merge', tokenA, { winnerId: z, loserId: y });
    const xRow = await prisma.party.findUnique({ where: { id: x } });
    expect(xRow?.mergedIntoId).toBe(z);

    // Survivorship never wipes a value with the duplicate's empty one.
    const w = await party('w', { name: 'Promet W', taxId: '4211111111111' });
    const v = await party('v', { name: 'Promet V' });
    const kept = await api('POST', '/api/v1/parties/merge', tokenA, {
      winnerId: w.toUpperCase(),
      loserId: v.toUpperCase(),
      takeFromLoser: ['taxId', 'name'],
    });
    expect(kept.body).toMatchObject({ id: w, taxId: '4211111111111', name: 'Promet V' });
  });

  it('CONCURRENCY: opposite merges at the same time — exactly one wins, no cycle', async () => {
    const p = await party('p', { name: 'Paralelno A' });
    const q = await party('q', { name: 'Paralelno B' });
    const [ab, ba] = await Promise.all([
      api('POST', '/api/v1/parties/merge', tokenA, { winnerId: p, loserId: q }),
      api('POST', '/api/v1/parties/merge', tokenA, { winnerId: q, loserId: p }),
    ]);
    expect([ab.status, ba.status].sort()).toEqual([201, 409]);
    const rows = await prisma.party.findMany({ where: { id: { in: [p, q] } } });
    expect(rows.filter((r) => r.status === 'ACTIVE')).toHaveLength(1);
  });

  it('GOVERNANCE: readiness reports always, blocks publishing only when the policy is enforced', async () => {
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'BRASNO-T400',
      name: 'Brašno T-400',
    });
    const productId = product.body.id as string;
    const report = await api('GET', `/api/v1/products/${productId}/readiness`, tokenA);
    expect(report.body).toMatchObject({ ready: false, enforced: false });
    expect((report.body.checks as Array<{ key: string; ok: boolean }>).map((c) => c.key)).toEqual([
      'description',
      'activeSku',
    ]);

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { pim: { publishPolicy: { enforce: true, requireBarcode: true } } },
    });
    const blocked = await api('POST', `/api/v1/products/${productId}/publish`, tokenA);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('Publish policy not met');

    // Governed description change via the approval flow, then data completion.
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId,
      code: 'BRASNO-T400-1KG',
      name: 'Brašno T-400 1 kg',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await prisma.product.update({
      where: { id: productId },
      data: { description: 'Pšenično brašno' },
    });
    const stillBlocked = await api('GET', `/api/v1/products/${productId}/readiness`, tokenA);
    const barcode = (
      stillBlocked.body.checks as Array<{ key: string; ok: boolean; message: string }>
    ).find((c) => c.key === 'barcode');
    expect(barcode).toMatchObject({ ok: false });
    expect(barcode?.message).toContain('BRASNO-T400-1KG');
    await api('POST', '/api/v1/barcodes', tokenA, { skuId: sku.body.id, value: '3871234567891' });
    const published = await api('POST', `/api/v1/products/${productId}/publish`, tokenA);
    expect(published.status).toBe(201);

    const foreign = await api('GET', `/api/v1/products/${productId}/readiness`, tokenB);
    expect(foreign.status).toBe(404);
  });

  it('HISTORY: change requests are listed per governed record', async () => {
    const submitted = await api('POST', '/api/v1/mdm/change-requests', tokenA, {
      entityType: 'party',
      entityId: ids.pek1,
      payload: { name: 'Pekara Hana d.o.o.' },
    });
    expect(submitted.status).toBe(201);
    await api('POST', '/api/v1/mdm/change-requests', tokenA, {
      entityType: 'party',
      entityId: ids.pek2,
      payload: { name: 'Hana d.o.o.' },
    });
    const history = await api(
      'GET',
      `/api/v1/mdm/change-requests?entityType=party&entityId=${ids.pek1}`,
      tokenA,
    );
    const rows = history.body.requests as Array<{ entityId: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entityId).toBe(ids.pek1);
    const bad = await api('GET', '/api/v1/mdm/change-requests?entityType=party', tokenA);
    expect(bad.status).toBe(400);
  });
});
