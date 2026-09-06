import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 060 acceptance tests: replenishment report (WMS-008)
 * — live report of SKUs at or below their reorder point, with the
 * suggested quantity restoring reorder point + safety stock.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 060 — replenishment', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s60a', subject: 'idp|s60-admin' });

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
      slug: 'test-s60a',
      name: 'Sprint60 Tenant',
      initialAdmin: {
        email: 'admin@s60a.example',
        displayName: 'S60 Admin',
        idpSubject: 'idp|s60-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH60',
      name: 'Sprint60 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO60', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO60-STD',
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
      idempotencyKey: 'receipt-PRO60',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE60',
      name: 'S60',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE60-STD',
      name: 'S60 Std',
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

  it('WMS-008: SKUs at or below the reorder point are reported with a suggestion', async () => {
    // plenty: 10 on hand, ROP 3 -> not reported; scarce: 0 on hand, ROP 5, safety 2 -> order 7.
    await api('PUT', '/api/v1/planning/policies', tokenA, {
      skuId,
      reorderPoint: 3,
    });
    await api('PUT', '/api/v1/planning/policies', tokenA, {
      skuId: scarceSkuId,
      reorderPoint: 5,
      safetyStock: 2,
    });
    const report = await api('GET', '/api/v1/planning/replenishment', tokenA);
    expect(report.status).toBe(200);
    const rows = report.body.rows as Array<{
      skuId: string;
      available: number;
      suggestedQty: number;
    }>;
    expect(rows.some((r) => r.skuId === skuId)).toBe(false);
    const scarce = rows.find((r) => r.skuId === scarceSkuId);
    expect(scarce).toBeDefined();
    expect(scarce?.available).toBe(0);
    expect(scarce?.suggestedQty).toBe(7);
  });

  it('WMS-008: reservations reduce availability in the report', async () => {
    // Reserve 8 of 10 -> available 2 <= ROP 3 -> plenty now appears.
    const orderId = await draftOrder(8, 10);
    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    expect(confirmed.status).toBe(201);
    const report = await api('GET', '/api/v1/planning/replenishment', tokenA);
    const plenty = (report.body.rows as Array<{ skuId: string; available: number }>).find(
      (r) => r.skuId === skuId,
    );
    expect(plenty).toBeDefined();
    expect(plenty?.available).toBe(2);
  });

  it('AUTHZ: the report needs plan.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s60a', subject: 'idp|s60-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko60@primjer.example',
      displayName: 'Niko60',
      idpSubject: 'idp|s60-nobody',
    });
    const denied = await api('GET', '/api/v1/planning/replenishment', stranger);
    expect(denied.status).toBe(403);
  });
});
