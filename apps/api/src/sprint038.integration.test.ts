import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 038 acceptance tests: approval authority matrix (IAM-009/PROC-003)
 * — the requisition approval threshold comes from versioned tenant
 * configuration, with safe fallbacks and tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 038 — configurable approval threshold', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s38a', subject: 'idp|s38-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s38b', subject: 'idp|s38b-admin' });

  let skuA = '';
  let skuB = '';

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

  async function makeSku(token: string, code: string): Promise<string> {
    const product = await api('POST', '/api/v1/products', token, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', token, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, token);
    return sku.body.id as string;
  }

  async function submitRequisition(token: string, skuId: string, total: number) {
    const requisition = await api('POST', '/api/v1/requisitions', token, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, token, {
      skuId,
      quantity: 1,
      estUnitPrice: total,
    });
    return api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, token);
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
      ['test-s38a', 'idp|s38-admin'],
      ['test-s38b', 'idp|s38b-admin'],
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
    skuA = await makeSku(tokenA, 'S38A');
    skuB = await makeSku(tokenB, 'S38B');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PROC-003: the default threshold (1000) applies with no configuration', async () => {
    const small = await submitRequisition(tokenA, skuA, 200);
    expect(small.body.status).toBe('APPROVED');

    const large = await submitRequisition(tokenA, skuA, 2000);
    expect(large.body.status).toBe('PENDING_APPROVAL');
  });

  it('IAM-009: a published policy lowers the threshold for this tenant only', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { approvals: { requisitionThreshold: 100 } },
    });

    const nowRouted = await submitRequisition(tokenA, skuA, 200);
    expect(nowRouted.body.status).toBe('PENDING_APPROVAL');
    // The approval title carries the effective threshold (audit trail).
    const approval = await prisma.approval.findFirst({
      where: { id: nowRouted.body.approvalId as string },
    });
    expect(approval?.title).toContain('threshold 100');

    // The other tenant still runs on the default.
    const other = await submitRequisition(tokenB, skuB, 200);
    expect(other.body.status).toBe('APPROVED');
  });

  it('IAM-009: raising the threshold auto-approves below it; junk config falls back', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { approvals: { requisitionThreshold: 50_000 } },
    });
    const big = await submitRequisition(tokenA, skuA, 20_000);
    expect(big.body.status).toBe('APPROVED');

    // A corrupt value falls back to the built-in default (1000).
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { approvals: { requisitionThreshold: 'many' } },
    });
    const fallback = await submitRequisition(tokenA, skuA, 2000);
    expect(fallback.body.status).toBe('PENDING_APPROVAL');
  });
});
