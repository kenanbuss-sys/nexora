import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 169 acceptance tests: printer adapter (DEV-006) — SSCC
 * labels render to ZPL and queue per printer device; devices drain
 * with their enrollment token and acknowledge exactly once.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 169 — printer adapter', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s169a', subject: 'idp|s169-admin' });

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
      slug: 'test-s169a',
      name: 'Sprint169 Tenant',
      initialAdmin: {
        email: 'admin@s169a.example',
        displayName: 'S169 Admin',
        idpSubject: 'idp|s169-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH169',
      name: 'Sprint169 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK169',
      name: 'PAK169 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK169-STD',
      name: 'PAK169 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s169',
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

  let printerId = '';
  let printerToken = '';

  it('DEV-006: an SSCC label renders and queues on a printer, idempotently', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { wms: { gs1CompanyPrefix: '3859999' } },
    });
    const printer = await api('POST', '/api/v1/devices', tokenA, {
      code: 'ZEBRA-169',
      name: 'Zebra 169',
      deviceType: 'PRINTER',
    });
    printerId = printer.body.id as string;
    printerToken = printer.body.enrollmentToken as string;
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: printerToken,
      appVersion: '1.0.0',
    });

    const pkg = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 6 }],
    });
    packageId = pkg.body.id as string;

    const printed = await api('POST', `/api/v1/packages/${packageId}/print-label`, tokenA, {
      deviceId: printerId,
    });
    expect(printed.status).toBe(201);
    expect(printed.body.duplicate).toBe(false);
    const zpl = printed.body.zpl as string;
    expect(zpl).toContain('^XA');
    expect(zpl).toContain('SSCC 03859999');

    const again = await api('POST', `/api/v1/packages/${packageId}/print-label`, tokenA, {
      deviceId: printerId,
    });
    expect(again.body.duplicate).toBe(true);
  });

  it('DEV-006: the device drains and acknowledges its queue exactly once', async () => {
    const pending = await api(
      'GET',
      `/api/v1/devices/print-jobs?enrollmentToken=${printerToken}`,
      tokenA,
    );
    expect(pending.status).toBe(200);
    const jobs = pending.body.jobs as Array<{ jobKey: string; zpl: string }>;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.jobKey).toBe(`sscc:${packageId}`);
    expect(jobs[0]?.zpl).toContain('^XA');

    const ack = await api('POST', '/api/v1/devices/print-jobs/ack', tokenA, {
      enrollmentToken: printerToken,
      jobKey: `sscc:${packageId}`,
    });
    expect(ack.status).toBe(201);
    expect(ack.body.duplicate).toBe(false);

    const drained = await api(
      'GET',
      `/api/v1/devices/print-jobs?enrollmentToken=${printerToken}`,
      tokenA,
    );
    expect((drained.body.jobs as unknown[]).length).toBe(0);

    const reack = await api('POST', '/api/v1/devices/print-jobs/ack', tokenA, {
      enrollmentToken: printerToken,
      jobKey: `sscc:${packageId}`,
    });
    expect(reack.body.duplicate).toBe(true);
  });

  it('DEV-006: only PRINTER devices take labels; bad tokens are refused', async () => {
    const scanner = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-169',
      name: 'Ručni 169',
      deviceType: 'SCANNER',
    });
    const second = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 4 }],
    });
    const wrong = await api('POST', `/api/v1/packages/${second.body.id}/print-label`, tokenA, {
      deviceId: scanner.body.id,
    });
    expect(wrong.status).toBe(409);

    const badToken = await api(
      'GET',
      '/api/v1/devices/print-jobs?enrollmentToken=xxxxxxxxxxxx',
      tokenA,
    );
    expect(badToken.status).toBe(401);
  });
});
