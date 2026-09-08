import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 173 acceptance tests: invoice matching (FIN-022) — the AP
 * worklist reports every unpaid supplier invoice with its three-way
 * outcome, mismatches first, under a configured tolerance.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 173 — invoice matching', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s173a', subject: 'idp|s173-admin' });

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
      slug: 'test-s173a',
      name: 'Sprint173 Tenant',
      initialAdmin: {
        email: 'admin@s173a.example',
        displayName: 'S173 Admin',
        idpSubject: 'idp|s173-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH173',
      name: 'Sprint173 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 173' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN173',
      name: 'FIN173 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN173-STD',
      name: 'FIN173 Std',
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

  it('FIN-022: the worklist flags under-received invoices, tolerance is configured', async () => {
    // Receive only 9 of 10 → invoice for the full PO exceeds received value.
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 's173-partial',
      lines: [{ lineId, quantity: 9 }],
    });
    const invoice = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId,
      dueInDays: 14,
    });
    expect(invoice.status).toBe(201);

    const worklist = await api('GET', '/api/v1/finance/matching', tokenA);
    expect(worklist.status).toBe(200);
    expect(worklist.body.total).toBe(1);
    expect(worklist.body.mismatched).toBe(1);
    const row = (worklist.body.rows as Array<Record<string, unknown>>)[0];
    expect(row?.matched).toBe(false);
    expect(row?.reasons).toContain('INVOICE_EXCEEDS_RECEIVED');
    expect(row?.reasons).toContain('NOT_FULLY_RECEIVED');

    // A huge configured tolerance forgives the value gap (but not the
    // missing receipt), so the payment guard shows the same truth.
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { fin: { matchTolerancePct: 25 } },
    });
    const relaxed = await api('GET', '/api/v1/finance/matching', tokenA);
    const relaxedRow = (relaxed.body.rows as Array<Record<string, unknown>>)[0];
    expect(relaxedRow?.reasons).not.toContain('INVOICE_EXCEEDS_RECEIVED');
    expect(relaxedRow?.reasons).toContain('NOT_FULLY_RECEIVED');
  });

  it('FIN-022: fully received invoices match and sort last', async () => {
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 's173-rest',
      lines: [{ lineId, quantity: 1 }],
    });
    const worklist = await api('GET', '/api/v1/finance/matching', tokenA);
    expect(worklist.body.mismatched).toBe(0);
    const row = (worklist.body.rows as Array<Record<string, unknown>>)[0];
    expect(row?.matched).toBe(true);
    expect(row?.reasons).toEqual([]);
  });

  it('AUTHZ: the worklist needs finance.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s173a', subject: 'idp|s173-nobody' });
    const denied = await api('GET', '/api/v1/finance/matching', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
