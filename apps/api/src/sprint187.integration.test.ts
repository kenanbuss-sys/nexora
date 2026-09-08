import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 187 acceptance tests: platform admin, release management and
 * tenant rollout (OPS-001/004/005) — tenant list/suspend/resume,
 * release info, and per-tenant module flips that gate routes.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 187 — platform admin & rollout', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s187a', subject: 'idp|s187-admin' });

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
      slug: 'test-s187a',
      name: 'Sprint187 Tenant',
      initialAdmin: {
        email: 'admin@s187a.example',
        displayName: 'S187 Admin',
        idpSubject: 'idp|s187-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH187',
      name: 'Sprint187 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK187',
      name: 'PAK187 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK187-STD',
      name: 'PAK187 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s187',
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

  let tenantId = '';

  it('OPS-001: platform operators list, suspend and resume tenants', async () => {
    const list = await api('GET', '/api/v1/tenants', platformToken);
    expect(list.status).toBe(200);
    const row = (list.body.tenants as Array<Record<string, unknown>>).find(
      (t) => t.slug === 'test-s187a',
    );
    expect(row?.status).toBe('ACTIVE');
    tenantId = row?.id as string;

    const suspended = await api('POST', `/api/v1/tenants/${tenantId}/suspend`, platformToken, {
      reason: 'Proba suspenzije',
    });
    expect(suspended.status).toBe(201);
    const resumed = await api('POST', `/api/v1/tenants/${tenantId}/resume`, platformToken);
    expect(resumed.status).toBe(201);
    expect(resumed.body.status).toBe('ACTIVE');

    const again = await api('POST', `/api/v1/tenants/${tenantId}/resume`, platformToken);
    expect(again.status).toBe(409);

    const denied = await api('GET', '/api/v1/tenants', tokenA);
    expect(denied.status).toBe(403);
  });

  it('OPS-005: module rollout flips gate live routes', async () => {
    const off = await api('POST', `/api/v1/tenants/${tenantId}/modules`, platformToken, {
      moduleKey: 'automation',
      enabled: false,
    });
    expect(off.status).toBe(201);
    const blocked = await api('GET', '/api/v1/workflows', tokenA);
    expect(blocked.status).toBe(403);
    expect((blocked.body.code as string) ?? '').toBe('MODULE_DISABLED');

    await api('POST', `/api/v1/tenants/${tenantId}/modules`, platformToken, {
      moduleKey: 'automation',
      enabled: true,
    });
    const allowed = await api('GET', '/api/v1/workflows', tokenA);
    expect(allowed.status).toBe(200);
  });

  it('OPS-004: release info reports version and schema footprint', async () => {
    const release = await api('GET', '/api/v1/ops/release', platformToken);
    expect(release.status).toBe(200);
    expect(release.body.service).toBe('nexora-api');
    expect(Number(release.body.tables)).toBeGreaterThan(50);
    const denied = await api('GET', '/api/v1/ops/release', tokenA);
    expect(denied.status).toBe(403);
  });
});
