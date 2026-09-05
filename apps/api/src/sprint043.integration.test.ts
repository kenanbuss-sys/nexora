import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 043 acceptance tests: data quality rules (MDM) — a live
 * computed report over master data, permissioned for stewards and
 * tenant-isolated.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 043 — data quality report', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s43a', subject: 'idp|s43-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s43b', subject: 'idp|s43b-admin' });

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

  function check(body: Record<string, unknown>, key: string) {
    return (body.checks as Array<{ key: string; count: number; samples: string[] }>).find(
      (c) => c.key === key,
    )!;
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

    for (const [slug, subject] of [
      ['test-s43a', 'idp|s43-admin'],
      ['test-s43b', 'idp|s43b-admin'],
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

    // Offenders: a party without e-mail (becomes a customer without
    // territory), a duplicate name pair, a product with no SKU, and an
    // active SKU without a barcode.
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Bezmail d.o.o.',
    });
    await api('POST', '/api/v1/crm/accounts', tokenA, { partyId: party.body.id });
    await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Dupla Firma',
      email: 'a@dupla.example',
    });
    await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'dupla  firma',
      email: 'b@dupla.example',
    });
    await api('POST', '/api/v1/products', tokenA, { code: 'EMPTY43', name: 'No SKUs' });
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'Q43', name: 'Q43' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'Q43-STD',
      name: 'Q43 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MDM: the report counts real offenders with samples', async () => {
    const report = await api('GET', '/api/v1/parties/quality', tokenA);
    expect(report.status).toBe(200);
    expect(check(report.body, 'party.missing_email').count).toBe(1);
    expect(check(report.body, 'party.missing_email').samples).toContain('Bezmail d.o.o.');
    expect(check(report.body, 'party.duplicates').count).toBe(1);
    expect(check(report.body, 'account.no_territory').count).toBe(1);
    expect(check(report.body, 'product.no_sku').count).toBe(1);
    expect(check(report.body, 'sku.no_barcode').count).toBe(1);
    expect(Number(report.body.totalIssues)).toBeGreaterThanOrEqual(5);
  });

  it('MDM: fixing an offender clears its check', async () => {
    const territory = await api('POST', '/api/v1/crm/territories', tokenA, {
      code: 'T43',
      name: 'Teritorija 43',
    });
    const accounts = await api('GET', '/api/v1/crm/accounts', tokenA);
    const account = (accounts.body.accounts as Array<{ id: string }>)[0]!;
    await api('POST', `/api/v1/crm/accounts/${account.id}/territory`, tokenA, {
      territoryId: territory.body.id,
    });
    const report = await api('GET', '/api/v1/parties/quality', tokenA);
    expect(check(report.body, 'account.no_territory').count).toBe(0);
  });

  it('TENANCY+AUTHZ: the report is isolated and steward-only', async () => {
    const other = await api('GET', '/api/v1/parties/quality', tokenB);
    expect(Number(other.body.totalIssues)).toBe(0);

    const stranger = identity.signToken({ tenantSlug: 'test-s43a', subject: 'idp|s43-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko43@primjer.example',
      displayName: 'Niko43',
      idpSubject: 'idp|s43-nobody',
    });
    const denied = await api('GET', '/api/v1/parties/quality', stranger);
    expect(denied.status).toBe(403);
  });
});
