import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 018 acceptance tests: backorders on confirmation (OMS-006),
 * backorder release when stock arrives, amendments of draft and
 * confirmed orders (OMS-009) and the fulfillment guard.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 018 — OMS depth', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s18a', subject: 'idp|s18-admin' });

  let accountId = '';
  let warehouseId = '';
  let plentySkuId = '';
  let scarceSkuId = '';

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

  async function makeSku(code: string, receipt: number): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Standard`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    if (receipt > 0) {
      await api('POST', '/api/v1/stock/movements', tokenA, {
        warehouseId,
        skuId: sku.body.id,
        movementType: 'RECEIPT',
        quantity: receipt,
        idempotencyKey: `receipt-${code}`,
      });
    }
    return sku.body.id as string;
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
      slug: 'test-s18a',
      name: 'Sprint18 Tenant',
      initialAdmin: {
        email: 'admin@s18a.example',
        displayName: 'S18 Admin',
        idpSubject: 'idp|s18-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH18',
      name: 'Sprint18 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    plentySkuId = await makeSku('PLENTY18', 1000);
    scarceSkuId = await makeSku('SCARCE18', 0);

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Osamnaest',
      company: 'Osamnaest d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function orderWith(
    lines: Array<{ skuId: string; quantity: number; unitPrice: number }>,
  ): Promise<string> {
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    for (const line of lines) {
      await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, line);
    }
    return order.body.id as string;
  }

  it('OMS-006: without allowBackorder a short line fails the whole confirm', async () => {
    const orderId = await orderWith([
      { skuId: plentySkuId, quantity: 2, unitPrice: 10 },
      { skuId: scarceSkuId, quantity: 3, unitPrice: 20 },
    ]);
    const failed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    expect(failed.status).toBeGreaterThanOrEqual(400);
    const order = await api('GET', `/api/v1/orders/${orderId}`, tokenA);
    expect(order.body.status).toBe('DRAFT');
    // Compensation: no dangling reservation on the plentiful line.
    const reservations = await prisma.stockReservation.count({
      where: { skuId: plentySkuId, status: 'ACTIVE' },
    });
    expect(reservations).toBe(0);
  });

  it('OMS-006: allowBackorder confirms, marks short lines, blocks fulfillment', async () => {
    const orderId = await orderWith([
      { skuId: plentySkuId, quantity: 2, unitPrice: 10 },
      { skuId: scarceSkuId, quantity: 3, unitPrice: 20 },
    ]);
    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {
      allowBackorder: true,
    });
    expect(confirmed.status).toBe(201);
    const lines = confirmed.body.lines as Array<{
      skuId: string;
      backordered: boolean;
      reservationId: string | null;
    }>;
    expect(lines.find((l) => l.skuId === plentySkuId)?.backordered).toBe(false);
    expect(lines.find((l) => l.skuId === scarceSkuId)?.backordered).toBe(true);

    const blocked = await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    expect(blocked.status).toBe(409);
    expect(String(blocked.body.message)).toContain('Backordered');

    // Stock arrives; release turns the backorder into a reservation.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: scarceSkuId,
      movementType: 'RECEIPT',
      quantity: 50,
      idempotencyKey: 'receipt-scarce-arrival',
    });
    const release = await api('POST', `/api/v1/orders/${orderId}/release-backorders`, tokenA);
    expect(release.body.released).toBe(1);
    expect(release.body.remaining).toBe(0);

    const fulfilled = await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    expect(fulfilled.status).toBe(201);
    expect(fulfilled.body.status).toBe('FULFILLED');
  });

  it('OMS-009: amendments adjust quantity, totals and reservations', async () => {
    const orderId = await orderWith([{ skuId: plentySkuId, quantity: 5, unitPrice: 10 }]);
    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    expect(confirmed.status).toBe(201);
    const lineId = (confirmed.body.lines as Array<{ id: string }>)[0]!.id;

    const amended = await api('POST', `/api/v1/orders/${orderId}/lines/${lineId}/amend`, tokenA, {
      quantity: 8,
    });
    expect(amended.status).toBe(201);
    expect(amended.body.total).toBe('80');
    const line = (
      amended.body.lines as Array<{ quantity: string; reservationId: string | null }>
    )[0]!;
    expect(Number(line.quantity)).toBe(8);
    expect(line.reservationId).not.toBeNull();

    // The amendment shows up on the timeline.
    const timeline = await api('GET', `/api/v1/orders/${orderId}/timeline`, tokenA);
    const types = (timeline.body.events as Array<{ eventType: string }>).map((e) => e.eventType);
    expect(types).toContain('order.amended');

    // A fulfilled order cannot be amended.
    await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    const late = await api('POST', `/api/v1/orders/${orderId}/lines/${lineId}/amend`, tokenA, {
      quantity: 2,
    });
    expect(late.status).toBe(409);
  });

  it('OMS-009: amendments over stock fail without losing the old reservation', async () => {
    const orderId = await orderWith([{ skuId: scarceSkuId, quantity: 10, unitPrice: 5 }]);
    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    expect(confirmed.status).toBe(201);
    const lineId = (confirmed.body.lines as Array<{ id: string }>)[0]!.id;

    const impossible = await api(
      'POST',
      `/api/v1/orders/${orderId}/lines/${lineId}/amend`,
      tokenA,
      { quantity: 100000 },
    );
    expect(impossible.status).toBeGreaterThanOrEqual(400);
    const order = await api('GET', `/api/v1/orders/${orderId}`, tokenA);
    const line = (
      order.body.lines as Array<{ quantity: string; reservationId: string | null }>
    )[0]!;
    expect(Number(line.quantity)).toBe(10);
    expect(line.reservationId).not.toBeNull();
  });
});
