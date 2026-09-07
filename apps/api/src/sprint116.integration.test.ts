import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 116 acceptance tests: B2C channel integration (COM-001) —
 * the sellable-quantity feed pushes to every valid commerce connector
 * through the port, audited per run.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 116 — channel sync', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s116a', subject: 'idp|s116-admin' });

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
      slug: 'test-s116a',
      name: 'Sprint116 Tenant',
      initialAdmin: {
        email: 'admin@s116a.example',
        displayName: 'S116 Admin',
        idpSubject: 'idp|s116-admin',
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
      code: 'WH116',
      name: 'Sprint116 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'CHN116',
      name: 'CHN116 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'CHN116-STD',
      name: 'CHN116 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 15,
      idempotencyKey: 'receipt-s116',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('COM-001: the availability feed pushes to commerce connectors only', async () => {
    const sync = await api('POST', '/api/v1/connectors/sync-channels', tokenA);
    expect(sync.status).toBe(201);
    const results = sync.body.results as Array<{ key: string; ok: boolean; items: number }>;
    // Only the commerce connector participates.
    expect(results).toHaveLength(1);
    expect(results[0]?.key).toBe('shop-main');
    expect(results[0]?.ok).toBe(true);
    expect(results[0]?.items).toBe(1);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'int.channel.sync' } });
    expect(audit).not.toBeNull();
  });

  it('COM-001: no commerce connectors means an empty run', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { int: { connectors: [] } },
    });
    const sync = await api('POST', '/api/v1/connectors/sync-channels', tokenA);
    expect((sync.body.results as unknown[]).length).toBe(0);
  });

  it('AUTHZ: channel sync needs integration.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s116a', subject: 'idp|s116-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko116@primjer.example',
      displayName: 'Niko116',
      idpSubject: 'idp|s116-nobody',
    });
    const denied = await api('POST', '/api/v1/connectors/sync-channels', stranger);
    expect(denied.status).toBe(403);
  });
});
