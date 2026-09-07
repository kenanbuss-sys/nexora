import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 119 acceptance tests: public API (INT-009) — an OpenAPI 3
 * document generated from the live route table, served publicly while
 * the API behind it stays authenticated.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 119 — public API', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s119a', subject: 'idp|s119-admin' });

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
      `TRUNCATE TABLE "rfq_quote", "rfq",
       "webhook_delivery", "webhook_subscription",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
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
      slug: 'test-s119a',
      name: 'Sprint119 Tenant',
      initialAdmin: {
        email: 'admin@s119a.example',
        displayName: 'S119 Admin',
        idpSubject: 'idp|s119-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'shop-main', kind: 'commerce', adapter: 'noop', config: {} },
            { key: 'acct-main', kind: 'accounting', adapter: 'noop', config: {} },
          ],
        },
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH119',
      name: 'Sprint119 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'CHN119',
      name: 'CHN119 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'CHN119-STD',
      name: 'CHN119 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 15,
      idempotencyKey: 'receipt-s119',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('INT-009: the OpenAPI document reflects the live route table', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi' });
    expect(response.statusCode).toBe(200);
    const doc = response.json() as {
      openapi: string;
      info: { title: string };
      components: { securitySchemes: Record<string, unknown> };
      paths: Record<string, Record<string, unknown>>;
    };
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toContain('NexoraOS');
    expect(doc.components.securitySchemes.bearerAuth).toBeDefined();
    expect(doc.components.securitySchemes.apiKey).toBeDefined();

    // Live routes appear with OpenAPI-style parameters.
    expect(doc.paths['/api/v1/orders']).toBeDefined();
    expect(doc.paths['/api/v1/orders/{id}']).toBeDefined();
    expect(doc.paths['/api/v1/stock/channel-availability']).toBeDefined();
    const withParam = doc.paths['/api/v1/orders/{id}']?.get as {
      parameters: Array<{ name: string; in: string }>;
    };
    expect(withParam.parameters[0]?.name).toBe('id');
    // A healthy public surface: hundreds of documented operations.
    expect(Object.keys(doc.paths).length).toBeGreaterThan(150);
  });

  it('INT-009: the document is public, the API is not', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/orders' });
    expect(anonymous.statusCode).toBe(401);
    const openapi = await app.inject({ method: 'GET', url: '/api/v1/openapi' });
    expect(openapi.statusCode).toBe(200);
  });
});
