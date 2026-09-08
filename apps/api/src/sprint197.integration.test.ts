import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 197 acceptance tests: extension platform (EXT-001..005/009/
 * 010) — validated manifests, permission containment, UI slots,
 * event subscriptions and connector-routed custom actions.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 197 — extension platform', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s197a', subject: 'idp|s197-admin' });

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
      slug: 'test-s197a',
      name: 'Sprint197 Tenant',
      initialAdmin: {
        email: 'admin@s197a.example',
        displayName: 'S197 Admin',
        idpSubject: 'idp|s197-admin',
      },
    });
    await makeSku('LAMP197', 'Lamp197');
    await makeSku('BULB197', 'Bulb197');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const manifest = {
    key: 'servisni-portal',
    name: 'Servisni portal',
    version: '1.2.0',
    extensionApi: 1,
    requiredPermissions: ['order.read'],
    uiSlots: [{ slot: 'nav', label: 'Servis', url: '/ext/servis', permission: 'order.read' }],
    customActions: [
      {
        key: 'posalji-servisu',
        label: 'Pošalji servisu',
        connectorKey: 'servis-api',
        objectType: 'sales_order',
        permission: 'order.read',
      },
    ],
    eventSubscriptions: ['order.confirmed', 'order.fulfilled'],
  };

  it('EXT-009/010: validation enforces API compatibility and permission containment', async () => {
    const futureApi = await api('POST', '/api/v1/extensions/validate', tokenA, {
      ...manifest,
      extensionApi: 99,
    });
    expect(futureApi.status).toBe(400);
    expect((futureApi.body.message as string) ?? '').toContain('EXT-009');

    const escalating = await api('POST', '/api/v1/extensions/validate', tokenA, {
      ...manifest,
      requiredPermissions: ['galaxy.destroy'],
    });
    expect(escalating.status).toBe(400);
    expect((escalating.body.message as string) ?? '').toContain('EXT-010');

    const ok = await api('POST', '/api/v1/extensions/validate', tokenA, manifest);
    expect(ok.status).toBe(201);
  });

  it('EXT-002/003/005: installed manifests expose slots and subscriptions', async () => {
    const installed = await api('POST', '/api/v1/extensions/install', tokenA, manifest);
    expect(installed.status).toBe(201);
    expect(installed.body.key).toBe('servisni-portal');

    const list = await api('GET', '/api/v1/extensions', tokenA);
    expect((list.body.extensions as unknown[]).length).toBe(1);

    const slots = await api('GET', '/api/v1/extensions/ui-slots', tokenA);
    const slotRows = slots.body.slots as Array<Record<string, unknown>>;
    expect(slotRows[0]?.slot).toBe('nav');
    expect(slotRows[0]?.extension).toBe('servisni-portal');

    const subs = await api('GET', '/api/v1/extensions/event-subscriptions', tokenA);
    const subRows = subs.body.subscriptions as Array<Record<string, unknown>>;
    expect(subRows.map((r) => r.eventType).sort()).toEqual(['order.confirmed', 'order.fulfilled']);
  });

  it('EXT-004: custom actions run through the declared connector, audited', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        ext: { extensions: [manifest] },
        int: { connectors: [{ key: 'servis-api', kind: 'other', adapter: 'noop', config: {} }] },
      },
    });
    const run = await api(
      'POST',
      '/api/v1/extensions/servisni-portal/actions/posalji-servisu',
      tokenA,
      { objectId: 'SO-000001', payload: { napomena: 'Hitno' } },
    );
    expect(run.status).toBe(201);
    expect(run.body.reference).toContain('noop:sales_order');

    const ghost = await api(
      'POST',
      '/api/v1/extensions/servisni-portal/actions/nepostojeca',
      tokenA,
      { objectId: 'x' },
    );
    expect(ghost.status).toBe(404);

    const audits = await prisma.auditEvent.count({ where: { action: 'ext.action.run' } });
    expect(audits).toBe(1);
  });
});
