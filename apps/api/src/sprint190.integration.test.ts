import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 190 acceptance tests: logistics core (LOG-001/002/004/005/
 * 006/008/009) — fleet & drivers, configured carriers, shipment
 * planning with sequenced stops, dispatch guards and stop-by-stop
 * trace to delivery.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 190 — logistics core', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s190a', subject: 'idp|s190-admin' });

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
      slug: 'test-s190a',
      name: 'Sprint190 Tenant',
      initialAdmin: {
        email: 'admin@s190a.example',
        displayName: 'S190 Admin',
        idpSubject: 'idp|s190-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH190',
      name: 'Sprint190 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK190',
      name: 'PAK190 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK190-STD',
      name: 'PAK190 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s190',
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


  let vehicleId = '';
  let driverId = '';
  let shipmentId = '';

  it('LOG-004/005: fleet and drivers register with governed validation', async () => {
    const vehicle = await api('POST', '/api/v1/logistics/vehicles', tokenA, {
      plate: 'A12-K-345',
      name: 'Kombi 1',
      capacityKg: 1200,
    });
    expect(vehicle.status).toBe(201);
    vehicleId = vehicle.body.id as string;

    const duplicate = await api('POST', '/api/v1/logistics/vehicles', tokenA, {
      plate: 'a12-k-345',
      name: 'Kombi duplikat',
    });
    expect(duplicate.status).toBe(409);

    const driver = await api('POST', '/api/v1/logistics/drivers', tokenA, {
      name: 'Vozač Jedan',
      licenseNo: 'C1-556677',
    });
    expect(driver.status).toBe(201);
    driverId = driver.body.id as string;
  });

  it('LOG-001/002/006: shipments plan with sequenced stops and validated carriers', async () => {
    const badCarrier = await api('POST', '/api/v1/shipments', tokenA, {
      carrierKey: 'nepoznat',
      stops: [{ address: 'Sarajevo, Titova 1' }],
    });
    expect(badCarrier.status).toBe(400);

    const created = await api('POST', '/api/v1/shipments', tokenA, {
      vehicleId,
      driverId,
      stops: [{ address: 'Sarajevo, Titova 1', orderId }, { address: 'Zenica, Bulevar 5' }],
    });
    expect(created.status).toBe(201);
    shipmentId = created.body.id as string;
    expect(created.body.shipmentNumber).toBe('SHP-000001');
    const stops = created.body.stops as Array<{ seq: number }>;
    expect(stops.map((st) => st.seq)).toEqual([1, 2]);

    const ghostOrder = await api('POST', '/api/v1/shipments', tokenA, {
      stops: [{ address: 'Mostar', orderId: '00000000-0000-0000-0000-000000000000' }],
    });
    expect(ghostOrder.status).toBe(404);
  });

  it('LOG-008/009: dispatch guards hold and stops trace to delivery in order', async () => {
    const bare = await api('POST', '/api/v1/shipments', tokenA, {
      stops: [{ address: 'Tuzla' }],
    });
    const undispatchable = await api('POST', `/api/v1/shipments/${bare.body.id}/dispatch`, tokenA);
    expect(undispatchable.status).toBe(409);

    await api('POST', `/api/v1/shipments/${shipmentId}/dispatch`, tokenA);
    await api('POST', `/api/v1/shipments/${shipmentId}/depart`, tokenA);

    const early = await api('POST', `/api/v1/shipments/${shipmentId}/deliver`, tokenA);
    expect(early.status).toBe(409);

    const shipment = await api('GET', `/api/v1/shipments/${shipmentId}`, tokenA);
    const stops = shipment.body.stops as Array<{ id: string; seq: number }>;
    const outOfOrder = await api(
      'POST',
      `/api/v1/shipments/${shipmentId}/stops/${stops[1]?.id}/complete`,
      tokenA,
    );
    expect(outOfOrder.status).toBe(409);

    await api('POST', `/api/v1/shipments/${shipmentId}/stops/${stops[0]?.id}/complete`, tokenA);
    await api('POST', `/api/v1/shipments/${shipmentId}/stops/${stops[1]?.id}/complete`, tokenA, {
      note: 'Ostavljeno na porti.',
    });
    const delivered = await api('POST', `/api/v1/shipments/${shipmentId}/deliver`, tokenA);
    expect(delivered.status).toBe(201);
    expect(delivered.body.status).toBe('DELIVERED');
    expect(delivered.body.deliveredAt).toBeTruthy();
  });

  it('LOG-008: exceptions need a reason and resume back to transit', async () => {
    const second = await api('POST', '/api/v1/shipments', tokenA, {
      vehicleId,
      driverId,
      stops: [{ address: 'Bihać' }],
    });
    const id = second.body.id as string;
    await api('POST', `/api/v1/shipments/${id}/dispatch`, tokenA);
    const noReason = await api('POST', `/api/v1/shipments/${id}/exception`, tokenA, {
      reason: 'x',
    });
    expect(noReason.status).toBe(400);
    const excepted = await api('POST', `/api/v1/shipments/${id}/exception`, tokenA, {
      reason: 'Kvar na vozilu kod Kaknja.',
    });
    expect(excepted.body.status).toBe('EXCEPTION');
    const resumed = await api('POST', `/api/v1/shipments/${id}/resume`, tokenA);
    expect(resumed.body.status).toBe('IN_TRANSIT');
  });

  it('AUTHZ: logistics needs inventory permissions', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s190a', subject: 'idp|s190-nobody' });
    const denied = await api('GET', '/api/v1/shipments', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
