import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 037 acceptance tests: module activation enforcement (CORE-006) —
 * a disabled module loses its API surface server-side, not just its
 * navigation; other modules and other tenants stay untouched.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 037 — module activation enforcement', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s37a', subject: 'idp|s37-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s37b', subject: 'idp|s37b-admin' });

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
      ['test-s37a', 'idp|s37-admin'],
      ['test-s37b', 'idp|s37b-admin'],
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

  it('CORE-006: disabling a module cuts its API surface off', async () => {
    // Manufacturing works while enabled.
    const before = await api('GET', '/api/v1/shopfloor/work-centers', tokenA);
    expect(before.status).toBe(200);

    const off = await api('PUT', '/api/v1/configuration/modules/manufacturing', tokenA, {
      enabled: false,
    });
    expect(off.status).toBe(200);

    const denied = await api('GET', '/api/v1/shopfloor/work-centers', tokenA);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('MODULE_DISABLED');
    const deniedWo = await api('GET', '/api/v1/work-orders', tokenA);
    expect(deniedWo.status).toBe(403);

    // Other modules keep working.
    const products = await api('GET', '/api/v1/products/search?q=x', tokenA);
    expect(products.status).toBe(200);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'configuration.module.set' },
    });
    expect(audit).not.toBeNull();
  });

  it('CORE-006: re-enabling restores the module; other tenants never noticed', async () => {
    // Tenant B was never affected.
    const other = await api('GET', '/api/v1/shopfloor/work-centers', tokenB);
    expect(other.status).toBe(200);

    await api('PUT', '/api/v1/configuration/modules/manufacturing', tokenA, { enabled: true });
    const restored = await api('GET', '/api/v1/shopfloor/work-centers', tokenA);
    expect(restored.status).toBe(200);
  });

  it('CORE-006: activations are readable by every signed-in user for nav gating', async () => {
    await api('PUT', '/api/v1/configuration/modules/portal', tokenA, { enabled: false });
    const nobody = identity.signToken({ tenantSlug: 'test-s37a', subject: 'idp|s37-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko37@primjer.example',
      displayName: 'Niko37',
      idpSubject: 'idp|s37-nobody',
    });
    const modules = await api('GET', '/api/v1/tenant/modules', nobody);
    expect(modules.status).toBe(200);
    expect((modules.body.modules as Record<string, boolean>).portal).toBe(false);

    // Toggling still needs configuration.publish.
    const denied = await api('PUT', '/api/v1/configuration/modules/portal', nobody, {
      enabled: true,
    });
    expect(denied.status).toBe(403);
  });
});
