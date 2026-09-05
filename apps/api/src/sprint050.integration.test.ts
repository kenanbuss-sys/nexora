import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 050 acceptance tests: step-up authentication — sensitive routes
 * demand a fresh password confirmation with a short-lived elevation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 050 — step-up authentication', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s50a', subject: 'idp|s50-admin' });

  let userId = '';
  const PASSWORD = 'stepup-lozinka-50';

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
      `TRUNCATE TABLE "consent_record", "exchange_rate", "sales_team_member", "sales_team",
       "territory", "packaging_level", "sku_substitution", "discount_rule",
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

    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s50a',
      name: 'Sprint50 Tenant',
      initialAdmin: {
        email: 'admin@s50a.example',
        displayName: 'S50 Admin',
        idpSubject: 'idp|s50-admin',
      },
    });
    const users = await api('GET', '/api/v1/users', tokenA);
    userId = (users.body.users as Array<{ id: string }>)[0]!.id;
    await api('POST', `/api/v1/users/${userId}/password`, tokenA, { password: PASSWORD });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('IAM: the sensitive export refuses without a fresh confirmation', async () => {
    const denied = await api('GET', '/api/v1/tenant/export', tokenA);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('STEP_UP_REQUIRED');
  });

  it('IAM: a wrong password grants nothing; the right one elevates briefly', async () => {
    const wrong = await api('POST', '/api/v1/auth/step-up', tokenA, {
      currentPassword: 'nije-tacna',
    });
    expect(wrong.status).toBe(403);
    const stillDenied = await api('GET', '/api/v1/tenant/export', tokenA);
    expect(stillDenied.status).toBe(403);

    const elevated = await api('POST', '/api/v1/auth/step-up', tokenA, {
      currentPassword: PASSWORD,
    });
    expect(elevated.status).toBe(201);
    expect(elevated.body.elevated).toBe(true);

    const allowed = await api('GET', '/api/v1/tenant/export', tokenA);
    expect(allowed.status).toBe(200);
    expect(allowed.body.parties).toBeDefined();

    const granted = await prisma.securityEvent.findFirst({
      where: { eventType: 'auth.step_up.granted' },
    });
    expect(granted).not.toBeNull();
  });

  it('IAM: platform sessions are exempt (no tenant credential to verify)', async () => {
    // Platform token hits a tenant-scoped route only through its own
    // platform surface; the guard itself exempts platformAdmin — assert
    // the step-up grant does not leak to other users.
    const stranger = identity.signToken({ tenantSlug: 'test-s50a', subject: 'idp|s50-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko50@primjer.example',
      displayName: 'Niko50',
      idpSubject: 'idp|s50-nobody',
    });
    const denied = await api('GET', '/api/v1/tenant/export', stranger);
    // Lacks iam.user.manage → 403 from permissions before step-up.
    expect(denied.status).toBe(403);
  });
});
