import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 034 acceptance tests: local password authentication — admin-set
 * passwords, real login issuing bearer tokens, self-service change,
 * brute-force lockout and security-event coverage.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 034 — local password authentication', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s34a', subject: 'idp|s34-admin' });

  let userId = '';

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
      `TRUNCATE TABLE "user_credential",
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
      slug: 'test-s34a',
      name: 'Sprint34 Tenant',
      initialAdmin: {
        email: 'admin@s34a.example',
        displayName: 'S34 Admin',
        idpSubject: 'idp|s34-admin',
      },
    });
    const users = await api('GET', '/api/v1/users', tokenA);
    userId = (users.body.users as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'admin@s34a.example',
    )!.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('IAM: admin sets a password (audited); weak passwords are refused', async () => {
    const weak = await api('POST', `/api/v1/users/${userId}/password`, tokenA, {
      password: 'kratko',
    });
    expect(weak.status).toBe(400);

    const set = await api('POST', `/api/v1/users/${userId}/password`, tokenA, {
      password: 'pocetna-lozinka-1',
    });
    expect(set.status).toBe(201);

    const credential = await prisma.userCredential.findUnique({ where: { userId } });
    expect(credential?.passwordHash).toContain('scrypt:');
    expect(credential?.passwordHash).not.toContain('pocetna-lozinka-1');
    expect(credential?.mustChangePassword).toBe(true);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'iam.password.set' } });
    expect(audit).not.toBeNull();
  });

  it('AUTH: login returns a working bearer token; wrong password fails closed', async () => {
    const ok = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s34a',
      email: 'admin@s34a.example',
      password: 'pocetna-lozinka-1',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.mustChangePassword).toBe(true);
    const token = ok.body.token as string;

    // The issued token authenticates real API calls.
    const me = await api('GET', '/api/v1/users', token);
    expect(me.status).toBe(200);

    const bad = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s34a',
      email: 'admin@s34a.example',
      password: 'pogresna-lozinka',
    });
    expect(bad.status).toBe(403);
    // Unknown tenant reads exactly the same (no information leak).
    const ghost = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'no-such-tenant',
      email: 'admin@s34a.example',
      password: 'pocetna-lozinka-1',
    });
    expect(ghost.status).toBe(403);
    expect(ghost.body.message).toBe(bad.body.message);

    const events = await prisma.securityEvent.findMany({
      where: { eventType: 'auth.login.succeeded' },
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it('AUTH: self-service change requires the current password', async () => {
    const login = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s34a',
      email: 'admin@s34a.example',
      password: 'pocetna-lozinka-1',
    });
    const token = login.body.token as string;

    const wrong = await api('POST', '/api/v1/auth/change-password', token, {
      currentPassword: 'nije-tacna',
      newPassword: 'nova-lozinka-99',
    });
    expect(wrong.status).toBe(403);

    const changed = await api('POST', '/api/v1/auth/change-password', token, {
      currentPassword: 'pocetna-lozinka-1',
      newPassword: 'nova-lozinka-99',
    });
    expect(changed.status).toBe(201);

    const again = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s34a',
      email: 'admin@s34a.example',
      password: 'nova-lozinka-99',
    });
    expect(again.status).toBe(201);
    expect(again.body.mustChangePassword).toBe(false);
  });

  it('AUTH: five failed attempts lock the account', async () => {
    for (let i = 0; i < 5; i++) {
      await api('POST', '/api/v1/auth/login', null, {
        tenantSlug: 'test-s34a',
        email: 'admin@s34a.example',
        password: `napad-${i}`,
      });
    }
    const locked = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s34a',
      email: 'admin@s34a.example',
      password: 'nova-lozinka-99',
    });
    expect(locked.status).toBe(409);
    expect(String(locked.body.message)).toContain('locked');

    const lockout = await prisma.securityEvent.findFirst({
      where: { eventType: 'auth.login.lockout' },
    });
    expect(lockout).not.toBeNull();

    // An admin reset clears the lock immediately.
    await api('POST', `/api/v1/users/${userId}/password`, tokenA, {
      password: 'poslije-reseta-1',
    });
    const unlocked = await api('POST', '/api/v1/auth/login', null, {
      tenantSlug: 'test-s34a',
      email: 'admin@s34a.example',
      password: 'poslije-reseta-1',
    });
    expect(unlocked.status).toBe(201);
  });

  it('AUTHZ: setting passwords needs iam.user.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s34a', subject: 'idp|s34-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko34@primjer.example',
      displayName: 'Niko34',
      idpSubject: 'idp|s34-nobody',
    });
    const denied = await api('POST', `/api/v1/users/${userId}/password`, stranger, {
      password: 'hakerska-lozinka',
    });
    expect(denied.status).toBe(403);
  });
});
