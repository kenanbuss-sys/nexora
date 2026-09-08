import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 143 acceptance tests: product configurator (CPQ-007) —
 * config-driven models with options, price deltas and incompatibility
 * constraints; deterministic validated pricing.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 143 — configurator', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s143a', subject: 'idp|s143-admin' });

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
      slug: 'test-s143a',
      name: 'Sprint143 Tenant',
      initialAdmin: {
        email: 'admin@s143a.example',
        displayName: 'S143 Admin',
        idpSubject: 'idp|s143-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        cpq: {
          configurator: {
            models: [
              {
                skuCode: 'DESK143',
                name: 'Standing Desk',
                basePrice: 400,
                options: [
                  {
                    key: 'top',
                    name: 'Tabletop',
                    required: true,
                    choices: [
                      { code: 'oak', name: 'Oak', priceDelta: 120 },
                      { code: 'laminate', name: 'Laminate', priceDelta: 0 },
                    ],
                  },
                  {
                    key: 'frame',
                    name: 'Frame',
                    required: true,
                    choices: [
                      { code: 'white', name: 'White', priceDelta: 0 },
                      { code: 'black', name: 'Black', priceDelta: 25 },
                    ],
                  },
                  {
                    key: 'cable',
                    name: 'Cable tray',
                    required: false,
                    choices: [{ code: 'yes', name: 'Included', priceDelta: 35 }],
                  },
                ],
                incompatible: [['top:oak', 'frame:white']],
              },
            ],
          },
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CPQ-007: models are listed from tenant configuration', async () => {
    const r = await api('GET', '/api/v1/configurator/models', tokenA);
    expect(r.status).toBe(200);
    const models = r.body.models as Array<Record<string, unknown>>;
    expect(models).toHaveLength(1);
    expect(models[0]?.skuCode).toBe('DESK143');

    const one = await api('GET', '/api/v1/configurator/models/DESK143', tokenA);
    expect(one.status).toBe(200);
    expect((one.body.options as unknown[]).length).toBe(3);

    const missing = await api('GET', '/api/v1/configurator/models/GHOST', tokenA);
    expect(missing.status).toBe(404);
  });

  it('CPQ-007: a valid selection prices deterministically', async () => {
    const r = await api('POST', '/api/v1/configurator/configure', tokenA, {
      skuCode: 'DESK143',
      selections: { top: 'oak', frame: 'black', cable: 'yes' },
    });
    expect(r.status).toBe(201);
    expect(r.body.unitPrice).toBe('580.00');
    expect(r.body.description).toContain('Oak');
    expect(r.body.description).toContain('Black');
  });

  it('CPQ-007: optional options may be omitted', async () => {
    const r = await api('POST', '/api/v1/configurator/configure', tokenA, {
      skuCode: 'DESK143',
      selections: { top: 'laminate', frame: 'white' },
    });
    expect(r.status).toBe(201);
    expect(r.body.unitPrice).toBe('400.00');
  });

  it('CPQ-007: validation — missing required, bad choice, unknown option', async () => {
    const missing = await api('POST', '/api/v1/configurator/configure', tokenA, {
      skuCode: 'DESK143',
      selections: { top: 'oak' },
    });
    expect(missing.status).toBe(400);

    const badChoice = await api('POST', '/api/v1/configurator/configure', tokenA, {
      skuCode: 'DESK143',
      selections: { top: 'mahogany', frame: 'black' },
    });
    expect(badChoice.status).toBe(400);

    const unknown = await api('POST', '/api/v1/configurator/configure', tokenA, {
      skuCode: 'DESK143',
      selections: { top: 'oak', frame: 'black', legs: 'four' },
    });
    expect(unknown.status).toBe(400);
  });

  it('CPQ-007: incompatible combinations are refused', async () => {
    const r = await api('POST', '/api/v1/configurator/configure', tokenA, {
      skuCode: 'DESK143',
      selections: { top: 'oak', frame: 'white' },
    });
    expect(r.status).toBe(409);
  });
});
