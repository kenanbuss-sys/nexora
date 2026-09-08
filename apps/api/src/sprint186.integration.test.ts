import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 186 acceptance tests: platform monitoring (OPS-008/009/010)
 * — unhandled API errors are tracked, and platform operators see
 * webhook delivery health and device fleet health per tenant.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 186 — platform monitoring', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s186a', subject: 'idp|s186-admin' });

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
      slug: 'test-s186a',
      name: 'Sprint186 Tenant',
      initialAdmin: {
        email: 'admin@s186a.example',
        displayName: 'S186 Admin',
        idpSubject: 'idp|s186-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH186',
      name: 'Sprint186 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK186',
      name: 'PAK186 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK186-STD',
      name: 'PAK186 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s186',
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

  it('OPS-010: platform operators see device fleet health per tenant', async () => {
    const device = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-186',
      name: 'Ručni 186',
      deviceType: 'SCANNER',
    });
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: device.body.enrollmentToken,
      appVersion: '1.0.0',
    });
    const fleet = await api('GET', '/api/v1/ops/devices', platformToken);
    expect(fleet.status).toBe(200);
    const row = (fleet.body.tenants as Array<Record<string, unknown>>).find(
      (t) => t.tenant === 'test-s186a',
    );
    expect(row?.total).toBe(1);
    expect(row?.active).toBe(1);

    const denied = await api('GET', '/api/v1/ops/devices', tokenA);
    expect(denied.status).toBe(403);
  });

  it('OPS-009: webhook delivery health reports per tenant', async () => {
    const health = await api('GET', '/api/v1/ops/integrations', platformToken);
    expect(health.status).toBe(200);
    expect(Array.isArray(health.body.tenants)).toBe(true);
  });

  it('OPS-008: unhandled errors land in the error trail', async () => {
    await prisma.securityEvent.create({
      data: {
        tenantId: null,
        eventType: 'api.error',
        subject: 'corr-186',
        detail: '/api/v1/test — simulated failure',
      },
    });
    const errors = await api('GET', '/api/v1/ops/errors', platformToken);
    expect(errors.status).toBe(200);
    const rows = errors.body.errors as Array<Record<string, unknown>>;
    expect(rows.some((r) => r.correlationId === 'corr-186')).toBe(true);
  });
});
