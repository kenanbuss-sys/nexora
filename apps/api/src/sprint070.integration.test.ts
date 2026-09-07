import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 070 acceptance tests: inventory valuation (FIN-004/005)
 * — standard costs on SKUs, live ledger-based valuation, honest
 * reporting of unvalued stock.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 070 — valuation', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s70a', subject: 'idp|s70-admin' });

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
      slug: 'test-s70a',
      name: 'Sprint70 Tenant',
      initialAdmin: {
        email: 'admin@s70a.example',
        displayName: 'S70 Admin',
        idpSubject: 'idp|s70-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH70',
      name: 'Sprint70 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO70', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO70-STD',
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
      idempotencyKey: 'receipt-PRO70',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE70',
      name: 'S70',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE70-STD',
      name: 'S70 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIN-005: setting a standard cost is validated and audited', async () => {
    const bad = await api('POST', `/api/v1/finance/valuation/skus/${skuId}/cost`, tokenA, {
      cost: -5,
    });
    expect(bad.status).toBe(400);

    const set = await api('POST', `/api/v1/finance/valuation/skus/${skuId}/cost`, tokenA, {
      cost: 12.5,
    });
    expect(set.status).toBe(201);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'fin.sku.standard_cost' } });
    expect(audit).not.toBeNull();
  });

  it('FIN-004: valuation derives from the ledger and reports unvalued SKUs honestly', async () => {
    // plenty: 10 on hand @ 12.50 = 125.00; scarce: 0 on hand, no cost.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: scarceSkuId,
      movementType: 'RECEIPT',
      quantity: 3,
      idempotencyKey: 'receipt-scarce-70',
    });
    const report = await api('GET', '/api/v1/finance/valuation', tokenA);
    expect(report.status).toBe(200);
    const rows = report.body.rows as Array<{
      skuId: string;
      onHand: number;
      value: string | null;
    }>;
    const plenty = rows.find((r) => r.skuId === skuId);
    expect(plenty?.onHand).toBe(10);
    expect(plenty?.value).toBe('125.00');
    const scarce = rows.find((r) => r.skuId === scarceSkuId);
    expect(scarce?.value).toBeNull();
    expect(report.body.unvaluedSkus).toBe(1);
    expect(Number(report.body.totalValue)).toBe(125);
  });

  it('AUTHZ: valuation needs finance permissions', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s70a', subject: 'idp|s70-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko70@primjer.example',
      displayName: 'Niko70',
      idpSubject: 'idp|s70-nobody',
    });
    const deniedRead = await api('GET', '/api/v1/finance/valuation', stranger);
    expect(deniedRead.status).toBe(403);
    const deniedWrite = await api(
      'POST',
      `/api/v1/finance/valuation/skus/${skuId}/cost`,
      stranger,
      { cost: 1 },
    );
    expect(deniedWrite.status).toBe(403);
  });
});
