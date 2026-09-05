import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 036 acceptance tests: terminology dictionary (CORE-004) — tenant
 * vocabulary readable by every signed-in user, governed writes, key
 * validation and tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 036 — terminology dictionary', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s36a', subject: 'idp|s36-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s36b', subject: 'idp|s36b-admin' });

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
      ['test-s36a', 'idp|s36-admin'],
      ['test-s36b', 'idp|s36b-admin'],
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

  it('CORE-004: terminology writes are governed and audited', async () => {
    const saved = await api('PUT', '/api/v1/configuration/terminology/en', tokenA, {
      entries: { 'nav.orders': 'Sales desk', 'nav.inventory': 'Stockroom' },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.updated).toBe(2);

    const invalid = await api('PUT', '/api/v1/configuration/terminology/en', tokenA, {
      entries: { 'Nav Orders!': 'Nope' },
    });
    expect(invalid.status).toBe(400);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'configuration.terminology.set' },
    });
    expect(audit).not.toBeNull();
  });

  it('CORE-004: every signed-in user reads the vocabulary', async () => {
    const nobody = identity.signToken({ tenantSlug: 'test-s36a', subject: 'idp|s36-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko36@primjer.example',
      displayName: 'Niko36',
      idpSubject: 'idp|s36-nobody',
    });
    const vocabulary = await api('GET', '/api/v1/tenant/vocabulary/en', nobody);
    expect(vocabulary.status).toBe(200);
    expect((vocabulary.body.entries as Record<string, string>)['nav.orders']).toBe('Sales desk');

    // A nonsense locale returns an empty dictionary rather than an error.
    const odd = await api('GET', '/api/v1/tenant/vocabulary/notalocale', nobody);
    expect(odd.status).toBe(200);
    expect(odd.body.entries).toEqual({});

    // Writing still needs configuration.publish.
    const denied = await api('PUT', '/api/v1/configuration/terminology/en', nobody, {
      entries: { 'nav.orders': 'Hacked' },
    });
    expect(denied.status).toBe(403);
  });

  it('CORE-004: locales are independent and tenants isolated', async () => {
    await api('PUT', '/api/v1/configuration/terminology/bs', tokenA, {
      entries: { 'nav.orders': 'Prodajni nalozi' },
    });
    const en = await api('GET', '/api/v1/tenant/vocabulary/en', tokenA);
    const bs = await api('GET', '/api/v1/tenant/vocabulary/bs', tokenA);
    expect((en.body.entries as Record<string, string>)['nav.orders']).toBe('Sales desk');
    expect((bs.body.entries as Record<string, string>)['nav.orders']).toBe('Prodajni nalozi');

    const other = await api('GET', '/api/v1/tenant/vocabulary/en', tokenB);
    expect(other.body.entries).toEqual({});
  });
});
