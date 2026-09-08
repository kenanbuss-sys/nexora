import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 153 acceptance tests: accounting connectors (INT-002) —
 * issued invoices export exactly once through a declared accounting
 * connector; non-accounting connectors and unissued invoices refuse.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 153 — accounting export', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s153a', subject: 'idp|s153-admin' });

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
      slug: 'test-s153a',
      name: 'Sprint153 Tenant',
      initialAdmin: {
        email: 'admin@s153a.example',
        displayName: 'S153 Admin',
        idpSubject: 'idp|s153-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH153',
      name: 'Sprint153 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 153' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN153',
      name: 'FIN153 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN153-STD',
      name: 'FIN153 Std',
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

  it('INT-002: issued invoices export exactly once to the accounting connector', async () => {
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 's153-all',
      lines: [{ lineId, quantity: 10 }],
    });
    const invoice = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId,
      dueInDays: 14,
    });
    invoiceId = invoice.body.id as string;
    expect(invoice.status).toBe(201);

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'erp-acc', kind: 'accounting', adapter: 'noop', config: {} },
            { key: 'shop', kind: 'commerce', adapter: 'noop', config: {} },
          ],
        },
      },
    });

    const run = await api('POST', '/api/v1/connectors/erp-acc/export-invoices', tokenA);
    expect(run.status).toBe(201);
    expect(run.body.exported).toBe(1);
    expect((run.body.references as string[])[0]).toContain('noop:invoice');

    const rerun = await api('POST', '/api/v1/connectors/erp-acc/export-invoices', tokenA);
    expect(rerun.body.exported).toBe(0);
    expect(rerun.body.skipped).toBe(1);
  });

  it('INT-002: non-accounting connectors refuse invoice export', async () => {
    const wrong = await api('POST', '/api/v1/connectors/shop/export-invoices', tokenA);
    expect(wrong.status).toBe(409);
    const ghost = await api('POST', '/api/v1/connectors/ghost/export-invoices', tokenA);
    expect(ghost.status).toBe(404);
  });

  it('INT-002: exports are audited per invoice', async () => {
    const events = await prisma.auditEvent.count({
      where: { action: 'int.accounting.export', objectId: `erp-acc:${invoiceId}` },
    });
    expect(events).toBe(1);
  });

  it('AUTHZ: invoice export needs finance.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s153a', subject: 'idp|s153-nobody' });
    const denied = await api('POST', '/api/v1/connectors/erp-acc/export-invoices', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
