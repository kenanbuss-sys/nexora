import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 234 acceptance tests: HCM-015 attendance status matrix
 * (šihtarica), ODL-002 "both models": configurable status catalog, set /
 * clear a day with audit old → new, optimistic concurrency, idempotent
 * re-set, clock + granted-leave SUGGESTIONS that fill only empty days
 * (idempotent), monthly digest (worked days by countsAsWorked + clock
 * hours), change-control report, month lock/unlock (with reason) that
 * blocks edits, CLOCK-only model, payroll export carries worked days,
 * authz and tenant isolation. Fixed month 2025-03.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const Y = 2025;
const M = 3;

integration('Sprint 234 — attendance matrix (HCM-015)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s234a', subject: 'idp|s234-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s234b', subject: 'idp|s234b-admin' });
  const reader = identity.signToken({ tenantSlug: 'test-s234a', subject: 'idp|s234-reader' });

  let tenantAId = '';
  let emp1 = '';
  let emp2 = '';

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

  type Emp = {
    id: string;
    cells: Record<string, { status: string; source: string; version: number }>;
    suggestions: Record<string, { status: string; source: string }>;
  };
  async function matrix(token = tokenA) {
    const res = await api('GET', `/api/v1/workforce/attendance/matrix?year=${Y}&month=${M}`, token);
    return res;
  }
  const row = (body: Record<string, unknown>, id: string) =>
    (body.employees as Emp[]).find((e) => e.id === id)!;

  async function clock(employeeId: string, event: 'IN' | 'OUT', at: string) {
    await prisma.auditEvent.create({
      data: {
        tenantId: tenantAId,
        actorType: 'USER',
        action: 'hcm.attendance',
        objectType: 'Employee',
        objectId: `${employeeId}:clock:${randomUUID()}`,
        occurredAt: new Date(at),
        correlationId: randomUUID(),
        source: 'api',
        newValues: { employeeId, event, at },
      },
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "attendance_day", "attendance_period", "employee",
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
      ['test-s234a', 'idp|s234-admin'],
      ['test-s234b', 'idp|s234b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint234 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: `Admin ${slug}`,
          idpSubject: subj,
        },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s234a' } }))!.id;
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [{ key: 'payroll-main', kind: 'other', adapter: 'noop', config: {} }],
        },
      },
    });
    emp1 = (await api('POST', '/api/v1/employees', tokenA, { name: 'Radnik Jedan' })).body
      .id as string;
    emp2 = (await api('POST', '/api/v1/employees', tokenA, { name: 'Radnik Dva' })).body
      .id as string;

    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 's234-reader',
      permissions: ['hcm.read'],
    });
    const invited = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'reader@s234.example',
      displayName: 'Reader',
      idpSubject: 'idp|s234-reader',
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

  it('SETTINGS: default model BOTH and the default status catalog', async () => {
    const res = await api('GET', '/api/v1/workforce/attendance/settings', tokenA);
    expect(res.body.model).toBe('BOTH');
    const keys = (res.body.statuses as Array<{ key: string }>).map((s) => s.key);
    expect(keys).toEqual(['PRESENT', 'TRAINING', 'SICK', 'ANNUAL', 'DAY_OFF', 'ABSENT']);
    const m = await matrix();
    expect((m.body.days as string[]).length).toBe(31);
    expect(m.body.periodStatus).toBe('OPEN');
  });

  it('SET DAY: audited old → new, optimistic concurrency, idempotent re-set, clear', async () => {
    const set = await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-03',
      statusKey: 'PRESENT',
      expectedVersion: 0,
    });
    expect(set.status).toBe(201);
    expect(set.body).toMatchObject({ status: 'PRESENT', version: 1, changed: true });

    const stale = await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-03',
      statusKey: 'SICK',
      expectedVersion: 0,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');

    const same = await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-03',
      statusKey: 'PRESENT',
    });
    expect(same.body.changed).toBe(false);

    const sick = await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-03',
      statusKey: 'SICK',
      note: 'Doznaka',
      expectedVersion: 1,
    });
    expect(sick.body).toMatchObject({ status: 'SICK', version: 2 });

    const audits = await prisma.auditEvent.findMany({
      where: {
        tenantId: tenantAId,
        action: 'hcm.attendance_day.set',
        objectId: `${emp1}:2025-03-03`,
      },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audits).toHaveLength(2);
    expect(audits[1]!.previousValues).toMatchObject({ status: 'PRESENT' });
    expect(audits[1]!.newValues).toMatchObject({ status: 'SICK', note: 'Doznaka' });

    await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-04',
      statusKey: 'PRESENT',
    });
    const cleared = await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-04',
      statusKey: null,
    });
    expect(cleared.body.changed).toBe(true);
    expect(row((await matrix()).body, emp1).cells['2025-03-04']).toBeUndefined();

    const unknown = await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-05',
      statusKey: 'HOLIDAY_X',
    });
    expect(unknown.status).toBe(400);
  });

  it('CONCURRENT edits of the same empty day: exactly one wins', async () => {
    const results = await Promise.all(
      ['PRESENT', 'SICK', 'ABSENT'].map((statusKey) =>
        api('POST', '/api/v1/workforce/attendance/day', tokenA, {
          employeeId: emp2,
          day: '2025-03-06',
          statusKey,
          expectedVersion: 0,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of results) expect([201, 409]).toContain(r.status);
    expect(
      await prisma.attendanceDay.count({
        where: { employeeId: emp2, day: new Date('2025-03-06') },
      }),
    ).toBe(1);
  });

  it('SUGGESTIONS: clock and granted leave suggest only EMPTY days; apply is idempotent', async () => {
    await clock(emp1, 'IN', '2025-03-10T07:00:00.000Z');
    await clock(emp1, 'OUT', '2025-03-10T15:30:00.000Z');
    await clock(emp1, 'IN', '2025-03-03T07:00:00.000Z'); // day already SICK — never overwritten
    await clock(emp1, 'OUT', '2025-03-03T09:00:00.000Z');
    await prisma.approval.create({
      data: {
        tenantId: tenantAId,
        title: 'Godišnji',
        subjectObjectType: 'hcm_leave',
        subjectObjectId: `${emp2}:leave:2025-03-17:2025-03-18`,
        status: 'GRANTED',
      },
    });
    const m = await matrix();
    expect(row(m.body, emp1).suggestions).toEqual({
      '2025-03-10': { status: 'PRESENT', source: 'CLOCK' },
    });
    expect(row(m.body, emp2).suggestions).toEqual({
      '2025-03-17': { status: 'ANNUAL', source: 'LEAVE' },
      '2025-03-18': { status: 'ANNUAL', source: 'LEAVE' },
    });
    expect(row(m.body, emp1).cells['2025-03-10']).toBeUndefined();

    const applied = await api('POST', '/api/v1/workforce/attendance/apply-suggestions', tokenA, {
      year: Y,
      month: M,
    });
    expect(applied.body).toEqual({ applied: 3, skipped: 0 });
    const again = await api('POST', '/api/v1/workforce/attendance/apply-suggestions', tokenA, {
      year: Y,
      month: M,
    });
    expect(again.body).toEqual({ applied: 0, skipped: 0 });
    const after = await matrix();
    expect(row(after.body, emp1).cells['2025-03-10']).toMatchObject({
      status: 'PRESENT',
      source: 'CLOCK',
    });
    expect(row(after.body, emp1).cells['2025-03-03']!.status).toBe('SICK');
  });

  it('DIGEST: worked days by countsAsWorked and clock hours; change-control report', async () => {
    const d = await api('GET', `/api/v1/workforce/attendance/digest?year=${Y}&month=${M}`, tokenA);
    type R = {
      employeeId: string;
      workedDays: number;
      counts: Record<string, number>;
      clockHours: string;
      unrecordedDays: number;
    };
    const r1 = (d.body.rows as R[]).find((r) => r.employeeId === emp1)!;
    // emp1: 03 SICK, 10 PRESENT(clock) → 1 worked; clock 8.5h + 2h
    expect(r1).toMatchObject({
      workedDays: 1,
      counts: { SICK: 1, PRESENT: 1 },
      clockHours: '10.50',
    });
    expect(r1.unrecordedDays).toBe(29);
    const r2 = (d.body.rows as R[]).find((r) => r.employeeId === emp2)!;
    expect(r2.counts.ANNUAL).toBe(2);

    const changes = await api(
      'GET',
      `/api/v1/workforce/attendance/changes?year=${Y}&month=${M}&employeeId=${emp1}`,
      tokenA,
    );
    const list = changes.body.changes as Array<{
      day: string;
      from: string | null;
      to: string | null;
    }>;
    expect(
      list.some((c) => c.day === '2025-03-03' && c.from === 'PRESENT' && c.to === 'SICK'),
    ).toBe(true);
    expect(list.some((c) => c.day === '2025-03-04' && c.from === 'PRESENT' && c.to === null)).toBe(
      true,
    );
  });

  it('PAYROLL: export uses worked days from the matrix (ODL-002 single payroll source)', async () => {
    const digest = await api(
      'GET',
      `/api/v1/workforce/attendance/digest?year=${Y}&month=${M}`,
      tokenA,
    );
    const res = await api('POST', '/api/v1/workforce/payroll/export', tokenA, {
      connectorKey: 'payroll-main',
      period: '2025-03',
    });
    expect(res.status).toBe(201);
    expect(res.body.employees).toBe(2);
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'hcm.payroll.export' },
    });
    expect(audit?.newValues).toMatchObject({
      workedDaysTotal: (digest.body.totals as { workedDays: number }).workedDays,
    });
  });

  it('LOCK: a locked month refuses edits and suggestions; unlock needs a reason and is audited', async () => {
    const lock = await api('POST', '/api/v1/workforce/attendance/lock', tokenA, {
      year: Y,
      month: M,
    });
    expect(lock.body.status).toBe('LOCKED');
    const edit = await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-20',
      statusKey: 'PRESENT',
    });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('INVALID_STATE');
    const apply = await api('POST', '/api/v1/workforce/attendance/apply-suggestions', tokenA, {
      year: Y,
      month: M,
    });
    expect(apply.status).toBe(409);
    const noReason = await api('POST', '/api/v1/workforce/attendance/unlock', tokenA, {
      year: Y,
      month: M,
      reason: 'x',
    });
    expect(noReason.status).toBe(400);
    const unlock = await api('POST', '/api/v1/workforce/attendance/unlock', tokenA, {
      year: Y,
      month: M,
      reason: 'Ispravka bolovanja',
    });
    expect(unlock.body.status).toBe('OPEN');
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'hcm.attendance_period.unlock' },
    });
    expect(audit?.reason).toBe('Ispravka bolovanja');
  });

  it('LOCK SERIALIZATION: an edit racing an uncommitted lock waits for it and is refused', async () => {
    let edit: Promise<{ status: number; body: Record<string, unknown> }> | null = null;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE attendance_period SET status = 'LOCKED'
        WHERE tenant_id = ${tenantAId}::uuid AND year = ${Y} AND month = ${M}`;
      // The pre-check outside the transaction still sees OPEN here.
      edit = api('POST', '/api/v1/workforce/attendance/day', tokenA, {
        employeeId: emp2,
        day: '2025-03-21',
        statusKey: 'PRESENT',
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    const result = await edit!;
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('INVALID_STATE');
    expect(
      await prisma.attendanceDay.count({
        where: { employeeId: emp2, day: new Date('2025-03-21') },
      }),
    ).toBe(0);
    await api('POST', '/api/v1/workforce/attendance/unlock', tokenA, {
      year: Y,
      month: M,
      reason: 'Nastavak testa',
    });
  });

  it('CONFIG: custom catalog and CLOCK-only model are tenant configuration', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: { connectors: [{ key: 'payroll-main', kind: 'other', adapter: 'noop', config: {} }] },
        hcm: {
          attendanceModel: 'CLOCK',
          attendanceStatuses: [
            { key: 'PRESENT', label: 'Prisutan', countsAsWorked: true },
            { key: 'REMOTE', label: 'Rad od kuće', countsAsWorked: true },
          ],
        },
      },
    });
    const s = await api('GET', '/api/v1/workforce/attendance/settings', tokenA);
    expect(s.body.model).toBe('CLOCK');
    expect((s.body.statuses as Array<{ key: string }>).map((x) => x.key)).toEqual([
      'PRESENT',
      'REMOTE',
    ]);
    const refused = await api('POST', '/api/v1/workforce/attendance/day', tokenA, {
      employeeId: emp1,
      day: '2025-03-28',
      statusKey: 'PRESENT',
    });
    expect(refused.status).toBe(409);
  });

  it('AUTHZ + TENANT: reader sees the matrix but cannot edit or see the change report; other tenant sees nothing', async () => {
    const read = await matrix(reader);
    expect(read.status).toBe(200);
    const edit = await api('POST', '/api/v1/workforce/attendance/day', reader, {
      employeeId: emp1,
      day: '2025-03-12',
      statusKey: 'PRESENT',
    });
    expect(edit.status).toBe(403);
    const changes = await api(
      'GET',
      `/api/v1/workforce/attendance/changes?year=${Y}&month=${M}`,
      reader,
    );
    expect(changes.status).toBe(403);

    const other = await matrix(tokenB);
    expect(other.status).toBe(200);
    expect(other.body.employees).toEqual([]);
    const cross = await api('POST', '/api/v1/workforce/attendance/day', tokenB, {
      employeeId: emp1,
      day: '2025-03-12',
      statusKey: 'PRESENT',
    });
    expect(cross.status).toBe(404);
    const crossChanges = await api(
      'GET',
      `/api/v1/workforce/attendance/changes?year=${Y}&month=${M}`,
      tokenB,
    );
    expect(crossChanges.body.changes).toEqual([]);
  });
});
