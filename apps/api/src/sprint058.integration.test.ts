import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 058 acceptance tests: promise dates (CPQ-013/PLAN-015)
 * — lines covered by stock promise next-day; short lines derive from
 * the SKU's planning lead time; the order promise is the latest line.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 058 — promise dates', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s58a', subject: 'idp|s58-admin' });

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
      slug: 'test-s58a',
      name: 'Sprint58 Tenant',
      initialAdmin: {
        email: 'admin@s58a.example',
        displayName: 'S58 Admin',
        idpSubject: 'idp|s58-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH58',
      name: 'Sprint58 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO58', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO58-STD',
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
      idempotencyKey: 'receipt-PRO58',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE58',
      name: 'S58',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE58-STD',
      name: 'S58 Std',
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

  it('CPQ-013: a line covered by stock promises next-day', async () => {
    const orderId = await draftOrder(2, 50);
    const promise = await api('GET', `/api/v1/orders/${orderId}/promise`, tokenA);
    expect(promise.status).toBe(200);
    const lines = promise.body.lines as Array<{ fromStock: boolean; promisedAt: string }>;
    expect(lines[0]?.fromStock).toBe(true);
    const days = (new Date(lines[0]?.promisedAt ?? 0).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(0.9);
    expect(days).toBeLessThan(1.1);
  });

  it('CPQ-013: a short line derives from the planning lead time; order takes the latest', async () => {
    await api('PUT', '/api/v1/planning/policies', tokenA, {
      skuId: scarceSkuId,
      leadTimeDays: 10,
    });
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity: 1,
      unitPrice: 50,
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId: scarceSkuId,
      quantity: 5,
      unitPrice: 20,
    });
    const promise = await api('GET', `/api/v1/orders/${order.body.id}/promise`, tokenA);
    expect(promise.status).toBe(200);
    const lines = promise.body.lines as Array<{
      fromStock: boolean;
      leadTimeDays: number;
      promisedAt: string;
    }>;
    const scarce = lines.find((l) => !l.fromStock);
    expect(scarce?.leadTimeDays).toBe(10);
    const orderDays =
      (new Date(promise.body.orderPromise as string).getTime() - Date.now()) / 86_400_000;
    expect(orderDays).toBeGreaterThan(10.5);
    expect(orderDays).toBeLessThan(11.5);
  });

  it('CPQ-013: without a policy a short line falls back to the 3-day buffer', async () => {
    const bare = await api('POST', '/api/v1/products', tokenA, { code: 'BARE58', name: 'B58' });
    const bareSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: bare.body.id,
      code: 'BARE58-STD',
      name: 'B58 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${bareSku.body.id}/activate`, tokenA);
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId: bareSku.body.id,
      quantity: 1,
      unitPrice: 5,
    });
    const promise = await api('GET', `/api/v1/orders/${order.body.id}/promise`, tokenA);
    const days =
      (new Date(promise.body.orderPromise as string).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.5);
    expect(days).toBeLessThan(3.5);
  });

  it('AUTHZ: promise dates need order.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s58a', subject: 'idp|s58-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko58@primjer.example',
      displayName: 'Niko58',
      idpSubject: 'idp|s58-nobody',
    });
    const orderId = await draftOrder(1, 10);
    const denied = await api('GET', `/api/v1/orders/${orderId}/promise`, stranger);
    expect(denied.status).toBe(403);
  });
});
