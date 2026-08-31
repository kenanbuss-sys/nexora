import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 007 acceptance tests (docs/implementation/SPRINT_007_OMS.md):
 * canonical orders, quote conversion, confirmation with stock reservation
 * orchestration, holds, cancellation compensation, and idempotent
 * ledger-issued fulfillment.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 007 — OMS', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s7a', subject: 'idp|s7-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s7b', subject: 'idp|s7b-admin' });

  let skuId = '';
  let accountId = '';
  let warehouseId = '';

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

  async function position(): Promise<{ onHand: number; reserved: number; available: number }> {
    const r = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    return {
      onHand: Number(r.body.onHand),
      reserved: Number(r.body.reserved),
      available: Number(r.body.available),
    };
  }

  async function createOrderWithLine(quantity: number): Promise<string> {
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    expect(order.status).toBe(201);
    const line = await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity,
      unitPrice: 100,
    });
    expect(line.status).toBe(201);
    return order.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "order_event", "sales_order_line", "sales_order",
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
      slug: 'test-s7a',
      name: 'Sprint7 Tenant A',
      initialAdmin: {
        email: 'admin@s7a.example',
        displayName: 'S7 Admin',
        idpSubject: 'idp|s7-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s7b',
      name: 'Sprint7 Tenant B',
      initialAdmin: {
        email: 'admin@s7b.example',
        displayName: 'S7B Admin',
        idpSubject: 'idp|s7b-admin',
      },
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'GADGET-01',
      name: 'Gadget',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'GADGET-01-STD',
      name: 'Gadget Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH7',
      name: 'Sprint7 warehouse',
    });
    warehouseId = warehouse.body.id as string;

    // Stock on hand: 100 pcs.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 100,
      idempotencyKey: 'receipt-s7-0001',
    });

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Omer Narucilac',
      company: 'Narucilac d.o.o.',
      email: 'omer@narucilac.example',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('OMS: order lifecycle — draft, confirm reserves stock, fulfill issues it', async () => {
    const orderId = await createOrderWithLine(10);

    const before = await position();
    expect(before.available).toBe(100);

    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.status).toBe('CONFIRMED');
    const lines = confirmed.body.lines as Array<{ reservationId: string | null }>;
    expect(lines[0]?.reservationId).toBeTruthy();

    const reserved = await position();
    expect(reserved.onHand).toBe(100);
    expect(reserved.reserved).toBe(10);
    expect(reserved.available).toBe(90);

    const fulfilled = await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    expect(fulfilled.status).toBe(201);
    expect(fulfilled.body.status).toBe('FULFILLED');

    const after = await position();
    expect(after.onHand).toBe(90);
    expect(after.reserved).toBe(0);
    expect(after.available).toBe(90);

    // Timeline recorded every transition (OMS-013).
    const timeline = await api('GET', `/api/v1/orders/${orderId}/timeline`, tokenA);
    const types = (timeline.body.events as Array<{ eventType: string }>).map((e) => e.eventType);
    expect(types).toContain('order.created');
    expect(types).toContain('order.confirmed');

    // Outbox events for the confirmation exist.
    const outbox = await prisma.outboxEvent.count({
      where: { eventType: 'order.confirmed', aggregateId: orderId },
    });
    expect(outbox).toBe(1);
  });

  it('OMS: confirming beyond available stock fails atomically (no orphan reservations)', async () => {
    const orderId = await createOrderWithLine(1000);
    const before = await position();

    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    expect(confirmed.status).toBe(409);

    const order = await api('GET', `/api/v1/orders/${orderId}`, tokenA);
    expect(order.body.status).toBe('DRAFT');

    // Compensation: reserved position unchanged.
    const after = await position();
    expect(after.reserved).toBe(before.reserved);
  });

  it('OMS: hold blocks fulfillment; release restores it; cancel frees reservations', async () => {
    const orderId = await createOrderWithLine(5);
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);

    const held = await api('POST', `/api/v1/orders/${orderId}/hold`, tokenA, {
      reason: 'Credit check pending',
    });
    expect(held.status).toBe(201);
    expect(held.body.status).toBe('ON_HOLD');

    const fulfillHeld = await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    expect(fulfillHeld.status).toBe(409);

    const released = await api('POST', `/api/v1/orders/${orderId}/release`, tokenA);
    expect(released.body.status).toBe('CONFIRMED');

    const beforeCancel = await position();
    const cancelled = await api('POST', `/api/v1/orders/${orderId}/cancel`, tokenA);
    expect(cancelled.body.status).toBe('CANCELLED');

    const after = await position();
    expect(after.reserved).toBe(beforeCancel.reserved - 5);

    // Cancelled orders cannot be fulfilled.
    const fulfillCancelled = await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    expect(fulfillCancelled.status).toBe(409);
  });

  it('OMS: fulfillment retry is idempotent — stock is issued exactly once', async () => {
    const orderId = await createOrderWithLine(4);
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    const before = await position();

    await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    // A retry of the same fulfillment must not double-issue.
    await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);

    const after = await position();
    expect(after.onHand).toBe(before.onHand - 4);
  });

  it('OMS: an accepted quote converts to an order exactly once, copying priced lines', async () => {
    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'PL7',
      name: 'Sprint7 list',
      currency: 'EUR',
    });
    await api('PUT', `/api/v1/price-lists/${list.body.id}/entries`, tokenA, {
      skuId,
      unitPrice: 250,
    });
    await api('POST', `/api/v1/price-lists/${list.body.id}/publish`, tokenA);

    const quote = await api('POST', '/api/v1/quotes', tokenA, {
      accountId,
      priceListId: list.body.id,
    });
    await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId,
      quantity: 2,
    });
    await api('POST', `/api/v1/quotes/${quote.body.id}/submit`, tokenA);
    await api('POST', `/api/v1/quotes/${quote.body.id}/send`, tokenA);
    await api('POST', `/api/v1/quotes/${quote.body.id}/accept`, tokenA);

    const order = await api('POST', '/api/v1/orders/from-quote', tokenA, {
      quoteId: quote.body.id,
      warehouseId,
    });
    expect(order.status).toBe(201);
    expect(order.body.total).toBe('500');
    expect((order.body.lines as unknown[]).length).toBe(1);

    // A second conversion is refused.
    const again = await api('POST', '/api/v1/orders/from-quote', tokenA, {
      quoteId: quote.body.id,
      warehouseId,
    });
    expect(again.status).toBe(409);

    // A draft quote does not convert.
    const draftQuote = await api('POST', '/api/v1/quotes', tokenA, {
      accountId,
      priceListId: list.body.id,
    });
    const refused = await api('POST', '/api/v1/orders/from-quote', tokenA, {
      quoteId: draftQuote.body.id,
      warehouseId,
    });
    expect(refused.status).toBe(409);
  });

  it('TENANCY: orders are invisible across tenants; permissions are enforced', async () => {
    const orders = await api('GET', '/api/v1/orders', tokenB);
    expect(orders.status).toBe(200);
    expect((orders.body.orders as unknown[]).length).toBe(0);

    const list = await api('GET', '/api/v1/orders', tokenA);
    const first = (list.body.orders as Array<{ id: string }>)[0];
    expect(first).toBeTruthy();

    const foreign = await api('GET', `/api/v1/orders/${first?.id}`, tokenB);
    expect(foreign.status).toBe(404);

    const foreignCancel = await api('POST', `/api/v1/orders/${first?.id}/cancel`, tokenB);
    expect([403, 404]).toContain(foreignCancel.status);
  });
});
