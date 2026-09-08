import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 185 acceptance tests: workflow designer (WF-001) — the
 * designer list shows definitions with their latest version, states
 * and instance counts; publishing bumps versions immutably.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 185 — workflow designer', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s185a', subject: 'idp|s185-admin' });

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
      slug: 'test-s185a',
      name: 'Sprint185 Tenant',
      initialAdmin: {
        email: 'admin@s185a.example',
        displayName: 'S185 Admin',
        idpSubject: 'idp|s185-admin',
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

  it('WF-001: the designer lists definitions with versions and instance counts', async () => {
    const empty = await api('GET', '/api/v1/workflows', tokenA);
    expect(empty.status).toBe(200);
    expect((empty.body.workflows as unknown[]).length).toBe(0);

    await api('POST', '/api/v1/workflows/publish', tokenA, {
      key: 'otprema',
      name: 'Otprema robe',
      spec: {
        initial: 'NOVO',
        states: [{ name: 'NOVO' }, { name: 'POSLANO', terminal: true }],
        transitions: [{ from: 'NOVO', to: 'POSLANO', trigger: 'posalji' }],
      },
    });
    await api('POST', '/api/v1/workflows/instances', tokenA, { definitionKey: 'otprema' });
    await api('POST', '/api/v1/workflows/instances', tokenA, { definitionKey: 'otprema' });

    const list = await api('GET', '/api/v1/workflows', tokenA);
    const rows = list.body.workflows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('otprema');
    expect(rows[0]?.version).toBe(1);
    expect(rows[0]?.instances).toBe(2);
    const spec = rows[0]?.spec as { states: Array<{ name: string }> };
    expect(spec.states.map((st) => st.name)).toEqual(['NOVO', 'POSLANO']);
  });

  it('WF-001: republishing bumps the version, older instances stay pinned', async () => {
    await api('POST', '/api/v1/workflows/publish', tokenA, {
      key: 'otprema',
      name: 'Otprema robe v2',
      spec: {
        initial: 'NOVO',
        states: [{ name: 'NOVO' }, { name: 'PAKOVANJE' }, { name: 'POSLANO', terminal: true }],
        transitions: [
          { from: 'NOVO', to: 'PAKOVANJE', trigger: 'pakuj' },
          { from: 'PAKOVANJE', to: 'POSLANO', trigger: 'posalji' },
        ],
      },
    });
    const list = await api('GET', '/api/v1/workflows', tokenA);
    const rows = list.body.workflows as Array<Record<string, unknown>>;
    expect(rows[0]?.version).toBe(2);
  });

  it('AUTHZ: the designer list needs workflow.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s185a', subject: 'idp|s185-nobody' });
    const denied = await api('GET', '/api/v1/workflows', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
