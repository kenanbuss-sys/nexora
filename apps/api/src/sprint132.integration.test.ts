import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 132 acceptance tests: standard vs actual (FIN-006) — per-SKU
 * variance between the maintained standard cost and the average
 * actually-received purchase price.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 0105 — three-way match', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s132a', subject: 'idp|s132-admin' });

  let warehouseId = '';
  let supplierId = '';
  let skuId = '';
  let poId = '';
  let lineId = '';

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
      `TRUNCATE TABLE "landed_cost", "package_line", "package", "rfq_quote", "rfq",
       "portal_user", "payment", "invoice",
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
      slug: 'test-s132a',
      name: 'Sprint132 Tenant',
      initialAdmin: {
        email: 'admin@s132a.example',
        displayName: 'S132 Admin',
        idpSubject: 'idp|s132-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH132',
      name: 'Sprint132 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 132' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'VAR132',
      name: 'VAR132 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'VAR132-STD',
      name: 'VAR132 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);

    // Requisition below the approval threshold: 10 pcs @ 50 = 500.
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
      estUnitPrice: 50,
    });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, tokenA);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId: requisition.body.id,
      supplierId,
      warehouseId,
    });
    poId = po.body.id as string;
    lineId = (po.body.lines as Array<{ id: string }>)[0]?.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIN-006: variance compares standard cost with actual received price', async () => {
    // Standard cost 45; PO receives 10 @ 50 → actual 50, variance +5 (+11.11%).
    await api('POST', `/api/v1/finance/valuation/skus/${skuId}/cost`, tokenA, { cost: 45 });
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'var132-all',
      lines: [{ lineId, quantity: 10 }],
    });

    const report = await api('GET', '/api/v1/finance/valuation/variance', tokenA);
    expect(report.status).toBe(200);
    const row = (
      report.body.report as Array<{
        code: string;
        standardCost: string;
        actualAvgCost: string | null;
        variance: string | null;
        variancePct: string | null;
      }>
    ).find((r) => r.code === 'VAR132-STD');
    expect(row?.standardCost).toBe('45.00');
    expect(row?.actualAvgCost).toBe('50.0000');
    expect(row?.variance).toBe('5.0000');
    expect(row?.variancePct).toBe('11.11');
  });

  it('FIN-006: SKUs without receipts report no actual', async () => {
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'VAR132B',
      name: 'Bez prijema',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'VAR132B-STD',
      name: 'Bez prijema Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', `/api/v1/finance/valuation/skus/${sku.body.id}/cost`, tokenA, { cost: 10 });
    const report = await api('GET', '/api/v1/finance/valuation/variance', tokenA);
    const row = (report.body.report as Array<{ code: string; actualAvgCost: string | null }>).find(
      (r) => r.code === 'VAR132B-STD',
    );
    expect(row?.actualAvgCost).toBeNull();
  });

  it('AUTHZ: the variance report needs finance.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s132a', subject: 'idp|s132-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko132@primjer.example',
      displayName: 'Niko132',
      idpSubject: 'idp|s132-nobody',
    });
    const denied = await api('GET', '/api/v1/finance/valuation/variance', stranger);
    expect(denied.status).toBe(403);
  });
});
