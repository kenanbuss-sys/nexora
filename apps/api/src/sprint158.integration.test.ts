import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 158 acceptance tests: financial dimensions (FIN-001) — a
 * configured dimension chart validates per-invoice attributions and
 * totals report per dimension value.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 158 — financial dimensions', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s158a', subject: 'idp|s158-admin' });

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
      slug: 'test-s158a',
      name: 'Sprint158 Tenant',
      initialAdmin: {
        email: 'admin@s158a.example',
        displayName: 'S158 Admin',
        idpSubject: 'idp|s158-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH158',
      name: 'Sprint158 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 158' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN158',
      name: 'FIN158 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN158-STD',
      name: 'FIN158 Std',
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

  let invoiceId = '';

  it('FIN-001: dimensions validate against the configured chart', async () => {
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 's158-all',
      lines: [{ lineId, quantity: 10 }],
    });
    const invoice = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId,
      dueInDays: 14,
    });
    invoiceId = invoice.body.id as string;

    const before = await api('POST', `/api/v1/finance/invoices/${invoiceId}/dimensions`, tokenA, {
      dimensions: { project: 'ALPHA' },
    });
    expect(before.status).toBe(409); // no chart configured yet

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        fin: {
          dimensions: [
            { key: 'project', values: ['ALPHA', 'BETA'], required: true },
            { key: 'region' },
          ],
        },
      },
    });

    const ok = await api('POST', `/api/v1/finance/invoices/${invoiceId}/dimensions`, tokenA, {
      dimensions: { project: 'ALPHA', region: 'BiH' },
    });
    expect(ok.status).toBe(201);

    const badValue = await api('POST', `/api/v1/finance/invoices/${invoiceId}/dimensions`, tokenA, {
      dimensions: { project: 'GAMMA' },
    });
    expect(badValue.status).toBe(400);

    const unknownKey = await api(
      'POST',
      `/api/v1/finance/invoices/${invoiceId}/dimensions`,
      tokenA,
      { dimensions: { project: 'ALPHA', animal: 'mačka' } },
    );
    expect(unknownKey.status).toBe(400);

    const missingRequired = await api(
      'POST',
      `/api/v1/finance/invoices/${invoiceId}/dimensions`,
      tokenA,
      { dimensions: { region: 'BiH' } },
    );
    expect(missingRequired.status).toBe(400);
  });

  it('FIN-001: totals report per dimension value', async () => {
    const report = await api('GET', '/api/v1/finance/by-dimension?key=project', tokenA);
    expect(report.status).toBe(200);
    const rows = report.body.rows as Array<Record<string, unknown>>;
    const alpha = rows.find((r) => r.value === 'ALPHA');
    expect(alpha?.invoices).toBe(1);
    expect(Number(alpha?.cost)).toBe(500);
    expect(Number(alpha?.revenue)).toBe(0);
  });

  it('FIN-001: dimension changes are audited with before/after', async () => {
    const events = await prisma.auditEvent.count({
      where: { action: 'fin.dimensions.set', objectId: invoiceId },
    });
    expect(events).toBe(1);
  });

  it('AUTHZ: setting dimensions needs finance.invoice', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s158a', subject: 'idp|s158-nobody' });
    const denied = await api('POST', `/api/v1/finance/invoices/${invoiceId}/dimensions`, stranger, {
      dimensions: { project: 'ALPHA' },
    });
    expect([401, 403]).toContain(denied.status);
  });
});
