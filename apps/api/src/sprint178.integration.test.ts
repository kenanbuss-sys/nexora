import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 178 acceptance tests: scheduled reports (BI-006) —
 * configured reports run once per day, export their dataset and
 * notify recipients in-app, audited with row counts.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 178 — scheduled reports', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s178a', subject: 'idp|s178-admin' });

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
      slug: 'test-s178a',
      name: 'Sprint178 Tenant',
      initialAdmin: {
        email: 'admin@s178a.example',
        displayName: 'S178 Admin',
        idpSubject: 'idp|s178-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH178',
      name: 'Sprint178 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK178',
      name: 'PAK178 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK178-STD',
      name: 'PAK178 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s178',
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

  it('BI-006: configured reports run once per day and notify recipients', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        bi: {
          scheduledReports: [
            {
              key: 'dnevne-narudzbe',
              dataset: 'orders',
              recipients: ['admin@s178a.example'],
            },
          ],
        },
      },
    });
    const run = await api('POST', '/api/v1/analytics/reports/run', tokenA);
    expect(run.status).toBe(201);
    expect(run.body.ran).toBe(1);
    const results = run.body.results as Array<Record<string, unknown>>;
    expect(results[0]?.key).toBe('dnevne-narudzbe');
    expect(results[0]?.rows).toBe(1);
    expect(results[0]?.notified).toBe(1);

    const rerun = await api('POST', '/api/v1/analytics/reports/run', tokenA);
    expect(rerun.body.ran).toBe(0);
    expect(rerun.body.skipped).toBe(1);
  });

  it('BI-006: recipients see the report notification', async () => {
    const inbox = await api('GET', '/api/v1/notifications', tokenA);
    expect(inbox.status).toBe(200);
    const rows = inbox.body.notifications as Array<Record<string, unknown>>;
    expect(rows.some((n) => n.type === 'scheduled_report')).toBe(true);
  });

  it('AUTHZ: running reports needs analytics.export', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s178a', subject: 'idp|s178-nobody' });
    const denied = await api('POST', '/api/v1/analytics/reports/run', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
