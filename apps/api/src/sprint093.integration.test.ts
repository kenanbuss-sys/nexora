import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 093 acceptance tests: allocation (OMS-003) — an allocation run
 * hands newly available stock to backordered lines of confirmed
 * orders, oldest first, idempotently and audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 093 — allocation', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s93a', subject: 'idp|s93-admin' });

  let warehouseId = '';
  let skuId = '';
  let accountId = '';
  let firstOrderId = '';
  let secondOrderId = '';

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

  async function orderWithLine(quantity: number): Promise<string> {
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity,
      unitPrice: 10,
    });
    return order.body.id as string;
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
      slug: 'test-s93a',
      name: 'Sprint93 Tenant',
      initialAdmin: {
        email: 'admin@s93a.example',
        displayName: 'S93 Admin',
        idpSubject: 'idp|s93-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH93',
      name: 'Sprint93 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'ALO93',
      name: 'ALO93 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'ALO93-STD',
      name: 'ALO93 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devedesettri',
      company: 'Kupac93 d.o.o.',
      email: 'kupac93@primjer.example',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    // No stock yet: both orders confirm backordered.
    firstOrderId = await orderWithLine(6);
    await api('POST', `/api/v1/orders/${firstOrderId}/confirm`, tokenA, { allowBackorder: true });
    secondOrderId = await orderWithLine(5);
    await api('POST', `/api/v1/orders/${secondOrderId}/confirm`, tokenA, { allowBackorder: true });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('OMS-003: the run allocates to the oldest order first', async () => {
    // 8 pcs arrive: enough for the first order (6), not the second (5).
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 8,
      idempotencyKey: 'receipt-s93-first',
    });
    const run = await api('POST', '/api/v1/orders/allocate-backorders', tokenA);
    expect(run.status).toBe(201);
    const report = run.body.report as Array<{ orderId: string; allocated: boolean }>;
    expect(report.find((r) => r.orderId === firstOrderId)?.allocated).toBe(true);
    expect(report.find((r) => r.orderId === secondOrderId)?.allocated).toBe(false);

    const first = await api('GET', `/api/v1/orders/${firstOrderId}`, tokenA);
    expect((first.body.lines as Array<{ backordered: boolean }>)[0]?.backordered).toBe(false);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'oms.allocation.run' } });
    expect(audit).not.toBeNull();
  });

  it('OMS-003: the next run picks up the rest once stock arrives; idempotent for allocated lines', async () => {
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 3,
      idempotencyKey: 'receipt-s93-second',
    });
    const run = await api('POST', '/api/v1/orders/allocate-backorders', tokenA);
    const report = run.body.report as Array<{ orderId: string; allocated: boolean }>;
    // First order is no longer in the report (nothing backordered there).
    expect(report.some((r) => r.orderId === firstOrderId)).toBe(false);
    expect(report.find((r) => r.orderId === secondOrderId)?.allocated).toBe(true);

    const emptyRun = await api('POST', '/api/v1/orders/allocate-backorders', tokenA);
    expect((emptyRun.body.report as unknown[]).length).toBe(0);
  });

  it('AUTHZ: the allocation run needs order.confirm', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s93a', subject: 'idp|s93-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko93@primjer.example',
      displayName: 'Niko93',
      idpSubject: 'idp|s93-nobody',
    });
    const denied = await api('POST', '/api/v1/orders/allocate-backorders', stranger);
    expect(denied.status).toBe(403);
  });
});
