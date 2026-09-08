import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 180 acceptance tests: rule simulation & workflow templates
 * (WF-009/011) — dry-run events against enabled rules with no side
 * effects, and publish workflows from the governed template library.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 180 — simulation & templates', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s180a', subject: 'idp|s180-admin' });

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
      slug: 'test-s180a',
      name: 'Sprint180 Tenant',
      initialAdmin: {
        email: 'admin@s180a.example',
        displayName: 'S180 Admin',
        idpSubject: 'idp|s180-admin',
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

  it('WF-009: simulation reports matches without executing anything', async () => {
    const published = await api('POST', '/api/v1/rules/publish', tokenA, {
      key: 'veliki-racuni',
      name: 'Veliki računi',
      spec: {
        when: 'order.confirmed',
        if: [{ path: 'total', op: 'gt', value: 1000 }],
        then: [{ action: 'create_task', title: 'Provjeri veliki račun' }],
      },
    });
    expect(published.status).toBe(201);

    const hit = await api('POST', '/api/v1/rules/simulate', tokenA, {
      eventType: 'order.confirmed',
      payload: { total: 5000 },
    });
    expect(hit.status).toBe(201);
    expect(hit.body.evaluated).toBe(1);
    const matched = hit.body.matched as Array<Record<string, unknown>>;
    expect(matched).toHaveLength(1);
    expect(matched[0]?.key).toBe('veliki-racuni');

    const miss = await api('POST', '/api/v1/rules/simulate', tokenA, {
      eventType: 'order.confirmed',
      payload: { total: 10 },
    });
    expect((miss.body.matched as unknown[]).length).toBe(0);

    // No side effects: simulation created no tasks.
    const tasks = await prisma.task.count();
    expect(tasks).toBe(0);
  });

  it('WF-011: workflows publish from the template library', async () => {
    const fromTemplate = await api('POST', '/api/v1/workflows/from-template', tokenA, {
      templateKey: 'odobrenje-dokumenta',
    });
    expect(fromTemplate.status).toBe(201);
    expect(fromTemplate.body.definitionKey).toBe('odobrenje-dokumenta');
    expect(fromTemplate.body.version).toBe(1);

    const custom = await api('POST', '/api/v1/workflows/from-template', tokenA, {
      templateKey: 'odobrenje-dokumenta',
      key: 'odobrenje-ugovora',
    });
    expect(custom.body.definitionKey).toBe('odobrenje-ugovora');

    const ghost = await api('POST', '/api/v1/workflows/from-template', tokenA, {
      templateKey: 'nepostojeci',
    });
    expect(ghost.status).toBe(404);
  });

  it('AUTHZ: simulation needs automation.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s180a', subject: 'idp|s180-nobody' });
    const denied = await api('POST', '/api/v1/rules/simulate', stranger, {
      eventType: 'order.confirmed',
      payload: {},
    });
    expect([401, 403]).toContain(denied.status);
  });
});
