import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 069 acceptance tests: SLA monitoring (WF-004/OMS-014)
 * — overdue unfulfilled orders and rotting approvals surface with
 * their age; both reports are permissioned.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 069 — SLA monitoring', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s69a', subject: 'idp|s69-admin' });

  let warehouseId = '';
  let skuId = '';
  let scarceSkuId = '';
  let accountId = '';

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
      slug: 'test-s69a',
      name: 'Sprint69 Tenant',
      initialAdmin: {
        email: 'admin@s69a.example',
        displayName: 'S69 Admin',
        idpSubject: 'idp|s69-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH69',
      name: 'Sprint69 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO69', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO69-STD',
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
      idempotencyKey: 'receipt-PRO69',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE69',
      name: 'S69',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE69-STD',
      name: 'S69 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac SLA69',
      company: 'SLA69 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('OMS-014: a stale confirmed order shows as overdue; fresh ones do not', async () => {
    const orderId = await draftOrder(1, 20);
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    // Backdate the order 5 days directly in the DB (test-only time travel).
    await prisma.salesOrder.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 5 * 86_400_000) },
    });

    const report = await api('GET', '/api/v1/orders/overdue?days=3', tokenA);
    expect(report.status).toBe(200);
    const row = (report.body.orders as Array<{ id: string; ageDays: number }>).find(
      (o) => o.id === orderId,
    );
    expect(row).toBeDefined();
    expect(row?.ageDays).toBeGreaterThanOrEqual(5);

    const strict = await api('GET', '/api/v1/orders/overdue?days=30', tokenA);
    const none = (strict.body.orders as Array<{ id: string }>).find((o) => o.id === orderId);
    expect(none).toBeUndefined();
  });

  it('WF-004: a rotting approval shows as overdue', async () => {
    // Force an approval through procurement: a requisition above the threshold.
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: 100,
      estUnitPrice: 100,
    });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, tokenA);

    // Backdate the pending approval (test-only time travel).
    await prisma.approval.updateMany({
      where: { status: 'REQUESTED' },
      data: { createdAt: new Date(Date.now() - 48 * 3_600_000) },
    });

    const report = await api('GET', '/api/v1/approvals/overdue?hours=24', tokenA);
    expect(report.status).toBe(200);
    const rows = report.body.approvals as Array<{ ageHours: number }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.ageHours).toBeGreaterThanOrEqual(48);
  });

  it('AUTHZ: SLA reports are permissioned', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s69a', subject: 'idp|s69-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko69@primjer.example',
      displayName: 'Niko69',
      idpSubject: 'idp|s69-nobody',
    });
    const deniedOrders = await api('GET', '/api/v1/orders/overdue', stranger);
    expect(deniedOrders.status).toBe(403);
    const deniedApprovals = await api('GET', '/api/v1/approvals/overdue', stranger);
    expect(deniedApprovals.status).toBe(403);
  });
});
