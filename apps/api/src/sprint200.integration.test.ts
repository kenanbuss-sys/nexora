import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 200 acceptance tests: data governance & legal holds
 * (GRC-010/011) — classification gaps are visible and held entities
 * survive retention purges.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 200 — governance & legal holds', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s200a', subject: 'idp|s200-admin' });

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
      slug: 'test-s200a',
      name: 'Sprint200 Tenant',
      initialAdmin: {
        email: 'admin@s200a.example',
        displayName: 'S200 Admin',
        idpSubject: 'idp|s200-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH200',
      name: 'Sprint200 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK200',
      name: 'PAK200 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK200-STD',
      name: 'PAK200 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s200',
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

  it('GRC-010: the gap report flags unprotected confidential data', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        grc: {
          dataClasses: [
            { entityType: 'invoice', class: 'confidential' },
            { entityType: 'sales_order', class: 'internal' },
          ],
        },
        doc: { retention: [{ entityType: 'sales_order', days: 30 }] },
      },
    });
    const report = await api('GET', '/api/v1/grc/data-governance', tokenA);
    expect(report.status).toBe(200);
    const rows = report.body.rows as Array<Record<string, unknown>>;
    const invoice = rows.find((r) => r.entityType === 'invoice');
    expect(invoice?.gap).toBe(true);
    const order = rows.find((r) => r.entityType === 'sales_order');
    expect(order?.gap).toBe(false);
    expect(order?.retentionConfigured).toBe(true);
  });

  it('GRC-011: legal holds exempt entities from retention purges', async () => {
    const oldDate = new Date(Date.now() - 90 * 86_400_000);
    const held = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'sales_order',
      entityId: orderId,
      fileName: 'drzani.txt',
      contentType: 'text/plain',
      dataBase64: Buffer.from('dokaz za sud').toString('base64'),
    });
    const purgeable = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'sales_order',
      entityId: '00000000-0000-0000-0000-00000000dead',
      fileName: 'stari.txt',
      contentType: 'text/plain',
      dataBase64: Buffer.from('stari dokument').toString('base64'),
    });
    await prisma.attachment.updateMany({
      where: { id: { in: [held.body.id as string, purgeable.body.id as string] } },
      data: { createdAt: oldDate },
    });

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        doc: { retention: [{ entityType: 'sales_order', days: 30 }] },
        grc: { legalHolds: [{ entityType: 'sales_order', entityId: orderId }] },
      },
    });
    const run = await api('POST', '/api/v1/attachments/retention/run', tokenA);
    expect(run.status).toBe(201);

    const survivors = await prisma.attachment.findMany({
      where: { entityType: 'sales_order' },
      select: { id: true },
    });
    const ids = survivors.map((a) => a.id);
    expect(ids).toContain(held.body.id);
    expect(ids).not.toContain(purgeable.body.id);

    const holdAudits = await prisma.auditEvent.count({ where: { action: 'doc.retention.hold' } });
    expect(holdAudits).toBe(1);
  });
});
