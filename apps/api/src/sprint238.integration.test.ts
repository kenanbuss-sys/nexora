import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 238 acceptance tests: EAM-015/016 equipment custody (revers) and
 * QR labels. Group issue, idempotent issue, one open custody per asset
 * (also under concurrency), retired/inactive guards, partial returns with
 * condition (damaged/lost need a note), derived status, audited prints,
 * location, revocable QR tokens, anonymous public lookup returning only
 * non-sensitive fields, authz and tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const E = '/api/v1/equipment';

integration('Sprint 238 — equipment custody + QR (EAM-015/016)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const admin = identity.signToken({ tenantSlug: 'test-s238a', subject: 'idp|s238-admin' });
  const reader = identity.signToken({ tenantSlug: 'test-s238a', subject: 'idp|s238-reader' });
  const adminB = identity.signToken({ tenantSlug: 'test-s238b', subject: 'idp|s238b-admin' });

  let tenantAId = '';
  let worker = '';
  let inactive = '';
  const asset: Record<string, string> = {};
  let custodyId = '';
  let groupToken = '';

  async function api(method: 'GET' | 'POST', url: string, token: string | null, payload?: unknown) {
    const response = await app.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
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
      `TRUNCATE TABLE "equipment_custody_line", "equipment_custody", "asset", "employee",
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
      ['test-s238a', 'idp|s238-admin'],
      ['test-s238b', 'idp|s238b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Fabrika ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s238a' } }))!.id;
    const role = await api('POST', '/api/v1/roles', admin, {
      name: 's238-reader',
      permissions: ['asset.read'],
    });
    const user = await api('POST', '/api/v1/users/invite', admin, {
      email: 'reader@s238.example',
      displayName: 'Reader',
      idpSubject: 'idp|s238-reader',
    });
    await api('POST', '/api/v1/roles/assign', admin, {
      userId: user.body.id,
      roleId: role.body.id,
    });

    worker = (await api('POST', '/api/v1/employees', admin, { name: 'Bravar Prvi' })).body
      .id as string;
    inactive = (await api('POST', '/api/v1/employees', admin, { name: 'Bivši Radnik' })).body
      .id as string;
    await api('POST', `/api/v1/employees/${inactive}/status`, admin, { status: 'INACTIVE' });
    for (const [key, name, value] of [
      ['drill', 'Bušilica Bosch GSB', 450],
      ['grinder', 'Brusilica 125mm', 220],
      ['scanner', 'Ručni skener', 600],
      ['old', 'Stara ključ-garnitura', 30],
    ] as const) {
      asset[key] = (
        await api('POST', '/api/v1/assets', admin, {
          name,
          category: 'Alat',
          serialNumber: `SN-${key.toUpperCase()}-001`,
          value,
        })
      ).body.id as string;
    }
    await api('POST', `/api/v1/assets/${asset.old}/transition`, admin, { status: 'RETIRED' });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ISSUE: one revers for several assets; idempotent; guards for retired assets and inactive employees', async () => {
    const payload = {
      employeeId: worker,
      assetIds: [asset.drill, asset.grinder],
      note: 'Radionica, smjena A',
      requestKey: 's238-issue-0001',
    };
    const res = await api('POST', `${E}/custody`, admin, payload);
    expect(res.status).toBe(201);
    custodyId = res.body.id as string;
    groupToken = res.body.groupToken as string;
    expect(res.body).toMatchObject({ status: 'OPEN', employeeName: 'Bravar Prvi' });
    expect((res.body.custodyNumber as string).startsWith('ZD-')).toBe(true);
    expect((res.body.lines as unknown[]).length).toBe(2);
    expect(groupToken.length).toBeGreaterThanOrEqual(20);

    const replay = await api('POST', `${E}/custody`, admin, payload);
    expect(replay.body.id).toBe(custodyId);
    const changed = await api('POST', `${E}/custody`, admin, {
      ...payload,
      assetIds: [asset.drill],
    });
    expect(changed.status).toBe(409);

    const retired = await api('POST', `${E}/custody`, admin, {
      employeeId: worker,
      assetIds: [asset.old],
      requestKey: 's238-issue-0002',
    });
    expect(retired.status).toBe(409);
    const gone = await api('POST', `${E}/custody`, admin, {
      employeeId: inactive,
      assetIds: [asset.scanner],
      requestKey: 's238-issue-0003',
    });
    expect(gone.status).toBe(409);
  });

  it('ONE HOLDER: an issued asset cannot be issued again — also under concurrency', async () => {
    const again = await api('POST', `${E}/custody`, admin, {
      employeeId: worker,
      assetIds: [asset.drill],
      requestKey: 's238-issue-0004',
    });
    expect(again.status).toBe(409);
    expect(String(again.body.message)).toContain('Already issued');

    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        api('POST', `${E}/custody`, admin, {
          employeeId: worker,
          assetIds: [asset.scanner],
          requestKey: `s238-race-000${n}`,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of results) expect([201, 409]).toContain(r.status);
    expect(
      await prisma.equipmentCustodyLine.count({
        where: { tenantId: tenantAId, assetId: asset.scanner!, returnedAt: null },
      }),
    ).toBe(1);
  });

  it('RETURN: partial, idempotent per line, damaged needs a note, status derived', async () => {
    const noNote = await api('POST', `${E}/custody/${custodyId}/return`, admin, {
      items: [{ assetId: asset.grinder, condition: 'DAMAGED' }],
    });
    expect(noNote.status).toBe(400);
    const partial = await api('POST', `${E}/custody/${custodyId}/return`, admin, {
      items: [{ assetId: asset.grinder, condition: 'DAMAGED', note: 'Puknut štitnik' }],
    });
    expect(partial.body.status).toBe('PARTIALLY_RETURNED');
    const again = await api('POST', `${E}/custody/${custodyId}/return`, admin, {
      items: [{ assetId: asset.grinder, condition: 'OK' }],
    });
    const grinder = (again.body.lines as Array<{ assetId: string; returnCondition: string }>).find(
      (l) => l.assetId === asset.grinder,
    );
    expect(grinder?.returnCondition).toBe('DAMAGED');
    const closed = await api('POST', `${E}/custody/${custodyId}/return`, admin, {
      items: [{ assetId: asset.drill, condition: 'OK' }],
    });
    expect(closed.body.status).toBe('CLOSED');
    const foreign = await api('POST', `${E}/custody/${custodyId}/return`, admin, {
      items: [{ assetId: asset.scanner, condition: 'OK' }],
    });
    expect(foreign.status).toBe(400);

    const reissue = await api('POST', `${E}/custody`, admin, {
      employeeId: worker,
      assetIds: [asset.drill],
      requestKey: 's238-issue-0005',
    });
    expect(reissue.status).toBe(201);
    const audits = await prisma.auditEvent.count({
      where: { tenantId: tenantAId, action: 'eam.custody.return', objectId: custodyId },
    });
    expect(audits).toBe(2);
  });

  it('PRINT + LOCATION: prints are audited; location is set and audited', async () => {
    await api('POST', `${E}/print-log`, reader, { custodyId, kind: 'REVERS' });
    await api('POST', `${E}/print-log`, reader, { assetId: asset.scanner, kind: 'LABEL' });
    expect(
      await prisma.auditEvent.count({
        where: { tenantId: tenantAId, action: { in: ['eam.custody.print', 'eam.asset.print'] } },
      }),
    ).toBe(2);
    const loc = await api('POST', `${E}/assets/${asset.scanner}/details`, admin, {
      location: 'Hala 2 / Linija 3',
    });
    expect(loc.body.location).toBe('Hala 2 / Linija 3');
    const byReader = await api('POST', `${E}/assets/${asset.scanner}/details`, reader, {
      location: 'x',
    });
    expect(byReader.status).toBe(403);
  });

  it('PUBLIC QR: anonymous lookup returns only non-sensitive fields; tokens are revocable', async () => {
    const issued = await api('POST', `${E}/assets/${asset.scanner}/qr`, admin, {});
    const token = issued.body.qrToken as string;
    expect(token.length).toBeGreaterThanOrEqual(20);
    const pub = await api('GET', `/api/v1/public/qr/asset/${token}`, null);
    expect(pub.status).toBe(200);
    expect(pub.body).toEqual({
      organization: 'Fabrika test-s238a',
      assetNumber: expect.any(String),
      name: 'Ručni skener',
      category: 'Alat',
      status: 'U upotrebi',
      // Location is hidden unless the tenant opts in.
      location: null,
      issued: true,
    });
    const text = JSON.stringify(pub.body);
    expect(text).not.toContain('SN-SCANNER');
    expect(text).not.toContain('600');
    expect(text).not.toContain('Bravar');
    expect(text).not.toContain(asset.scanner!);

    const raw = await app.inject({ method: 'GET', url: `/api/v1/public/qr/asset/${token}` });
    expect(raw.headers['cache-control']).toBe('no-store');
    expect(raw.headers['referrer-policy']).toBe('no-referrer');
    await api('POST', '/api/v1/tenant/configuration', admin, {
      config: { eam: { publicLookup: { showLocation: true } } },
    });
    const withLocation = await api('GET', `/api/v1/public/qr/asset/${token}`, null);
    expect(withLocation.body.location).toBe('Hala 2 / Linija 3');

    const group = await api('GET', `/api/v1/public/qr/custody/${groupToken}`, null);
    expect(group.body).toMatchObject({ status: 'CLOSED' });
    expect(JSON.stringify(group.body)).not.toContain('Bravar');

    const rotated = await api('POST', `${E}/assets/${asset.scanner}/qr`, admin, { rotate: true });
    expect(rotated.body.qrToken).not.toBe(token);
    expect((await api('GET', `/api/v1/public/qr/asset/${token}`, null)).status).toBe(404);
    await api('POST', `${E}/assets/${asset.scanner}/qr/revoke`, admin);
    expect(
      (await api('GET', `/api/v1/public/qr/asset/${rotated.body.qrToken as string}`, null)).status,
    ).toBe(404);
    expect((await api('GET', '/api/v1/public/qr/asset/x', null)).status).toBe(404);
  });

  it('REVIEW FIXES: revocable revers token, retired assets, suspended tenant, disabled module, audits', async () => {
    const rotated = await api('POST', `${E}/custody/${custodyId}/qr`, admin, {});
    const newGroup = rotated.body.groupToken as string;
    expect(newGroup).not.toBe(groupToken);
    expect((await api('GET', `/api/v1/public/qr/custody/${groupToken}`, null)).status).toBe(404);
    expect((await api('GET', `/api/v1/public/qr/custody/${newGroup}`, null)).status).toBe(200);
    const revoked = await api('POST', `${E}/custody/${custodyId}/qr`, admin, { revoke: true });
    expect(revoked.body.groupToken).toBeNull();
    expect((await api('GET', `/api/v1/public/qr/custody/${newGroup}`, null)).status).toBe(404);

    const label = await api('POST', `${E}/assets/${asset.grinder}/qr`, admin, {});
    const grinderToken = label.body.qrToken as string;
    expect((await api('GET', `/api/v1/public/qr/asset/${grinderToken}`, null)).status).toBe(200);
    await api('POST', `/api/v1/assets/${asset.grinder}/transition`, admin, { status: 'RETIRED' });
    expect((await api('GET', `/api/v1/public/qr/asset/${grinderToken}`, null)).status).toBe(404);
    expect((await api('POST', `${E}/assets/${asset.grinder}/qr`, admin, {})).status).toBe(409);

    const drillToken = (await api('POST', `${E}/assets/${asset.drill}/qr`, admin, {})).body
      .qrToken as string;
    await prisma.moduleActivation.create({
      data: { tenantId: tenantAId, moduleKey: 'assets', enabled: false },
    });
    expect((await api('GET', `/api/v1/public/qr/asset/${drillToken}`, null)).status).toBe(404);
    expect((await api('GET', `${E}/custody`, admin)).status).toBe(403);
    await prisma.moduleActivation.deleteMany({
      where: { tenantId: tenantAId, moduleKey: 'assets' },
    });
    await prisma.tenant.update({ where: { id: tenantAId }, data: { status: 'SUSPENDED' } });
    expect((await api('GET', `/api/v1/public/qr/asset/${drillToken}`, null)).status).toBe(404);
    await prisma.tenant.update({ where: { id: tenantAId }, data: { status: 'ACTIVE' } });
    expect((await api('GET', `/api/v1/public/qr/asset/${drillToken}`, null)).status).toBe(200);

    const actions = (
      await prisma.auditEvent.findMany({
        where: { tenantId: tenantAId, action: { startsWith: 'eam.' } },
        select: { action: true },
      })
    ).map((a) => a.action);
    for (const a of [
      'eam.asset.qr_issue',
      'eam.asset.qr_rotate',
      'eam.asset.qr_revoke',
      'eam.asset.location',
      'eam.custody.qr_rotate',
      'eam.custody.qr_revoke',
    ]) {
      expect(actions).toContain(a);
    }
  });

  it('AUTHZ + TENANT: reader cannot issue; other tenant sees nothing and cannot touch custody', async () => {
    const byReader = await api('POST', `${E}/custody`, reader, {
      employeeId: worker,
      assetIds: [asset.grinder],
      requestKey: 's238-issue-0099',
    });
    expect(byReader.status).toBe(403);
    expect((await api('GET', `${E}/custody`, reader)).status).toBe(200);
    expect((await api('GET', `${E}/custody/${custodyId}`, adminB)).status).toBe(404);
    const list = await api('GET', `${E}/custody`, adminB);
    expect(list.body.custodies).toEqual([]);
    const ret = await api('POST', `${E}/custody/${custodyId}/return`, adminB, {
      items: [{ assetId: asset.drill, condition: 'OK' }],
    });
    expect(ret.status).toBe(404);
    expect((await api('POST', `${E}/assets/${asset.scanner}/qr`, reader, {})).status).toBe(403);
    expect((await api('POST', `${E}/assets/${asset.scanner}/qr/revoke`, reader)).status).toBe(403);
    expect((await api('GET', `${E}/assets/${asset.scanner}`, adminB)).status).toBe(404);
    expect(
      (await api('POST', `${E}/assets/${asset.scanner}/details`, adminB, { location: 'x' })).status,
    ).toBe(404);
    expect((await api('POST', `${E}/assets/${asset.scanner}/qr`, adminB, {})).status).toBe(404);
    expect((await api('POST', `${E}/assets/${asset.scanner}/qr/revoke`, adminB)).status).toBe(404);
    expect((await api('POST', `${E}/custody/${custodyId}/qr`, adminB, {})).status).toBe(404);
    expect(
      (await api('POST', `${E}/print-log`, adminB, { custodyId, kind: 'REVERS' })).status,
    ).toBe(404);
    const cross = await api('POST', `${E}/custody`, adminB, {
      employeeId: worker,
      assetIds: [asset.grinder],
      requestKey: 's238-issue-0100',
    });
    expect(cross.status).toBe(404);
  });
});
