import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 088 acceptance tests: RFQ management (PROC-004) — quotations
 * requested per SKU, supplier offers recorded exactly once, and a
 * single audited award decision.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 088 — RFQ', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s88a', subject: 'idp|s88-admin' });

  let skuId = '';
  let supplierAId = '';
  let supplierBId = '';

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
      `TRUNCATE TABLE "rfq_quote", "rfq",
       "quarantine_hold", "asset", "employee", "contract", "support_case",
       "master_data_request", "break_glass_grant", "loyalty_transaction", "loyalty_account",
       "promotion_redemption", "promotion",
       "serial_number", "bundle_component",
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
      slug: 'test-s88a',
      name: 'Sprint88 Tenant',
      initialAdmin: {
        email: 'admin@s88a.example',
        displayName: 'S88 Admin',
        idpSubject: 'idp|s88-admin',
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'RFQ88',
      name: 'RFQ88 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'RFQ88-STD',
      name: 'RFQ88 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const supplierA = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 88A' });
    supplierAId = supplierA.body.id as string;
    const supplierB = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 88B' });
    supplierBId = supplierB.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PROC-004: RFQ collects supplier quotes and awards one, audited', async () => {
    const created = await api('POST', '/api/v1/rfqs', tokenA, { skuId, quantity: 50 });
    expect(created.status).toBe(201);
    expect(created.body.rfqNumber).toBe('RFQ-000001');
    expect(created.body.status).toBe('DRAFT');
    const rfqId = created.body.id as string;

    // Quotes are only accepted once the RFQ is SENT.
    const early = await api('POST', `/api/v1/rfqs/${rfqId}/quotes`, tokenA, {
      supplierId: supplierAId,
      unitPrice: 9.5,
    });
    expect(early.status).toBe(409);

    const sent = await api('POST', `/api/v1/rfqs/${rfqId}/send`, tokenA);
    expect(sent.body.status).toBe('SENT');

    const quoteA = await api('POST', `/api/v1/rfqs/${rfqId}/quotes`, tokenA, {
      supplierId: supplierAId,
      unitPrice: 9.5,
      leadTimeDays: 14,
    });
    expect(quoteA.status).toBe(201);
    const quoteB = await api('POST', `/api/v1/rfqs/${rfqId}/quotes`, tokenA, {
      supplierId: supplierBId,
      unitPrice: 8.75,
      leadTimeDays: 21,
    });
    expect(quoteB.status).toBe(201);

    // One offer per supplier — a second quote from A is refused.
    const duplicate = await api('POST', `/api/v1/rfqs/${rfqId}/quotes`, tokenA, {
      supplierId: supplierAId,
      unitPrice: 9.0,
    });
    expect(duplicate.status).toBe(409);

    const detail = await api('GET', `/api/v1/rfqs/${rfqId}`, tokenA);
    const quotes = detail.body.quotes as Array<{ id: string; supplierId: string }>;
    expect(quotes).toHaveLength(2);
    const winning = quotes.find((q) => q.supplierId === supplierBId);
    expect(winning).toBeDefined();

    const awarded = await api('POST', `/api/v1/rfqs/${rfqId}/award`, tokenA, {
      quoteId: winning?.id,
    });
    expect(awarded.status).toBe(201);
    expect(awarded.body.status).toBe('AWARDED');
    const awardedQuotes = awarded.body.quotes as Array<{ supplierId: string; awarded: boolean }>;
    expect(awardedQuotes.find((q) => q.supplierId === supplierBId)?.awarded).toBe(true);

    // Awarding twice is refused; the decision is audited.
    const again = await api('POST', `/api/v1/rfqs/${rfqId}/award`, tokenA, {
      quoteId: winning?.id,
    });
    expect(again.status).toBe(409);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'proc.rfq.award' } });
    expect(audit).not.toBeNull();
  });

  it('AUTHZ: RFQ management needs purchase permissions', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s88a', subject: 'idp|s88-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko88@primjer.example',
      displayName: 'Niko88',
      idpSubject: 'idp|s88-nobody',
    });
    const denied = await api('POST', '/api/v1/rfqs', stranger, { skuId, quantity: 1 });
    expect(denied.status).toBe(403);
    const deniedList = await api('GET', '/api/v1/rfqs', stranger);
    expect(deniedList.status).toBe(403);
  });
});
