import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 205 acceptance tests: support-case operations (CSM-002/004/
 * 006/007/008/009/010/012/013/015) — omnichannel intake, complaints,
 * escalations, comments, canned responses, knowledge base, linkage
 * and satisfaction feedback.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 205 — case operations', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s205a', subject: 'idp|s205-admin' });

  let caseId = '';

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
      `TRUNCATE TABLE "support_case",
       "order_event", "sales_order_line", "sales_order",
       "crm_activity", "opportunity", "lead", "crm_account",
       "stock_reservation", "stock_movement", "warehouse_location", "warehouse",
       "uom_conversion", "barcode", "sku", "product",
       "party_external_identity", "party",
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

    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s205a',
      name: 'Sprint205 Tenant',
      initialAdmin: {
        email: 'admin@s205a.example',
        displayName: 'S205 Admin',
        idpSubject: 'idp|s205-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        csm: {
          channels: ['email', 'phone', 'portal'],
          cannedResponses: [
            {
              key: 'primili-smo',
              title: 'Zaprimljeno',
              body: 'Vaš slučaj {{caseNumber}} ({{subject}}) je zaprimljen.',
            },
          ],
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CSM-002/010: intake records the channel; the channel report adds up', async () => {
    const created = await api('POST', '/api/v1/support-cases/intake', tokenA, {
      subject: 'Ne radi čitač barkoda',
      description: 'Skener se ne pali.',
      channel: 'portal',
    });
    expect(created.status).toBe(201);
    expect(created.body.channel).toBe('portal');
    caseId = created.body.id as string;

    await api('POST', '/api/v1/support-cases/intake', tokenA, {
      subject: 'Pitanje o računu',
      channel: 'email',
    });

    const unknown = await api('POST', '/api/v1/support-cases/intake', tokenA, {
      subject: 'X',
      channel: 'fax',
    });
    expect(unknown.status).toBe(400);

    const report = await api('GET', '/api/v1/support-cases/reports/channels', tokenA);
    const channels = report.body.channels as Array<{ channel: string; cases: number }>;
    expect(channels.find((c) => c.channel === 'portal')?.cases).toBe(1);
    expect(channels.find((c) => c.channel === 'email')?.cases).toBe(1);
  });

  it('CSM-004: complaints are flagged once and raise priority', async () => {
    const flagged = await api('POST', `/api/v1/support-cases/${caseId}/complaint`, tokenA, {
      reason: 'Kupac je formalno uložio prigovor.',
    });
    expect(flagged.status).toBe(201);
    expect(flagged.body.duplicate).toBe(false);

    const replay = await api('POST', `/api/v1/support-cases/${caseId}/complaint`, tokenA, {
      reason: 'Kupac je formalno uložio prigovor.',
    });
    expect(replay.body.duplicate).toBe(true);

    const report = await api('GET', '/api/v1/support-cases/reports/complaints', tokenA);
    expect(report.body.complaints).toBe(1);
    expect(report.body.open).toBe(1);
  });

  it('CSM-006: escalation is once-only, sets URGENT and opens a task', async () => {
    const escalated = await api('POST', `/api/v1/support-cases/${caseId}/escalate`, tokenA, {
      reason: 'Prekoračen rok za odgovor.',
    });
    expect(escalated.status).toBe(201);
    expect(escalated.body.taskId).toBeTruthy();

    const replay = await api('POST', `/api/v1/support-cases/${caseId}/escalate`, tokenA, {
      reason: 'Prekoračen rok za odgovor.',
    });
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.taskId).toBe(escalated.body.taskId);

    const row = await prisma.supportCase.findFirst({ where: { id: caseId } });
    expect(row?.priority).toBe('URGENT');
  });

  it('CSM-007: comments thread chronologically', async () => {
    await api('POST', `/api/v1/support-cases/${caseId}/comments`, tokenA, {
      body: 'Poslan zamjenski uređaj.',
    });
    await api('POST', `/api/v1/support-cases/${caseId}/comments`, tokenA, {
      body: 'Kupac potvrdio prijem.',
    });
    const list = await api('GET', `/api/v1/support-cases/${caseId}/comments`, tokenA);
    const comments = list.body.comments as Array<{ body: string }>;
    expect(comments).toHaveLength(2);
    expect(comments[0]?.body).toBe('Poslan zamjenski uređaj.');
  });

  it('CSM-008: canned responses render case placeholders', async () => {
    const list = await api('GET', '/api/v1/support-cases/canned-responses', tokenA);
    expect((list.body.responses as unknown[]).length).toBe(1);

    const rendered = await api(
      'POST',
      `/api/v1/support-cases/${caseId}/canned-responses/render`,
      tokenA,
      { key: 'primili-smo' },
    );
    expect(rendered.status).toBe(201);
    expect(rendered.body.body).toContain('CS-000001');
    expect(rendered.body.body).toContain('Ne radi čitač barkoda');
  });

  it('CSM-009: the knowledge base stores and finds articles', async () => {
    const setup = await api('POST', '/api/v1/support-cases/kb/setup', tokenA);
    expect(setup.status).toBe(201);

    await api('POST', '/api/v1/custom-objects/csm_kb_article/records', tokenA, {
      data: {
        naslov: 'Resetovanje barkod skenera',
        sadrzaj: 'Držite dugme za napajanje 10 sekundi pa skenirajte reset kod.',
        oznake: 'skener,hardver',
      },
    });

    const hit = await api('GET', '/api/v1/support-cases/kb/search?q=skener', tokenA);
    const articles = hit.body.articles as Array<{ title: string }>;
    expect(articles).toHaveLength(1);
    expect(articles[0]?.title).toContain('Resetovanje');

    const miss = await api('GET', '/api/v1/support-cases/kb/search?q=nepostojeci', tokenA);
    expect(miss.body.articles).toEqual([]);
  });

  it('CSM-012/013: cases link to service requests and RMAs', async () => {
    const link = await api('POST', `/api/v1/support-cases/${caseId}/links`, tokenA, {
      entityType: 'rma',
      entityId: 'RMA-000001',
    });
    expect(link.status).toBe(201);
    const dup = await api('POST', `/api/v1/support-cases/${caseId}/links`, tokenA, {
      entityType: 'rma',
      entityId: 'RMA-000001',
    });
    expect(dup.body.duplicate).toBe(true);

    const badOrder = await api('POST', `/api/v1/support-cases/${caseId}/links`, tokenA, {
      entityType: 'order',
      entityId: '00000000-0000-0000-0000-000000000000',
    });
    expect(badOrder.status).toBe(404);

    const list = await api('GET', `/api/v1/support-cases/${caseId}/links`, tokenA);
    expect(list.body.links).toEqual([{ entityType: 'rma', entityId: 'RMA-000001' }]);
  });

  it('CSM-015: satisfaction is rated once, only after resolution', async () => {
    const early = await api('POST', `/api/v1/support-cases/${caseId}/rate`, tokenA, { score: 5 });
    expect(early.status).toBe(409);

    await api('POST', `/api/v1/support-cases/${caseId}/transition`, tokenA, {
      status: 'RESOLVED',
    });
    const rated = await api('POST', `/api/v1/support-cases/${caseId}/rate`, tokenA, {
      score: 4,
      comment: 'Brza reakcija.',
    });
    expect(rated.status).toBe(201);
    const replay = await api('POST', `/api/v1/support-cases/${caseId}/rate`, tokenA, { score: 1 });
    expect(replay.body.duplicate).toBe(true);

    const report = await api('GET', '/api/v1/support-cases/reports/satisfaction', tokenA);
    expect(report.body.ratings).toBe(1);
    expect(report.body.average).toBe('4.00');
  });

  it('AUTHZ: case operations need crm permissions', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s205a', subject: 'idp|s205-nobody' });
    const denied = await api('POST', '/api/v1/support-cases/intake', stranger, {
      subject: 'X',
      channel: 'email',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
