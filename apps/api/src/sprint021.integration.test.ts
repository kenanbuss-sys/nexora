import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 021 acceptance tests: API-key service accounts (IAM-009), the
 * security event log (IAM-013), platform usage analytics (OPS-014) and
 * tenant data export (OPS-017).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 021 — platform ops & security', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s21a', subject: 'idp|s21-admin' });

  let apiKey = '';
  let apiKeyId = '';

  async function api(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    token: string | null,
    payload?: unknown,
    extraHeaders?: Record<string, string>,
  ) {
    const response = await app.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(extraHeaders ?? {}),
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
      `TRUNCATE TABLE "security_event", "api_key",
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
      slug: 'test-s21a',
      name: 'Sprint21 Tenant',
      initialAdmin: {
        email: 'admin@s21a.example',
        displayName: 'S21 Admin',
        idpSubject: 'idp|s21-admin',
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'OPS21', name: 'O21' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'OPS21-STD',
      name: 'O21 Standard',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('IAM-009: an API key authenticates within its allowlist only', async () => {
    const created = await api('POST', '/api/v1/iam/api-keys', tokenA, {
      name: 'erp-sync',
      permissions: ['product.read', 'order.read'],
    });
    expect(created.status).toBe(201);
    apiKey = created.body.key as string;
    apiKeyId = created.body.id as string;
    expect(apiKey.startsWith('nxk_')).toBe(true);

    // Allowed: reading products with the key, no bearer token at all.
    const allowed = await api('GET', '/api/v1/products/search?q=O21', null, undefined, {
      'x-api-key': apiKey,
    });
    expect(allowed.status).toBe(200);
    expect((allowed.body.products as unknown[]).length).toBeGreaterThan(0);

    // Outside the allowlist: denied and logged.
    const denied = await api('GET', '/api/v1/finance/invoices', null, undefined, {
      'x-api-key': apiKey,
    });
    expect(denied.status).toBe(403);

    // Garbage key: unauthenticated.
    const invalid = await api('GET', '/api/v1/products/search?q=x', null, undefined, {
      'x-api-key': 'nxk_' + '0'.repeat(48),
    });
    expect(invalid.status).toBe(401);
  });

  it('IAM-009: revocation takes effect immediately', async () => {
    await api('POST', `/api/v1/iam/api-keys/${apiKeyId}/revoke`, tokenA);
    const afterRevoke = await api('GET', '/api/v1/products/search?q=x', null, undefined, {
      'x-api-key': apiKey,
    });
    expect(afterRevoke.status).toBe(401);

    const keys = await api('GET', '/api/v1/iam/api-keys', tokenA);
    const key = (keys.body.apiKeys as Array<{ active: boolean; lastUsedAt: string | null }>)[0]!;
    expect(key.active).toBe(false);
    expect(key.lastUsedAt).not.toBeNull();
  });

  it('IAM-013: the security log captures key lifecycle and denials', async () => {
    const events = await api('GET', '/api/v1/iam/security-events', tokenA);
    const types = (events.body.events as Array<{ eventType: string }>).map((e) => e.eventType);
    expect(types).toContain('api_key.created');
    expect(types).toContain('api_key.revoked');
    expect(types).toContain('permission.denied');
  });

  it('OPS-017: tenant export returns a bounded audited snapshot', async () => {
    // Sprint 050: the export is a step-up route — confirm the password first.
    const stepUpDenied = await api('GET', '/api/v1/tenant/export', tokenA);
    expect(stepUpDenied.status).toBe(403);
    const users = await api('GET', '/api/v1/users', tokenA);
    const admin = (users.body.users as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'admin@s21a.example',
    )!;
    await api('POST', `/api/v1/users/${admin.id}/password`, tokenA, {
      password: 'izvoz-lozinka-21',
    });
    await api('POST', '/api/v1/auth/step-up', tokenA, { currentPassword: 'izvoz-lozinka-21' });

    const exported = await api('GET', '/api/v1/tenant/export', tokenA);
    expect(exported.status).toBe(200);
    expect(exported.body.tenantSlug).toBe('test-s21a');
    expect((exported.body.products as unknown[]).length).toBe(1);
    expect((exported.body.skus as unknown[]).length).toBe(1);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'ops.tenant.export' } });
    expect(audit).not.toBeNull();
  });

  it('OPS-014: platform usage is operator-only and counts per tenant', async () => {
    const denied = await api('GET', '/api/v1/platform/usage', tokenA);
    expect(denied.status).toBe(403);

    const usage = await api('GET', '/api/v1/platform/usage', platformToken);
    expect(usage.status).toBe(200);
    const row = (usage.body.tenants as Array<Record<string, unknown>>).find(
      (t) => t.slug === 'test-s21a',
    )!;
    expect(row.users).toBe(1);
    expect(row.status).toBe('ACTIVE');
  });
});
