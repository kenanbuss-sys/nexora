import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 191 acceptance tests: load planning, POD, freight cost and
 * delivery exceptions (LOG-007/010/011/013).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 191 — load, POD & freight', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s191a', subject: 'idp|s191-admin' });

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
      slug: 'test-s191a',
      name: 'Sprint191 Tenant',
      initialAdmin: {
        email: 'admin@s191a.example',
        displayName: 'S191 Admin',
        idpSubject: 'idp|s191-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH191',
      name: 'Sprint191 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK191',
      name: 'PAK191 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK191-STD',
      name: 'PAK191 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s191',
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

  it('LOG-007: the load plan compares packed weight to vehicle capacity', async () => {
    const vehicle = await api('POST', '/api/v1/logistics/vehicles', tokenA, {
      plate: 'K19-M-001',
      name: 'Mali kombi',
      capacityKg: 10,
    });
    vehicleId = vehicle.body.id as string;
    const driver = await api('POST', '/api/v1/logistics/drivers', tokenA, { name: 'Vozač 191' });
    driverId = driver.body.id as string;

    const withLine = await api('GET', `/api/v1/orders/${orderId}`, tokenA);
    const lineId = (withLine.body.lines as Array<{ id: string }>)[0]?.id as string;
    const pkg = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 2 }],
      weightKg: 14.5,
    });
    expect(pkg.status).toBe(201);

    const shipment = await api('POST', '/api/v1/shipments', tokenA, {
      vehicleId,
      driverId,
      stops: [{ address: 'Sarajevo, Obala 10', orderId }],
    });
    shipmentId = shipment.body.id as string;

    const plan = await api('GET', `/api/v1/shipments/${shipmentId}/load-plan`, tokenA);
    expect(plan.status).toBe(200);
    expect(plan.body.totalKg).toBe('14.50');
    expect(plan.body.capacityKg).toBe('10.00');
    expect(plan.body.overloaded).toBe(true);
    expect(plan.body.packages).toBe(1);
  });

  it('LOG-013: freight cost records and reports per carrier', async () => {
    const set = await api('POST', `/api/v1/shipments/${shipmentId}/freight`, tokenA, {
      cost: 85.5,
      currency: 'EUR',
    });
    expect(set.status).toBe(201);
    expect(set.body.freightCost).toBe('85.5');

    const report = await api('GET', '/api/v1/shipments/reports/freight', tokenA);
    const rows = report.body.rows as Array<Record<string, unknown>>;
    expect(rows[0]?.carrier).toBe('(vlastita flota)');
    expect(rows[0]?.totalCost).toBe('85.50');
  });

  it('LOG-010: POD countersigns once, at or after delivery', async () => {
    const early = await api('POST', `/api/v1/shipments/${shipmentId}/pod`, tokenA, {
      name: 'Primalac Rani',
      pin: '1234',
    });
    expect(early.status).toBe(409);

    await api('POST', `/api/v1/shipments/${shipmentId}/dispatch`, tokenA);
    await api('POST', `/api/v1/shipments/${shipmentId}/depart`, tokenA);
    const pod = await api('POST', `/api/v1/shipments/${shipmentId}/pod`, tokenA, {
      name: 'Amira Primalac',
      pin: '4711',
    });
    expect(pod.status).toBe(201);

    const again = await api('POST', `/api/v1/shipments/${shipmentId}/pod`, tokenA, {
      name: 'Amira Primalac',
      pin: '4711',
    });
    expect(again.status).toBe(409);
  });

  it('LOG-011: the exceptions desk lists excepted shipments and failed stops', async () => {
    const shipment = await api('GET', `/api/v1/shipments/${shipmentId}`, tokenA);
    const stopId = (shipment.body.stops as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/shipments/${shipmentId}/stops/${stopId}/complete`, tokenA, {
      failed: true,
      note: 'Niko na adresi.',
    });
    await api('POST', `/api/v1/shipments/${shipmentId}/exception`, tokenA, {
      reason: 'Neuspjela dostava, vraćanje u skladište.',
    });

    const desk = await api('GET', '/api/v1/shipments/reports/exceptions', tokenA);
    expect(desk.status).toBe(200);
    expect((desk.body.exceptedShipments as unknown[]).length).toBe(1);
    const failedStops = desk.body.failedStops as Array<Record<string, unknown>>;
    expect(failedStops[0]?.note).toBe('Niko na adresi.');
  });
});
