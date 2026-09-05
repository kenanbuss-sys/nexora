import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 046 acceptance tests: sales teams (CRM) — governed team master,
 * audited membership, territory coverage and tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 046 — sales teams', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s46a', subject: 'idp|s46-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s46b', subject: 'idp|s46b-admin' });

  let teamId = '';
  let adminUserId = '';
  let territoryId = '';

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
      `TRUNCATE TABLE "sales_team_member", "sales_team", "territory",
       "packaging_level", "sku_substitution", "discount_rule",
       "user_credential",
       "downtime_event", "work_center",
       "stock_count_line", "stock_count",
       "return_order_line", "return_order", "product_category",
       "security_event", "api_key",
       "webhook_delivery", "webhook_subscription",
       "budget", "cost_center",
       "comment", "attachment_blob", "attachment", "number_sequence",
       "portal_user", "payment", "invoice",
       "qc_inspection_item", "qc_inspection", "qc_plan_item", "qc_plan", "ncr",
       "work_order_operation", "work_order",
       "mrp_suggestion", "mrp_run", "planning_policy",
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
       "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
       "wms_order_line", "wms_order", "scan_event", "device",
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

    for (const [slug, subject] of [
      ['test-s46a', 'idp|s46-admin'],
      ['test-s46b', 'idp|s46b-admin'],
    ] as const) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Tenant ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: 'Admin',
          idpSubject: subject,
        },
      });
    }
    const users = await api('GET', '/api/v1/users', tokenA);
    adminUserId = (users.body.users as Array<{ id: string }>)[0]!.id;
    const territory = await api('POST', '/api/v1/crm/territories', tokenA, {
      code: 'T46',
      name: 'Teritorija 46',
    });
    territoryId = territory.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CRM: teams are governed master data with audited membership', async () => {
    const created = await api('POST', '/api/v1/crm/teams', tokenA, {
      code: 'jug',
      name: 'Tim jug',
    });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe('JUG');
    teamId = created.body.id as string;

    const duplicate = await api('POST', '/api/v1/crm/teams', tokenA, {
      code: 'JUG',
      name: 'Dup',
    });
    expect(duplicate.status).toBe(409);

    const added = await api('POST', `/api/v1/crm/teams/${teamId}/members`, tokenA, {
      userId: adminUserId,
    });
    expect(added.status).toBe(201);
    const again = await api('POST', `/api/v1/crm/teams/${teamId}/members`, tokenA, {
      userId: adminUserId,
    });
    expect(again.status).toBe(409);

    const listed = await api('GET', '/api/v1/crm/teams', tokenA);
    const team = (
      listed.body.teams as Array<{ id: string; members: Array<{ email: string }> }>
    ).find((t) => t.id === teamId)!;
    expect(team.members.length).toBe(1);
    expect(team.members[0]!.email).toBe('admin@test-s46a.example');

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'crm.team.member.add' } });
    expect(audit).not.toBeNull();
  });

  it('CRM: a team covers territories; clearing works', async () => {
    const assigned = await api('POST', `/api/v1/crm/territories/${territoryId}/team`, tokenA, {
      teamId,
    });
    expect(assigned.status).toBe(201);
    const listed = await api('GET', '/api/v1/crm/teams', tokenA);
    const team = (listed.body.teams as Array<{ id: string; territoryCount: number }>).find(
      (t) => t.id === teamId,
    )!;
    expect(team.territoryCount).toBe(1);

    await api('POST', `/api/v1/crm/territories/${territoryId}/team`, tokenA, { teamId: null });
    const after = await api('GET', '/api/v1/crm/teams', tokenA);
    expect(
      (after.body.teams as Array<{ id: string; territoryCount: number }>).find(
        (t) => t.id === teamId,
      )!.territoryCount,
    ).toBe(0);
  });

  it('TENANCY: teams are isolated; cross-tenant coverage fails', async () => {
    const other = await api('GET', '/api/v1/crm/teams', tokenB);
    expect((other.body.teams as unknown[]).length).toBe(0);

    const foreignTerritory = await api('POST', '/api/v1/crm/territories', tokenB, {
      code: 'TUDJA',
      name: 'Tudja',
    });
    const cross = await api(
      'POST',
      `/api/v1/crm/territories/${foreignTerritory.body.id}/team`,
      tokenB,
      { teamId },
    );
    expect(cross.status).toBe(404);
  });
});
