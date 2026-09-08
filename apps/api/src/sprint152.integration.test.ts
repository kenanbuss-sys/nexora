import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 152 acceptance tests: bank feed hooks (FIN-013) — normalized
 * transactions import exactly once through the provider-neutral port
 * and reconcile against open invoices by remittance number or exact
 * open amount; matched transactions pay through the ordinary path.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 152 — bank feed', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s152a', subject: 'idp|s152-admin' });

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
      slug: 'test-s152a',
      name: 'Sprint152 Tenant',
      initialAdmin: {
        email: 'admin@s152a.example',
        displayName: 'S152 Admin',
        idpSubject: 'idp|s152-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH152',
      name: 'Sprint152 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 152' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN152',
      name: 'FIN152 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN152-STD',
      name: 'FIN152 Std',
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
  let invoiceNumber = '';

  it('FIN-013: transactions match by remittance number and pay the invoice', async () => {
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 's152-all',
      lines: [{ lineId, quantity: 10 }],
    });
    const invoice = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId,
      dueInDays: 14,
    });
    expect(invoice.status).toBe(201);
    invoiceId = invoice.body.id as string;
    invoiceNumber = invoice.body.invoiceNumber as string;

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        fin: {
          bankFeed: {
            transactions: [
              {
                externalRef: 'BANK-TX-001',
                amount: 200,
                currency: 'EUR',
                date: new Date().toISOString(),
                description: `Uplata po računu ${invoiceNumber}`,
                invoiceNumber,
              },
              {
                externalRef: 'BANK-TX-002',
                amount: 77.77,
                currency: 'EUR',
                date: new Date().toISOString(),
                description: 'Nepoznata uplata',
              },
            ],
          },
        },
      },
    });

    const run = await api('POST', '/api/v1/finance/bank-feed/import', tokenA);
    expect(run.status).toBe(201);
    expect(run.body.fetched).toBe(2);
    expect(run.body.imported).toBe(2);
    expect(run.body.matched).toBe(1);
    const unmatched = run.body.unmatched as Array<{ externalRef: string }>;
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.externalRef).toBe('BANK-TX-002');

    const payments = await api('GET', `/api/v1/finance/invoices/${invoiceId}/payments`, tokenA);
    const rows = payments.body.payments as Array<{ reference: string | null; amount: string }>;
    expect(rows.some((p) => p.reference === 'bank:BANK-TX-001')).toBe(true);
  });

  it('FIN-013: a re-run imports nothing new (exactly-once)', async () => {
    const rerun = await api('POST', '/api/v1/finance/bank-feed/import', tokenA);
    expect(rerun.body.fetched).toBe(2);
    expect(rerun.body.imported).toBe(0);
    expect(rerun.body.matched).toBe(0);
  });

  it('FIN-013: exact-open-amount matching pays without a remittance hint', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        fin: {
          bankFeed: {
            transactions: [
              {
                externalRef: 'BANK-TX-003',
                amount: 300,
                currency: 'EUR',
                date: new Date().toISOString(),
                description: 'Ostatak po fakturi',
              },
            ],
          },
        },
      },
    });
    const run = await api('POST', '/api/v1/finance/bank-feed/import', tokenA);
    expect(run.body.matched).toBe(1);
    const invoice = await api('GET', '/api/v1/finance/invoices', tokenA);
    const row = (invoice.body.invoices as Array<Record<string, unknown>>).find(
      (i) => i.id === invoiceId,
    );
    expect(row?.status).toBe('PAID');
  });

  it('AUTHZ: bank feed import needs finance.pay', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s152a', subject: 'idp|s152-nobody' });
    const denied = await api('POST', '/api/v1/finance/bank-feed/import', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
