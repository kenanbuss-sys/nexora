import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 062 acceptance tests: loyalty (COM-013)
 * — idempotent point accrual on fulfillment, audited manual
 * adjustments with a non-negative balance, zero for fresh accounts.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 062 — loyalty', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s62a', subject: 'idp|s62-admin' });

  let warehouseId = '';
  let accountId = '';
  let skuId = '';
  let scarceSkuId = '';

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

  async function draftOrder(quantity: number, unitPrice: number): Promise<string> {
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity,
      unitPrice,
    });
    return order.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "serial_number", "bundle_component",
       "promotion_redemption", "promotion",
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
      slug: 'test-s62a',
      name: 'Sprint62 Tenant',
      initialAdmin: {
        email: 'admin@s62a.example',
        displayName: 'S62 Admin',
        idpSubject: 'idp|s62-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH62',
      name: 'Sprint62 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO62', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO62-STD',
      name: 'P53 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-PRO62',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE62',
      name: 'S62',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE62-STD',
      name: 'S62 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Pedesettri',
      company: 'Pedesettri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('COM-013: fulfillment awards points once — retries never double-award', async () => {
    const orderId = await draftOrder(2, 100); // total 200 -> 20 points
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    const fulfilled = await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    expect(fulfilled.status).toBe(201);

    const loyalty = await api('GET', `/api/v1/crm/accounts/${accountId}/loyalty`, tokenA);
    expect(loyalty.status).toBe(200);
    expect(loyalty.body.points).toBe(20);

    // A second fulfillment attempt conflicts, and points stay put.
    const again = await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    expect(again.status).toBe(409);
    const after = await api('GET', `/api/v1/crm/accounts/${accountId}/loyalty`, tokenA);
    expect(after.body.points).toBe(20);
  });

  it('COM-013: manual adjustments are audited and the balance never goes negative', async () => {
    const adjusted = await api('POST', `/api/v1/crm/accounts/${accountId}/loyalty/adjust`, tokenA, {
      delta: 5,
      reason: 'Welcome bonus',
    });
    expect(adjusted.status).toBe(201);
    expect(adjusted.body.points).toBe(25);

    const tooMuch = await api('POST', `/api/v1/crm/accounts/${accountId}/loyalty/adjust`, tokenA, {
      delta: -100,
      reason: 'Should fail',
    });
    expect(tooMuch.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'crm.loyalty.adjust' } });
    expect(audit).not.toBeNull();
  });

  it('COM-013: an account with no history reads zero', async () => {
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Bez62',
      company: 'Bez62 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const loyalty = await api(
      'GET',
      `/api/v1/crm/accounts/${converted.body.accountId}/loyalty`,
      tokenA,
    );
    expect(loyalty.status).toBe(200);
    expect(loyalty.body.points).toBe(0);
  });

  it('AUTHZ: adjusting needs crm.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s62a', subject: 'idp|s62-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko62@primjer.example',
      displayName: 'Niko62',
      idpSubject: 'idp|s62-nobody',
    });
    const denied = await api('POST', `/api/v1/crm/accounts/${accountId}/loyalty/adjust`, stranger, {
      delta: 1000,
      reason: 'hak',
    });
    expect(denied.status).toBe(403);
  });
});
