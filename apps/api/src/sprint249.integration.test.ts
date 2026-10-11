import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 249 acceptance tests: role home ("my work today") shows only the
 * sections the caller's permissions allow; switched-off modules lose their
 * API surface (service, VAT, ledger, bank); open unscheduled visits list.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 249 — role home + module profile', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s249a', subject: 'idp|s249-admin' });
  const installer = identity.signToken({ tenantSlug: 'test-s249a', subject: 'idp|s249-installer' });
  let accountId = '';

  async function api(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string,
    payload?: unknown,
  ) {
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
      `TRUNCATE TABLE "service_order", "processed_event", "outbox_event", "audit_event",
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
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s249a',
      name: 'Sprint249',
      initialAdmin: {
        email: 'admin@s249.example',
        displayName: 'Admin',
        idpSubject: 'idp|s249-admin',
      },
    });
    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'montaza',
      permissions: ['service.read', 'service.manage'],
    });
    const user = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'monter@s249.example',
      displayName: 'Monter',
      idpSubject: 'idp|s249-installer',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: user.body.id,
      roleId: role.body.id,
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac',
      company: 'Kupac DEMO',
    });
    accountId = (await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {})).body
      .accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('HOME: sections follow the caller permissions', async () => {
    const admin = await api('GET', '/api/v1/home/today', tokenA);
    expect(admin.status).toBe(200);
    expect(Object.keys(admin.body)).toEqual(
      expect.arrayContaining(['sales', 'production', 'installation', 'accounting']),
    );
    const mine = await api('GET', '/api/v1/home/today', installer);
    expect(mine.status).toBe(200);
    expect(mine.body.installation).toBeTruthy();
    expect(mine.body.sales).toBeUndefined();
    expect(mine.body.accounting).toBeUndefined();
  });

  it('ROLE HOME: field work looks 7 days ahead (yesterday out, day 6 in, day 8 out)', async () => {
    const crewId = (await api('POST', '/api/v1/employees', tokenA, { name: 'Monter DEMO 7d' })).body
      .id as string;
    const today = new Date();
    const at = (days: number) =>
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days, 9));
    const ids: Record<number, string> = {};
    for (const d of [-1, 6, 8]) {
      const v = await api('POST', '/api/v1/service/visits/measurements', tokenA, {
        accountId,
        siteAddress: `Adresa DEMO ${d}`,
      });
      ids[d] = v.body.id as string;
      const s = await api('POST', `/api/v1/service/visits/${ids[d]}/schedule`, tokenA, {
        slotStart: at(d).toISOString(),
        slotEnd: new Date(at(d).getTime() + 3_600_000).toISOString(),
        crewEmployeeIds: [crewId],
      });
      expect(s.status).toBe(201);
    }
    const home = (await api('GET', '/api/v1/home/today', tokenA)).body as {
      installation: { next7Days: Array<{ id: string }> };
      sales: { measurementsNext7Days: number };
    };
    const seen = home.installation.next7Days.map((v) => v.id);
    expect(seen).toContain(ids[6]);
    expect(seen).not.toContain(ids[-1]);
    expect(seen).not.toContain(ids[8]);
    expect(home.sales.measurementsNext7Days).toBeGreaterThanOrEqual(1);
  });

  it('MTM RULES: a salesperson (quote.read, no configuration.read) reads the made-to-measure rules', async () => {
    const config = (await api('GET', '/api/v1/tenant/configuration', tokenA)).body.config as Record<
      string,
      unknown
    >;
    const published = await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        ...config,
        cpq: { madeToMeasure: { products: [{ skuCode: 'X-STD', basis: 'AREA', minBillable: 1 }] } },
      },
    });
    expect([200, 201]).toContain(published.status);
    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'prodaja',
      permissions: ['quote.read'],
    });
    const user = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'prodaja@s249.example',
      displayName: 'Prodaja',
      idpSubject: 'idp|s249-sales',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: user.body.id,
      roleId: role.body.id,
    });
    const sales = identity.signToken({ tenantSlug: 'test-s249a', subject: 'idp|s249-sales' });
    expect((await api('GET', '/api/v1/tenant/configuration', sales)).status).toBe(403);
    const rules = await api('GET', '/api/v1/quotes/made-to-measure/rules', sales);
    expect(rules.status).toBe(200);
    expect((rules.body.rules as { products: unknown[] }).products).toHaveLength(1);
    expect((await api('GET', '/api/v1/quotes/made-to-measure/rules', installer)).status).toBe(403);
  });

  it('OPEN VISITS: unscheduled measurements are listed for dispatch', async () => {
    const visit = await api('POST', '/api/v1/service/visits/measurements', tokenA, {
      accountId,
      siteAddress: 'Adresa DEMO 5',
    });
    const open = await api('GET', '/api/v1/service/visits/open', installer);
    const rows = open.body.visits as Array<{ id: string; customer: string }>;
    expect(rows.map((r) => r.id)).toContain(visit.body.id);
    expect(rows[0]!.customer).toBe('Kupac DEMO');
  });

  it('MODULES: a switched-off module loses its API (service, VAT, ledger, bank)', async () => {
    for (const key of ['service', 'finance']) {
      const r = await api('PUT', `/api/v1/configuration/modules/${key}`, tokenA, {
        enabled: false,
      });
      expect([200, 201]).toContain(r.status);
    }
    expect((await api('GET', '/api/v1/service/visits/open', tokenA)).status).toBe(403);
    expect((await api('GET', '/api/v1/vat/periods', tokenA)).status).toBe(403);
    expect((await api('GET', '/api/v1/ledger/accounts', tokenA)).status).toBe(403);
    expect((await api('GET', '/api/v1/bank/statements', tokenA)).status).toBe(403);
    const modules = await api('GET', '/api/v1/tenant/modules', tokenA);
    expect(modules.body.modules).toMatchObject({ service: false, finance: false });
    await api('PUT', '/api/v1/configuration/modules/service', tokenA, { enabled: true });
    expect((await api('GET', '/api/v1/service/visits/open', tokenA)).status).toBe(200);
  });
});
