import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 181 acceptance tests: override governance (WF-012) — a
 * privileged user may jump a workflow instance outside the declared
 * transitions only with a substantive reason, always audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 181 — override governance', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s181a', subject: 'idp|s181-admin' });

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
      `TRUNCATE TABLE "rfq_quote", "rfq", "work_order_operation", "work_order",
       "mrp_suggestion", "mrp_run", "planning_policy",
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
       "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
       "wms_order_line", "wms_order", "scan_event", "device",
       "stock_reservation", "stock_movement", "warehouse_location", "warehouse",
       "sku_channel_content", "uom_conversion", "barcode", "sku", "product",
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
      slug: 'test-s181a',
      name: 'Sprint181 Tenant',
      initialAdmin: {
        email: 'admin@s181a.example',
        displayName: 'S181 Admin',
        idpSubject: 'idp|s181-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        wf: {
          templates: [
            {
              key: 'odobrenje-dokumenta',
              name: 'Odobrenje dokumenta',
              spec: {
                initial: 'DRAFT',
                states: [
                  { name: 'DRAFT' },
                  { name: 'REVIEW' },
                  { name: 'APPROVED', terminal: true },
                ],
                transitions: [
                  { from: 'DRAFT', to: 'REVIEW', trigger: 'submit' },
                  { from: 'REVIEW', to: 'APPROVED', trigger: 'approve' },
                ],
              },
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

  let instanceId = '';

  it('WF-012: overrides need a substantive reason and land audited', async () => {
    await api('POST', '/api/v1/workflows/from-template', tokenA, {
      templateKey: 'odobrenje-dokumenta',
    });
    const started = await api('POST', '/api/v1/workflows/instances', tokenA, {
      definitionKey: 'odobrenje-dokumenta',
    });
    expect(started.status).toBe(201);
    instanceId = started.body.id as string;
    expect(started.body.currentState).toBe('DRAFT');

    const noReason = await api(
      'POST',
      `/api/v1/workflows/instances/${instanceId}/override`,
      tokenA,
      { toState: 'APPROVED', reason: 'kratko' },
    );
    expect(noReason.status).toBe(400);

    const badState = await api(
      'POST',
      `/api/v1/workflows/instances/${instanceId}/override`,
      tokenA,
      { toState: 'NEPOSTOJI', reason: 'Direktor odobrio telefonom, hitna isporuka.' },
    );
    expect(badState.status).toBe(400);

    const overridden = await api(
      'POST',
      `/api/v1/workflows/instances/${instanceId}/override`,
      tokenA,
      { toState: 'APPROVED', reason: 'Direktor odobrio telefonom, hitna isporuka.' },
    );
    expect(overridden.status).toBe(201);
    expect(overridden.body.currentState).toBe('APPROVED');
    expect(overridden.body.status).toBe('COMPLETED');

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'workflow.override', objectId: instanceId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.reason).toContain('Direktor');
  });

  it('WF-012: completed instances refuse further overrides', async () => {
    const again = await api('POST', `/api/v1/workflows/instances/${instanceId}/override`, tokenA, {
      toState: 'REVIEW',
      reason: 'Pokušaj naknadne izmjene stanja.',
    });
    expect(again.status).toBe(409);
  });

  it('AUTHZ: overrides need workflow.override', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s181a', subject: 'idp|s181-nobody' });
    const denied = await api(
      'POST',
      `/api/v1/workflows/instances/${instanceId}/override`,
      stranger,
      { toState: 'REVIEW', reason: 'Neovlašteni pokušaj override-a.' },
    );
    expect([401, 403]).toContain(denied.status);
  });
});
