import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 151 acceptance tests: OCR capture hooks (DOC-010) — stored
 * attachments run through the provider-neutral OCR port; text and
 * typed fields come back, captures are audited and policy-guarded.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 151 — OCR capture', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s151a', subject: 'idp|s151-admin' });

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
      slug: 'test-s151a',
      name: 'Sprint151 Tenant',
      initialAdmin: {
        email: 'admin@s151a.example',
        displayName: 'S151 Admin',
        idpSubject: 'idp|s151-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH151',
      name: 'Sprint151 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK151',
      name: 'PAK151 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK151-STD',
      name: 'PAK151 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s151',
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

  let attachmentId = '';

  it('DOC-010: OCR extracts text and typed fields from an attachment', async () => {
    const racun = [
      'RAČUN br: FAK-2026-091',
      'Datum: 2026-09-08',
      'Roba: vijci, 500 kom',
      'UKUPNO: EUR 1.234,50',
    ].join('\n');
    const uploaded = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'sales_order',
      entityId: orderId,
      fileName: 'racun.txt',
      contentType: 'text/plain',
      dataBase64: Buffer.from(racun).toString('base64'),
    });
    expect(uploaded.status).toBe(201);
    attachmentId = uploaded.body.id as string;

    const captured = await api('POST', `/api/v1/attachments/${attachmentId}/ocr`, tokenA);
    expect(captured.status).toBe(201);
    expect(captured.body.text).toContain('vijci');
    const fields = captured.body.fields as Record<string, string | null>;
    expect(fields.invoiceNumber).toBe('FAK-2026-091');
    expect(fields.total).toBe('1.234,50');
    expect(fields.date).toBe('2026-09-08');
  });

  it('DOC-010: captures are audited', async () => {
    const events = await prisma.auditEvent.count({
      where: { action: 'doc.ocr.capture', objectId: attachmentId },
    });
    expect(events).toBe(1);
  });

  it('DOC-010: unknown attachments are 404', async () => {
    const ghost = await api(
      'POST',
      '/api/v1/attachments/00000000-0000-0000-0000-000000000000/ocr',
      tokenA,
    );
    expect(ghost.status).toBe(404);
  });

  it('AUTHZ: capture needs collab.use', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s151a', subject: 'idp|s151-nobody' });
    const denied = await api('POST', `/api/v1/attachments/${attachmentId}/ocr`, stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
