import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 160 acceptance tests: commerce connectors (INT-003) — the
 * sellable catalog (active SKUs + per-channel copy) exports through a
 * declared commerce connector, repeatably and audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 160 — commerce catalog export', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s160a', subject: 'idp|s160-admin' });

  let lampId = '';

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
      slug: 'test-s160a',
      name: 'Sprint160 Tenant',
      initialAdmin: {
        email: 'admin@s160a.example',
        displayName: 'S160 Admin',
        idpSubject: 'idp|s160-admin',
      },
    });
    lampId = await makeSku('LAMP160', 'Lamp160');
    await makeSku('BULB160', 'Bulb160');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('INT-003: the catalog exports with channel content applied', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'webshop', kind: 'commerce', adapter: 'noop', config: { channel: 'webshop' } },
            { key: 'psp', kind: 'payment', adapter: 'noop', config: {} },
          ],
        },
      },
    });
    await api('PUT', `/api/v1/skus/${lampId}/channel-content/webshop`, tokenA, {
      title: 'Nordijska lampa',
      description: 'Za webshop.',
    });

    const run = await api('POST', '/api/v1/connectors/webshop/export-catalog', tokenA);
    expect(run.status).toBe(201);
    expect(run.body.pushed).toBe(2);
    expect(run.body.withContent).toBe(1);
    expect(run.body.reference).toContain('noop:catalog');

    // Repeatable — sync semantics, not one-shot.
    const again = await api('POST', '/api/v1/connectors/webshop/export-catalog', tokenA);
    expect(again.status).toBe(201);
    expect(again.body.pushed).toBe(2);
  });

  it('INT-003: only commerce connectors export the catalog', async () => {
    const wrong = await api('POST', '/api/v1/connectors/psp/export-catalog', tokenA);
    expect(wrong.status).toBe(409);
    const ghost = await api('POST', '/api/v1/connectors/ghost/export-catalog', tokenA);
    expect(ghost.status).toBe(404);
  });

  it('INT-003: runs are audited with their summary', async () => {
    const events = await prisma.auditEvent.findMany({
      where: { action: 'int.commerce.catalog', objectId: 'webshop' },
    });
    expect(events.length).toBe(2);
    const values = events[0]?.newValues as Record<string, unknown>;
    expect(values.channel).toBe('webshop');
  });

  it('AUTHZ: catalog export needs product.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s160a', subject: 'idp|s160-nobody' });
    const denied = await api('POST', '/api/v1/connectors/webshop/export-catalog', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
