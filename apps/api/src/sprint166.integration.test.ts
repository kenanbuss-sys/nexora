import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 166 acceptance tests: offline mobile execution (WMS-025) —
 * line confirmations queued offline as scan events replay into WMS
 * order processing exactly once, malformed values are reported.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 166 — offline execution', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s166a', subject: 'idp|s166-admin' });

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
      slug: 'test-s166a',
      name: 'Sprint166 Tenant',
      initialAdmin: {
        email: 'admin@s166a.example',
        displayName: 'S166 Admin',
        idpSubject: 'idp|s166-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH166',
      name: 'Sprint166 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK166',
      name: 'PAK166 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK166-STD',
      name: 'PAK166 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s166',
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

  let wmsOrderId = '';
  let wmsLineId = '';
  let deviceToken = '';

  it('WMS-025: offline-queued confirmations replay into the ledger exactly once', async () => {
    const wmsOrder = await api('POST', '/api/v1/wms/orders', tokenA, {
      orderType: 'RECEIVING',
      warehouseId,
      reference: 'ASN-166',
      lines: [{ skuId, expectedQty: 50 }],
    });
    expect(wmsOrder.status).toBe(201);
    wmsOrderId = wmsOrder.body.id as string;
    wmsLineId = (wmsOrder.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/wms/orders/${wmsOrderId}/start`, tokenA);

    const registered = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-166',
      name: 'Ručni 166',
      deviceType: 'SCANNER',
    });
    deviceToken = registered.body.enrollmentToken as string;
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: deviceToken,
      appVersion: '1.0.0',
    });
    // Offline queue: two picks of 10 and 5, one malformed entry.
    const envelope = await api('POST', '/api/v1/scan-events', tokenA, {
      enrollmentToken: deviceToken,
      events: [
        {
          clientEventId: 'off-166-1',
          kind: 'QR',
          value: `wms-exec:${wmsOrderId}:${wmsLineId}:10`,
          capturedAt: new Date().toISOString(),
        },
        {
          clientEventId: 'off-166-2',
          kind: 'QR',
          value: `wms-exec:${wmsOrderId}:${wmsLineId}:5`,
          capturedAt: new Date().toISOString(),
        },
        {
          clientEventId: 'off-166-3',
          kind: 'QR',
          value: 'wms-exec:garbage',
          capturedAt: new Date().toISOString(),
        },
      ],
    });
    expect(envelope.status).toBe(201);

    const drained = await api('POST', '/api/v1/wms/orders/offline/apply', tokenA);
    expect(drained.status).toBe(201);
    expect(drained.body.scanned).toBe(3);
    expect(drained.body.applied).toBe(2);
    expect((drained.body.failed as unknown[]).length).toBe(1);

    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(Number(position.body.onHand)).toBe(35); // 20 receipt in setup + 15 offline
  });

  it('WMS-025: a second drain applies nothing new', async () => {
    const again = await api('POST', '/api/v1/wms/orders/offline/apply', tokenA);
    expect(again.body.applied).toBe(0);
    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(Number(position.body.onHand)).toBe(35);
  });

  it('AUTHZ: draining needs inventory.adjust', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s166a', subject: 'idp|s166-nobody' });
    const denied = await api('POST', '/api/v1/wms/orders/offline/apply', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
