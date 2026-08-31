import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 015 acceptance tests (docs/implementation/SPRINT_015_B2B.md):
 * portal users bound to one account, self-service reads scoped
 * server-side to that account, credit visibility, and denial without an
 * active binding.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 015 — B2B portal', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s15a', subject: 'idp|s15-admin' });
  const customerToken = identity.signToken({
    tenantSlug: 'test-s15a',
    subject: 'idp|s15-customer',
  });
  const strangerToken = identity.signToken({
    tenantSlug: 'test-s15a',
    subject: 'idp|s15-stranger',
  });

  let skuId = '';
  let warehouseId = '';
  let accountOneId = '';
  let accountTwoId = '';

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

  async function convertLead(name: string, company: string): Promise<string> {
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, { name, company });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    return converted.body.accountId as string;
  }

  async function fulfilledOrder(accountId: string, qty: number, price: number): Promise<string> {
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
    await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA);
    await api('POST', `/api/v1/orders/${order.body.id}/fulfill`, tokenA);
    return order.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "portal_user", "payment", "invoice",
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
      slug: 'test-s15a',
      name: 'Sprint15 Tenant A',
      initialAdmin: {
        email: 'admin@s15a.example',
        displayName: 'S15 Admin',
        idpSubject: 'idp|s15-admin',
      },
    });

    // Customer + stranger users with the portal role.
    const portalRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'portal-customer',
      permissions: ['portal.access'],
    });
    for (const [email, name, subject] of [
      ['kupac@primjer.example', 'Portal Kupac', 'idp|s15-customer'],
      ['stranac@primjer.example', 'Portal Stranac', 'idp|s15-stranger'],
    ]) {
      const user = await api('POST', '/api/v1/users/invite', tokenA, {
        email,
        displayName: name,
        idpSubject: subject,
      });
      await api('POST', '/api/v1/roles/assign', tokenA, {
        userId: user.body.id,
        roleId: portalRole.body.id,
      });
    }

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'B2B15',
      name: 'B2b15',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'B2B15-STD',
      name: 'B2b15 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH15',
      name: 'Sprint15 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 100,
      idempotencyKey: 'receipt-s15',
    });

    accountOneId = await convertLead('Prvi Kupac', 'Prvi d.o.o.');
    accountTwoId = await convertLead('Drugi Kupac', 'Drugi d.o.o.');

    // Orders + invoice for account one; account two has its own order.
    const orderOne = await fulfilledOrder(accountOneId, 3, 100);
    await fulfilledOrder(accountTwoId, 5, 50);
    const invoice = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId: orderOne,
    });
    await api('POST', `/api/v1/finance/invoices/${invoice.body.id}/payments`, tokenA, {
      amount: 100,
    });

    // Bind the customer identity to account one.
    await api('POST', '/api/v1/portal-users', tokenA, {
      accountId: accountOneId,
      idpSubject: 'idp|s15-customer',
      displayName: 'Portal Kupac',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('B2B: a bound portal user sees only their own account', async () => {
    const me = await api('GET', '/api/v1/portal/me', customerToken);
    expect(me.status).toBe(200);
    expect(me.body.accountId).toBe(accountOneId);
    expect(me.body.accountName).toBe('Prvi d.o.o.');

    const orders = await api('GET', '/api/v1/portal/orders', customerToken);
    const list = orders.body.orders as Array<{ total: string }>;
    expect(list.length).toBe(1);
    expect(list[0]?.total).toBe('300');
  });

  it('B2B: credit visibility reflects invoices and payments', async () => {
    const me = await api('GET', '/api/v1/portal/me', customerToken);
    const credit = me.body.credit as { invoiced: string; paid: string; openBalance: string };
    expect(credit.invoiced).toBe('300.00');
    expect(credit.paid).toBe('100.00');
    expect(credit.openBalance).toBe('200.00');

    const invoices = await api('GET', '/api/v1/portal/invoices', customerToken);
    expect((invoices.body.invoices as unknown[]).length).toBe(1);
  });

  it('B2B: order progress is visible; foreign orders are not', async () => {
    const orders = await api('GET', '/api/v1/portal/orders', customerToken);
    const own = (orders.body.orders as Array<{ id: string }>)[0]!;
    const timeline = await api('GET', `/api/v1/portal/orders/${own.id}/timeline`, customerToken);
    const types = (timeline.body.events as Array<{ eventType: string }>).map((e) => e.eventType);
    expect(types).toContain('order.created');
    expect(types).toContain('order.confirmed');

    // The other account's order is invisible even by direct id.
    const foreignOrders = await prisma.salesOrder.findMany({
      where: { accountId: accountTwoId },
    });
    const foreign = await api(
      'GET',
      `/api/v1/portal/orders/${foreignOrders[0]?.id}/timeline`,
      customerToken,
    );
    expect(foreign.status).toBe(404);
  });

  it('B2B: no binding or a disabled binding means no portal', async () => {
    const stranger = await api('GET', '/api/v1/portal/me', strangerToken);
    expect(stranger.status).toBe(403);

    const users = await api('GET', '/api/v1/portal-users', tokenA);
    const binding = (users.body.portalUsers as Array<{ id: string }>)[0]!;
    await api('POST', `/api/v1/portal-users/${binding.id}/disable`, tokenA);
    const disabled = await api('GET', '/api/v1/portal/me', customerToken);
    expect(disabled.status).toBe(403);
    await api('POST', `/api/v1/portal-users/${binding.id}/activate`, tokenA);

    // One identity cannot be bound twice.
    const duplicate = await api('POST', '/api/v1/portal-users', tokenA, {
      accountId: accountTwoId,
      idpSubject: 'idp|s15-customer',
      displayName: 'Dupli',
    });
    expect(duplicate.status).toBe(409);
  });

  it('B2B: back-office endpoints require portal.manage', async () => {
    const denied = await api('GET', '/api/v1/portal-users', customerToken);
    expect(denied.status).toBe(403);
  });
});
