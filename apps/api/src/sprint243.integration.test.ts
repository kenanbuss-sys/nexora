import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 243 acceptance tests: EAM-002 asset hierarchy and history.
 * Install/move/remove with reason; tree (ancestors + descendants);
 * effective-dated structure history; cycles and depth refused (also for
 * concurrent opposite moves); retire guard for installed components;
 * retired assets cannot be installed into or moved; no-op moves leave no
 * history; concurrent creates get unique numbers; outbox event + audit;
 * tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 243 — asset hierarchy (EAM-002)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s243a', subject: 'idp|s243-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s243b', subject: 'idp|s243b-admin' });

  let tenantAId = '';

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

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "asset_structure_change", "equipment_custody_line", "equipment_custody", "asset",
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
      ['test-s243a', 'idp|s243-admin'],
      ['test-s243b', 'idp|s243b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint243 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s243a' } }))!.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });
  type Node = { id: string; assetNumber: string; depth: number; status: string };

  const create = async (name: string, parentAssetId?: string, token = tokenA) => {
    const r = await api('POST', '/api/v1/assets', token, {
      name,
      category: 'Proizvodnja',
      ...(parentAssetId ? { parentAssetId } : {}),
    });
    return r;
  };
  const id = async (name: string, parentAssetId?: string) => {
    const r = await create(name, parentAssetId);
    expect(r.status).toBe(201);
    return r.body.id as string;
  };
  const setParent = (assetId: string, parentAssetId: string | null, token = tokenA) =>
    api('POST', `/api/v1/assets/${assetId}/parent`, token, {
      parentAssetId,
      reason: parentAssetId ? 'Ugradnja' : 'Demontaža',
    });

  let line = '';
  let machine = '';
  let assembly = '';
  let part = '';

  it('TREE: line > machine > assembly > part; ancestors and descendants with depth', async () => {
    line = await id('Linija za presovanje 1');
    machine = await id('Hidraulična presa 250t');
    assembly = await id('Hidraulički agregat', machine);
    part = await id('Pumpa A10VSO', assembly);
    const installed = await setParent(machine, line);
    expect(installed.status).toBe(201);
    expect(installed.body).toMatchObject({ parentAssetId: line, changed: true });

    const tree = await api('GET', `/api/v1/assets/${machine}/tree`, tokenA);
    expect(tree.status).toBe(200);
    expect((tree.body.ancestors as Node[]).map((n) => n.id)).toEqual([line]);
    expect((tree.body.descendants as Node[]).map((n) => [n.id, n.depth])).toEqual([
      [assembly, 1],
      [part, 2],
    ]);
    const partTree = await api('GET', `/api/v1/assets/${part}/tree`, tokenA);
    expect((partTree.body.ancestors as Node[]).map((n) => n.id)).toEqual([line, machine, assembly]);

    const event = await prisma.outboxEvent.findFirst({
      where: { tenantId: tenantAId, eventType: 'asset.structure.changed', aggregateId: machine },
    });
    expect(event?.payload).toMatchObject({
      assetId: machine,
      fromParentId: null,
      toParentId: line,
    });
    expect(
      await prisma.auditEvent.count({
        where: { tenantId: tenantAId, action: 'eam.asset.structure', objectId: machine },
      }),
    ).toBe(1);
  });

  it('INVARIANTS: no cycles, no self-parent, depth limit; no-op moves leave no history', async () => {
    expect((await setParent(line, part)).status).toBe(400);
    expect((await setParent(line, line)).status).toBe(400);

    const again = await setParent(machine, line);
    expect(again.body).toMatchObject({ changed: false });
    expect(
      await prisma.assetStructureChange.count({ where: { tenantId: tenantAId, assetId: machine } }),
    ).toBe(1);

    // Depth: line(1) > machine(2) > assembly(3) > part(4) > d5(5) > d6(6); d7 refused.
    const d5 = await id('Ležaj', part);
    const d6 = await id('Kavez ležaja', d5);
    const d7 = await create('Kuglica', d6);
    expect(d7.status).toBe(400);
    // Moving a 2-level subtree under part would reach 7 levels.
    const sub = await id('Ventilski blok');
    await id('Ventil', sub);
    expect((await setParent(sub, d5)).status).toBe(400);
    expect((await setParent(sub, part)).status).toBe(201);
    expect((await setParent(sub, null)).body).toMatchObject({ parentAssetId: null, changed: true });
  });

  it('RETIRE: installed live components block retiring; retired assets cannot be installed or moved', async () => {
    const blocked = await api('POST', `/api/v1/assets/${machine}/transition`, tokenA, {
      status: 'RETIRED',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message as string).toContain('AST-');

    const spare = await id('Rezervna pumpa');
    await api('POST', `/api/v1/assets/${spare}/transition`, tokenA, { status: 'RETIRED' });
    expect((await setParent(spare, assembly)).status).toBe(409);
    const intoRetired = await id('Filter');
    expect((await setParent(intoRetired, spare)).status).toBe(409);

    // Remove the pump (history: installed at create, removed now), retire it.
    expect((await setParent(part, null)).status).toBe(201);
    const history = await api('GET', `/api/v1/assets/${assembly}/structure-history`, tokenA);
    const changes = history.body.changes as Array<{
      assetId: string;
      toParentId: string | null;
      fromParentId: string | null;
    }>;
    expect(
      changes.filter((c) => c.assetId === part).map((c) => [c.fromParentId, c.toParentId]),
    ).toEqual([
      [null, assembly],
      [assembly, null],
    ]);
  });

  it('CONCURRENCY: opposite moves cannot form a cycle; parallel creates get unique numbers', async () => {
    const x = await id('Transporter X');
    const y = await id('Transporter Y');
    const [xy, yx] = await Promise.all([setParent(x, y), setParent(y, x)]);
    expect([xy.status, yx.status].sort()).toEqual([201, 400]);
    const rows = await prisma.asset.findMany({ where: { id: { in: [x, y] } } });
    expect(rows.filter((r) => r.parentAssetId !== null)).toHaveLength(1);

    const created = await Promise.all(
      Array.from({ length: 5 }, (_, i) => create(`Viljuškar ${i + 1}`)),
    );
    expect(created.every((r) => r.status === 201)).toBe(true);
    const numbers = new Set(created.map((r) => r.body.assetNumber));
    expect(numbers.size).toBe(5);
  });

  it('TENANT: another tenant cannot see or change the structure', async () => {
    expect((await api('GET', `/api/v1/assets/${machine}/tree`, tokenB)).status).toBe(404);
    expect((await api('GET', `/api/v1/assets/${machine}/structure-history`, tokenB)).status).toBe(
      404,
    );
    expect((await setParent(machine, null, tokenB)).status).toBe(404);
    const foreign = await create('Tuđa mašina', undefined, tokenB);
    expect((await setParent(foreign.body.id as string, line, tokenB)).status).toBe(404);
    expect((await create('Tuđi dio', line, tokenB)).status).toBe(404);
  });
});
