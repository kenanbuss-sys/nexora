import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 253 acceptance tests: HCM-018 employee self-service.
 * Identity comes from the sign-in (employee.user_id), never from the
 * request; one employee per user; own attendance/leave/contracts/documents
 * only (another employee's document behaves as non-existent); payslips are
 * off by default and, when enabled, show only CONFIRMED runs of the caller;
 * leave requests are idempotent per period (also concurrently); reads of
 * documents/payslips are audited; hcm.self is required; tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 253 — employee self-service (HCM-018)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);
  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const admin = identity.signToken({ tenantSlug: 'test-s253a', subject: 'idp|s253-admin' });
  const adminB = identity.signToken({ tenantSlug: 'test-s253b', subject: 'idp|s253b-admin' });
  const ana = identity.signToken({ tenantSlug: 'test-s253a', subject: 'idp|s253-ana' });
  const bob = identity.signToken({ tenantSlug: 'test-s253a', subject: 'idp|s253-bob' });
  const noRole = identity.signToken({ tenantSlug: 'test-s253a', subject: 'idp|s253-norole' });
  const hrToken = identity.signToken({ tenantSlug: 'test-s253a', subject: 'idp|s253-hr' });
  const unlinked = identity.signToken({ tenantSlug: 'test-s253a', subject: 'idp|s253-unlinked' });

  let tenantId = '';
  const user: Record<string, string> = {};
  const emp: Record<string, string> = {};

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
      `TRUNCATE TABLE "payroll_line", "payroll_run", "payroll_adjustment", "attendance_day",
       "attendance_period", "employment_contract", "attachment_blob", "attachment", "employee",
       "processed_event", "outbox_event", "audit_event", "approval", "task", "notification",
       "module_activation", "user_role_assignment", "role_permission", "role", "user",
       "branch", "factory", "business_unit", "legal_entity",
       "tenant_configuration_version", "tenant" CASCADE`,
    );
    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    for (const [slug, subject] of [
      ['test-s253a', 'idp|s253-admin'],
      ['test-s253b', 'idp|s253b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint253 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subject },
      });
    }
    tenantId = (await prisma.tenant.findFirst({ where: { slug: 'test-s253a' } }))!.id;
    const role = await api('POST', '/api/v1/roles', admin, {
      name: 'radnik',
      permissions: ['hcm.self'],
    });
    const hr = await api('POST', '/api/v1/roles', admin, {
      name: 'hr-dokumenti',
      permissions: [
        'hcm.read',
        'hcm.manage',
        'hcm.docs.read',
        'hcm.docs.manage',
        'hcm.salary.read',
      ],
    });
    const hrUser = await api('POST', '/api/v1/users/invite', admin, {
      email: 'hr@s253.example',
      displayName: 'HR',
      idpSubject: 'idp|s253-hr',
    });
    const assigned = await api('POST', '/api/v1/roles/assign', admin, {
      userId: hrUser.body.id,
      roleId: hr.body.id,
    });
    expect(assigned.status).toBe(201);
    for (const key of ['ana', 'bob', 'norole', 'unlinked']) {
      const u = await api('POST', '/api/v1/users/invite', admin, {
        email: `${key}@s253.example`,
        displayName: key,
        idpSubject: `idp|s253-${key}`,
      });
      user[key] = u.body.id as string;
      if (key !== 'norole') {
        await api('POST', '/api/v1/roles/assign', admin, {
          userId: u.body.id,
          roleId: role.body.id,
        });
      }
    }
    for (const key of ['ana', 'bob', 'norole']) {
      const e = await api('POST', '/api/v1/employees', admin, { name: `Radnik ${key} DEMO` });
      emp[key] = e.body.id as string;
      const link = await api('POST', `/api/v1/employees/${emp[key]}/user`, hrToken, {
        userId: user[key],
      });
      expect(link.status).toBe(201);
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('LINK: one employee per user; foreign/unknown user refused; audited', async () => {
    const other = await api('POST', '/api/v1/employees', admin, { name: 'Drugi DEMO' });
    const dup = await api('POST', `/api/v1/employees/${other.body.id}/user`, hrToken, {
      userId: user.ana,
    });
    expect(dup.status).toBe(409);
    const bUser = (await prisma.user.findFirst({ where: { idpSubject: 'idp|s253b-admin' } }))!.id;
    expect(
      (await api('POST', `/api/v1/employees/${other.body.id}/user`, hrToken, { userId: bUser }))
        .status,
    ).toBe(404);
    expect(
      await prisma.auditEvent.count({
        where: { tenantId, action: 'hcm.employee.user_link', objectId: emp.ana! },
      }),
    ).toBe(1);
  });

  it('LINK SECURITY: no self-link, rights required, explicit unlink, salary lock, user status', async () => {
    const target = await api('POST', '/api/v1/employees', admin, { name: 'Direktor DEMO' });
    const tid = target.body.id as string;
    const hrId = (await prisma.user.findFirst({ where: { idpSubject: 'idp|s253-hr' } }))!.id;
    // An HR user may not open another person's data to themselves.
    const self = await api('POST', `/api/v1/employees/${tid}/user`, hrToken, { userId: hrId });
    expect(self.status).toBe(403);
    // hcm.manage alone (tenant admin baseline) is not enough to link.
    const weak = await api('POST', `/api/v1/employees/${tid}/user`, admin, {
      userId: user.unlinked,
    });
    expect(weak.status).toBe(403);
    expect((weak.body.details as { missing: string[] }).missing).toEqual(
      expect.arrayContaining(['hcm.docs.manage', 'hcm.salary.read']),
    );
    // Re-linking an already linked employee needs an explicit unlink first.
    expect(
      (await api('POST', `/api/v1/employees/${emp.ana}/user`, hrToken, { userId: user.unlinked }))
        .status,
    ).toBe(409);
    // A salary-locked employee needs the management layer.
    await prisma.employee.update({ where: { id: tid }, data: { salaryLocked: true } });
    const locked = await api('POST', `/api/v1/employees/${tid}/user`, hrToken, {
      userId: user.unlinked,
    });
    expect(locked.status).toBe(403);
    await prisma.employee.update({ where: { id: tid }, data: { salaryLocked: false } });
    // Suspended users cannot be linked.
    await prisma.user.update({ where: { id: user.unlinked }, data: { status: 'SUSPENDED' } });
    expect(
      (await api('POST', `/api/v1/employees/${tid}/user`, hrToken, { userId: user.unlinked }))
        .status,
    ).toBe(409);
    await prisma.user.update({ where: { id: user.unlinked }, data: { status: 'ACTIVE' } });
    expect(await prisma.employee.count({ where: { id: tid, userId: { not: null } } })).toBe(0);
  });

  it('PROFILE: the caller sees only their own record; no link / no permission explained', async () => {
    const me = await api('GET', '/api/v1/hcm/me', ana);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ name: 'Radnik ana DEMO', payslipsEnabled: false });
    expect(me.body).not.toHaveProperty('salaryLocked');
    const none = await api('GET', '/api/v1/hcm/me', unlinked);
    expect(none.status).toBe(404);
    expect(String(none.body.message)).toMatch(/not linked/);
    expect((await api('GET', '/api/v1/hcm/me', noRole)).status).toBe(403);
    // Tenant B admin has no linked employee in A and cannot read A.
    expect((await api('GET', '/api/v1/hcm/me', adminB)).status).toBe(404);
  });

  it('ATTENDANCE: own month only, with labels and worked days', async () => {
    await prisma.attendanceDay.createMany({
      data: [
        { tenantId, employeeId: emp.ana!, day: new Date('2026-09-01'), statusKey: 'R' },
        { tenantId, employeeId: emp.ana!, day: new Date('2026-09-02'), statusKey: 'GO' },
        { tenantId, employeeId: emp.bob!, day: new Date('2026-09-01'), statusKey: 'R' },
      ],
    });
    const mine = await api('GET', '/api/v1/hcm/me/attendance?year=2026&month=9', ana);
    expect(mine.status).toBe(200);
    expect((mine.body.days as unknown[]).length).toBe(2);
    const bobs = await api('GET', '/api/v1/hcm/me/attendance?year=2026&month=9', bob);
    expect((bobs.body.days as unknown[]).length).toBe(1);
    expect((await api('GET', '/api/v1/hcm/me/attendance?year=2026&month=13', ana)).status).toBe(
      400,
    );
  });

  it('LEAVE: request is idempotent per period (also concurrently) and listed as own', async () => {
    const body = { from: '2026-11-02', to: '2026-11-06', type: 'GODISNJI' };
    const [r1, r2] = await Promise.all([
      api('POST', '/api/v1/hcm/me/leave', ana, body),
      api('POST', '/api/v1/hcm/me/leave', ana, body),
    ]);
    expect([r1.body.duplicate, r2.body.duplicate].sort()).toEqual([false, true]);
    expect(
      await prisma.approval.count({
        where: { tenantId, subjectObjectId: `${emp.ana}:leave:2026-11-02:2026-11-06` },
      }),
    ).toBe(1);
    expect(
      (await api('POST', '/api/v1/hcm/me/leave', ana, { ...body, to: '2026-11-01' })).status,
    ).toBe(400);
    const list = await api('GET', '/api/v1/hcm/me/leave', ana);
    expect(list.body.leave).toEqual([
      expect.objectContaining({
        from: '2026-11-02',
        to: '2026-11-06',
        type: 'GODISNJI',
        status: 'REQUESTED',
      }),
    ]);
    expect((await api('GET', '/api/v1/hcm/me/leave', bob)).body.leave).toEqual([]);
  });

  it("DOCUMENTS: own list and download (audited); another employee's document is 404", async () => {
    const up = await api('POST', `/api/v1/hcm/employees/${emp.bob}/documents`, hrToken, {
      fileName: 'ljekarsko-bob.pdf',
      contentType: 'application/pdf',
      dataBase64: Buffer.from('%PDF-1.4 DEMO').toString('base64'),
    });
    expect(up.body).toMatchObject({ fileName: 'ljekarsko-bob.pdf' });
    expect(up.status).toBe(201);
    const bobDoc = up.body.id as string;
    const mine = await api('GET', '/api/v1/hcm/me/documents', bob);
    expect((mine.body.documents as Array<{ id: string }>).map((d) => d.id)).toEqual([bobDoc]);
    expect((await api('GET', '/api/v1/hcm/me/documents', ana)).body.documents).toEqual([]);
    expect((await api('GET', `/api/v1/hcm/me/documents/${bobDoc}`, ana)).status).toBe(404);
    const dl = await api('GET', `/api/v1/hcm/me/documents/${bobDoc}`, bob);
    expect(dl.status).toBe(200);
    expect(dl.body.fileName).toBe('ljekarsko-bob.pdf');
    expect(
      await prisma.auditEvent.count({
        where: { tenantId, action: 'hcm.self.document.read', objectId: emp.bob! },
      }),
    ).toBe(1);
  });

  it('PAYSLIPS: off by default; when enabled only own CONFIRMED runs; audited', async () => {
    const run = async (month: number, status: string) =>
      prisma.payrollRun.create({
        data: {
          tenantId,
          year: 2026,
          month,
          status,
          fundDays: 22,
          currency: 'BAM',
          computedAt: new Date(),
        },
      });
    const line = (runId: string, key: 'ana' | 'bob', net: string) =>
      prisma.payrollLine.create({
        data: {
          tenantId,
          runId,
          employeeId: emp[key]!,
          employeeNumber: key,
          employeeName: `Radnik ${key} DEMO`,
          salaryLocked: false,
          salaryId: emp[key]!,
          baseNet: net,
          workedDays: 22,
          fundDays: 22,
          earned: net,
          bonuses: '0',
          deductions: '0',
          netTotal: net,
        },
      });
    const aug = await run(8, 'CONFIRMED');
    const sep = await run(9, 'DRAFT');
    await line(aug.id, 'ana', '1500.00');
    await line(aug.id, 'bob', '1700.00');
    await line(sep.id, 'ana', '1550.00');

    expect((await api('GET', '/api/v1/hcm/me/payslips', ana)).status).toBe(403);

    const config = (await api('GET', '/api/v1/tenant/configuration', admin)).body.config as Record<
      string,
      unknown
    >;
    await api('POST', '/api/v1/tenant/configuration', admin, {
      config: { ...config, hcm: { selfService: { payslips: true } } },
    });
    const list = await api('GET', '/api/v1/hcm/me/payslips', ana);
    expect(list.body.payslips).toEqual([{ year: 2026, month: 8, currency: 'BAM' }]);
    const slip = await api('GET', '/api/v1/hcm/me/payslips/2026/8', ana);
    expect(slip.body).toMatchObject({ employeeName: 'Radnik ana DEMO', netTotal: '1500.00' });
    expect((await api('GET', '/api/v1/hcm/me/payslips/2026/9', ana)).status).toBe(404); // draft
    expect(
      await prisma.auditEvent.count({ where: { tenantId, action: 'hcm.self.payslip.view' } }),
    ).toBe(1);
  });

  it('CONTRACTS: salary text hidden unless salary data is open to self-service', async () => {
    await prisma.employmentContract.create({
      data: {
        tenantId,
        employeeId: emp.bob!,
        contractNumber: 'UGO-DEMO-1',
        contractType: 'INDEFINITE',
        startDate: new Date('2026-01-01'),
        templateKey: 'ugovor',
        templateVersion: 1,
        containsSalary: true,
        content: 'Neto plata: 1.700,00 KM (DEMO)',
        requestKey: 'demo-contract-bob-1',
        requestHash: 'demo',
      },
    });
    // Payslips (and so salary data) were enabled by the previous test.
    const open = await api('GET', '/api/v1/hcm/me/contracts', bob);
    expect((open.body.contracts as Array<{ content: string }>)[0]!.content).toMatch(/1.700/);
    const config = (await api('GET', '/api/v1/tenant/configuration', admin)).body.config as Record<
      string,
      unknown
    >;
    await api('POST', '/api/v1/tenant/configuration', admin, {
      config: { ...config, hcm: { selfService: { payslips: false } } },
    });
    const closed = await api('GET', '/api/v1/hcm/me/contracts', bob);
    expect(
      (closed.body.contracts as Array<{ restricted: boolean; content: unknown }>)[0],
    ).toMatchObject({ restricted: true, content: null });
    expect(
      await prisma.auditEvent.count({ where: { tenantId, action: 'hcm.self.contract.read' } }),
    ).toBe(1);
  });

  it('INACTIVE / DATES: former employee reads but cannot request; impossible dates refused', async () => {
    expect(
      (
        await api('POST', '/api/v1/hcm/me/leave', ana, {
          from: '2026-02-30',
          to: '2026-03-02',
          type: 'GODISNJI',
        })
      ).status,
    ).toBe(400);
    await prisma.employee.update({ where: { id: emp.ana! }, data: { status: 'INACTIVE' } });
    expect((await api('GET', '/api/v1/hcm/me/leave', ana)).status).toBe(200);
    expect(
      (
        await api('POST', '/api/v1/hcm/me/leave', ana, {
          from: '2026-12-01',
          to: '2026-12-02',
          type: 'GODISNJI',
        })
      ).status,
    ).toBe(409);
  });
});
