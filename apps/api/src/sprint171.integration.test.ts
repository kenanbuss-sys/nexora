import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 171 acceptance tests: scanner configuration & device event
 * audit (DEV-005/015) — governed capability updates with
 * before/after audit, and one chronological event trail per device.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 171 — device config & audit', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s171a', subject: 'idp|s171-admin' });

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
      slug: 'test-s171a',
      name: 'Sprint171 Tenant',
      initialAdmin: {
        email: 'admin@s171a.example',
        displayName: 'S171 Admin',
        idpSubject: 'idp|s171-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH171',
      name: 'Sprint171 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK171',
      name: 'PAK171 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK171-STD',
      name: 'PAK171 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s171',
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

  let deviceId = '';
  let deviceToken = '';

  it('DEV-005: capability updates are governed and audited with before/after', async () => {
    const scanner = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-171',
      name: 'Ručni 171',
      deviceType: 'SCANNER',
    });
    deviceId = scanner.body.id as string;
    deviceToken = scanner.body.enrollmentToken as string;
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: deviceToken,
      appVersion: '1.0.0',
      capabilities: { symbologies: ['EAN13'] },
    });

    const updated = await api('POST', `/api/v1/devices/${deviceId}/capabilities`, tokenA, {
      capabilities: { symbologies: ['EAN13', 'CODE128', 'QR'], torch: true },
    });
    expect(updated.status).toBe(201);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'dev.device.capabilities', objectId: deviceId },
    });
    expect(audit).not.toBeNull();
    const prev = audit?.previousValues as { capabilities?: { symbologies?: string[] } };
    const next = audit?.newValues as { capabilities?: { symbologies?: string[] } };
    expect(prev.capabilities?.symbologies).toEqual(['EAN13']);
    expect(next.capabilities?.symbologies).toContain('CODE128');

    const ghost = await api(
      'POST',
      '/api/v1/devices/00000000-0000-0000-0000-000000000000/capabilities',
      tokenA,
      { capabilities: {} },
    );
    expect(ghost.status).toBe(404);
  });

  it('DEV-015: the device trail merges scans and audited device actions', async () => {
    await api('POST', '/api/v1/scan-events', tokenA, {
      enrollmentToken: deviceToken,
      events: [
        {
          clientEventId: 'trail-171-1',
          kind: 'BARCODE',
          value: '3859890000012',
          capturedAt: new Date().toISOString(),
        },
      ],
    });
    const trail = await api('GET', `/api/v1/devices/${deviceId}/events`, tokenA);
    expect(trail.status).toBe(200);
    const events = trail.body.events as Array<{ kind: string; detail: string }>;
    expect(events.some((e) => e.kind === 'scan:BARCODE' && e.detail === '3859890000012')).toBe(
      true,
    );
    expect(events.some((e) => e.kind === 'dev.device.capabilities')).toBe(true);
  });

  it('AUTHZ: capability updates need device.assign', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s171a', subject: 'idp|s171-nobody' });
    const denied = await api('POST', `/api/v1/devices/${deviceId}/capabilities`, stranger, {
      capabilities: {},
    });
    expect([401, 403]).toContain(denied.status);
  });
});
