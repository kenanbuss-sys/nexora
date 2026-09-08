import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 154 acceptance tests: bank/payment connectors (INT-004) —
 * payment intents per (connector, order) with idempotent retry, and
 * provider confirmations recorded exactly once.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 154 — payment connectors', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s154a', subject: 'idp|s154-admin' });

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
      slug: 'test-s154a',
      name: 'Sprint154 Tenant',
      initialAdmin: {
        email: 'admin@s154a.example',
        displayName: 'S154 Admin',
        idpSubject: 'idp|s154-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH154',
      name: 'Sprint154 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK154',
      name: 'PAK154 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK154-STD',
      name: 'PAK154 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s154',
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

  let reference = '';

  it('INT-004: an intent is created once per (connector, order)', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'psp', kind: 'payment', adapter: 'noop', config: {} },
            { key: 'shop', kind: 'commerce', adapter: 'noop', config: {} },
          ],
        },
      },
    });
    const intent = await api('POST', '/api/v1/connectors/psp/payment-intents', tokenA, {
      orderId,
    });
    expect(intent.status).toBe(201);
    expect(intent.body.existing).toBe(false);
    expect(intent.body.currency).toBe('EUR');
    reference = intent.body.reference as string;
    expect(reference).toContain('noop:payment_intent');

    const retry = await api('POST', '/api/v1/connectors/psp/payment-intents', tokenA, {
      orderId,
    });
    expect(retry.body.existing).toBe(true);
    expect(retry.body.reference).toBe(reference);
  });

  it('INT-004: only payment connectors take intents', async () => {
    const wrong = await api('POST', '/api/v1/connectors/shop/payment-intents', tokenA, {
      orderId,
    });
    expect(wrong.status).toBe(409);
  });

  it('INT-004: confirmations are exactly-once', async () => {
    const first = await api('POST', '/api/v1/connectors/psp/payment-confirmations', tokenA, {
      orderId,
      reference,
    });
    expect(first.status).toBe(201);
    expect(first.body.confirmed).toBe(true);
    expect(first.body.duplicate).toBe(false);

    const second = await api('POST', '/api/v1/connectors/psp/payment-confirmations', tokenA, {
      orderId,
      reference,
    });
    expect(second.body.duplicate).toBe(true);

    const noIntent = await api('POST', '/api/v1/connectors/psp/payment-confirmations', tokenA, {
      orderId: '00000000-0000-0000-0000-000000000000',
      reference,
    });
    expect(noIntent.status).toBe(404);
  });

  it('AUTHZ: payment flows need order.confirm', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s154a', subject: 'idp|s154-nobody' });
    const denied = await api('POST', '/api/v1/connectors/psp/payment-intents', stranger, {
      orderId,
    });
    expect([401, 403]).toContain(denied.status);
  });
});
