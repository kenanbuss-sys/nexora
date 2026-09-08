import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 165 acceptance tests: rate-limit handling & versioned
 * mappings (INT-018/019) — rate-limited pushes retry with backoff up
 * to three attempts, and mapping rules report the configuration
 * version they came from.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 165 — rate limits & mappings', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s165a', subject: 'idp|s165-admin' });

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

  async function makeSku(code: string, name: string): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${name} Standard`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "rfq_quote", "rfq", "work_order_operation", "work_order",
       "mrp_suggestion", "mrp_run", "planning_policy",
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
       "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
       "wms_order_line", "wms_order", "scan_event", "device",
       "stock_reservation", "stock_movement", "warehouse_location", "warehouse",
       "sku_channel_content", "uom_conversion", "barcode", "sku", "product",
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
      slug: 'test-s165a',
      name: 'Sprint165 Tenant',
      initialAdmin: {
        email: 'admin@s165a.example',
        displayName: 'S165 Admin',
        idpSubject: 'idp|s165-admin',
      },
    });
    await makeSku('LAMP165', 'Lamp165');
    await makeSku('BULB165', 'Bulb165');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('INT-018: a rate-limited push retries with backoff and succeeds', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            {
              key: 'sporo',
              kind: 'commerce',
              adapter: 'ratelimited',
              config: { failFirst: 2 },
            },
            {
              key: 'presporo',
              kind: 'commerce',
              adapter: 'ratelimited',
              config: { failFirst: 9 },
            },
          ],
        },
      },
    });
    const ok = await api('POST', '/api/v1/connectors/sporo/export-catalog', tokenA);
    expect(ok.status).toBe(201);
    expect(ok.body.reference).toContain('ratelimited:catalog');

    // Still rate-limited after 3 attempts → refused, no partial audit.
    const refused = await api('POST', '/api/v1/connectors/presporo/export-catalog', tokenA);
    expect(refused.status).toBe(409);
  });

  it('INT-019: mapping rules report their configuration version', async () => {
    const before = await api('GET', '/api/v1/connectors/sporo/mappings', tokenA);
    expect(before.status).toBe(200);
    const versionBefore = before.body.version as number;
    expect((before.body.rules as unknown[]).length).toBe(0);

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'sporo', kind: 'commerce', adapter: 'ratelimited', config: { failFirst: 0 } },
          ],
          mappings: [
            {
              key: 'sporo',
              rules: [{ from: 'channel', to: 'externalChannel', transform: 'uppercase' }],
            },
          ],
        },
      },
    });
    const after = await api('GET', '/api/v1/connectors/sporo/mappings', tokenA);
    expect(after.body.version).toBeGreaterThan(versionBefore);
    const rules = after.body.rules as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(1);
    expect(rules[0]?.to).toBe('externalChannel');
  });

  it('AUTHZ: mapping inspection needs integration.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s165a', subject: 'idp|s165-nobody' });
    const denied = await api('GET', '/api/v1/connectors/sporo/mappings', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
