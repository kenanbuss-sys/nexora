import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 013 acceptance tests (docs/implementation/SPRINT_013_FINANCE.md):
 * AR invoices from fulfilled orders (exactly once), AP from received
 * POs, guarded payment matching with overpayment refusal, COGS/margin
 * from received purchase prices, and the operational P&L snapshot.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 013 — Finance', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s13a', subject: 'idp|s13-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s13b', subject: 'idp|s13b-admin' });

  let skuId = '';
  let warehouseId = '';
  let accountId = '';
  let fulfilledOrderId = '';
  let receivedPoId = '';

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
      slug: 'test-s13a',
      name: 'Sprint13 Tenant A',
      initialAdmin: {
        email: 'admin@s13a.example',
        displayName: 'S13 Admin',
        idpSubject: 'idp|s13-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s13b',
      name: 'Sprint13 Tenant B',
      initialAdmin: {
        email: 'admin@s13b.example',
        displayName: 'S13B Admin',
        idpSubject: 'idp|s13b-admin',
      },
    });

    // SKU, warehouse.
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'GOOD13',
      name: 'Good13',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'GOOD13-STD',
      name: 'Good13 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH13',
      name: 'Sprint13 warehouse',
    });
    warehouseId = warehouse.body.id as string;

    // Supplier + received PO at 40/unit (COGS source): 50 units.
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Uvoznik d.o.o.' });
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: 20,
      estUnitPrice: 40,
    });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, tokenA);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId: requisition.body.id,
      supplierId: supplier.body.id,
      warehouseId,
    });
    receivedPoId = po.body.id as string;
    const poLine = (po.body.lines as Array<{ id: string }>)[0]!;
    await api('POST', `/api/v1/purchase-orders/${receivedPoId}/receive`, tokenA, {
      receiptKey: 'r13-1',
      lines: [{ lineId: poLine.id, quantity: 20 }],
    });

    // Customer account + fulfilled order: 10 units at 100.
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Trinaest',
      company: 'Kupac13 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    fulfilledOrderId = order.body.id as string;
    await api('POST', `/api/v1/orders/${fulfilledOrderId}/lines`, tokenA, {
      skuId,
      quantity: 10,
      unitPrice: 100,
    });
    await api('POST', `/api/v1/orders/${fulfilledOrderId}/confirm`, tokenA);
    await api('POST', `/api/v1/orders/${fulfilledOrderId}/fulfill`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIN: a fulfilled order is invoiced exactly once', async () => {
    const invoice = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId: fulfilledOrderId,
      dueInDays: 30,
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoiceNumber).toMatch(/^INV-/);
    expect(invoice.body.total).toBe('1000');

    const again = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId: fulfilledOrderId,
    });
    expect(again.status).toBe(409);

    // A draft order cannot be invoiced.
    const draft = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    const refused = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId: draft.body.id,
    });
    expect(refused.status).toBe(409);

    const issued = await prisma.outboxEvent.count({
      where: { eventType: 'invoice.issued' },
    });
    expect(issued).toBeGreaterThanOrEqual(1);
  });

  it('FIN: supplier invoices come from received POs', async () => {
    const invoice = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId: receivedPoId,
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoiceNumber).toMatch(/^SUPINV-/);
    expect(invoice.body.total).toBe('800'); // 20 × 40
  });

  it('FIN: payments match partially, refuse overpayment, and close the invoice', async () => {
    const invoices = await api('GET', '/api/v1/finance/invoices?type=CUSTOMER', tokenA);
    const invoice = (invoices.body.invoices as Array<{ id: string; total: string }>)[0]!;

    const partial = await api('POST', `/api/v1/finance/invoices/${invoice.id}/payments`, tokenA, {
      amount: 400,
    });
    expect(partial.body.status).toBe('PARTIALLY_PAID');
    expect(partial.body.paidAmount).toBe('400');

    const over = await api('POST', `/api/v1/finance/invoices/${invoice.id}/payments`, tokenA, {
      amount: 700,
    });
    expect(over.status).toBe(400);

    const rest = await api('POST', `/api/v1/finance/invoices/${invoice.id}/payments`, tokenA, {
      amount: 600,
    });
    expect(rest.body.status).toBe('PAID');

    const closed = await api('POST', `/api/v1/finance/invoices/${invoice.id}/payments`, tokenA, {
      amount: 1,
    });
    expect(closed.status).toBe(409);

    const matched = await prisma.outboxEvent.count({ where: { eventType: 'payment.matched' } });
    expect(matched).toBe(2);
  });

  it('FIN: margin uses average received purchase cost as COGS', async () => {
    const margin = await api('GET', '/api/v1/finance/margin', tokenA);
    const rows = margin.body.rows as Array<{
      orderId: string;
      revenue: string;
      cogs: string;
      margin: string;
    }>;
    const row = rows.find((r) => r.orderId === fulfilledOrderId);
    expect(row?.revenue).toBe('1000.00');
    expect(row?.cogs).toBe('400.00'); // 10 × avg cost 40
    expect(row?.margin).toBe('600.00');
  });

  it('FIN: the P&L snapshot aggregates AR/AP and cash', async () => {
    const pnl = await api('GET', '/api/v1/finance/pnl', tokenA);
    expect(pnl.body.revenue).toBe('1000.00');
    expect(pnl.body.expenses).toBe('800.00');
    expect(pnl.body.grossResult).toBe('200.00');
    expect(pnl.body.cashIn).toBe('1000.00');
    expect(pnl.body.cashOut).toBe('0.00');
    expect(pnl.body.openPayables).toBe('800.00');
  });

  it('TENANCY: finance data is invisible across tenants', async () => {
    const invoices = await api('GET', '/api/v1/finance/invoices', tokenB);
    expect((invoices.body.invoices as unknown[]).length).toBe(0);
    const pnl = await api('GET', '/api/v1/finance/pnl', tokenB);
    expect(pnl.body.revenue).toBe('0.00');
  });
});
