import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 141 acceptance tests: unified channel attribution (COM-006)
 * — every order carries its intake channel (direct by default, store
 * for endless aisle, explicit codes for web/POS) and the channel mix
 * report aggregates orders and revenue per channel.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 141 — channel attribution', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s141a', subject: 'idp|s141-admin' });

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
      `TRUNCATE TABLE "package_line", "package", "landed_cost", "rfq_quote", "rfq",
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
      slug: 'test-s141a',
      name: 'Sprint141 Tenant',
      initialAdmin: {
        email: 'admin@s141a.example',
        displayName: 'S141 Admin',
        idpSubject: 'idp|s141-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH141',
      name: 'Sprint141 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK141',
      name: 'PAK141 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK141-STD',
      name: 'PAK141 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s141',
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

  it('COM-006: orders default to the direct channel', async () => {
    const order = await api('GET', `/api/v1/orders/${orderId}`, tokenA);
    expect(order.status).toBe(200);
    expect(order.body.channel).toBe('direct');
  });

  it('COM-006: an explicit channel is stored and validated', async () => {
    const web = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      channel: 'webshop',
    });
    expect(web.status).toBe(201);
    expect(web.body.channel).toBe('webshop');

    const bad = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      channel: 'BAD CHANNEL',
    });
    expect(bad.status).toBe(400);
  });

  it('COM-006: endless-aisle orders are attributed to the store channel', async () => {
    const aisle = await api('POST', '/api/v1/orders/endless-aisle', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [{ code: 'PAK141-STD', quantity: 1 }],
    });
    expect(aisle.status).toBe(201);
    const created = aisle.body.order as Record<string, unknown>;
    expect(created.channel).toBe('store');
  });

  it('COM-006: the channel mix aggregates orders and revenue per channel', async () => {
    const r = await api('GET', '/api/v1/orders/channel-mix', tokenA);
    expect(r.status).toBe(200);
    const mix = r.body.mix as Array<{ channel: string; orders: number; revenue: string }>;
    const channels = Object.fromEntries(mix.map((m) => [m.channel, m]));
    expect(channels.direct?.orders).toBe(1);
    expect(channels.webshop?.orders).toBe(1);
    expect(channels.store?.orders).toBe(1);
    expect(Number(channels.direct?.revenue)).toBeCloseTo(10);
  });

  it('AUTHZ: the channel mix needs order.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s141a', subject: 'idp|s141-nobody' });
    const denied = await api('GET', '/api/v1/orders/channel-mix', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
