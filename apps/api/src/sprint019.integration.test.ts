import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 019 acceptance tests: cost centers (FIN-016), budgets vs
 * actuals (FIN-008), AR/AP aging buckets (FIN-011/012) and the monthly
 * cash-flow read model (FIN-010).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 019 — financial depth', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s19a', subject: 'idp|s19-admin' });

  let accountId = '';
  let warehouseId = '';
  let skuId = '';
  let supplierId = '';
  let costCenterId = '';
  let apInvoiceId = '';

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
      `TRUNCATE TABLE "budget", "cost_center",
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
      slug: 'test-s19a',
      name: 'Sprint19 Tenant',
      initialAdmin: {
        email: 'admin@s19a.example',
        displayName: 'S19 Admin',
        idpSubject: 'idp|s19-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH19',
      name: 'Sprint19 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'FIN19', name: 'F19' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN19-STD',
      name: 'F19 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 100,
      idempotencyKey: 'receipt-s19',
    });

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devetnaest',
      company: 'Devetnaest d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    // AR: fulfilled order, invoiced due 30 days, partially paid.
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity: 3,
      unitPrice: 100,
    });
    await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA);
    await api('POST', `/api/v1/orders/${order.body.id}/fulfill`, tokenA);
    const arInvoice = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId: order.body.id,
      dueInDays: 30,
    });
    await api('POST', `/api/v1/finance/invoices/${arInvoice.body.id}/payments`, tokenA, {
      amount: 100,
    });
    // Age it: pretend it was due 45 days ago.
    await prisma.invoice.update({
      where: { id: arInvoice.body.id as string },
      data: { dueAt: new Date(Date.now() - 45 * 86_400_000) },
    });

    // AP: received PO -> supplier invoice, paid in part.
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, {
      name: 'Devetnaest Dobavljač d.o.o.',
    });
    supplierId = supplier.body.id as string;
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
      estUnitPrice: 20,
    });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, tokenA);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId: requisition.body.id,
      supplierId,
      warehouseId,
    });
    const poLine = (po.body.lines as Array<{ id: string }>)[0]!;
    const received = await api('POST', `/api/v1/purchase-orders/${po.body.id}/receive`, tokenA, {
      receiptKey: 'r19-1',
      lines: [{ lineId: poLine.id, quantity: 10 }],
    });
    // eslint-disable-next-line no-console
    if (received.status >= 400) console.log('RECEIVE DEBUG', received.status, received.body);
    const apInvoice = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId: po.body.id,
    });
    // eslint-disable-next-line no-console
    if (apInvoice.status >= 400) console.log('AP DEBUG', po.status, po.body, apInvoice.body);
    apInvoiceId = apInvoice.body.id as string;
    await api('POST', `/api/v1/finance/invoices/${apInvoiceId}/payments`, tokenA, {
      amount: 50,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIN-016/008: budgets track actual spend per cost center', async () => {
    const center = await api('POST', '/api/v1/finance/cost-centers', tokenA, {
      code: 'PROD',
      name: 'Proizvodnja',
    });
    expect(center.status).toBe(201);
    costCenterId = center.body.id as string;

    const duplicate = await api('POST', '/api/v1/finance/cost-centers', tokenA, {
      code: 'PROD',
      name: 'Duplikat',
    });
    expect(duplicate.status).toBe(409);

    const period = new Date().toISOString().slice(0, 7);
    await api('POST', '/api/v1/finance/budgets', tokenA, {
      costCenterId,
      periodKey: period,
      amount: 500,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/finance/invoices/${apInvoiceId}/cost-center`, tokenA, {
      costCenterId,
    });

    const report = await api('GET', `/api/v1/finance/budgets?period=${period}`, tokenA);
    const row = (report.body.rows as Array<Record<string, string>>)[0]!;
    expect(row.budget).toBe('500.00');
    expect(row.actual).toBe('200.00');
    expect(row.remaining).toBe('300.00');
  });

  it('FIN-011: receivable aging lands in the right bucket', async () => {
    const aging = await api('GET', '/api/v1/finance/aging?type=CUSTOMER', tokenA);
    expect(aging.status).toBe(200);
    expect(aging.body.totalOpen).toBe('200.00');
    const buckets = aging.body.buckets as Array<{ bucket: string; count: number; amount: string }>;
    const d3160 = buckets.find((b) => b.bucket === 'D31_60')!;
    expect(d3160.count).toBe(1);
    expect(d3160.amount).toBe('200.00');
  });

  it('FIN-012: payable aging shows the open supplier amount as not due', async () => {
    const aging = await api('GET', '/api/v1/finance/aging?type=SUPPLIER', tokenA);
    expect(aging.body.totalOpen).toBe('150.00');
    const notDue = (aging.body.buckets as Array<{ bucket: string; amount: string }>).find(
      (b) => b.bucket === 'NOT_DUE',
    )!;
    expect(notDue.amount).toBe('150.00');
  });

  it('FIN-010: cash flow nets matched payments by month', async () => {
    const cashflow = await api('GET', '/api/v1/finance/cashflow?months=3', tokenA);
    const rows = cashflow.body.rows as Array<{
      month: string;
      cashIn: string;
      cashOut: string;
      net: string;
    }>;
    expect(rows.length).toBe(3);
    const current = rows[rows.length - 1]!;
    expect(current.cashIn).toBe('100.00');
    expect(current.cashOut).toBe('50.00');
    expect(current.net).toBe('50.00');
  });

  it('AUTH: budgets and cost centers need finance.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s19a', subject: 'idp|s19-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko19@primjer.example',
      displayName: 'Niko19',
      idpSubject: 'idp|s19-nobody',
    });
    const denied = await api('POST', '/api/v1/finance/cost-centers', stranger, {
      code: 'X',
      name: 'X',
    });
    expect(denied.status).toBe(403);
  });
});
