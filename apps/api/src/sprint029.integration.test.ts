import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 029 acceptance tests: supplier performance read model
 * (PROC-012) and one-click purchase suggestions → requisitions
 * (PROC-015).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 029 — procurement depth', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s29a', subject: 'idp|s29-admin' });

  let warehouseId = '';
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
      `TRUNCATE TABLE "return_order_line", "return_order", "product_category",
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
      slug: 'test-s29a',
      name: 'Sprint29 Tenant',
      initialAdmin: {
        email: 'admin@s29a.example',
        displayName: 'S29 Admin',
        idpSubject: 'idp|s29-admin',
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PROC29', name: 'P29' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PROC29-STD',
      name: 'P29 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH29',
      name: 'Sprint29 warehouse',
    });
    warehouseId = warehouse.body.id as string;

    // A supplier with one partially received PO: 10 ordered @ 4, 6 received.
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, {
      name: 'Dvadesetdevet Uvoz d.o.o.',
    });
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
      estUnitPrice: 4,
    });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, tokenA);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId: requisition.body.id,
      supplierId: supplier.body.id,
      warehouseId,
    });
    const poLine = (po.body.lines as Array<{ id: string }>)[0]!;
    await api('POST', `/api/v1/purchase-orders/${po.body.id}/receive`, tokenA, {
      receiptKey: 'r29-1',
      lines: [{ lineId: poLine.id, quantity: 6 }],
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PROC-012: supplier performance derives from POs and receipts', async () => {
    const performance = await api('GET', '/api/v1/suppliers/performance', tokenA);
    expect(performance.status).toBe(200);
    const row = (
      performance.body.suppliers as Array<{
        supplierName: string;
        poCount: number;
        spend: string;
        fillRatePct: string;
        avgReceiptDays: string | null;
      }>
    )[0]!;
    expect(row.supplierName).toBe('Dvadesetdevet Uvoz d.o.o.');
    expect(row.poCount).toBe(1);
    expect(row.spend).toBe('24.00');
    expect(row.fillRatePct).toBe('60.0');
    expect(row.avgReceiptDays).not.toBeNull();
  });

  it('PROC-015: a purchase suggestion becomes a priced draft requisition', async () => {
    // Planning policy demanding stock (safety 50, on hand 6) then MRP.
    await api('PUT', '/api/v1/planning/policies', tokenA, {
      skuId,
      safetyStock: 50,
      reorderPoint: 50,
      leadTimeDays: 7,
    });
    const run = await api('POST', '/api/v1/planning/runs', tokenA);
    const suggestions = (run.body.suggestions ?? []) as Array<{
      id: string;
      suggestionType: string;
    }>;
    const purchase = suggestions.find((s) => s.suggestionType === 'PURCHASE');
    expect(purchase).toBeDefined();

    const requisition = await api('POST', '/api/v1/requisitions/from-suggestion', tokenA, {
      suggestionId: purchase!.id,
    });
    expect(requisition.status).toBe(201);
    expect(requisition.body.status).toBe('DRAFT');
    const lines = requisition.body.lines as Array<{ estUnitPrice: string; quantity: string }>;
    expect(lines.length).toBe(1);
    // Priced from the last purchase order line (4.00).
    expect(Number(lines[0]?.estUnitPrice)).toBe(4);
  });

  it('AUTH: suggestion conversion needs purchase.request', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s29a', subject: 'idp|s29-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko29@primjer.example',
      displayName: 'Niko29',
      idpSubject: 'idp|s29-nobody',
    });
    const denied = await api('POST', '/api/v1/requisitions/from-suggestion', stranger, {
      suggestionId: '00000000-0000-0000-0000-000000000001',
    });
    expect(denied.status).toBe(403);
  });
});
