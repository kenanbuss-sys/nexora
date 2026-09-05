import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { totpCode } from '@nexora/domain-iam';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 044 acceptance tests: TOTP two-factor authentication — enroll,
 * confirm-to-arm, MFA-gated login, and password-verified disable.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 044 — two-factor authentication', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s44a', subject: 'idp|s44-admin' });

  let userId = '';
  let totpSecret = '';
  const PASSWORD = 'tajna-lozinka-44';

  async function api(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string | null,
    payload?: unknown,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
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
      `TRUNCATE TABLE "territory", "packaging_level", "sku_substitution", "discount_rule",
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
      slug: 'test-s44a',
      name: 'Sprint44 Tenant',
      initialAdmin: {
        email: 'admin@s44a.example',
        displayName: 'S44 Admin',
        idpSubject: 'idp|s44-admin',
      },
    });
    const users = await api('GET', '/api/v1/users', tokenA);
    userId = (users.body.users as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'admin@s44a.example',
    )!.id;
    await api('POST', `/api/v1/users/${userId}/password`, tokenA, { password: PASSWORD });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MFA: enrollment issues a secret; the first valid code arms it', async () => {
    const status = await api('GET', '/api/v1/auth/mfa', tokenA);
    expect(status.body).toEqual({ hasPassword: true, mfaEnabled: false });

    const enrolled = await api('POST', '/api/v1/auth/mfa/enroll', tokenA);
    expect(enrolled.status).toBe(201);
    totpSecret = enrolled.body.secret as string;
    expect(String(enrolled.body.otpauthUri)).toContain('otpauth://totp/');

    // Login still works without a code — MFA is not armed yet.
    const preLogin = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s44a',
      email: 'admin@s44a.example',
      password: PASSWORD,
    });
    expect(preLogin.status).toBe(201);

    const wrong = await api('POST', '/api/v1/auth/mfa/confirm', tokenA, { code: '000000' });
    expect(wrong.status).toBe(403);

    const confirmed = await api('POST', '/api/v1/auth/mfa/confirm', tokenA, {
      code: totpCode(totpSecret),
    });
    expect(confirmed.status).toBe(201);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'iam.mfa.enable' } });
    expect(audit).not.toBeNull();
  });

  it('MFA: armed accounts require a valid code at login', async () => {
    const noCode = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s44a',
      email: 'admin@s44a.example',
      password: PASSWORD,
    });
    expect(noCode.status).toBe(403);
    expect(noCode.body.message).toBe('MFA code required');

    const badCode = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s44a',
      email: 'admin@s44a.example',
      password: PASSWORD,
      otp: '000000',
    });
    expect(badCode.status).toBe(403);

    const good = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s44a',
      email: 'admin@s44a.example',
      password: PASSWORD,
      otp: totpCode(totpSecret),
    });
    expect(good.status).toBe(201);
    expect(good.body.token).toBeTruthy();

    const challenged = await prisma.securityEvent.findFirst({
      where: { eventType: 'auth.mfa.challenged' },
    });
    expect(challenged).not.toBeNull();
  });

  it('MFA: disabling requires the current password', async () => {
    const wrong = await api('POST', '/api/v1/auth/mfa/disable', tokenA, {
      currentPassword: 'nije-tacna',
    });
    expect(wrong.status).toBe(403);

    const disabled = await api('POST', '/api/v1/auth/mfa/disable', tokenA, {
      currentPassword: PASSWORD,
    });
    expect(disabled.status).toBe(201);

    const login = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s44a',
      email: 'admin@s44a.example',
      password: PASSWORD,
    });
    expect(login.status).toBe(201);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'iam.mfa.disable' } });
    expect(audit).not.toBeNull();
  });
});
