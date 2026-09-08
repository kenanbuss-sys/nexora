import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 161 acceptance tests: courier connectors (INT-005) —
 * shipments book exactly once per (connector, package) with the SSCC
 * riding along; shipped packages and non-courier connectors refuse.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 161 — courier connectors', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s161a', subject: 'idp|s161-admin' });

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
      slug: 'test-s161a',
      name: 'Sprint161 Tenant',
      initialAdmin: {
        email: 'admin@s161a.example',
        displayName: 'S161 Admin',
        idpSubject: 'idp|s161-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH161',
      name: 'Sprint161 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK161',
      name: 'PAK161 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK161-STD',
      name: 'PAK161 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s161',
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

  let trackingRef = '';

  it('INT-005: a shipment books once per (connector, package)', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        wms: { gs1CompanyPrefix: '3859999' },
        int: {
          connectors: [
            { key: 'kurir', kind: 'courier', adapter: 'noop', config: {} },
            { key: 'shop', kind: 'commerce', adapter: 'noop', config: {} },
          ],
        },
      },
    });
    const pkg = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 6 }],
      weightKg: 4.2,
    });
    packageId = pkg.body.id as string;
    await api('POST', `/api/v1/packages/${packageId}/sscc`, tokenA);

    const booked = await api('POST', '/api/v1/connectors/kurir/shipments', tokenA, {
      packageId,
    });
    expect(booked.status).toBe(201);
    expect(booked.body.existing).toBe(false);
    trackingRef = booked.body.trackingRef as string;
    expect(trackingRef).toContain('noop:shipment');

    const retry = await api('POST', '/api/v1/connectors/kurir/shipments', tokenA, {
      packageId,
    });
    expect(retry.body.existing).toBe(true);
    expect(retry.body.trackingRef).toBe(trackingRef);
  });

  it('INT-005: only courier connectors book shipments', async () => {
    const wrong = await api('POST', '/api/v1/connectors/shop/shipments', tokenA, { packageId });
    expect(wrong.status).toBe(409);
  });

  it('INT-005: shipped packages refuse new bookings', async () => {
    const second = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 4 }],
    });
    await api('POST', `/api/v1/packages/${second.body.id}/stage`, tokenA);
    await api('POST', `/api/v1/packages/${second.body.id}/ship`, tokenA);
    const refused = await api('POST', '/api/v1/connectors/kurir/shipments', tokenA, {
      packageId: second.body.id,
    });
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: shipment booking needs inventory.adjust', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s161a', subject: 'idp|s161-nobody' });
    const denied = await api('POST', '/api/v1/connectors/kurir/shipments', stranger, {
      packageId,
    });
    expect([401, 403]).toContain(denied.status);
  });
});
