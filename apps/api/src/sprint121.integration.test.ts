import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 121 acceptance tests: location master (MDM-003) — one
 * governed registry of branches, factories and warehouses, read from
 * the owning structures, with duplicate-name hygiene for stewards.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 121 — location master', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s121a', subject: 'idp|s121-admin' });

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
      slug: 'test-s121a',
      name: 'Sprint121 Tenant',
      initialAdmin: {
        email: 'admin@s121a.example',
        displayName: 'S121 Admin',
        idpSubject: 'idp|s121-admin',
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
      code: 'WH121',
      name: 'Sprint121 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'CHN121',
      name: 'CHN121 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'CHN121-STD',
      name: 'CHN121 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 15,
      idempotencyKey: 'receipt-s121',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MDM-003: sites unify branches, factories and warehouses', async () => {
    const le = await api('POST', '/api/v1/organization/legal-entities', tokenA, {
      name: 'Nexora d.o.o.',
    });
    const bu = await api('POST', '/api/v1/organization/business-units', tokenA, {
      legalEntityId: le.body.id,
      name: 'Distribucija',
    });
    await api('POST', '/api/v1/organization/branches', tokenA, {
      businessUnitId: bu.body.id,
      name: 'Poslovnica Zenica',
    });
    await api('POST', '/api/v1/organization/factories', tokenA, {
      businessUnitId: bu.body.id,
      name: 'Pogon Tešanj',
    });
    await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH121A', name: 'Skladište Zenica' });

    const sites = await api('GET', '/api/v1/sites', tokenA);
    expect(sites.status).toBe(200);
    const rows = sites.body.sites as Array<{ kind: string; name: string; parent: string | null }>;
    expect(rows.filter((r) => r.kind === 'BRANCH')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'FACTORY')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'WAREHOUSE')).toHaveLength(2);
    expect(rows.find((r) => r.kind === 'BRANCH')?.parent).toBe('Distribucija');
  });

  it('MDM-003: duplicate names surface for stewards', async () => {
    await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH121B',
      name: 'Skladište Zenica',
    });
    const duplicates = await api('GET', '/api/v1/sites/duplicates', tokenA);
    const rows = duplicates.body.duplicates as Array<{ name: string; count: number }>;
    expect(rows.find((r) => r.name === 'skladište zenica')?.count).toBe(2);
  });

  it('AUTHZ: duplicates need mdm.steward', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s121a', subject: 'idp|s121-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko121@primjer.example',
      displayName: 'Niko121',
      idpSubject: 'idp|s121-nobody',
    });
    const denied = await api('GET', '/api/v1/sites/duplicates', stranger);
    expect(denied.status).toBe(403);
  });
});
