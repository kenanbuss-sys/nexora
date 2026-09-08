import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 159 acceptance tests: point of sale (COM-003) — register
 * sessions with one-open-per-register, sales as pos-channel orders
 * with cash on the drawer, and reconciled close with variance.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 159 — point of sale', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s159a', subject: 'idp|s159-admin' });

  let orderId = '';
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

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "pos_session", "package_line", "package", "landed_cost", "rfq_quote", "rfq",
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
      slug: 'test-s159a',
      name: 'Sprint159 Tenant',
      initialAdmin: {
        email: 'admin@s159a.example',
        displayName: 'S159 Admin',
        idpSubject: 'idp|s159-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH159',
      name: 'Sprint159 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK159',
      name: 'PAK159 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK159-STD',
      name: 'PAK159 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s159',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stotri',
      company: 'Stotri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
    warehouseId = warehouse.body.id as string;
    skuId = sku.body.id as string;
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId,
      quantity: 2,
      unitPrice: 5,
    });
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let sessionId = '';

  it('COM-003: one open session per register', async () => {
    const opened = await api('POST', '/api/v1/pos/sessions', tokenA, {
      registerCode: 'KASA-1',
      openingFloat: 100,
    });
    expect(opened.status).toBe(201);
    sessionId = opened.body.id as string;
    expect(opened.body.status).toBe('OPEN');
    expect(opened.body.expectedCash).toBe('100.00');

    const duplicate = await api('POST', '/api/v1/pos/sessions', tokenA, {
      registerCode: 'KASA-1',
    });
    expect(duplicate.status).toBe(409);
  });

  it('COM-003: sales create pos-channel orders and accumulate cash', async () => {
    const sale = await api('POST', `/api/v1/pos/sessions/${sessionId}/sales`, tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [{ code: 'PAK159-STD', quantity: 2 }],
      cashAmount: 50,
    });
    expect(sale.status).toBe(201);
    const orderId2 = sale.body.orderId as string;
    const order = await api('GET', `/api/v1/orders/${orderId2}`, tokenA);
    expect(order.body.channel).toBe('pos');
    expect(order.body.status).toBe('CONFIRMED');
    expect((sale.body.session as Record<string, unknown>).cashSales).toBe('50');
  });

  it('COM-003: close reconciles the drawer with a variance', async () => {
    const closed = await api('POST', `/api/v1/pos/sessions/${sessionId}/close`, tokenA, {
      closingCount: 145,
    });
    expect(closed.status).toBe(201);
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.expectedCash).toBe('150.00');
    expect(closed.body.variance).toBe('-5.00');

    const late = await api('POST', `/api/v1/pos/sessions/${sessionId}/sales`, tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [{ code: 'PAK159-STD', quantity: 1 }],
      cashAmount: 10,
    });
    expect(late.status).toBe(409);

    const reclose = await api('POST', `/api/v1/pos/sessions/${sessionId}/close`, tokenA, {
      closingCount: 145,
    });
    expect(reclose.status).toBe(409);
  });

  it('AUTHZ: POS needs order permissions', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s159a', subject: 'idp|s159-nobody' });
    const denied = await api('POST', '/api/v1/pos/sessions', stranger, {
      registerCode: 'KASA-9',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
