import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 091 acceptance tests: three-way-match hooks (PROC-014) —
 * supplier invoices are compared against the purchase order and the
 * goods receipt, and payment is blocked (audited) while the invoiced
 * value exceeds what was actually received.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 091 — three-way match', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s91a', subject: 'idp|s91-admin' });

  let warehouseId = '';
  let supplierId = '';
  let skuId = '';
  let poId = '';
  let lineId = '';
  let invoiceId = '';

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
      slug: 'test-s91a',
      name: 'Sprint91 Tenant',
      initialAdmin: {
        email: 'admin@s91a.example',
        displayName: 'S91 Admin',
        idpSubject: 'idp|s91-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH91',
      name: 'Sprint91 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 91' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'TWM91',
      name: 'TWM91 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'TWM91-STD',
      name: 'TWM91 Std',
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

  it('PROC-014: partially received invoice mismatches and payment is blocked', async () => {
    // Receive 6 of 10 → received value 300 of 500.
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'twm91-first',
      lines: [{ lineId, quantity: 6 }],
    });
    const invoice = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, { poId });
    expect(invoice.status).toBe(201);
    invoiceId = invoice.body.id as string;

    const match = await api('GET', `/api/v1/finance/invoices/${invoiceId}/three-way-match`, tokenA);
    expect(match.status).toBe(200);
    expect(match.body.matched).toBe(false);
    expect(match.body.reasons).toContain('INVOICE_EXCEEDS_RECEIVED');

    const blocked = await api('POST', `/api/v1/finance/invoices/${invoiceId}/payments`, tokenA, {
      amount: 500,
    });
    expect(blocked.status).toBe(409);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'fin.three_way.block' } });
    expect(audit).not.toBeNull();
  });

  it('PROC-014: full receipt clears the match and payment goes through', async () => {
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'twm91-second',
      lines: [{ lineId, quantity: 4 }],
    });
    const match = await api('GET', `/api/v1/finance/invoices/${invoiceId}/three-way-match`, tokenA);
    expect(match.body.matched).toBe(true);
    expect(match.body.reasons).toHaveLength(0);

    const paid = await api('POST', `/api/v1/finance/invoices/${invoiceId}/payments`, tokenA, {
      amount: 500,
    });
    expect(paid.status).toBe(201);
    expect(paid.body.status).toBe('PAID');
  });

  it('AUTHZ: the match report needs finance.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s91a', subject: 'idp|s91-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko91@primjer.example',
      displayName: 'Niko91',
      idpSubject: 'idp|s91-nobody',
    });
    const denied = await api(
      'GET',
      `/api/v1/finance/invoices/${invoiceId}/three-way-match`,
      stranger,
    );
    expect(denied.status).toBe(403);
  });
});
