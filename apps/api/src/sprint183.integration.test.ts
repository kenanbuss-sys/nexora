import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 183 acceptance tests: RFID & camera adapters (DEV-007/009)
 * — RFID captures resolve to SKUs at ingest via the tag registry,
 * and devices upload photo evidence with their enrollment token.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 183 — RFID & camera adapters', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s183a', subject: 'idp|s183-admin' });

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
      slug: 'test-s183a',
      name: 'Sprint183 Tenant',
      initialAdmin: {
        email: 'admin@s183a.example',
        displayName: 'S183 Admin',
        idpSubject: 'idp|s183-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH183',
      name: 'Sprint183 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK183',
      name: 'PAK183 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK183-STD',
      name: 'PAK183 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s183',
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

  let deviceToken = '';
  let rfidEventId = '';

  it('DEV-007: RFID captures resolve to SKUs at ingest', async () => {
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'RF183',
      name: 'RF183 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'RF183-STD',
      name: 'RF183 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        ver: { rfidTags: [{ tag: 'E2000017221101441890', skuCode: 'RF183-STD' }] },
      },
    });
    const registered = await api('POST', '/api/v1/devices', tokenA, {
      code: 'RFID-183',
      name: 'RFID čitač 183',
      deviceType: 'SCANNER',
    });
    deviceToken = registered.body.enrollmentToken as string;
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: deviceToken,
      appVersion: '1.0.0',
    });
    const envelope = await api('POST', '/api/v1/scan-events', tokenA, {
      enrollmentToken: deviceToken,
      events: [
        {
          clientEventId: 'rf-183-1',
          kind: 'RFID',
          value: 'e2000017221101441890',
          capturedAt: new Date().toISOString(),
        },
        {
          clientEventId: 'rf-183-2',
          kind: 'RFID',
          value: 'DEADBEEF00000001',
          capturedAt: new Date().toISOString(),
        },
      ],
    });
    expect(envelope.status).toBe(201);

    const events = await api('GET', '/api/v1/scan-events', tokenA);
    const rows = events.body.events as Array<Record<string, unknown>>;
    const resolved = rows.find((e) => e.clientEventId === 'rf-183-1');
    rfidEventId = resolved?.id as string;
    expect(resolved?.resolvedSkuId).toBe(sku.body.id);
    const unresolved = rows.find((e) => e.clientEventId === 'rf-183-2');
    expect(unresolved?.resolvedSkuId).toBeNull();
  });

  it('DEV-009: devices upload photo evidence with their token', async () => {
    const uploaded = await api('POST', '/api/v1/devices/evidence', tokenA, {
      enrollmentToken: deviceToken,
      scanEventId: rfidEventId,
      fileName: 'dokaz.jpg',
      contentType: 'text/plain',
      dataBase64: Buffer.from('slika dokaza').toString('base64'),
    });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.ok).toBe(true);

    const links = await prisma.auditEvent.count({
      where: { action: 'ver.evidence.link', objectId: rfidEventId },
    });
    expect(links).toBe(1);

    const badToken = await api('POST', '/api/v1/devices/evidence', tokenA, {
      enrollmentToken: 'xxxxxxxxxxxx',
      scanEventId: rfidEventId,
      fileName: 'dokaz.jpg',
      contentType: 'text/plain',
      dataBase64: Buffer.from('x').toString('base64'),
    });
    expect(badToken.status).toBe(401);

    const ghost = await api('POST', '/api/v1/devices/evidence', tokenA, {
      enrollmentToken: deviceToken,
      scanEventId: '00000000-0000-0000-0000-000000000000',
      fileName: 'dokaz.jpg',
      contentType: 'text/plain',
      dataBase64: Buffer.from('x').toString('base64'),
    });
    expect(ghost.status).toBe(404);
  });
});
