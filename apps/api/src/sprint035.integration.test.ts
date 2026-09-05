import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 035 acceptance tests: white-label branding (CORE-003) — versioned
 * configuration publishing, sanitized branding for every signed-in user,
 * and tenant-isolated history.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 035 — white-label branding', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s35a', subject: 'idp|s35-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s35b', subject: 'idp|s35b-admin' });

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

    for (const [slug, subject] of [
      ['test-s35a', 'idp|s35-admin'],
      ['test-s35b', 'idp|s35b-admin'],
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CORE-003: publishing branding creates immutable versions', async () => {
    const v1 = await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { branding: { name: 'Adria Manufacturing', accentColor: '#0e7490' } },
    });
    expect(v1.status).toBe(201);
    expect(v1.body.version).toBe(1);

    const v2 = await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        branding: { name: 'Adria d.o.o.', accentColor: '#0e7490', accentColor2: '#155e75' },
      },
    });
    expect(v2.body.version).toBe(2);

    const history = await api('GET', '/api/v1/tenant/configuration/history', tokenA);
    expect(history.status).toBe(200);
    const versions = history.body.versions as Array<{ version: number }>;
    expect(versions.map((v) => v.version)).toEqual([2, 1]);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'tenant.configuration.publish' },
    });
    expect(audit).not.toBeNull();
  });

  it('CORE-003: every signed-in user reads sanitized branding', async () => {
    // A user with no roles at all still gets the branding.
    const nobody = identity.signToken({ tenantSlug: 'test-s35a', subject: 'idp|s35-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko35@primjer.example',
      displayName: 'Niko35',
      idpSubject: 'idp|s35-nobody',
    });
    const branding = await api('GET', '/api/v1/tenant/branding', nobody);
    expect(branding.status).toBe(200);
    expect(branding.body.name).toBe('Adria d.o.o.');
    expect(branding.body.accentColor).toBe('#0e7490');

    // ...but not the raw configuration (needs configuration.read).
    const raw = await api('GET', '/api/v1/tenant/configuration', nobody);
    expect(raw.status).toBe(403);
  });

  it('CORE-003: invalid colors are dropped, never rendered', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        branding: {
          name: 'X'.repeat(100),
          accentColor: 'javascript:alert(1)',
          accentColor2: '#GGGGGG',
        },
      },
    });
    const branding = await api('GET', '/api/v1/tenant/branding', tokenA);
    expect(branding.body.accentColor).toBeNull();
    expect(branding.body.accentColor2).toBeNull();
    expect((branding.body.name as string).length).toBe(60);
  });

  it('TENANCY: branding and history are tenant-isolated', async () => {
    const other = await api('GET', '/api/v1/tenant/branding', tokenB);
    expect(other.body.name).toBeNull();
    const history = await api('GET', '/api/v1/tenant/configuration/history', tokenB);
    expect((history.body.versions as unknown[]).length).toBe(0);
  });
});
