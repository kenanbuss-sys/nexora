import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 077 acceptance tests: material check (VER-007/011)
 * — scan-first barcode-vs-expected-SKU verification with quantity
 * comparison, honest mismatches, audited trail.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 077 — material check', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s77a', subject: 'idp|s77-admin' });

  let warehouseId = '';
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
      slug: 'test-s77a',
      name: 'Sprint77 Tenant',
      initialAdmin: {
        email: 'admin@s77a.example',
        displayName: 'S77 Admin',
        idpSubject: 'idp|s77-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH77',
      name: 'Sprint77 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO77', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO77-STD',
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
      idempotencyKey: 'receipt-PRO77',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE77',
      name: 'S77',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE77-STD',
      name: 'S77 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('VER-007: a matching barcode verifies and the check is audited', async () => {
    await api('POST', '/api/v1/barcodes', tokenA, { skuId, value: '3859890077001' });
    const check = await api('POST', '/api/v1/scan-events/material-check', tokenA, {
      expectedSkuId: skuId,
      barcode: '3859890077001',
    });
    expect(check.status).toBe(201);
    expect(check.body.skuMatch).toBe(true);
    expect(check.body.resolvedSkuId).toBe(skuId);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'ver.material_check' } });
    expect(audit).not.toBeNull();
  });

  it('VER-007: a foreign or unknown barcode reports MISMATCH honestly', async () => {
    await api('POST', '/api/v1/barcodes', tokenA, { skuId: scarceSkuId, value: '3859890077002' });
    const wrong = await api('POST', '/api/v1/scan-events/material-check', tokenA, {
      expectedSkuId: skuId,
      barcode: '3859890077002',
    });
    expect(wrong.body.skuMatch).toBe(false);
    expect(wrong.body.resolvedSkuId).toBe(scarceSkuId);

    const unknown = await api('POST', '/api/v1/scan-events/material-check', tokenA, {
      expectedSkuId: skuId,
      barcode: 'NEPOSTOJECI-KOD',
    });
    expect(unknown.body.skuMatch).toBe(false);
    expect(unknown.body.resolvedSkuId).toBeNull();
  });

  it('VER-011: quantity checks compare expected vs counted', async () => {
    const check = await api('POST', '/api/v1/scan-events/material-check', tokenA, {
      expectedSkuId: skuId,
      barcode: '3859890077001',
      expectedQty: 10,
      countedQty: 9,
    });
    expect(check.body.qtyMatch).toBe(false);
    const ok = await api('POST', '/api/v1/scan-events/material-check', tokenA, {
      expectedSkuId: skuId,
      barcode: '3859890077001',
      expectedQty: 10,
      countedQty: 10,
    });
    expect(ok.body.qtyMatch).toBe(true);
  });

  it('AUTHZ: material checks need inventory.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s77a', subject: 'idp|s77-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko77@primjer.example',
      displayName: 'Niko77',
      idpSubject: 'idp|s77-nobody',
    });
    const denied = await api('POST', '/api/v1/scan-events/material-check', stranger, {
      expectedSkuId: skuId,
      barcode: 'x',
    });
    expect(denied.status).toBe(403);
  });
});
