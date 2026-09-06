import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 059 acceptance tests: repeat order (B2B-008) and line substitution (OMS-007)
 * — duplicating an order into a fresh draft, and swapping lines to
 * configured substitutes, with backorder-clearing reservation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 059 — repeat & substitution', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s59a', subject: 'idp|s59-admin' });

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
      slug: 'test-s59a',
      name: 'Sprint59 Tenant',
      initialAdmin: {
        email: 'admin@s59a.example',
        displayName: 'S59 Admin',
        idpSubject: 'idp|s59-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH59',
      name: 'Sprint59 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO59', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO59-STD',
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
      idempotencyKey: 'receipt-PRO59',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE59',
      name: 'S59',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE59-STD',
      name: 'S59 Std',
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

  it('B2B-008: repeating an order copies lines into a fresh draft', async () => {
    const orderId = await draftOrder(2, 40);
    const repeated = await api('POST', `/api/v1/orders/${orderId}/repeat`, tokenA);
    expect(repeated.status).toBe(201);
    expect(repeated.body.status).toBe('DRAFT');
    expect(repeated.body.id).not.toBe(orderId);
    const lines = repeated.body.lines as Array<{ quantity: string; unitPrice: string }>;
    expect(lines.length).toBe(1);
    expect(Number(lines[0]?.quantity)).toBe(2);
    expect(Number(lines[0]?.unitPrice)).toBe(40);
  });

  it('OMS-007: a draft line swaps to a configured substitute only', async () => {
    const orderId = await draftOrder(1, 30);
    const order = await api('GET', `/api/v1/orders/${orderId}`, tokenA);
    const lineId = (order.body.lines as Array<{ id: string }>)[0]?.id ?? '';

    // Not configured yet -> refused.
    const refused = await api(
      'POST',
      `/api/v1/orders/${orderId}/lines/${lineId}/substitute`,
      tokenA,
      { substituteSkuId: scarceSkuId },
    );
    expect(refused.status).toBe(400);

    await api('POST', `/api/v1/skus/${skuId}/substitutions`, tokenA, {
      substituteSkuId: scarceSkuId,
    });
    const swapped = await api(
      'POST',
      `/api/v1/orders/${orderId}/lines/${lineId}/substitute`,
      tokenA,
      { substituteSkuId: scarceSkuId },
    );
    expect(swapped.status).toBe(201);
    const lines = swapped.body.lines as Array<{ skuId: string }>;
    expect(lines[0]?.skuId).toBe(scarceSkuId);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'oms.order.substitute_line' },
    });
    expect(audit).not.toBeNull();
  });

  it('OMS-007: a backordered confirmed line substitutes and reserves when stock covers', async () => {
    // scarceSku has no stock; order it, confirm with backorder.
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId: scarceSkuId,
      quantity: 2,
      unitPrice: 15,
    });
    const confirmed = await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA, {
      allowBackorder: true,
    });
    expect(confirmed.status).toBe(201);

    // Configure the substitution scarce -> plenty and swap.
    await api('POST', `/api/v1/skus/${scarceSkuId}/substitutions`, tokenA, {
      substituteSkuId: skuId,
    });
    const view = await api('GET', `/api/v1/orders/${order.body.id}`, tokenA);
    const line = (view.body.lines as Array<{ id: string; backordered: boolean }>)[0];
    expect(line?.backordered).toBe(true);
    const swapped = await api(
      'POST',
      `/api/v1/orders/${order.body.id}/lines/${line?.id ?? ''}/substitute`,
      tokenA,
      { substituteSkuId: skuId },
    );
    expect(swapped.status).toBe(201);
    const after = (swapped.body.lines as Array<{ backordered: boolean; reservationId: string }>)[0];
    expect(after?.backordered).toBe(false);
    expect(after?.reservationId).toBeTruthy();
  });

  it('AUTHZ: repeating and substituting need order.create', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s59a', subject: 'idp|s59-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko59@primjer.example',
      displayName: 'Niko59',
      idpSubject: 'idp|s59-nobody',
    });
    const orderId = await draftOrder(1, 10);
    const denied = await api('POST', `/api/v1/orders/${orderId}/repeat`, stranger);
    expect(denied.status).toBe(403);
  });
});
