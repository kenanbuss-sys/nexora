import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { TeamTaskService } from '@nexora/domain-core';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 252 acceptance tests: tenant time zone (CORE-007 + WF-013).
 * `locale.timeZone` is validated on publish; recurring task due times are
 * wall-clock times in the tenant zone (DST-aware); the worker's "now" maps
 * to the tenant's local date; a tenant without the setting keeps UTC; the
 * role home counts field visits from the tenant's local midnight.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 252 — tenant time zone', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);
  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s252a', subject: 'idp|s252-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s252b', subject: 'idp|s252b-admin' });
  const ids: Record<string, { tenantId: string; userId: string }> = {};

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

  const publish = async (token: string, patch: Record<string, unknown>) => {
    const current = (await api('GET', '/api/v1/tenant/configuration', token)).body.config;
    return api('POST', '/api/v1/tenant/configuration', token, {
      config: { ...((current as Record<string, unknown>) ?? {}), ...patch },
    });
  };

  const dueAtOf = async (tenantId: string, date: string) =>
    (
      await prisma.task.findFirst({
        where: { tenantId, occurrenceDate: new Date(`${date}T00:00:00Z`) },
      })
    )?.dueAt?.toISOString();

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "task_assignee", "recurring_task_template", "service_order",
       "processed_event", "outbox_event", "audit_event", "approval", "task", "notification",
       "module_activation", "user_role_assignment", "role_permission", "role", "user",
       "branch", "factory", "business_unit", "legal_entity",
       "tenant_configuration_version", "tenant" CASCADE`,
    );
    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    for (const [slug, subject, token] of [
      ['test-s252a', 'idp|s252-admin', tokenA],
      ['test-s252b', 'idp|s252b-admin', tokenB],
    ] as const) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint252 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subject },
      });
      const tenantId = (await prisma.tenant.findFirst({ where: { slug } }))!.id;
      const userId = (await prisma.user.findFirst({ where: { tenantId } }))!.id;
      await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
      ids[slug] = { tenantId, userId };
      const t = await api('POST', '/api/v1/tasks/recurring/templates', token, {
        code: 'OTVARANJE',
        title: 'Otvaranje',
        frequency: 'DAILY',
        dueTime: '07:30',
        assigneeUserIds: [userId],
      });
      expect(t.status).toBe(201);
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CONFIG: locale.timeZone must be an IANA zone; a valid one is published', async () => {
    const bad = await publish(tokenA, { locale: { timeZone: 'Mars/Olympus' } });
    expect(bad.status).toBe(400);
    expect((await publish(tokenA, { locale: { timeZone: 'Europe/Sarajevo' } })).status).toBe(201);
  });

  it('RECURRING: due time is local wall clock (summer, winter, DST day); tenant B stays UTC', async () => {
    for (const date of ['2026-07-01', '2026-12-01', '2026-10-25']) {
      expect((await api('POST', '/api/v1/tasks/recurring/run', tokenA, { date })).status).toBe(201);
      await api('POST', '/api/v1/tasks/recurring/run', tokenB, { date });
    }
    const a = ids['test-s252a']!.tenantId;
    const b = ids['test-s252b']!.tenantId;
    expect(await dueAtOf(a, '2026-07-01')).toBe('2026-07-01T05:30:00.000Z'); // CEST +2
    expect(await dueAtOf(a, '2026-12-01')).toBe('2026-12-01T06:30:00.000Z'); // CET +1
    expect(await dueAtOf(a, '2026-10-25')).toBe('2026-10-25T06:30:00.000Z'); // after fall-back
    expect(await dueAtOf(b, '2026-07-01')).toBe('2026-07-01T07:30:00.000Z'); // UTC default
  });

  it('WORKER: "now" maps to the tenant local date (late evening UTC = next day in Sarajevo)', async () => {
    const service = new TeamTaskService(prisma);
    const ctx = (slug: string) => ({
      tenantId: ids[slug]!.tenantId,
      tenantSlug: slug,
      tenantStatus: 'ACTIVE' as const,
      actorType: 'SERVICE' as const,
      userId: undefined,
      userStatus: undefined,
      platformAdmin: false,
    });
    const lateEvening = new Date('2026-08-10T23:30:00Z');
    expect((await service.generate(lateEvening, ctx('test-s252a'))).date).toBe('2026-08-11');
    expect((await service.generate(lateEvening, ctx('test-s252b'))).date).toBe('2026-08-10');
    // Repeating the hourly run is idempotent.
    expect(await service.generate(lateEvening, ctx('test-s252a'))).toMatchObject({
      created: 0,
      existing: 1,
    });
  });

  it('ROLE HOME: field visits are counted from the tenant local midnight', async () => {
    // A zone far ahead of UTC makes "today" differ from the UTC date.
    expect((await publish(tokenA, { locale: { timeZone: 'Pacific/Kiritimati' } })).status).toBe(
      201,
    );
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, { name: 'K', company: 'K DEMO' });
    const accountId = (await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {}))
      .body.accountId as string;
    const crew = (await api('POST', '/api/v1/employees', tokenA, { name: 'Monter DEMO' })).body
      .id as string;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Kiritimati',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    // Local midnight in UTC+14 = previous UTC day 10:00.
    const localMidnight = new Date(new Date(`${parts}T00:00:00Z`).getTime() - 14 * 3_600_000);
    const visit = async (start: Date) => {
      const v = await api('POST', '/api/v1/service/visits/measurements', tokenA, {
        accountId,
        siteAddress: 'DEMO',
      });
      const s = await api('POST', `/api/v1/service/visits/${v.body.id}/schedule`, tokenA, {
        slotStart: start.toISOString(),
        slotEnd: new Date(start.getTime() + 1_800_000).toISOString(),
        crewEmployeeIds: [crew],
      });
      expect(s.status).toBe(201);
      return v.body.id as string;
    };
    const before = await visit(new Date(localMidnight.getTime() - 3_600_000));
    const after = await visit(new Date(localMidnight.getTime() + 3_600_000));
    const home = (await api('GET', '/api/v1/home/today', tokenA)).body as {
      installation: { next7Days: Array<{ id: string }> };
    };
    const seen = home.installation.next7Days.map((v) => v.id);
    expect(seen).toContain(after);
    expect(seen).not.toContain(before);
  });
});
