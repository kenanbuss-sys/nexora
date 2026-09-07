import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 137 acceptance tests: revenue/cost capture (FIN-002) —
 * invoiced revenue and cost per calendar month with margin.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 137 — revenue/cost capture', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s137a', subject: 'idp|s137-admin' });

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
      `TRUNCATE TABLE "rfq_quote", "rfq",
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
      slug: 'test-s137a',
      name: 'Sprint137 Tenant',
      initialAdmin: {
        email: 'admin@s137a.example',
        displayName: 'S137 Admin',
        idpSubject: 'idp|s137-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH137',
      name: 'Sprint137 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 137' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'RC137',
      name: 'RC137 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'RC137-STD',
      name: 'RC137 Std',
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

  it('FIN-002: monthly revenue, cost and margin line up', async () => {
    // AP: receive + invoice 500.
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'rc137-all',
      lines: [{ lineId, quantity: 10 }],
    });
    await api('POST', '/api/v1/finance/invoices/supplier', tokenA, { poId });

    // AR: sell 4 × 100, fulfil, invoice 400.
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Rc 137',
      company: 'Rc137 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity: 4,
      unitPrice: 100,
    });
    await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA, {});
    await api('POST', `/api/v1/orders/${order.body.id}/fulfill`, tokenA);
    await api('POST', '/api/v1/finance/invoices/customer', tokenA, { orderId: order.body.id });

    const report = await api('GET', '/api/v1/finance/revenue-cost?months=3', tokenA);
    expect(report.status).toBe(200);
    const month = new Date().toISOString().slice(0, 7);
    const row = (
      report.body.rows as Array<{ month: string; revenue: string; cost: string; margin: string }>
    ).find((r) => r.month === month);
    expect(row?.revenue).toBe('400.00');
    expect(row?.cost).toBe('500.00');
    expect(row?.margin).toBe('-100.00');
  });

  it('AUTHZ: the report needs finance.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s137a', subject: 'idp|s137-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko137@primjer.example',
      displayName: 'Niko137',
      idpSubject: 'idp|s137-nobody',
    });
    const denied = await api('GET', '/api/v1/finance/revenue-cost', stranger);
    expect(denied.status).toBe(403);
  });
});
