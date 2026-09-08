import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 142 acceptance tests: customer API keys (B2B-014) —
 * account-bound keys carry only customer-safe permissions, act solely
 * for their own account and place orders attributed to the api
 * channel.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 142 — customer API keys', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s142a', subject: 'idp|s142-admin' });

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

  async function keyed(method: 'GET' | 'POST', url: string, key: string, payload?: unknown) {
    const response = await app.inject({
      method,
      url,
      headers: {
        'x-api-key': key,
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
      slug: 'test-s142a',
      name: 'Sprint142 Tenant',
      initialAdmin: {
        email: 'admin@s142a.example',
        displayName: 'S142 Admin',
        idpSubject: 'idp|s142-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH142',
      name: 'Sprint142 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK142',
      name: 'PAK142 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK142-STD',
      name: 'PAK142 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s142',
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

  let customerKey = '';
  let customerKeyId = '';

  it('B2B-014: a customer key is bound to an account with a safe allowlist only', async () => {
    const bad = await api('POST', '/api/v1/iam/api-keys', tokenA, {
      name: 'evil-customer-key',
      permissions: ['iam.user.manage'],
      accountId,
    });
    expect(bad.status).toBe(400);

    const created = await api('POST', '/api/v1/iam/api-keys', tokenA, {
      name: 'acme-b2b-key',
      permissions: ['order.create', 'order.read'],
      accountId,
    });
    expect(created.status).toBe(201);
    expect(created.body.accountId).toBe(accountId);
    customerKey = created.body.key as string;
    customerKeyId = created.body.id as string;
    expect(customerKey).toMatch(/^nxk_/);
  });

  it('B2B-014: the key sees only its own account orders', async () => {
    const mine = await keyed('GET', '/api/v1/b2b/my/orders', customerKey);
    expect(mine.status).toBe(200);
    const orders = mine.body.orders as Array<{ accountId: string }>;
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.accountId === accountId)).toBe(true);
  });

  it('B2B-014: the key places orders for its account on the api channel', async () => {
    const placed = await keyed('POST', '/api/v1/b2b/my/orders', customerKey, {
      lines: [{ code: 'PAK142-STD', quantity: 3 }],
    });
    expect(placed.status).toBe(201);
    const order = placed.body.order as Record<string, unknown>;
    expect(order.accountId).toBe(accountId);
    expect(order.channel).toBe('api');
  });

  it('B2B-014: a tenant-wide key without account binding is refused on /my', async () => {
    const created = await api('POST', '/api/v1/iam/api-keys', tokenA, {
      name: 'integration-key',
      permissions: ['order.read'],
    });
    const denied = await keyed('GET', '/api/v1/b2b/my/orders', created.body.key as string);
    expect(denied.status).toBe(403);
  });

  it('B2B-014: revocation cuts the key off immediately', async () => {
    const revoked = await api('POST', `/api/v1/iam/api-keys/${customerKeyId}/revoke`, tokenA);
    expect(revoked.status).toBe(201);
    const denied = await keyed('GET', '/api/v1/b2b/my/orders', customerKey);
    expect(denied.status).toBe(401);
  });
});
