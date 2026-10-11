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
