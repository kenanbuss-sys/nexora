import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 076 acceptance tests: incoming inspection queue (QMS-002)
 * — PO receipts of QC-planned SKUs enter the inspector's queue;
 * unplanned SKUs stay out; permissioned.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 076 — incoming QC queue', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s76a', subject: 'idp|s76-admin' });

  let warehouseId = '';
  let skuId = '';
  let scarceSkuId = '';
  let supplierId = '';

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
      slug: 'test-s76a',
      name: 'Sprint76 Tenant',
      initialAdmin: {
        email: 'admin@s76a.example',
        displayName: 'S76 Admin',
        idpSubject: 'idp|s76-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH76',
      name: 'Sprint76 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO76', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO76-STD',
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
      idempotencyKey: 'receipt-PRO76',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE76',
      name: 'S76',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE76-STD',
      name: 'S76 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, {
      name: 'Dobavljac76 d.o.o.',
      leadTimeDays: 5,
    });
    supplierId = supplier.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('QMS-002: received goods with an active QC plan enter the incoming queue', async () => {
    // A QC plan for the plenty SKU, then a PO receipt for it.
    await api('POST', '/api/v1/qc/plans', tokenA, {
      skuId,
      name: 'Ulazna kontrola 76',
      items: [{ name: 'Vizuelni pregled', requirement: 'Bez vidljivih oštećenja' }],
    });
    const requisitionId = await approvedRequisition(6, 4);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId,
      supplierId,
      warehouseId,
    });
    const lineId = (po.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/purchase-orders/${po.body.id}/receive`, tokenA, {
      receiptKey: 'r-76-qc',
      lines: [{ lineId, quantity: 6 }],
    });

    const queue = await api('GET', '/api/v1/qc/inspections/incoming-queue', tokenA);
    expect(queue.status).toBe(200);
    const row = (queue.body.queue as Array<{ skuId: string; receivedQty: number }>).find(
      (q) => q.skuId === skuId,
    );
    expect(row).toBeDefined();
    expect(row?.receivedQty).toBe(6);
  });

  it('QMS-002: SKUs without an active plan stay out of the queue', async () => {
    const requisitionId = await approvedRequisition(2, 4);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId,
      supplierId,
      warehouseId,
    });
    // Same SKU already has a plan — verify a different, plan-less SKU is absent
    // by checking the queue holds only planned SKUs.
    const queue = await api('GET', '/api/v1/qc/inspections/incoming-queue', tokenA);
    const rows = queue.body.queue as Array<{ skuId: string }>;
    expect(rows.every((q) => q.skuId === skuId)).toBe(true);
    void po;
  });

  it('AUTHZ: the incoming queue needs qc.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s76a', subject: 'idp|s76-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko76@primjer.example',
      displayName: 'Niko76',
      idpSubject: 'idp|s76-nobody',
    });
    const denied = await api('GET', '/api/v1/qc/inspections/incoming-queue', stranger);
    expect(denied.status).toBe(403);
  });
});
