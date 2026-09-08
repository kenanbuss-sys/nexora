import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 198 acceptance tests: industry packs & marketplaces
 * (EXT-006/007/008) — curated configuration bundles apply atomically
 * and everything they bring is live immediately.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 198 — packs & marketplace', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s198a', subject: 'idp|s198-admin' });

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
      slug: 'test-s198a',
      name: 'Sprint198 Tenant',
      initialAdmin: {
        email: 'admin@s198a.example',
        displayName: 'S198 Admin',
        idpSubject: 'idp|s198-admin',
      },
    });
    await makeSku('LAMP198', 'Lamp198');
    await makeSku('BULB198', 'Bulb198');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('EXT-006/007/008: the marketplace lists packs, templates and recipes', async () => {
    const market = await api('GET', '/api/v1/extensions/marketplace', tokenA);
    expect(market.status).toBe(200);
    const packs = market.body.packs as Array<Record<string, unknown>>;
    expect(packs.map((p) => p.key)).toContain('retail-bih');
    const templates = market.body.workflowTemplates as Array<Record<string, unknown>>;
    expect(templates.some((t) => t.key === 'povrat-robe')).toBe(true);
    const recipes = market.body.connectorRecipes as Array<Record<string, unknown>>;
    expect(recipes.some((r) => r.key === 'fiskal-bih' && r.kind === 'fiscal')).toBe(true);
  });

  it('EXT-006: applying a pack makes its contents live immediately', async () => {
    const applied = await api('POST', '/api/v1/extensions/packs/retail-bih/apply', tokenA);
    expect(applied.status).toBe(201);
    expect(Number(applied.body.version)).toBeGreaterThan(0);

    // Workflow template from the pack publishes directly.
    const fromTemplate = await api('POST', '/api/v1/workflows/from-template', tokenA, {
      templateKey: 'povrat-robe',
    });
    expect(fromTemplate.status).toBe(201);

    // The pack's form validates submissions.
    const form = await api('POST', '/api/v1/forms/povrat-forma/submit', tokenA, {
      data: { razlog: 'osteceno', opis: 'Puknuto u transportu' },
    });
    expect(form.status).toBe(201);

    // The connector recipe is a live fiscal connector.
    const connectors = await api('GET', '/api/v1/connectors', tokenA);
    const rows = connectors.body.connectors as Array<Record<string, unknown>>;
    expect(rows.some((c) => c.key === 'fiskal-bih')).toBe(true);

    const ghost = await api('POST', '/api/v1/extensions/packs/nepostojeci/apply', tokenA);
    expect(ghost.status).toBe(404);
  });

  it('EXT-006: re-applying merges by key without duplication', async () => {
    await api('POST', '/api/v1/extensions/packs/retail-bih/apply', tokenA);
    const connectors = await api('GET', '/api/v1/connectors', tokenA);
    const rows = (connectors.body.connectors as Array<Record<string, unknown>>).filter(
      (c) => c.key === 'fiskal-bih',
    );
    expect(rows).toHaveLength(1);

    const audits = await prisma.auditEvent.count({ where: { action: 'ext.pack.apply' } });
    expect(audits).toBe(2);
  });
});
