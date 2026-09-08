import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 170 acceptance tests: scale adapter (DEV-008) — registered
 * scales push package weights device-authenticated and idempotent
 * per capture; only SCALE devices and unshipped packages qualify.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 170 — scale adapter', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s170a', subject: 'idp|s170-admin' });

  let orderId = '';
  let lineId = '';
  let packageId = '';

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
      slug: 'test-s170a',
      name: 'Sprint170 Tenant',
      initialAdmin: {
        email: 'admin@s170a.example',
        displayName: 'S170 Admin',
        idpSubject: 'idp|s170-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH170',
      name: 'Sprint170 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK170',
      name: 'PAK170 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK170-STD',
      name: 'PAK170 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s170',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stotri',
      company: 'Stotri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { wms: { gs1CompanyPrefix: '3859999' } },
    });

    orderId = order.body.id as string;
    const withLine = await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId: sku.body.id,
      quantity: 12,
      unitPrice: 5,
    });
    lineId = (withLine.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let scaleToken = '';
  let packageNumber = '';

  it('DEV-008: a scale pushes the package weight, idempotently per capture', async () => {
    const scale = await api('POST', '/api/v1/devices', tokenA, {
      code: 'VAGA-170',
      name: 'Vaga 170',
      deviceType: 'SCALE',
    });
    scaleToken = scale.body.enrollmentToken as string;
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: scaleToken,
      appVersion: '1.0.0',
    });

    const pkg = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 6 }],
    });
    packageId = pkg.body.id as string;
    packageNumber = pkg.body.packageNumber as string;
    expect(pkg.body.weightKg).toBeNull();

    const captured = await api('POST', '/api/v1/devices/weights', tokenA, {
      enrollmentToken: scaleToken,
      packageNumber,
      weightKg: 7.35,
      captureId: 'cap-170-1',
    });
    expect(captured.status).toBe(201);
    expect(captured.body.duplicate).toBe(false);

    const replay = await api('POST', '/api/v1/devices/weights', tokenA, {
      enrollmentToken: scaleToken,
      packageNumber,
      weightKg: 7.35,
      captureId: 'cap-170-1',
    });
    expect(replay.body.duplicate).toBe(true);

    const list = await api('GET', `/api/v1/packages?orderId=${orderId}`, tokenA);
    const row = (list.body.packages as Array<Record<string, unknown>>).find(
      (p) => p.id === packageId,
    );
    expect(Number(row?.weightKg)).toBeCloseTo(7.35);
  });

  it('DEV-008: only SCALE devices push weights; shipped packages refuse', async () => {
    const scanner = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-170',
      name: 'Ručni 170',
      deviceType: 'SCANNER',
    });
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: scanner.body.enrollmentToken,
      appVersion: '1.0.0',
    });
    const wrongType = await api('POST', '/api/v1/devices/weights', tokenA, {
      enrollmentToken: scanner.body.enrollmentToken,
      packageNumber,
      weightKg: 5,
      captureId: 'cap-170-2',
    });
    expect(wrongType.status).toBe(409);

    await api('POST', `/api/v1/packages/${packageId}/stage`, tokenA);
    await api('POST', `/api/v1/packages/${packageId}/ship`, tokenA);
    const late = await api('POST', '/api/v1/devices/weights', tokenA, {
      enrollmentToken: scaleToken,
      packageNumber,
      weightKg: 9,
      captureId: 'cap-170-3',
    });
    expect(late.status).toBe(409);
  });

  it('DEV-008: unknown tokens and packages are refused', async () => {
    const badToken = await api('POST', '/api/v1/devices/weights', tokenA, {
      enrollmentToken: 'xxxxxxxxxxxx',
      packageNumber,
      weightKg: 5,
      captureId: 'cap-170-4',
    });
    expect(badToken.status).toBe(401);
    const ghost = await api('POST', '/api/v1/devices/weights', tokenA, {
      enrollmentToken: scaleToken,
      packageNumber: 'PKG-999999',
      weightKg: 5,
      captureId: 'cap-170-5',
    });
    expect(ghost.status).toBe(404);
  });
});
