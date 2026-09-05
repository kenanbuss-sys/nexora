import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 017 acceptance tests: Customer 360 read model (CRM-005),
 * governed credit profile enforced on order confirmation (CRM-008) and
 * segmentation tags (CRM-009).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 017 — Customer 360 & credit', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s17a', subject: 'idp|s17-admin' });

  let accountId = '';
  let warehouseId = '';
  let skuId = '';

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

  async function draftOrder(qty: number, price: number): Promise<string> {
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity: qty,
      unitPrice: price,
    });
    return order.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "comment", "attachment_blob", "attachment", "number_sequence",
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
      slug: 'test-s17a',
      name: 'Sprint17 Tenant',
      initialAdmin: {
        email: 'admin@s17a.example',
        displayName: 'S17 Admin',
        idpSubject: 'idp|s17-admin',
      },
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'C360',
      name: 'C360 Product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'C360-STD',
      name: 'C360 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH17',
      name: 'Sprint17 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 500,
      idempotencyKey: 'receipt-s17',
    });

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac 360',
      company: 'Tristašezdeset d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    // Commercial history: one fulfilled + invoiced + half-paid order.
    const orderId = await draftOrder(4, 100);
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    const invoice = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId,
    });
    await api('POST', `/api/v1/finance/invoices/${invoice.body.id}/payments`, tokenA, {
      amount: 150,
    });
    await api('POST', '/api/v1/crm/activities', tokenA, {
      accountId,
      activityType: 'CALL',
      subject: 'Dogovoren godišnji okvir',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CRM-005: the 360 view aggregates revenue, balance and history', async () => {
    const summary = await api('GET', `/api/v1/crm/accounts/${accountId}/summary`, tokenA);
    expect(summary.status).toBe(200);
    expect(summary.body.partyName).toBe('Tristašezdeset d.o.o.');
    const credit = summary.body.credit as Record<string, string>;
    expect(credit.invoiced).toBe('400.00');
    expect(credit.paid).toBe('150.00');
    expect(credit.openBalance).toBe('250.00');
    const orders = summary.body.orders as { count: number; revenue: string };
    expect(orders.count).toBe(1);
    expect(orders.revenue).toBe('400.00');
    expect((summary.body.activities as unknown[]).length).toBeGreaterThan(0);
  });

  it('CRM-008: credit hold blocks order confirmation server-side', async () => {
    await api('POST', `/api/v1/crm/accounts/${accountId}/credit`, tokenA, {
      creditHold: true,
    });
    const held = await draftOrder(1, 50);
    const blocked = await api('POST', `/api/v1/orders/${held}/confirm`, tokenA);
    expect(blocked.status).toBe(409);
    expect(String(blocked.body.message)).toContain('credit hold');

    await api('POST', `/api/v1/crm/accounts/${accountId}/credit`, tokenA, {
      creditHold: false,
    });
    const released = await api('POST', `/api/v1/orders/${held}/confirm`, tokenA);
    expect(released.status).toBe(201);
  });

  it('CRM-008: an exceeded credit limit blocks; a sufficient one passes', async () => {
    // Open balance is 250; limit 300 leaves room for 50.
    await api('POST', `/api/v1/crm/accounts/${accountId}/credit`, tokenA, {
      creditLimit: 300,
    });
    const tooBig = await draftOrder(2, 100);
    const blocked = await api('POST', `/api/v1/orders/${tooBig}/confirm`, tokenA);
    expect(blocked.status).toBe(409);
    expect(String(blocked.body.message)).toContain('Credit limit exceeded');

    const fits = await draftOrder(1, 40);
    const ok = await api('POST', `/api/v1/orders/${fits}/confirm`, tokenA);
    expect(ok.status).toBe(201);

    await api('POST', `/api/v1/crm/accounts/${accountId}/credit`, tokenA, {
      creditLimit: null,
    });
  });

  it('CRM-009: tags are validated, deduplicated and audited', async () => {
    const set = await api('POST', `/api/v1/crm/accounts/${accountId}/tags`, tokenA, {
      tags: ['VIP', 'maloprodaja', 'VIP'],
    });
    expect(set.status).toBe(201);
    const summary = await api('GET', `/api/v1/crm/accounts/${accountId}/summary`, tokenA);
    expect(summary.body.tags).toEqual(['VIP', 'maloprodaja']);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'crm.tags.update', objectId: accountId },
    });
    expect(audit).not.toBeNull();
  });

  it('AUTH: credit updates need crm.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s17a', subject: 'idp|s17-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko17@primjer.example',
      displayName: 'Niko17',
      idpSubject: 'idp|s17-nobody',
    });
    const denied = await api('POST', `/api/v1/crm/accounts/${accountId}/credit`, stranger, {
      creditHold: true,
    });
    expect(denied.status).toBe(403);
  });
});
