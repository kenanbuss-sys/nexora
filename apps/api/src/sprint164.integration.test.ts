import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 164 acceptance tests: secrets management (INT-017) — raw
 * secrets in connector configuration are refused, secretRef values
 * resolve from the runtime store at call time.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 164 — secrets management', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s164a', subject: 'idp|s164-admin' });


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
      slug: 'test-s164a',
      name: 'Sprint164 Tenant',
      initialAdmin: {
        email: 'admin@s164a.example',
        displayName: 'S164 Admin',
        idpSubject: 'idp|s164-admin',
      },
    });
    await makeSku('LAMP164', 'Lamp164');
    await makeSku('BULB164', 'Bulb164');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('INT-017: raw secrets in connector config are refused', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            {
              key: 'leaky',
              kind: 'commerce',
              adapter: 'noop',
              config: { apiKey: 'sk-plain-text-secret' },
            },
          ],
        },
      },
    });
    const refused = await api('POST', '/api/v1/connectors/leaky/export-catalog', tokenA);
    expect(refused.status).toBe(400);
    expect((refused.body.message as string) ?? '').toContain('secretRef');
  });

  it('INT-017: secretRef values resolve from the runtime store', async () => {
    process.env.NEXORA_SECRET_WEBSHOP_KEY = 'runtime-secret-value';
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            {
              key: 'clean',
              kind: 'commerce',
              adapter: 'noop',
              config: { credentials: { secretRef: 'WEBSHOP_KEY' } },
            },
            {
              key: 'missing',
              kind: 'commerce',
              adapter: 'noop',
              config: { credentials: { secretRef: 'NOT_PROVISIONED_S164' } },
            },
            {
              key: 'badref',
              kind: 'commerce',
              adapter: 'noop',
              config: { credentials: { secretRef: 'not upper case' } },
            },
          ],
        },
      },
    });
    const ok = await api('POST', '/api/v1/connectors/clean/export-catalog', tokenA);
    expect(ok.status).toBe(201);

    const missing = await api('POST', '/api/v1/connectors/missing/export-catalog', tokenA);
    expect(missing.status).toBe(409);
    expect((missing.body.message as string) ?? '').toContain('not provisioned');

    const badref = await api('POST', '/api/v1/connectors/badref/export-catalog', tokenA);
    expect(badref.status).toBe(400);
  });

  it('INT-017: resolved secrets never land in the audit trail', async () => {
    const events = await prisma.auditEvent.findMany({
      where: { action: 'int.commerce.catalog' },
    });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('runtime-secret-value');
  });
});
