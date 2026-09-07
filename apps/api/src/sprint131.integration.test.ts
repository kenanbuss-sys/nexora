import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 131 acceptance tests: treasury snapshot (FIN-015) and profit
 * centers (FIN-017) — point-in-time cash picture with 7-day dues, and
 * revenue/cost/margin per cost center.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 131 — treasury & profit centers', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s131a', subject: 'idp|s131-admin' });

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
      slug: 'test-s131a',
      name: 'Sprint131 Tenant',
      initialAdmin: {
        email: 'admin@s131a.example',
        displayName: 'S131 Admin',
        idpSubject: 'idp|s131-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH131',
      name: 'Sprint131 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 131' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN131',
      name: 'FIN131 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN131-STD',
      name: 'FIN131 Std',
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

  it('FIN-015/017: cash, dues and per-center margins line up', async () => {
    // AP side: receive the PO fully, invoice 500, attribute to PROD, pay 200.
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'fin131-all',
      lines: [{ lineId, quantity: 10 }],
    });
    const ap = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId,
      dueInDays: 3,
    });
    const center = await api('POST', '/api/v1/finance/cost-centers', tokenA, {
      code: 'PROD',
      name: 'Proizvodnja',
    });
    await api('POST', `/api/v1/finance/invoices/${ap.body.id}/cost-center`, tokenA, {
      costCenterId: center.body.id,
    });
    await api('POST', `/api/v1/finance/invoices/${ap.body.id}/payments`, tokenA, {
      amount: 200,
    });

    // AR side: sell 4 pcs at 100, fulfill, invoice, collect 150.
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Fin 131',
      company: 'Fin131 d.o.o.',
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
    const ar = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId: order.body.id,
      dueInDays: 3,
    });
    await api('POST', `/api/v1/finance/invoices/${ar.body.id}/payments`, tokenA, {
      amount: 150,
    });

    const treasury = await api('GET', '/api/v1/finance/treasury', tokenA);
    expect(treasury.status).toBe(200);
    expect(treasury.body.cashIn).toBe('150.00');
    expect(treasury.body.cashOut).toBe('200.00');
    expect(treasury.body.netCash).toBe('-50.00');
    expect(treasury.body.openReceivables).toBe('250.00');
    expect(treasury.body.openPayables).toBe('300.00');
    expect(treasury.body.receivablesDue7d).toBe('250.00');
    expect(treasury.body.payablesDue7d).toBe('300.00');

    const centers = await api('GET', '/api/v1/finance/profit-centers', tokenA);
    const rows = centers.body.centers as Array<{
      code: string;
      revenue: string;
      cost: string;
      margin: string;
    }>;
    const prod = rows.find((r) => r.code === 'PROD');
    expect(prod?.cost).toBe('500.00');
    const unassigned = rows.find((r) => r.code === '(neraspoređeno)');
    expect(unassigned?.revenue).toBe('400.00');
  });

  it('AUTHZ: treasury needs finance.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s131a', subject: 'idp|s131-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko131@primjer.example',
      displayName: 'Niko131',
      idpSubject: 'idp|s131-nobody',
    });
    const denied = await api('GET', '/api/v1/finance/treasury', stranger);
    expect(denied.status).toBe(403);
  });
});
