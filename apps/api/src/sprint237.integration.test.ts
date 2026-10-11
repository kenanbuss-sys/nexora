import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 237 acceptance tests: HCM-017 employee development + typed bonuses.
 * Mentor scope enforced server-side (own employees only; out of scope = 404),
 * assignment only by the manage permission, qualification-level-matched versioned
 * templates, idempotent training-plan start, item statuses with optimistic
 * concurrency, closed items never reopen, close only when all closed,
 * overdue/recheck overview, append-only training record, typed bonuses
 * converted with configured rates into payroll adjustments, tenant
 * isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const C = '/api/v1/hcm/development';

integration('Sprint 237 — employee development + bonuses (HCM-017)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const admin = identity.signToken({ tenantSlug: 'test-s237a', subject: 'idp|s237-admin' });
  const lead = identity.signToken({ tenantSlug: 'test-s237a', subject: 'idp|s237-lead' });
  const mentor1 = identity.signToken({ tenantSlug: 'test-s237a', subject: 'idp|s237-mentor1' });
  const mentor2 = identity.signToken({ tenantSlug: 'test-s237a', subject: 'idp|s237-mentor2' });
  const officer = identity.signToken({ tenantSlug: 'test-s237a', subject: 'idp|s237-officer' });
  const adminB = identity.signToken({ tenantSlug: 'test-s237b', subject: 'idp|s237b-admin' });
  const leadB = identity.signToken({ tenantSlug: 'test-s237b', subject: 'idp|s237b-lead' });

  let tenantAId = '';
  let e1 = '';
  let e2 = '';
  const users: Record<string, string> = {};
  let planId = '';

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

  async function grant(
    token: string,
    slug: string,
    name: string,
    subject: string,
    permissions: string[],
  ) {
    const role = await api('POST', '/api/v1/roles', token, { name, permissions });
    const user = await api('POST', '/api/v1/users/invite', token, {
      email: `${name}@${slug}.example`,
      displayName: name,
      idpSubject: subject,
    });
    await api('POST', '/api/v1/roles/assign', token, {
      userId: user.body.id,
      roleId: role.body.id,
    });
    return user.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "training_record", "training_plan_item", "training_plan", "training_plan_template",
       "employment_contract", "payroll_line", "payroll_run", "payroll_adjustment", "employee_salary",
       "attendance_day", "attendance_period", "employee",
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
      ['test-s237a', 'idp|s237-admin'],
      ['test-s237b', 'idp|s237b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint237 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s237a' } }))!.id;
    await api('POST', '/api/v1/tenant/configuration', admin, {
      config: { hcm: { payroll: { rates: { EUR: 1.95583 } } } },
    });
    users.lead = await grant(admin, 'test-s237a', 's237-lead', 'idp|s237-lead', [
      'hcm.read',
      'hcm.development.manage',
    ]);
    users.mentor1 = await grant(admin, 'test-s237a', 's237-mentor1', 'idp|s237-mentor1', [
      'hcm.read',
      'hcm.development.own',
    ]);
    users.mentor2 = await grant(admin, 'test-s237a', 's237-mentor2', 'idp|s237-mentor2', [
      'hcm.read',
      'hcm.development.own',
    ]);
    await grant(admin, 'test-s237a', 's237-officer', 'idp|s237-officer', [
      'hcm.read',
      'hcm.salary.read',
      'hcm.salary.manage',
    ]);
    await grant(adminB, 'test-s237b', 's237b-lead', 'idp|s237b-lead', [
      'hcm.read',
      'hcm.development.manage',
    ]);
    e1 = (await api('POST', '/api/v1/employees', admin, { name: 'Radnik Jedan' })).body
      .id as string;
    e2 = (await api('POST', '/api/v1/employees', admin, { name: 'Radnik Dva' })).body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ASSIGNMENT: only the manage permission assigns mentor/qualification level; tenant-admin alone has no access', async () => {
    const adminView = await api('GET', `${C}/employees`, admin);
    expect(adminView.status).toBe(403);
    const ok = await api('POST', `${C}/employees/${e1}/assignment`, lead, {
      mentorUserId: users.mentor1,
      qualificationLevel: 'OPERATOR',
    });
    expect(ok.body).toMatchObject({ mentorUserId: users.mentor1, qualificationLevel: 'OPERATOR' });
    await api('POST', `${C}/employees/${e2}/assignment`, lead, {
      mentorUserId: users.mentor2,
      qualificationLevel: 'SKILLED',
    });
    const byMentor = await api('POST', `${C}/employees/${e1}/assignment`, mentor1, {
      mentorUserId: users.mentor1,
      qualificationLevel: 'SKILLED',
    });
    expect(byMentor.status).toBe(403);
    const badLevel = await api('POST', `${C}/employees/${e1}/assignment`, lead, {
      mentorUserId: users.mentor1,
      qualificationLevel: 'ASTRONAUT',
    });
    expect(badLevel.status).toBe(400);
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'hcm.development.assign', objectId: e1 },
    });
    expect(audit?.newValues).toMatchObject({ qualificationLevel: 'OPERATOR' });
  });

  it('MENTOR SCOPE: a mentor sees and touches only own employees (others are 404)', async () => {
    const mine = await api('GET', `${C}/employees`, mentor1);
    expect((mine.body.employees as Array<{ employeeId: string }>).map((a) => a.employeeId)).toEqual(
      [e1],
    );
    const all = await api('GET', `${C}/employees`, lead);
    expect((all.body.employees as unknown[]).length).toBe(2);
    expect((await api('GET', `${C}/plans?employeeId=${e2}`, mentor1)).status).toBe(404);
    expect((await api('GET', `${C}/records?employeeId=${e2}`, mentor1)).status).toBe(404);
    const start = await api('POST', `${C}/plans`, mentor1, {
      employeeId: e2,
      templateKey: 'x',
      dueDate: '2025-03-01',
      requestKey: 's237-foreign-01',
    });
    expect(start.status).toBe(404);
  });

  it('TEMPLATES + START: versioned per qualification level; level default; idempotent start', async () => {
    const byMentor = await api('POST', `${C}/templates`, mentor1, {
      key: 'operater-cnc',
      name: 'Osposobljavanje za CNC',
      items: [{ key: 'a', text: 'A' }],
    });
    expect(byMentor.status).toBe(403);
    const v1 = await api('POST', `${C}/templates`, lead, {
      key: 'operater-cnc',
      name: 'Osposobljavanje za CNC',
      qualificationLevel: 'OPERATOR',
      items: [
        { key: 'a', text: 'Zaštita na radu na mašini' },
        { key: 'b', text: 'Postavljanje alata i nulte tačke' },
      ],
    });
    expect(v1.body.version).toBe(1);
    const v2 = await api('POST', `${C}/templates`, lead, {
      key: 'operater-cnc',
      name: 'Osposobljavanje za CNC',
      qualificationLevel: 'OPERATOR',
      items: [
        { key: 'a', text: 'Zaštita na radu na mašini' },
        { key: 'b', text: 'Postavljanje alata i nulte tačke' },
        { key: 'c', text: 'Samostalna izrada probnog komada' },
      ],
    });
    expect(v2.body.version).toBe(2);
    const payload = {
      employeeId: e1,
      dueDate: '2025-03-31',
      recheckDate: '2025-04-15',
      requestKey: 's237-start-0001',
    };
    const started = await api('POST', `${C}/plans`, mentor1, payload);
    expect(started.status).toBe(201);
    planId = started.body.id as string;
    expect(started.body).toMatchObject({
      templateKey: 'operater-cnc',
      templateVersion: 2,
      status: 'OPEN',
    });
    expect((started.body.items as unknown[]).length).toBe(3);
    const replay = await api('POST', `${C}/plans`, mentor1, payload);
    expect(replay.body.id).toBe(planId);
    expect(await prisma.trainingPlan.count({ where: { tenantId: tenantAId } })).toBe(1);
  });

  it('ITEMS: optimistic versions, audited old→new, closed items never reopen, close only when all closed', async () => {
    const p = `${C}/plans/${planId}/items`;
    const s1 = await api('POST', `${p}/a`, mentor1, { status: 'IN_PROGRESS', expectedVersion: 1 });
    expect(s1.status).toBe(201);
    const stale = await api('POST', `${p}/a`, mentor1, { status: 'DONE', expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');
    await api('POST', `${p}/a`, mentor1, { status: 'DONE', note: 'Odlično', expectedVersion: 2 });
    const reopen = await api('POST', `${p}/a`, mentor1, {
      status: 'IN_PROGRESS',
      expectedVersion: 3,
    });
    expect(reopen.status).toBe(409);
    expect(reopen.body.code).toBe('INVALID_STATE');
    const early = await api('POST', `${C}/plans/${planId}/close`, mentor1);
    expect(early.status).toBe(409);
    await api('POST', `${p}/b`, mentor1, { status: 'QUALIFIED', expectedVersion: 1 });
    await api('POST', `${p}/c`, mentor1, { status: 'DONE', expectedVersion: 1 });
    const closed = await api('POST', `${C}/plans/${planId}/close`, mentor1);
    expect(closed.body.status).toBe('CLOSED');
    const after = await api('POST', `${p}/c`, mentor1, {
      status: 'DONE',
      note: 'x',
      expectedVersion: 2,
    });
    expect(after.status).toBe(409);
    const audits = await prisma.auditEvent.findMany({
      where: { tenantId: tenantAId, action: 'hcm.training_plan.item', objectId: planId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audits[1]!.previousValues).toMatchObject({ status: 'IN_PROGRESS' });
    expect(audits[1]!.newValues).toMatchObject({ itemKey: 'a', status: 'DONE' });
    const foreign = await api('GET', `${C}/plans/${planId}`, mentor2);
    expect(foreign.status).toBe(404);
  });

  it('OVERVIEW: overdue plans and due rechecks per mentor scope', async () => {
    await api('POST', `${C}/plans`, mentor1, {
      employeeId: e1,
      templateKey: 'operater-cnc',
      dueDate: '2025-01-10',
      recheckDate: '2025-01-05',
      requestKey: 's237-start-0002',
    });
    const o1 = await api('GET', `${C}/overview?asOf=2025-02-01`, mentor1);
    expect(o1.body).toEqual({ employees: 1, overdue: 1, rechecksDue: 1 });
    const o2 = await api('GET', `${C}/overview?asOf=2025-02-01`, mentor2);
    expect(o2.body).toEqual({ employees: 1, overdue: 0, rechecksDue: 0 });
  });

  it('TRAINING RECORD: append-only, idempotent, scoped', async () => {
    const entry = {
      employeeId: e1,
      sessionDate: '2025-02-03',
      topic: 'Postavljanje alata i nulte tačke',
      notes: 'Vježba na tri probna komada',
      recheckDate: '2025-02-17',
      requestKey: 's237-record-0001',
    };
    const first = await api('POST', `${C}/records`, mentor1, entry);
    expect(first.status).toBe(201);
    const replay = await api('POST', `${C}/records`, mentor1, entry);
    expect(replay.body.id).toBe(first.body.id);
    const list = await api('GET', `${C}/records?employeeId=${e1}`, lead);
    expect((list.body.records as unknown[]).length).toBe(1);
    expect(
      (await api('POST', `${C}/records`, mentor2, { ...entry, requestKey: 's237-record-0002' }))
        .status,
    ).toBe(404);
  });

  it('BONUSES: typed, converted with the configured rate into payroll adjustments; salary permissions apply', async () => {
    const forbidden = await api('POST', '/api/v1/payroll/bonuses', lead, {
      year: 2025,
      month: 3,
      employeeId: e1,
      bonusType: 'STIMULATION',
      amount: 100,
      currency: 'EUR',
      reason: 'Premašena norma',
      requestKey: 's237-bonus-0001',
    });
    expect(forbidden.status).toBe(403);
    const bonus = {
      year: 2025,
      month: 3,
      employeeId: e1,
      bonusType: 'STIMULATION',
      amount: 100,
      currency: 'EUR',
      reason: 'Premašena norma',
      requestKey: 's237-bonus-0001',
    };
    const res = await api('POST', '/api/v1/payroll/bonuses', officer, bonus);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: '195.58', currency: 'BAM', replay: false });
    const replay = await api('POST', '/api/v1/payroll/bonuses', officer, bonus);
    expect(replay.body).toMatchObject({ id: res.body.id, replay: true });
    await api('POST', '/api/v1/payroll/bonuses', officer, {
      ...bonus,
      bonusType: 'DESTIMULATION',
      amount: 20,
      currency: 'BAM',
      requestKey: 's237-bonus-0002',
    });
    const unknownType = await api('POST', '/api/v1/payroll/bonuses', officer, {
      ...bonus,
      bonusType: 'HOLIDAY',
      requestKey: 's237-bonus-0003',
    });
    expect(unknownType.status).toBe(400);
    const noRate = await api('POST', '/api/v1/payroll/bonuses', officer, {
      ...bonus,
      currency: 'USD',
      requestKey: 's237-bonus-0004',
    });
    expect(noRate.status).toBe(400);
    const list = await api('GET', '/api/v1/payroll/adjustments?year=2025&month=3', officer);
    const rows = list.body.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: 'BONUS',
      bonusType: 'STIMULATION',
      amount: '195.58',
      originalAmount: '100.00',
      originalCurrency: 'EUR',
    });
    expect(rows[1]).toMatchObject({
      kind: 'DEDUCTION',
      bonusType: 'DESTIMULATION',
      amount: '20.00',
    });
    expect(
      (await api('GET', '/api/v1/payroll/adjustments?year=2025&month=3', mentor1)).status,
    ).toBe(403);
  });

  it('TENANT ISOLATION: another tenant’s lead sees nothing of tenant A', async () => {
    const staff = await api('GET', `${C}/employees`, leadB);
    expect(staff.body.employees).toEqual([]);
    expect((await api('GET', `${C}/plans/${planId}`, leadB)).status).toBe(404);
    const assign = await api('POST', `${C}/employees/${e1}/assignment`, leadB, {
      mentorUserId: null,
      qualificationLevel: null,
    });
    expect(assign.status).toBe(404);
  });
});
