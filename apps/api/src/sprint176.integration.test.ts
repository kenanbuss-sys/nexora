import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 176 acceptance tests: supplier & process analytics
 * (BI-012/013) — the sourcing scorecard aggregates spend and received
 * share per supplier, and cycle times report per core flow.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 176 — supplier & process analytics', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s176a', subject: 'idp|s176-admin' });

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
      slug: 'test-s176a',
      name: 'Sprint176 Tenant',
      initialAdmin: {
        email: 'admin@s176a.example',
        displayName: 'S176 Admin',
        idpSubject: 'idp|s176-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH176',
      name: 'Sprint176 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 176' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN176',
      name: 'FIN176 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN176-STD',
      name: 'FIN176 Std',
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

  it('BI-012: the supplier scorecard aggregates spend and received share', async () => {
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 's176-partial',
      lines: [{ lineId, quantity: 5 }],
    });
    const scorecard = await api('GET', '/api/v1/analytics/suppliers', tokenA);
    expect(scorecard.status).toBe(200);
    const rows = scorecard.body.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toContain('Dobavljac');
    expect(rows[0]?.purchaseOrders).toBe(1);
    expect(rows[0]?.openOrders).toBe(1);
    expect(Number(rows[0]?.spend)).toBe(500);
    expect(rows[0]?.receivedSharePct).toBe('50.0');
  });

  it('BI-013: process cycle times report per flow', async () => {
    // Complete the order-to-fulfilment flow once.
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Procesa',
      company: 'Procesi d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity: 2,
      unitPrice: 10,
    });
    await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA, {});
    await api('POST', `/api/v1/orders/${order.body.id}/fulfill`, tokenA);

    const processes = await api('GET', '/api/v1/analytics/processes', tokenA);
    expect(processes.status).toBe(200);
    const rows = processes.body.rows as Array<Record<string, unknown>>;
    const o2f = rows.find((r) => r.process === 'order_to_fulfilment');
    expect(o2f?.completed).toBe(1);
    expect(o2f?.avgHours).not.toBeNull();
    const po2r = rows.find((r) => r.process === 'po_to_receipt');
    expect(po2r?.completed).toBe(0);
  });

  it('AUTHZ: analytics need analytics.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s176a', subject: 'idp|s176-nobody' });
    const denied = await api('GET', '/api/v1/analytics/suppliers', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
