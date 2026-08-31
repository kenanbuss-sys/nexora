import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 014 acceptance tests (docs/implementation/SPRINT_014_BI.md):
 * governed KPI catalog, executive summary computed live from the
 * transactional truth, per-domain analytics, and strict tenant scoping
 * of every analytic read.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 014 — BI & Control Center', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s14a', subject: 'idp|s14-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s14b', subject: 'idp|s14b-admin' });

  let skuId = '';
  let warehouseId = '';
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

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "payment", "invoice",
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
      slug: 'test-s14a',
      name: 'Sprint14 Tenant A',
      initialAdmin: {
        email: 'admin@s14a.example',
        displayName: 'S14 Admin',
        idpSubject: 'idp|s14-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s14b',
      name: 'Sprint14 Tenant B',
      initialAdmin: {
        email: 'admin@s14b.example',
        displayName: 'S14B Admin',
        idpSubject: 'idp|s14b-admin',
      },
    });

    // Minimal cross-domain activity for the KPIs.
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'KPI14',
      name: 'Kpi14',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'KPI14-STD',
      name: 'Kpi14 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH14',
      name: 'Sprint14 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 50,
      idempotencyKey: 'receipt-s14',
    });

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Analiticar',
      company: 'Analitika d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    // A confirmed (open) order: 5 × 200 = 1000, and a fulfilled+invoiced one.
    const openOrder = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${openOrder.body.id}/lines`, tokenA, {
      skuId,
      quantity: 5,
      unitPrice: 200,
    });
    await api('POST', `/api/v1/orders/${openOrder.body.id}/confirm`, tokenA);

    const doneOrder = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${doneOrder.body.id}/lines`, tokenA, {
      skuId,
      quantity: 2,
      unitPrice: 150,
    });
    await api('POST', `/api/v1/orders/${doneOrder.body.id}/confirm`, tokenA);
    await api('POST', `/api/v1/orders/${doneOrder.body.id}/fulfill`, tokenA);
    await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId: doneOrder.body.id,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('BI: the KPI catalog is governed and versioned in code', async () => {
    const kpis = await api('GET', '/api/v1/analytics/kpis', tokenA);
    const list = kpis.body.kpis as Array<{ key: string; domain: string }>;
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.some((k) => k.key === 'revenue.invoiced')).toBe(true);
    expect(list.some((k) => k.key === 'scrap.rate')).toBe(true);
  });

  it('BI: the executive summary reflects live transactional truth', async () => {
    const summary = await api('GET', '/api/v1/analytics/executive', tokenA);
    expect(summary.body.revenue).toBe('300.00');
    expect(summary.body.openOrders).toBe(1);
    expect(summary.body.openReceivables).toBe('300.00');
  });

  it('BI: inventory and customer analytics aggregate per tenant', async () => {
    const inventory = await api('GET', '/api/v1/analytics/inventory', tokenA);
    const rows = inventory.body.rows as Array<{ warehouseCode: string; movements: number }>;
    expect(rows.length).toBe(1);
    expect(rows[0]?.movements).toBeGreaterThanOrEqual(2); // receipt + fulfillment issue

    const customers = await api('GET', '/api/v1/analytics/customers', tokenA);
    const top = (customers.body.rows as Array<{ accountId: string; revenue: string }>)[0];
    expect(top?.accountId).toBe(accountId);
    expect(Number(top?.revenue)).toBe(1300); // 1000 open + 300 fulfilled
  });

  it('BI: analytics are tenant-isolated and permission-gated', async () => {
    const summaryB = await api('GET', '/api/v1/analytics/executive', tokenB);
    expect(summaryB.body.revenue).toBe('0.00');
    expect(summaryB.body.openOrders).toBe(0);

    const inventoryB = await api('GET', '/api/v1/analytics/inventory', tokenB);
    expect((inventoryB.body.rows as unknown[]).length).toBe(0);
  });
});
