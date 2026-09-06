import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 063 acceptance tests: supplier lead times (PROC-007)
 * — PO expected dates defaulting from supplier lead time, and the
 * on-time delivery report per supplier.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 063 — supplier lead times', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s63a', subject: 'idp|s63-admin' });

  let warehouseId = '';
  let skuId = '';
  let scarceSkuId = '';
  let supplierId = '';
  let poId = '';
  let poLineId = '';

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

  async function approvedRequisition(qty: number, price: number): Promise<string> {
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: qty,
      estUnitPrice: price,
    });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, tokenA);
    return requisition.body.id as string;
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
      slug: 'test-s63a',
      name: 'Sprint63 Tenant',
      initialAdmin: {
        email: 'admin@s63a.example',
        displayName: 'S63 Admin',
        idpSubject: 'idp|s63-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH63',
      name: 'Sprint63 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO63', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO63-STD',
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
      idempotencyKey: 'receipt-PRO63',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE63',
      name: 'S63',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE63-STD',
      name: 'S63 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, {
      name: 'Dobavljac63 d.o.o.',
      leadTimeDays: 7,
    });
    supplierId = supplier.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PROC-007: a PO without an explicit promise defaults from the supplier lead time', async () => {
    const requisitionId = await approvedRequisition(5, 10);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId,
      supplierId,
      warehouseId,
    });
    expect(po.status).toBe(201);
    poId = po.body.id as string;
    poLineId = (po.body.lines as Array<{ id: string }>)[0]?.id as string;
    expect(po.body.expectedAt).toBeTruthy();
    const days = (new Date(po.body.expectedAt as string).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.5);
    expect(days).toBeLessThan(7.5);
  });

  it('PROC-007: an explicit promise wins over the default', async () => {
    const requisitionId = await approvedRequisition(2, 10);
    const explicit = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId,
      supplierId,
      warehouseId,
      expectedAt: explicit,
    });
    expect(po.body.expectedAt).toBe(explicit);
  });

  it('PROC-007: on-time delivery report counts fully received POs against their promise', async () => {
    // Receive the first PO fully — well before its 7-day promise.
    const received = await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'r-63-full',
      lines: [{ lineId: poLineId, quantity: 5 }],
    });
    expect(received.body.status).toBe('RECEIVED');

    const report = await api('GET', '/api/v1/suppliers/delivery-performance', tokenA);
    expect(report.status).toBe(200);
    const row = (
      report.body.suppliers as Array<{
        supplierId: string;
        receivedCount: number;
        onTimeCount: number;
        onTimePct: number | null;
      }>
    ).find((r) => r.supplierId === supplierId);
    expect(row).toBeDefined();
    expect(row?.receivedCount).toBe(1);
    expect(row?.onTimeCount).toBe(1);
    expect(row?.onTimePct).toBe(100);
  });

  it('AUTHZ: the delivery report needs purchase.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s63a', subject: 'idp|s63-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko63@primjer.example',
      displayName: 'Niko63',
      idpSubject: 'idp|s63-nobody',
    });
    const denied = await api('GET', '/api/v1/suppliers/delivery-performance', stranger);
    expect(denied.status).toBe(403);
  });
});
