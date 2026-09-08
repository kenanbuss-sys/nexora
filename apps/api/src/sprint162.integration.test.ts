import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 162 acceptance tests: fiscal/eInvoice connectors (INT-006)
 * — issued invoices fiscalize exactly once per (connector, invoice);
 * retries return the existing fiscal reference.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 162 — fiscal connectors', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s162a', subject: 'idp|s162-admin' });

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
      slug: 'test-s162a',
      name: 'Sprint162 Tenant',
      initialAdmin: {
        email: 'admin@s162a.example',
        displayName: 'S162 Admin',
        idpSubject: 'idp|s162-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH162',
      name: 'Sprint162 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 162' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN162',
      name: 'FIN162 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN162-STD',
      name: 'FIN162 Std',
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
  let fiscalRef = '';

  it('INT-006: an invoice fiscalizes exactly once', async () => {
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 's162-all',
      lines: [{ lineId, quantity: 10 }],
    });
    const invoice = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId,
      dueInDays: 14,
    });
    invoiceId = invoice.body.id as string;

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'fiskal', kind: 'fiscal', adapter: 'noop', config: {} },
            { key: 'shop', kind: 'commerce', adapter: 'noop', config: {} },
          ],
        },
      },
    });

    const first = await api('POST', '/api/v1/connectors/fiskal/fiscalize', tokenA, {
      invoiceId,
    });
    expect(first.status).toBe(201);
    expect(first.body.existing).toBe(false);
    fiscalRef = first.body.fiscalRef as string;
    expect(fiscalRef).toContain('noop:fiscal_invoice');

    const retry = await api('POST', '/api/v1/connectors/fiskal/fiscalize', tokenA, {
      invoiceId,
    });
    expect(retry.body.existing).toBe(true);
    expect(retry.body.fiscalRef).toBe(fiscalRef);
  });

  it('INT-006: only fiscal connectors fiscalize; unknown invoices are 404', async () => {
    const wrong = await api('POST', '/api/v1/connectors/shop/fiscalize', tokenA, { invoiceId });
    expect(wrong.status).toBe(409);
    const ghost = await api('POST', '/api/v1/connectors/fiskal/fiscalize', tokenA, {
      invoiceId: '00000000-0000-0000-0000-000000000000',
    });
    expect(ghost.status).toBe(404);
  });

  it('INT-006: fiscalizations are audited', async () => {
    const events = await prisma.auditEvent.count({
      where: { action: 'int.fiscal.invoice', objectId: `fiskal:${invoiceId}` },
    });
    expect(events).toBe(1);
  });

  it('AUTHZ: fiscalization needs finance.invoice', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s162a', subject: 'idp|s162-nobody' });
    const denied = await api('POST', '/api/v1/connectors/fiskal/fiscalize', stranger, {
      invoiceId,
    });
    expect([401, 403]).toContain(denied.status);
  });
});
