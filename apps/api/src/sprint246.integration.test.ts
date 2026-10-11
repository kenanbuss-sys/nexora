import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 246 acceptance tests: WF-013 multi-assignee and recurring tasks.
 * Per-person status; ALL closes when everyone is done, ANY on the first;
 * only assignees complete their own part; checklist answers validated (a
 * failed item needs a note); idempotent completion; concurrent last
 * completions close the task once; legacy completion refused for team
 * tasks; recurring templates generate one occurrence per date (idempotent,
 * weekly/monthly rules, month-end clamp), snapshot the template, and the
 * log shows who did what and what was missed; tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

type Task = {
  id: string;
  status: string;
  completedAt: string | null;
  duplicate?: boolean;
  assignees: Array<{ userId: string; status: string }>;
};

integration('Sprint 246 — multi-assignee + recurring tasks (WF-013)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s246a', subject: 'idp|s246-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s246b', subject: 'idp|s246b-admin' });
  const token1 = identity.signToken({ tenantSlug: 'test-s246a', subject: 'idp|s246-u1' });
  const token2 = identity.signToken({ tenantSlug: 'test-s246a', subject: 'idp|s246-u2' });

  let tenantAId = '';
  let u1 = '';
  let u2 = '';
  let gone = '';

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

  const CHECKLIST = [
    { label: 'Kasa otvorena', required: true },
    { label: 'Temperatura vitrine', required: true },
    { label: 'Napomena za smjenu', required: false },
  ];
  const okAnswers = [
    { label: 'Kasa otvorena', ok: true },
    { label: 'Temperatura vitrine', ok: true, value: '3.5' },
  ];
  const team = (body: Record<string, unknown>) =>
    api('POST', '/api/v1/tasks/team', tokenA, {
      title: 'Otvaranje marketa',
      assigneeUserIds: [u1, u2],
      checklist: CHECKLIST,
      ...body,
    });
  const complete = (taskId: string, token: string, body: Record<string, unknown> = {}) =>
    api('POST', `/api/v1/tasks/${taskId}/complete-mine`, token, { results: okAnswers, ...body });

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "task_assignee", "recurring_task_template",
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
      ['test-s246a', 'idp|s246-admin'],
      ['test-s246b', 'idp|s246b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint246 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s246a' } }))!.id;
    const ids: string[] = [];
    for (const [email, name, subj] of [
      ['prodavac1@s246.example', 'Prodavač Prvi', 'idp|s246-u1'],
      ['prodavac2@s246.example', 'Prodavač Drugi', 'idp|s246-u2'],
      ['bivsi@s246.example', 'Bivši Radnik', 'idp|s246-gone'],
    ]) {
      const user = await api('POST', '/api/v1/users/invite', tokenA, {
        email,
        displayName: name,
        idpSubject: subj,
      });
      ids.push(user.body.id as string);
    }
    [u1, u2, gone] = ids as [string, string, string];
    // Fixture: the two sellers are active users, the third is suspended.
    await prisma.user.updateMany({ where: { id: { in: [u1, u2] } }, data: { status: 'ACTIVE' } });
    await prisma.user.update({ where: { id: gone }, data: { status: 'SUSPENDED' } });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('TEAM ALL: each assignee completes their part; the task closes when everyone is done', async () => {
    expect((await team({ assigneeUserIds: [u1, gone] })).status).toBe(400);
    const created = await team({});
    expect(created.status).toBe(201);
    const taskId = created.body.id as string;

    expect((await complete(taskId, token1, { results: [okAnswers[0]] })).status).toBe(400);
    const failedNoNote = await complete(taskId, token1, {
      results: [okAnswers[0], { label: 'Temperatura vitrine', ok: false, value: '9' }],
    });
    expect(failedNoNote.status).toBe(400);
    const first = await complete(taskId, token1, {
      results: [
        okAnswers[0],
        {
          label: 'Temperatura vitrine',
          ok: false,
          value: '9',
          note: 'Vitrina prebačena, servis pozvan',
        },
      ],
    });
    expect(first.status).toBe(201);
    expect((first.body as Task).status).toBe('OPEN');

    const mine1 = await api('GET', '/api/v1/tasks', token1);
    expect((mine1.body.tasks as Array<{ id: string }>).some((t) => t.id === taskId)).toBe(false);
    const mine2 = await api('GET', '/api/v1/tasks', token2);
    expect((mine2.body.tasks as Array<{ id: string }>).some((t) => t.id === taskId)).toBe(true);

    expect((await complete(taskId, tokenA)).status).toBe(404); // not an assignee
    const asAssignee = await api('GET', `/api/v1/tasks/${taskId}/mine`, token2);
    expect((asAssignee.body.checklist as unknown[]).length).toBe(3);
    expect((await api('GET', `/api/v1/tasks/${taskId}/mine`, tokenA)).status).toBe(404);
    expect((await api('POST', `/api/v1/tasks/${taskId}/complete`, tokenA)).status).toBe(409);

    const last = await complete(taskId, token2);
    expect(last.body as Task).toMatchObject({ status: 'DONE' });
    expect((last.body as Task).completedAt).not.toBeNull();
    const again = await complete(taskId, token2);
    expect(again.body as Task).toMatchObject({ status: 'DONE', duplicate: true });
    const detail = await api('GET', `/api/v1/tasks/${taskId}/team`, tokenA);
    expect((detail.body.assignees as Task['assignees']).every((a) => a.status === 'DONE')).toBe(
      true,
    );
    expect(
      await prisma.notification.count({ where: { tenantId: tenantAId, relatedObjectId: taskId } }),
    ).toBe(2);
  });

  it('TEAM ANY + CONCURRENCY: first completion closes ANY; concurrent last completions close ALL once', async () => {
    const any = await team({ completionRule: 'ANY' });
    const anyId = any.body.id as string;
    expect((await complete(anyId, token1)).body as Task).toMatchObject({ status: 'DONE' });
    expect((await complete(anyId, token2)).status).toBe(409);

    const all = await team({});
    const allId = all.body.id as string;
    const [a, b] = await Promise.all([complete(allId, token1), complete(allId, token2)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const closing = await prisma.auditEvent.findMany({
      where: { tenantId: tenantAId, action: 'task.assignee.complete', objectId: allId },
    });
    expect(closing).toHaveLength(2);
    expect(
      closing.filter((e) => (e.newValues as { taskClosed?: boolean }).taskClosed === true),
    ).toHaveLength(1);
    expect((await prisma.task.findUnique({ where: { id: allId } }))?.status).toBe('DONE');
  });

  it('RECURRING: one occurrence per date (idempotent), weekly/monthly rules, snapshot of the template', async () => {
    const daily = await api('POST', '/api/v1/tasks/recurring/templates', tokenA, {
      code: 'OTVARANJE',
      title: 'Otvaranje marketa',
      frequency: 'DAILY',
      dueTime: '07:30',
      assigneeUserIds: [u1, u2],
      checklist: CHECKLIST,
    });
    expect(daily.status).toBe(201);
    await api('POST', '/api/v1/tasks/recurring/templates', tokenA, {
      code: 'HACCP-PON',
      title: 'HACCP sedmična kontrola',
      frequency: 'WEEKLY',
      weekdays: [1],
      assigneeUserIds: [u1],
    });
    await api('POST', '/api/v1/tasks/recurring/templates', tokenA, {
      code: 'INVENTURA',
      title: 'Mjesečni popis kase',
      frequency: 'MONTHLY',
      dayOfMonth: 31,
      assigneeUserIds: [u2],
    });
    expect(
      (
        await api('POST', '/api/v1/tasks/recurring/templates', tokenA, {
          code: 'LOS',
          title: 'Bez dana',
          frequency: 'WEEKLY',
          assigneeUserIds: [u1],
        })
      ).status,
    ).toBe(400);

    // 2026-10-12 is a Monday: daily + weekly due.
    const run1 = await api('POST', '/api/v1/tasks/recurring/run', tokenA, { date: '2026-10-12' });
    expect(run1.body).toMatchObject({ created: 2, existing: 0 });
    const run2 = await api('POST', '/api/v1/tasks/recurring/run', tokenA, { date: '2026-10-12' });
    expect(run2.body).toMatchObject({ created: 0, existing: 2 });
    // Tuesday: only daily; 30 Nov 2026 (a Monday): daily + weekly + month-end clamp of "31st".
    expect(
      (await api('POST', '/api/v1/tasks/recurring/run', tokenA, { date: '2026-10-13' })).body,
    ).toMatchObject({ created: 1 });
    expect(
      (await api('POST', '/api/v1/tasks/recurring/run', tokenA, { date: '2026-11-30' })).body,
    ).toMatchObject({ created: 3 });

    // Template edits never rewrite generated occurrences.
    await api('POST', '/api/v1/tasks/recurring/templates', tokenA, {
      code: 'OTVARANJE',
      title: 'Otvaranje marketa (nova procedura)',
      frequency: 'DAILY',
      assigneeUserIds: [u1],
    });
    const occurrence = await prisma.task.findFirst({
      where: {
        tenantId: tenantAId,
        templateId: daily.body.id as string,
        occurrenceDate: new Date('2026-10-12'),
      },
      include: { assignees: true },
    });
    expect(occurrence?.title).toBe('Otvaranje marketa');
    expect(occurrence?.assignees).toHaveLength(2);
    expect(occurrence?.dueAt?.toISOString()).toBe('2026-10-12T07:30:00.000Z');
  });

  it('LOG: per date who did what and when; past-due open occurrences are missed', async () => {
    const templates = await api('GET', '/api/v1/tasks/recurring/templates', tokenA);
    const daily = (templates.body.templates as Array<{ id: string; code: string }>).find(
      (t) => t.code === 'OTVARANJE',
    )!;
    // The edited template (one assignee, no checklist) drives new occurrences.
    await api('POST', '/api/v1/tasks/recurring/run', tokenA, { date: '2025-01-06' });
    await api('POST', '/api/v1/tasks/recurring/run', tokenA, { date: '2025-01-07' });
    const done = await prisma.task.findFirst({
      where: { templateId: daily.id, occurrenceDate: new Date('2025-01-06') },
    });
    expect(
      (await complete(done!.id, token1, { results: [], note: 'Otvoreno u 7:10' })).status,
    ).toBe(201);
    const log = await api(
      'GET',
      `/api/v1/tasks/recurring/templates/${daily.id}/log?from=2025-01-01&to=2025-01-31`,
      tokenA,
    );
    expect(log.status).toBe(200);
    const occurrences = log.body.occurrences as Array<{
      date: string;
      missed: boolean;
      status: string;
      completedAt: string | null;
      assignees: Array<{ userId: string; status: string; note: string | null }>;
    }>;
    expect(occurrences.map((o) => [o.date, o.status, o.missed])).toEqual([
      ['2025-01-06', 'DONE', false],
      ['2025-01-07', 'OPEN', true],
    ]);
    expect(occurrences[0]!.assignees).toEqual([
      expect.objectContaining({ userId: u1, status: 'DONE', note: 'Otvoreno u 7:10' }),
    ]);
    expect(
      (
        await api(
          'GET',
          `/api/v1/tasks/recurring/templates/${daily.id}/log?from=2025-02-01&to=2025-01-01`,
          tokenA,
        )
      ).status,
    ).toBe(400);

    await api('POST', `/api/v1/tasks/recurring/templates/${daily.id}/deactivate`, tokenA);
    expect(
      (await api('POST', '/api/v1/tasks/recurring/run', tokenA, { date: '2026-12-01' })).body,
    ).toMatchObject({ created: 0 });
  });

  it('TENANT: another tenant sees no templates, logs or tasks of this tenant', async () => {
    const templates = await api('GET', '/api/v1/tasks/recurring/templates', tokenB);
    expect(templates.body.templates).toEqual([]);
    const anyTask = await prisma.task.findFirst({ where: { tenantId: tenantAId } });
    expect((await api('GET', `/api/v1/tasks/${anyTask!.id}/team`, tokenB)).status).toBe(404);
    const t = await prisma.recurringTaskTemplate.findFirst({ where: { tenantId: tenantAId } });
    expect(
      (
        await api(
          'GET',
          `/api/v1/tasks/recurring/templates/${t!.id}/log?from=2026-10-01&to=2026-10-31`,
          tokenB,
        )
      ).status,
    ).toBe(404);
    expect(
      (await api('POST', '/api/v1/tasks/team', tokenB, { title: 'X', assigneeUserIds: [u1] }))
        .status,
    ).toBe(400);
  });
});
