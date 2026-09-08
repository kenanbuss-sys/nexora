import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 156 acceptance tests: photo evidence & digital signature
 * (VER-015/016) — evidence attachments link to scan events, and named
 * signers countersign business objects with PIN-hashed signatures.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 156 — evidence & signatures', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s156a', subject: 'idp|s156-admin' });

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
      slug: 'test-s156a',
      name: 'Sprint156 Tenant',
      initialAdmin: {
        email: 'admin@s156a.example',
        displayName: 'S156 Admin',
        idpSubject: 'idp|s156-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH156',
      name: 'Sprint156 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK156',
      name: 'PAK156 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK156-STD',
      name: 'PAK156 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s156',
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

  let scanEventId = '';

  it('VER-015: photo evidence links to a scan event, audited', async () => {
    const registered = await api('POST', '/api/v1/devices', tokenA, {
      code: 'CAM-156',
      name: 'Kamera 156',
      deviceType: 'SCANNER',
    });
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: registered.body.enrollmentToken,
      appVersion: '1.0.0',
    });
    const envelope = await api('POST', '/api/v1/scan-events', tokenA, {
      enrollmentToken: registered.body.enrollmentToken,
      events: [
        {
          clientEventId: 'evt-s156-1',
          kind: 'QR',
          value: 'evidence:case-1',
          capturedAt: new Date().toISOString(),
        },
      ],
    });
    expect(envelope.status).toBe(201);
    const events = await api('GET', '/api/v1/scan-events', tokenA);
    scanEventId = (events.body.events as Array<{ id: string }>)[0]?.id as string;

    const photo = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'work_order',
      entityId: scanEventId,
      fileName: 'dokaz.txt',
      contentType: 'text/plain',
      dataBase64: Buffer.from('fotografija dokaza').toString('base64'),
    });
    expect(photo.status).toBe(201);

    const linked = await api('POST', `/api/v1/scan-events/${scanEventId}/evidence`, tokenA, {
      attachmentId: photo.body.id,
    });
    expect(linked.status).toBe(201);
    expect(linked.body.ok).toBe(true);

    const audits = await prisma.auditEvent.count({
      where: { action: 'ver.evidence.link', objectId: scanEventId },
    });
    expect(audits).toBe(1);

    const ghost = await api(
      'POST',
      '/api/v1/scan-events/00000000-0000-0000-0000-000000000000/evidence',
      tokenA,
      { attachmentId: photo.body.id },
    );
    expect(ghost.status).toBe(404);
  });

  it('VER-016: a signature is recorded as a hash and verifies only with the right PIN', async () => {
    const signed = await api('POST', '/api/v1/scan-events/signatures', tokenA, {
      objectType: 'work_order',
      objectId: 'wo-156-demo',
      signerName: 'Amir Operater',
      pin: '4711',
    });
    expect(signed.status).toBe(201);
    expect(signed.body.signatureHash).toMatch(/^[a-f0-9]{64}$/);

    const valid = await api('POST', '/api/v1/scan-events/signatures/verify', tokenA, {
      objectType: 'work_order',
      objectId: 'wo-156-demo',
      signerName: 'Amir Operater',
      pin: '4711',
    });
    expect(valid.body.valid).toBe(true);
    expect(valid.body.signedAt).toBeTruthy();

    const wrongPin = await api('POST', '/api/v1/scan-events/signatures/verify', tokenA, {
      objectType: 'work_order',
      objectId: 'wo-156-demo',
      signerName: 'Amir Operater',
      pin: '9999',
    });
    expect(wrongPin.body.valid).toBe(false);
  });

  it('VER-016: validation — weak PINs and bad object types', async () => {
    const weak = await api('POST', '/api/v1/scan-events/signatures', tokenA, {
      objectType: 'work_order',
      objectId: 'wo-156-demo',
      signerName: 'Amir Operater',
      pin: 'abcd',
    });
    expect(weak.status).toBe(400);
    const badType = await api('POST', '/api/v1/scan-events/signatures', tokenA, {
      objectType: 'WO!',
      objectId: 'wo-156-demo',
      signerName: 'Amir Operater',
      pin: '4711',
    });
    expect(badType.status).toBe(400);
  });

  it('AUTHZ: signatures need production.execute', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s156a', subject: 'idp|s156-nobody' });
    const denied = await api('POST', '/api/v1/scan-events/signatures', stranger, {
      objectType: 'work_order',
      objectId: 'x',
      signerName: 'Niko',
      pin: '1234',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
