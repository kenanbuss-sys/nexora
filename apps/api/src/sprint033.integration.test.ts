import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 033 acceptance tests: CSV import/export framework (CORE-019) —
 * idempotent onboarding of catalog, customers, suppliers and opening
 * stock through the owning domains, with per-row reports and exports.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 033 — CSV import/export', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s33a', subject: 'idp|s33-admin' });

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
      `TRUNCATE TABLE "downtime_event", "work_center",
       "stock_count_line", "stock_count",
       "return_order_line", "return_order", "product_category",
       "security_event", "api_key",
       "webhook_delivery", "webhook_subscription",
       "budget", "cost_center",
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
      slug: 'test-s33a',
      name: 'Sprint33 Tenant',
      initialAdmin: {
        email: 'admin@s33a.example',
        displayName: 'S33 Admin',
        idpSubject: 'idp|s33-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CORE-019: product import creates rows, reports errors and re-runs idempotently', async () => {
    const csv = 'code,name,description\nCH-01,Chair,Basic chair\nCH-02,Table,\n,Missing code,';
    const first = await api('POST', '/api/v1/data/import/products', tokenA, { csv });
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(2);
    expect(first.body.errors).toBe(1);

    const again = await api('POST', '/api/v1/data/import/products', tokenA, { csv });
    expect(again.body.created).toBe(0);
    expect(again.body.skipped).toBe(2);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'data.import' } });
    expect(audit).not.toBeNull();
  });

  it('CORE-019: SKU import resolves product codes and activates', async () => {
    const csv =
      'productCode,code,name,baseUom,activate\n' +
      'CH-01,CH-01-STD,Chair standard,pcs,yes\n' +
      'NOPE,X-1,Ghost,pcs,no';
    const report = await api('POST', '/api/v1/data/import/skus', tokenA, { csv });
    expect(report.body.created).toBe(1);
    expect(report.body.errors).toBe(1);
    const results = report.body.results as Array<{ status: string; message: string }>;
    expect(results[1]!.message).toContain("Product 'NOPE' not found");
    const sku = await prisma.sku.findFirst({ where: { code: 'CH-01-STD' } });
    expect(sku?.status).toBe('ACTIVE');
  });

  it('CORE-019: customer and supplier imports go through MDM and skip duplicates', async () => {
    const customers = 'name,email,creditLimit\nKupac d.o.o.,kupac@primjer.example,5000';
    const first = await api('POST', '/api/v1/data/import/customers', tokenA, { csv: customers });
    expect(first.body.created).toBe(1);
    const again = await api('POST', '/api/v1/data/import/customers', tokenA, { csv: customers });
    expect(again.body.skipped).toBe(1);

    const suppliers = 'name,email,leadTimeDays\nDobavljač d.o.o.,d@primjer.example,7';
    const sup = await api('POST', '/api/v1/data/import/suppliers', tokenA, { csv: suppliers });
    expect(sup.body.created).toBe(1);
    const supAgain = await api('POST', '/api/v1/data/import/suppliers', tokenA, { csv: suppliers });
    expect(supAgain.body.skipped).toBe(1);

    // The customer landed as a real MDM party + CRM account.
    const account = await prisma.crmAccount.findFirst({});
    expect(account).not.toBeNull();
  });

  it('CORE-019: opening stock posts idempotent ledger receipts', async () => {
    await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH33', name: 'Main' });
    const csv = 'warehouseCode,skuCode,quantity\nWH33,CH-01-STD,25\nWH33,GHOST,5';
    const first = await api('POST', '/api/v1/data/import/stock', tokenA, { csv });
    expect(first.body.created).toBe(1);
    expect(first.body.errors).toBe(1);

    const again = await api('POST', '/api/v1/data/import/stock', tokenA, { csv });
    expect(again.body.created).toBe(0);
    expect(again.body.skipped).toBe(1);

    const movements = await prisma.stockMovement.count({ where: { movementType: 'RECEIPT' } });
    expect(movements).toBe(1);
  });

  it('CORE-019: exports round-trip the imported data as CSV', async () => {
    const products = await api('GET', '/api/v1/data/export/products', tokenA);
    expect(products.status).toBe(200);
    expect(String(products.body.csv)).toContain('CH-01,Chair,Basic chair');

    const stock = await api('GET', '/api/v1/data/export/stock', tokenA);
    expect(String(stock.body.csv)).toContain('WH33,CH-01-STD,25');

    const customers = await api('GET', '/api/v1/data/export/customers', tokenA);
    expect(String(customers.body.csv)).toContain('Kupac d.o.o.');
  });

  it('AUTH: imports need the owning domain permission', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s33a', subject: 'idp|s33-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko33@primjer.example',
      displayName: 'Niko33',
      idpSubject: 'idp|s33-nobody',
    });
    const denied = await api('POST', '/api/v1/data/import/products', stranger, {
      csv: 'code,name\nX-9,Nope',
    });
    expect(denied.status).toBe(403);
  });

  it('VALIDATION: a CSV without the required columns is rejected', async () => {
    const bad = await api('POST', '/api/v1/data/import/products', tokenA, {
      csv: 'foo,bar\n1,2',
    });
    expect(bad.status).toBe(400);
    expect(String(bad.body.message)).toContain("missing the 'code' column");
  });
});
