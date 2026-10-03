import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 236 acceptance tests: HCM-016 employment contracts from DOC
 * templates (whitelisted placeholders, frozen text, salary in words only
 * with the salary contract scope), idempotent issue, validation, expiry
 * list + idempotent/concurrent expiry tasks, termination, management
 * lock, private employee documents (unreachable through the generic
 * attachment API, docs permissions, audited reads) and tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

const SALARY_TEMPLATE = [
  'UGOVOR O RADU {{contract.number}}',
  '{{company.name}} i {{ employee.name }} ({{employee.number}})',
  'Ugovor {{contract.type}} od {{contract.startDate}} do {{contract.endDate}}.',
  'Pozicija: {{contract.position}}',
  'Neto plata: {{salary.net}} {{salary.currency}} ({{salary.netWords}})',
].join('\n');
const PLAIN_TEMPLATE =
  'UGOVOR {{contract.number}} — {{employee.name}}, {{contract.type}}, od {{contract.startDate}}';

integration('Sprint 236 — employment contracts + employee documents (HCM-016)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const admin = identity.signToken({ tenantSlug: 'test-s236a', subject: 'idp|s236-admin' });
  const hr = identity.signToken({ tenantSlug: 'test-s236a', subject: 'idp|s236-hr' });
  const manager = identity.signToken({ tenantSlug: 'test-s236a', subject: 'idp|s236-manager' });
  const docs = identity.signToken({ tenantSlug: 'test-s236a', subject: 'idp|s236-docs' });
  const reader = identity.signToken({ tenantSlug: 'test-s236a', subject: 'idp|s236-reader' });
  const adminB = identity.signToken({ tenantSlug: 'test-s236b', subject: 'idp|s236b-admin' });
  const docsB = identity.signToken({ tenantSlug: 'test-s236b', subject: 'idp|s236b-docs' });

  let tenantAId = '';
  let e1 = '';
  let e2 = '';
  let salaryContract = '';
  let plainContract = '';
  let fixedContract = '';
  let docId = '';

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
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "employment_contract", "attachment_blob", "attachment",
       "payroll_line", "payroll_run", "payroll_adjustment", "employee_salary",
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
      ['test-s236a', 'idp|s236-admin'],
      ['test-s236b', 'idp|s236b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Firma ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s236a' } }))!.id;
    await grant(admin, 'test-s236a', 's236-hr', 'idp|s236-hr', [
      'hcm.read',
      'hcm.manage',
      'hcm.salary.contract',
    ]);
    await grant(admin, 'test-s236a', 's236-manager', 'idp|s236-manager', [
      'hcm.read',
      'hcm.manage',
      'hcm.salary.read',
      'hcm.salary.manage',
      'hcm.salary.management',
      'hcm.docs.read',
      'hcm.docs.manage',
    ]);
    await grant(admin, 'test-s236a', 's236-docs', 'idp|s236-docs', [
      'hcm.read',
      'hcm.docs.read',
      'hcm.docs.manage',
    ]);
    await grant(admin, 'test-s236a', 's236-reader', 'idp|s236-reader', ['hcm.read', 'collab.use']);
    await grant(adminB, 'test-s236b', 's236b-docs', 'idp|s236b-docs', [
      'hcm.read',
      'hcm.docs.read',
      'hcm.docs.manage',
    ]);

    for (const [key, name, content] of [
      ['ugovor-o-radu', 'Ugovor o radu', SALARY_TEMPLATE],
      ['ugovor-bez-plate', 'Ugovor bez plate', PLAIN_TEMPLATE],
      ['los-sablon', 'Loš šablon', 'JMBG: {{employee.jmbg}} {{employee.name}}'],
    ]) {
      const t = await api('POST', '/api/v1/document-templates/publish', admin, {
        key,
        name,
        content,
      });
      expect(t.status).toBe(201);
    }
    e1 = (
      await api('POST', '/api/v1/employees', admin, { name: 'Amra Radnica', title: 'Arhitekta' })
    ).body.id as string;
    e2 = (await api('POST', '/api/v1/employees', admin, { name: 'Direktor Dva' })).body
      .id as string;
    await api('POST', '/api/v1/payroll/salaries', manager, {
      employeeId: e1,
      netAmount: 2100,
      validFrom: '2025-01-01',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const base = (over: Record<string, unknown> = {}) => ({
    employeeId: e1,
    templateKey: 'ugovor-bez-plate',
    contractType: 'INDEFINITE',
    startDate: '2025-03-01',
    requestKey: `k-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    ...over,
  });

  it('TEMPLATE: unknown placeholders are refused; plain template renders and is frozen; audit carries no text', async () => {
    const bad = await api(
      'POST',
      '/api/v1/hcm/contracts',
      admin,
      base({ templateKey: 'los-sablon' }),
    );
    expect(bad.status).toBe(400);
    expect(String(bad.body.message)).toContain('employee.jmbg');

    const res = await api('POST', '/api/v1/hcm/contracts', admin, base());
    expect(res.status).toBe(201);
    plainContract = res.body.id as string;
    expect(res.body).toMatchObject({
      contractNumber: 'UR-2025-0001',
      containsSalary: false,
      restricted: false,
      templateVersion: 1,
    });
    expect(res.body.content).toBe(
      'UGOVOR UR-2025-0001 — Amra Radnica, na neodređeno vrijeme, od 01.03.2025.',
    );
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: tenantAId, action: 'hcm.contract.issue', objectId: plainContract },
    });
    expect(JSON.stringify(audit?.newValues)).not.toContain('Amra');

    // A new template version never changes the issued text.
    await api('POST', '/api/v1/document-templates/publish', admin, {
      key: 'ugovor-bez-plate',
      name: 'Ugovor bez plate',
      content: 'IZMIJENJEN {{employee.name}}',
    });
    const again = await api('GET', `/api/v1/hcm/contracts/${plainContract}`, admin);
    expect(again.body.content).toContain('UGOVOR UR-2025-0001');
  });

  it('SALARY IN CONTRACT: needs the salary contract scope; amount in words; text restricted for others', async () => {
    const byAdmin = await api(
      'POST',
      '/api/v1/hcm/contracts',
      admin,
      base({ templateKey: 'ugovor-o-radu' }),
    );
    expect(byAdmin.status).toBe(403);
    const payload = base({
      templateKey: 'ugovor-o-radu',
      contractType: 'FIXED_TERM',
      startDate: '2025-04-01',
      endDate: '2025-04-20',
      position: 'Projektant',
    });
    const res = await api('POST', '/api/v1/hcm/contracts', hr, payload);
    expect(res.status).toBe(201);
    salaryContract = res.body.id as string;
    fixedContract = salaryContract;
    expect(res.body.content).toContain('Neto plata: 2100.00 KM (dvije hiljade sto KM i 00/100)');
    expect(res.body.content).toContain('od 01.04.2025. do 20.04.2025.');
    expect(res.body.content).toContain('Pozicija: Projektant');

    const replay = await api('POST', '/api/v1/hcm/contracts', hr, payload);
    expect(replay.body.id).toBe(salaryContract);
    const changed = await api('POST', '/api/v1/hcm/contracts', hr, {
      ...payload,
      position: 'Drugo',
    });
    expect(changed.status).toBe(409);

    const asReader = await api('GET', `/api/v1/hcm/contracts?employeeId=${e1}`, reader);
    const list = asReader.body.contracts as Array<{
      id: string;
      restricted: boolean;
      content: string | null;
    }>;
    expect(list.find((c) => c.id === salaryContract)).toMatchObject({
      restricted: true,
      content: null,
    });
    expect(list.find((c) => c.id === plainContract)?.restricted).toBe(false);

    const noSalary = await api(
      'POST',
      '/api/v1/hcm/contracts',
      hr,
      base({
        employeeId: e2,
        templateKey: 'ugovor-o-radu',
      }),
    );
    expect(noSalary.status).toBe(409);
  });

  it('VALIDATION: fixed-term needs an end date; indefinite has none', async () => {
    const noEnd = await api(
      'POST',
      '/api/v1/hcm/contracts',
      admin,
      base({ contractType: 'FIXED_TERM' }),
    );
    expect(noEnd.status).toBe(400);
    const withEnd = await api(
      'POST',
      '/api/v1/hcm/contracts',
      admin,
      base({ endDate: '2025-12-31' }),
    );
    expect(withEnd.status).toBe(400);
    const reversed = await api(
      'POST',
      '/api/v1/hcm/contracts',
      admin,
      base({
        contractType: 'FIXED_TERM',
        startDate: '2025-05-01',
        endDate: '2025-04-01',
      }),
    );
    expect(reversed.status).toBe(400);
  });

  it('EXPIRY: listed with days left; one task per contract even for repeated and concurrent scans', async () => {
    const list = await api('GET', '/api/v1/hcm/contracts/expiring?days=30&asOf=2025-04-01', admin);
    const item = (list.body.contracts as Array<{ id: string; daysLeft: number }>).find(
      (c) => c.id === fixedContract,
    );
    expect(item?.daysLeft).toBe(19);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        api('POST', '/api/v1/hcm/contracts/expiry-scan', admin, { asOf: '2025-04-01' }),
      ),
    );
    expect(results.reduce((s, r) => s + Number(r.body.created), 0)).toBe(1);
    const again = await api('POST', '/api/v1/hcm/contracts/expiry-scan', admin, {
      asOf: '2025-04-01',
    });
    expect(again.body.created).toBe(0);
    const tasks = await prisma.task.findMany({
      where: {
        tenantId: tenantAId,
        relatedObjectType: 'hcm_contract',
        relatedObjectId: fixedContract,
      },
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).not.toContain('2100');
  });

  it('TERMINATE: reason required; terminated contracts leave the expiry list', async () => {
    const short = await api('POST', `/api/v1/hcm/contracts/${fixedContract}/terminate`, admin, {
      terminatedOn: '2025-04-10',
      reason: 'x',
    });
    expect(short.status).toBe(400);
    const done = await api('POST', `/api/v1/hcm/contracts/${fixedContract}/terminate`, admin, {
      terminatedOn: '2025-04-10',
      reason: 'Sporazumni raskid',
    });
    expect(done.body).toMatchObject({ status: 'TERMINATED', terminatedOn: '2025-04-10' });
    const list = await api('GET', '/api/v1/hcm/contracts/expiring?days=30&asOf=2025-04-01', admin);
    expect((list.body.contracts as Array<{ id: string }>).some((c) => c.id === fixedContract)).toBe(
      false,
    );
  });

  it('MANAGEMENT LOCK: locked employee’s contracts and documents need the management layer', async () => {
    await api('POST', '/api/v1/payroll/salary-lock', manager, { employeeId: e2, locked: true });
    const byManager = await api('POST', '/api/v1/hcm/contracts', manager, base({ employeeId: e2 }));
    expect(byManager.status).toBe(201);
    const lockedId = byManager.body.id as string;
    const byHr = await api('POST', '/api/v1/hcm/contracts', hr, base({ employeeId: e2 }));
    expect(byHr.status).toBe(404);
    const view = await api('GET', `/api/v1/hcm/contracts/${lockedId}`, hr);
    expect(view.status).toBe(404);
    const list = await api('GET', '/api/v1/hcm/contracts', hr);
    expect((list.body.contracts as Array<{ id: string }>).some((c) => c.id === lockedId)).toBe(
      false,
    );
    const docsList = await api('GET', `/api/v1/hcm/employees/${e2}/documents`, docs);
    expect(docsList.status).toBe(404);
  });

  it('DOCUMENTS: private store — docs permissions, audited reads, generic attachment API cannot reach them', async () => {
    const pdf = Buffer.from('%PDF-1.4 ugovor').toString('base64');
    const up = await api('POST', `/api/v1/hcm/employees/${e1}/documents`, docs, {
      fileName: 'licna-karta.pdf',
      contentType: 'application/pdf',
      dataBase64: pdf,
    });
    expect(up.status).toBe(201);
    docId = up.body.id as string;
    const html = await api('POST', `/api/v1/hcm/employees/${e1}/documents`, docs, {
      fileName: 'x.html',
      contentType: 'text/html',
      dataBase64: Buffer.from('<script>').toString('base64'),
    });
    expect(html.status).toBe(400);

    const denied = await api('GET', `/api/v1/hcm/employees/${e1}/documents`, reader);
    expect(denied.status).toBe(403);
    const generic = await api('GET', `/api/v1/attachments/${docId}/download`, reader);
    expect(generic.status).toBe(404);
    const genericAdmin = await api('GET', `/api/v1/attachments/${docId}/download`, admin);
    expect(genericAdmin.status).toBe(404);
    const genericList = await api(
      'GET',
      `/api/v1/attachments?entityType=hcm_employee&entityId=${e1}`,
      admin,
    );
    expect(genericList.status).toBe(400);

    const list = await api('GET', `/api/v1/hcm/employees/${e1}/documents`, docs);
    expect((list.body.documents as Array<{ id: string }>).map((d) => d.id)).toEqual([docId]);
    const dl = await api('GET', `/api/v1/hcm/documents/${docId}`, docs);
    expect(dl.body.dataBase64).toBe(pdf);
    expect(
      await prisma.auditEvent.count({
        where: { tenantId: tenantAId, action: 'hcm.employee_document.read' },
      }),
    ).toBe(1);
  });

  it('TENANT ISOLATION: another tenant sees neither contracts nor documents', async () => {
    const view = await api('GET', `/api/v1/hcm/contracts/${plainContract}`, adminB);
    expect(view.status).toBe(404);
    const list = await api('GET', '/api/v1/hcm/contracts', adminB);
    expect(list.body.contracts).toEqual([]);
    const dl = await api('GET', `/api/v1/hcm/documents/${docId}`, docsB);
    expect(dl.status).toBe(404);
    const docsList = await api('GET', `/api/v1/hcm/employees/${e1}/documents`, docsB);
    expect(docsList.status).toBe(404);
    const terminate = await api(
      'POST',
      `/api/v1/hcm/contracts/${plainContract}/terminate`,
      adminB,
      {
        terminatedOn: '2025-05-01',
        reason: 'Tuđi tenant',
      },
    );
    expect(terminate.status).toBe(404);
  });
});
