import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 182 acceptance tests: mobile version management (DEV-011) —
 * devices report app versions at enrollment; the fleet view compares
 * against the configured minimum and flags outdated devices.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 182 — version management', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s182a', subject: 'idp|s182-admin' });

  let orderId = '';

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
      slug: 'test-s182a',
      name: 'Sprint182 Tenant',
      initialAdmin: {
        email: 'admin@s182a.example',
        displayName: 'S182 Admin',
        idpSubject: 'idp|s182-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH182',
      name: 'Sprint182 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK182',
      name: 'PAK182 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK182-STD',
      name: 'PAK182 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s182',
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
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId: sku.body.id,
      quantity: 12,
      unitPrice: 5,
    });
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('DEV-011: the fleet flags devices below the configured minimum', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { dev: { minAppVersion: '2.1.0' } },
    });
    const oldDevice = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-182A',
      name: 'Stari 182',
      deviceType: 'SCANNER',
    });
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: oldDevice.body.enrollmentToken,
      appVersion: '1.9.3',
    });
    const newDevice = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-182B',
      name: 'Novi 182',
      deviceType: 'SCANNER',
    });
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: newDevice.body.enrollmentToken,
      appVersion: '2.1.0',
    });
    const silent = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-182C',
      name: 'Bez verzije 182',
      deviceType: 'SCANNER',
    });
    expect(silent.status).toBe(201);

    const fleet = await api('GET', '/api/v1/devices/fleet', tokenA);
    expect(fleet.status).toBe(200);
    expect(fleet.body.minAppVersion).toBe('2.1.0');
    const rows = fleet.body.devices as Array<Record<string, unknown>>;
    expect(rows.find((d) => d.code === 'HH-182A')?.outdated).toBe(true);
    expect(rows.find((d) => d.code === 'HH-182B')?.outdated).toBe(false);
    expect(rows.find((d) => d.code === 'HH-182C')?.outdated).toBe(true);
  });

  it('DEV-011: without a configured minimum nothing is flagged', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, { config: {} });
    const fleet = await api('GET', '/api/v1/devices/fleet', tokenA);
    expect(fleet.body.minAppVersion).toBeNull();
    const rows = fleet.body.devices as Array<Record<string, unknown>>;
    expect(rows.every((d) => d.outdated === false)).toBe(true);
  });

  it('AUTHZ: the fleet view needs device.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s182a', subject: 'idp|s182-nobody' });
    const denied = await api('GET', '/api/v1/devices/fleet', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
