import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 051 acceptance tests: product lifecycle end state (PIM-016) —
 * archiving demands discontinued SKUs, archived products refuse new
 * SKUs and re-publishing, and everything is audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 051 — product lifecycle', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s51a', subject: 'idp|s51-admin' });

  let productId = '';
  let skuId = '';

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
      slug: 'test-s51a',
      name: 'Sprint51 Tenant',
      initialAdmin: {
        email: 'admin@s51a.example',
        displayName: 'S51 Admin',
        idpSubject: 'idp|s51-admin',
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'ARC51', name: 'A51' });
    productId = product.body.id as string;
    await api('POST', `/api/v1/products/${productId}/publish`, tokenA);
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId,
      code: 'ARC51-STD',
      name: 'A51 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM-016: archiving refuses while SKUs are still live — and says which', async () => {
    const refused = await api('POST', `/api/v1/products/${productId}/archive`, tokenA);
    expect(refused.status).toBe(409);
    expect(String(refused.body.message)).toContain('ARC51-STD');
  });

  it('PIM-016: after discontinuing, archiving succeeds and the end state holds', async () => {
    await api('POST', `/api/v1/skus/${skuId}/discontinue`, tokenA);
    const archived = await api('POST', `/api/v1/products/${productId}/archive`, tokenA);
    expect(archived.status).toBe(201);
    expect(archived.body.status).toBe('ARCHIVED');

    // No new SKUs, no re-publish, no double archive.
    const newSku = await api('POST', '/api/v1/skus', tokenA, {
      productId,
      code: 'ARC51-NEW',
      name: 'Nope',
      baseUom: 'pcs',
    });
    expect(newSku.status).toBe(409);
    const republish = await api('POST', `/api/v1/products/${productId}/publish`, tokenA);
    expect(republish.status).toBe(409);
    const again = await api('POST', `/api/v1/products/${productId}/archive`, tokenA);
    expect(again.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'product.archive' } });
    expect(audit).not.toBeNull();
  });

  it('AUTHZ: archiving needs product.publish', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s51a', subject: 'idp|s51-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko51@primjer.example',
      displayName: 'Niko51',
      idpSubject: 'idp|s51-nobody',
    });
    const denied = await api('POST', `/api/v1/products/${productId}/archive`, stranger);
    expect(denied.status).toBe(403);
  });
});
