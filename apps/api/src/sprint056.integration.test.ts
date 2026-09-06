import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 056 acceptance tests: break-glass access (IAM-014) — no
 * self-grant, mandatory reason, time-boxed elevation that bypasses
 * role permissions with every use audited, and revocation that closes
 * the door immediately.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 056 — break-glass', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s56a', subject: 'idp|s56-admin' });

  let adminUserId = '';
  let helperUserId = '';
  const helperToken = identity.signToken({ tenantSlug: 'test-s56a', subject: 'idp|s56-helper' });

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
      `TRUNCATE TABLE "master_data_request", "break_glass_grant",
       "serial_number", "bundle_component",
       "promotion_redemption", "promotion",
       "consent_record", "exchange_rate", "sales_team_member", "sales_team",
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
      slug: 'test-s56a',
      name: 'Sprint56 Tenant',
      initialAdmin: {
        email: 'admin@s56a.example',
        displayName: 'S56 Admin',
        idpSubject: 'idp|s56-admin',
      },
    });
    const list = await api('GET', '/api/v1/users', tokenA);
    adminUserId = (list.body.users as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'admin@s56a.example',
    )?.id as string;
    const invited = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'pomoc56@primjer.example',
      displayName: 'Pomoc56',
      idpSubject: 'idp|s56-helper',
    });
    helperUserId = invited.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('IAM-014: self-grant is refused and a reason is mandatory', async () => {
    const selfGrant = await api('POST', '/api/v1/break-glass', tokenA, {
      userId: adminUserId,
      reason: 'because I want it now',
      minutes: 30,
    });
    expect(selfGrant.status).toBe(403);

    const noReason = await api('POST', '/api/v1/break-glass', tokenA, {
      userId: helperUserId,
      reason: 'short',
      minutes: 30,
    });
    expect(noReason.status).toBe(400);
  });

  it('IAM-014: an active grant bypasses permissions and every use is audited', async () => {
    // Helper has no roles: creating a product is normally forbidden.
    const before = await api('POST', '/api/v1/products', helperToken, {
      code: 'BG56A',
      name: 'Denied',
    });
    expect(before.status).toBe(403);

    const granted = await api('POST', '/api/v1/break-glass', tokenA, {
      userId: helperUserId,
      reason: 'Incident #56 — emergency data fix',
      minutes: 30,
    });
    expect(granted.status).toBe(201);
    expect(granted.body.active).toBe(true);

    const dupe = await api('POST', '/api/v1/break-glass', tokenA, {
      userId: helperUserId,
      reason: 'Second grant should conflict',
      minutes: 30,
    });
    expect(dupe.status).toBe(409);

    const during = await api('POST', '/api/v1/products', helperToken, {
      code: 'BG56B',
      name: 'Allowed via break-glass',
    });
    expect(during.status).toBe(201);

    const grantAudit = await prisma.auditEvent.findFirst({
      where: { action: 'iam.break_glass.grant' },
    });
    expect(grantAudit).not.toBeNull();
    const useAudit = await prisma.auditEvent.findFirst({
      where: { action: 'iam.break_glass.use' },
    });
    expect(useAudit).not.toBeNull();
  });

  it('IAM-014: revocation closes the door immediately', async () => {
    const list = await api('GET', '/api/v1/break-glass', tokenA);
    const active = (list.body.grants as Array<{ id: string; active: boolean }>).find(
      (g) => g.active,
    );
    expect(active).toBeDefined();
    const revoked = await api('POST', `/api/v1/break-glass/${active?.id ?? ''}/revoke`, tokenA);
    expect(revoked.status).toBe(201);

    const after = await api('POST', '/api/v1/products', helperToken, {
      code: 'BG56C',
      name: 'Denied again',
    });
    expect(after.status).toBe(403);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'iam.break_glass.revoke' },
    });
    expect(audit).not.toBeNull();
  });

  it('AUTHZ: managing break-glass needs iam.user.manage', async () => {
    const denied = await api('GET', '/api/v1/break-glass', helperToken);
    expect(denied.status).toBe(403);
  });
});
