import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 192 acceptance tests: courier carriers, reverse logistics,
 * dock scheduling and yard events (LOG-003/012/014/015).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 192 — reverse, docks & yard', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s192a', subject: 'idp|s192-admin' });

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
      `TRUNCATE TABLE "shipment_stop", "shipment", "vehicle", "driver", "dock_appointment", "pos_session", "package_line", "package", "landed_cost", "rfq_quote", "rfq",
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
      slug: 'test-s192a',
      name: 'Sprint192 Tenant',
      initialAdmin: {
        email: 'admin@s192a.example',
        displayName: 'S192 Admin',
        idpSubject: 'idp|s192-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH192',
      name: 'Sprint192 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK192',
      name: 'PAK192 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK192-STD',
      name: 'PAK192 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s192',
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

  let shipmentId = '';

  it('LOG-003: declared courier connectors count as carriers', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: { connectors: [{ key: 'brzi-kurir', kind: 'courier', adapter: 'noop', config: {} }] },
      },
    });
    const viaCourier = await api('POST', '/api/v1/shipments', tokenA, {
      carrierKey: 'brzi-kurir',
      stops: [{ address: 'Sarajevo, Ferhadija 12' }],
    });
    expect(viaCourier.status).toBe(201);
    shipmentId = viaCourier.body.id as string;
    // A courier shipment dispatches without own fleet.
    const dispatched = await api('POST', `/api/v1/shipments/${shipmentId}/dispatch`, tokenA);
    expect(dispatched.status).toBe(201);
  });

  it('LOG-012: a return shipment reverses the route, exactly once', async () => {
    await api('POST', `/api/v1/shipments/${shipmentId}/depart`, tokenA);
    const shipment = await api('GET', `/api/v1/shipments/${shipmentId}`, tokenA);
    const stopId = (shipment.body.stops as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/shipments/${shipmentId}/stops/${stopId}/complete`, tokenA);
    await api('POST', `/api/v1/shipments/${shipmentId}/deliver`, tokenA);

    const returned = await api('POST', `/api/v1/shipments/${shipmentId}/return`, tokenA);
    expect(returned.status).toBe(201);
    expect(returned.body.status).toBe('PLANNED');
    expect(returned.body.carrierKey).toBe('brzi-kurir');

    const again = await api('POST', `/api/v1/shipments/${shipmentId}/return`, tokenA);
    expect(again.status).toBe(409);

    const tooEarly = await api('POST', `/api/v1/shipments/${returned.body.id}/return`, tokenA);
    expect(tooEarly.status).toBe(409);
  });

  it('LOG-014: dock appointments refuse overlapping bookings', async () => {
    const at = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const first = await api('POST', '/api/v1/docks', tokenA, {
      warehouseId,
      dockCode: 'D1',
      scheduledAt: at,
      durationMin: 60,
      reference: 'ASN-192',
    });
    expect(first.status).toBe(201);

    const overlap = await api('POST', '/api/v1/docks', tokenA, {
      warehouseId,
      dockCode: 'd1',
      scheduledAt: new Date(Date.parse(at) + 30 * 60_000).toISOString(),
      durationMin: 60,
    });
    expect(overlap.status).toBe(409);

    const otherDock = await api('POST', '/api/v1/docks', tokenA, {
      warehouseId,
      dockCode: 'D2',
      scheduledAt: at,
    });
    expect(otherDock.status).toBe(201);
  });

  it('LOG-015: yard events move the appointment through its day', async () => {
    const list = await api('GET', `/api/v1/docks?warehouseId=${warehouseId}`, tokenA);
    const appointment = (list.body.appointments as Array<{ id: string; dockCode: string }>).find(
      (a) => a.dockCode === 'D1',
    );
    const id = appointment?.id as string;

    const departEarly = await api('POST', `/api/v1/docks/${id}/yard`, tokenA, {
      event: 'DEPARTED',
    });
    expect(departEarly.status).toBe(409);

    const arrived = await api('POST', `/api/v1/docks/${id}/yard`, tokenA, { event: 'ARRIVED' });
    expect(arrived.body.status).toBe('AT_DOCK');
    const departed = await api('POST', `/api/v1/docks/${id}/yard`, tokenA, {
      event: 'DEPARTED',
      note: 'Kamion otišao pun.',
    });
    expect(departed.body.status).toBe('DONE');

    const yardEvents = await prisma.auditEvent.count({ where: { action: 'log.yard.event' } });
    expect(yardEvents).toBe(2);
  });
});
