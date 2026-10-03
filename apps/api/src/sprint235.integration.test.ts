import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 235 acceptance tests: HCM-013/014 salary data + payroll.
 * Salary policy by explicit permissions (tenant-admin alone sees nothing;
 * contract scope sees current base only; management lock hides locked
 * employees even from the salary circle), effective-dated salary
 * versions, idempotent adjustments, computation from the Šihtarica
 * (earned = base / fund × worked), confirmation only with the attendance
 * month locked (immutable, one event without amounts, unlock refused),
 * payslips (audited, locked → 404), concurrency and tenant isolation.
 * March 2025 has 21 weekdays (default fund).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 235 — payroll + salary permissions (HCM-013/014)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const admin = identity.signToken({ tenantSlug: 'test-s235a', subject: 'idp|s235-admin' });
  const officer = identity.signToken({ tenantSlug: 'test-s235a', subject: 'idp|s235-officer' });
  const manager = identity.signToken({ tenantSlug: 'test-s235a', subject: 'idp|s235-manager' });
  const contract = identity.signToken({ tenantSlug: 'test-s235a', subject: 'idp|s235-contract' });
  const adminB = identity.signToken({ tenantSlug: 'test-s235b', subject: 'idp|s235b-admin' });
  const officerB = identity.signToken({ tenantSlug: 'test-s235b', subject: 'idp|s235b-officer' });

  let tenantAId = '';
  let e1 = '';
  let e2 = '';
  let e3 = '';

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
    const assigned = await api('POST', '/api/v1/roles/assign', token, {
      userId: user.body.id,
      roleId: role.body.id,
    });
    expect(assigned.status).toBe(201);
  }

  async function present(employeeId: string, days: number[]) {
    for (const d of days) {
      const r = await api('POST', '/api/v1/workforce/attendance/day', admin, {
        employeeId,
        day: `2025-03-${String(d).padStart(2, '0')}`,
        statusKey: 'PRESENT',
      });
      expect(r.status).toBe(201);
    }
  }

  type Line = {
    employeeId: string;
    earned: string;
    bonuses: string;
    deductions: string;
    netTotal: string;
    workedDays: number;
    fundDays: number;
    baseNet: string;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "payroll_line", "payroll_run", "payroll_adjustment", "employee_salary",
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
      ['test-s235a', 'idp|s235-admin'],
      ['test-s235b', 'idp|s235b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint235 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s235a' } }))!.id;
    const circle = ['hcm.read', 'hcm.salary.read', 'hcm.salary.manage'];
    await grant(admin, 'test-s235a', 's235-officer', 'idp|s235-officer', circle);
    await grant(admin, 'test-s235a', 's235-manager', 'idp|s235-manager', [
      ...circle,
      'hcm.salary.management',
    ]);
    await grant(admin, 'test-s235a', 's235-contract', 'idp|s235-contract', [
      'hcm.read',
      'hcm.salary.contract',
    ]);
    await grant(adminB, 'test-s235b', 's235b-officer', 'idp|s235b-officer', circle);

    e1 = (await api('POST', '/api/v1/employees', admin, { name: 'Ana Prva' })).body.id as string;
    e2 = (await api('POST', '/api/v1/employees', admin, { name: 'Direktor Drugi' })).body
      .id as string;
    e3 = (await api('POST', '/api/v1/employees', admin, { name: 'Bez Plate' })).body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SALARY DATA: effective-dated versions; tenant-admin alone and contract scope cannot set; audit has no amount', async () => {
    const forbidden = await api('POST', '/api/v1/payroll/salaries', admin, {
      employeeId: e1,
      netAmount: 2100,
      validFrom: '2025-01-01',
    });
    expect(forbidden.status).toBe(403);
    const byContract = await api('POST', '/api/v1/payroll/salaries', contract, {
      employeeId: e1,
      netAmount: 2100,
      validFrom: '2025-01-01',
    });
    expect(byContract.status).toBe(403);

    const set = await api('POST', '/api/v1/payroll/salaries', officer, {
      employeeId: e1,
      netAmount: 2100,
      validFrom: '2025-01-01',
    });
    expect(set.status).toBe(201);
    expect(set.body).toMatchObject({ netAmount: '2100.00', currency: 'BAM' });
    await api('POST', '/api/v1/payroll/salaries', officer, {
      employeeId: e1,
      netAmount: 2200,
      validFrom: '2025-04-01',
    });
    const dup = await api('POST', '/api/v1/payroll/salaries', officer, {
      employeeId: e1,
      netAmount: 9999,
      validFrom: '2025-04-01',
    });
    expect(dup.status).toBe(409);
    await api('POST', '/api/v1/payroll/salaries', officer, {
      employeeId: e2,
      netAmount: 3000,
      validFrom: '2025-01-01',
    });

    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'hcm.salary.set' },
    });
    expect(JSON.stringify(audit?.newValues)).not.toContain('2100');
  });

  it('MANAGEMENT LOCK: only the management layer locks; locked salaries vanish for the salary circle', async () => {
    const byOfficer = await api('POST', '/api/v1/payroll/salary-lock', officer, {
      employeeId: e2,
      locked: true,
    });
    expect(byOfficer.status).toBe(403);
    const lock = await api('POST', '/api/v1/payroll/salary-lock', manager, {
      employeeId: e2,
      locked: true,
    });
    expect(lock.body.locked).toBe(true);

    const officerView = await api('GET', '/api/v1/payroll/salaries', officer);
    const ids = (officerView.body.rows as Array<{ employeeId: string }>).map((r) => r.employeeId);
    expect(officerView.body.scope).toBe('FULL');
    expect(ids).toContain(e1);
    expect(ids).not.toContain(e2);
    const editLocked = await api('POST', '/api/v1/payroll/salaries', officer, {
      employeeId: e2,
      netAmount: 1,
      validFrom: '2025-02-01',
    });
    expect(editLocked.status).toBe(404);

    const managerView = await api('GET', '/api/v1/payroll/salaries', manager);
    expect(
      (managerView.body.rows as Array<{ employeeId: string }>).map((r) => r.employeeId),
    ).toContain(e2);
  });

  it('CONTRACT SCOPE: current base salary only, no history, no payroll; tenant-admin sees nothing', async () => {
    const view = await api('GET', '/api/v1/payroll/salaries', contract);
    expect(view.body.scope).toBe('CONTRACT');
    const r1 = (view.body.rows as Array<Record<string, unknown>>).find((r) => r.employeeId === e1)!;
    expect(r1.current).toBeTruthy();
    expect(r1.history).toBeUndefined();
    expect((view.body.rows as Array<{ employeeId: string }>).some((r) => r.employeeId === e2)).toBe(
      false,
    );
    const run = await api('GET', '/api/v1/payroll/runs?year=2025&month=3', contract);
    expect(run.status).toBe(403);
    const adminView = await api('GET', '/api/v1/payroll/salaries', admin);
    expect(adminView.status).toBe(403);
  });

  it('ADJUSTMENTS: idempotent per requestKey; changed payload conflicts', async () => {
    const bonus = {
      year: 2025,
      month: 3,
      employeeId: e1,
      kind: 'BONUS',
      amount: 150,
      reason: 'Stimulacija',
      requestKey: 's235-bonus-0001',
    };
    const first = await api('POST', '/api/v1/payroll/adjustments', officer, bonus);
    expect(first.body.replay).toBe(false);
    const replay = await api('POST', '/api/v1/payroll/adjustments', officer, bonus);
    expect(replay.body).toMatchObject({ id: first.body.id, replay: true });
    const changed = await api('POST', '/api/v1/payroll/adjustments', officer, {
      ...bonus,
      amount: 151,
    });
    expect(changed.status).toBe(409);
    await api('POST', '/api/v1/payroll/adjustments', officer, {
      ...bonus,
      kind: 'DEDUCTION',
      amount: 50,
      reason: 'Akontacija',
      requestKey: 's235-ded-0001',
    });
  });

  it('COMPUTE: earned = base / fund × worked (Šihtarica) + bonuses − deductions; locked lines hidden from the circle', async () => {
    await present(e1, [3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28]);
    await present(
      e2,
      [3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28, 31],
    );
    // The run includes a locked employee: only the management layer may compute it.
    const byOfficer = await api('POST', '/api/v1/payroll/runs/compute', officer, {
      year: 2025,
      month: 3,
    });
    expect(byOfficer.status).toBe(403);
    expect(String(byOfficer.body.message)).toContain('hcm.salary.management');
    await api('POST', '/api/v1/payroll/runs/compute', manager, { year: 2025, month: 3 });
    const res = await api('GET', '/api/v1/payroll/runs?year=2025&month=3', officer);
    expect(res.body).toMatchObject({ status: 'DRAFT', fundDays: 21, visibleTotal: '2100.00' });
    // The salary circle does not even learn how many employees are locked.
    expect(res.body.hiddenLines).toBeUndefined();
    expect(res.body.lockedLinesIncluded).toBeUndefined();
    expect((res.body.lines as Line[]).map((l) => l.employeeId)).toEqual([e1]);
    const l1 = (res.body.lines as Line[]).find((l) => l.employeeId === e1)!;
    expect(l1).toMatchObject({
      baseNet: '2100.00',
      workedDays: 20,
      fundDays: 21,
      earned: '2000.00',
      bonuses: '150.00',
      deductions: '50.00',
      netTotal: '2100.00',
    });
    expect((res.body.lines as Line[]).some((l) => l.employeeId === e3)).toBe(false);

    const mgmt = await api('GET', '/api/v1/payroll/runs?year=2025&month=3', manager);
    expect(mgmt.body).toMatchObject({ lockedLinesIncluded: 1, visibleTotal: '5100.00' });
  });

  it('CONFIRM: needs the locked Šihtarica; immutable; one event without amounts; unlock refused', async () => {
    const early = await api('POST', '/api/v1/payroll/runs/confirm', manager, {
      year: 2025,
      month: 3,
    });
    expect(early.status).toBe(409);
    expect(String(early.body.message)).toContain('šihtarica');

    await api('POST', '/api/v1/workforce/attendance/lock', admin, { year: 2025, month: 3 });
    const officerConfirm = await api('POST', '/api/v1/payroll/runs/confirm', officer, {
      year: 2025,
      month: 3,
    });
    expect(officerConfirm.status).toBe(403);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        api('POST', '/api/v1/payroll/runs/confirm', manager, { year: 2025, month: 3 }),
      ),
    );
    for (const r of results) expect([201, 409]).toContain(r.status);
    const final = await api('POST', '/api/v1/payroll/runs/confirm', manager, {
      year: 2025,
      month: 3,
    });
    expect(final.body.status).toBe('CONFIRMED');
    const events = await prisma.outboxEvent.findMany({
      where: { tenantId: tenantAId, eventType: 'payroll.confirmed' },
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0]!.payload)).not.toMatch(/2100|3000|5100/);

    const lateAdj = await api('POST', '/api/v1/payroll/adjustments', officer, {
      year: 2025,
      month: 3,
      employeeId: e1,
      kind: 'BONUS',
      amount: 10,
      reason: 'Kasno',
      requestKey: 's235-late-0001',
    });
    expect(lateAdj.status).toBe(409);
    const recompute = await api('POST', '/api/v1/payroll/runs/compute', manager, {
      year: 2025,
      month: 3,
    });
    expect(recompute.status).toBe(409);
    const unlock = await api('POST', '/api/v1/workforce/attendance/unlock', admin, {
      year: 2025,
      month: 3,
      reason: 'Pokušaj izmjene',
    });
    expect(unlock.status).toBe(409);
    expect(String(unlock.body.message)).toContain('payroll');
  });

  it('PAYSLIP: salary circle only, locked employee hidden, every view audited', async () => {
    const slip = await api(
      'GET',
      `/api/v1/payroll/payslip?year=2025&month=3&employeeId=${e1}`,
      officer,
    );
    expect(slip.status).toBe(200);
    expect(slip.body).toMatchObject({ draft: false, earned: '2000.00', netTotal: '2100.00' });
    expect((slip.body.adjustments as unknown[]).length).toBe(2);
    const locked = await api(
      'GET',
      `/api/v1/payroll/payslip?year=2025&month=3&employeeId=${e2}`,
      officer,
    );
    expect(locked.status).toBe(404);
    const byManager = await api(
      'GET',
      `/api/v1/payroll/payslip?year=2025&month=3&employeeId=${e2}`,
      manager,
    );
    expect(byManager.body.netTotal).toBe('3000.00');
    const byContract = await api(
      'GET',
      `/api/v1/payroll/payslip?year=2025&month=3&employeeId=${e1}`,
      contract,
    );
    expect(byContract.status).toBe(403);
    expect(
      await prisma.auditEvent.count({ where: { tenantId: tenantAId, action: 'hcm.payslip.view' } }),
    ).toBe(2);
  });

  it('LOCK AFTER CONFIRM: locking later hides the confirmed history from the salary circle too', async () => {
    await api('POST', '/api/v1/payroll/salary-lock', manager, { employeeId: e1, locked: true });
    const slip = await api(
      'GET',
      `/api/v1/payroll/payslip?year=2025&month=3&employeeId=${e1}`,
      officer,
    );
    expect(slip.status).toBe(404);
    const run = await api('GET', '/api/v1/payroll/runs?year=2025&month=3', officer);
    expect(run.body.lines).toEqual([]);
    expect(run.body.visibleTotal).toBe('0.00');
    await api('POST', '/api/v1/payroll/salary-lock', manager, { employeeId: e1, locked: false });
  });

  it('SCOPED GRANT: an org-scoped (legal entity) salary permission never grants tenant-wide salary access', async () => {
    const role = await api('POST', '/api/v1/roles', admin, {
      name: 's235-branch-salary',
      permissions: ['hcm.read', 'hcm.salary.read', 'hcm.salary.manage', 'hcm.salary.management'],
    });
    const user = await api('POST', '/api/v1/users/invite', admin, {
      email: 'branch@test-s235a.example',
      displayName: 'Branch',
      idpSubject: 'idp|s235-branch',
    });
    const le = await api('POST', '/api/v1/organization/legal-entities', admin, {
      name: 'Podružnica 235',
    });
    const assigned = await api('POST', '/api/v1/roles/assign', admin, {
      userId: user.body.id,
      roleId: role.body.id,
      scopeType: 'LEGAL_ENTITY',
      scopeId: le.body.id,
    });
    expect(assigned.status).toBe(201);
    const branch = identity.signToken({ tenantSlug: 'test-s235a', subject: 'idp|s235-branch' });
    const salaries = await api('GET', '/api/v1/payroll/salaries', branch);
    expect(salaries.status).toBe(403);
    const lock = await api('POST', '/api/v1/payroll/salary-lock', branch, {
      employeeId: e1,
      locked: true,
    });
    expect(lock.status).toBe(403);
    const slip = await api(
      'GET',
      `/api/v1/payroll/payslip?year=2025&month=3&employeeId=${e1}`,
      branch,
    );
    expect(slip.status).toBe(403);
  });

  it('TENANT ISOLATION: another tenant’s salary circle sees nothing of tenant A', async () => {
    const slip = await api(
      'GET',
      `/api/v1/payroll/payslip?year=2025&month=3&employeeId=${e1}`,
      officerB,
    );
    expect(slip.status).toBe(404);
    const run = await api('GET', '/api/v1/payroll/runs?year=2025&month=3', officerB);
    expect(run.body.status).toBe('NONE');
    const set = await api('POST', '/api/v1/payroll/salaries', officerB, {
      employeeId: e1,
      netAmount: 1,
      validFrom: '2025-01-01',
    });
    expect(set.status).toBe(404);
    const salaries = await api('GET', '/api/v1/payroll/salaries', officerB);
    expect(salaries.body.rows).toEqual([]);
  });
});
