import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 139 acceptance tests: channel-specific content (PIM-009) —
 * per-channel commercial copy over one canonical SKU, upsert-idempotent,
 * with channel readiness reporting.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 139 — channel content', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s139a', subject: 'idp|s139-admin' });

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
      slug: 'test-s139a',
      name: 'Sprint139 Tenant',
      initialAdmin: {
        email: 'admin@s139a.example',
        displayName: 'S139 Admin',
        idpSubject: 'idp|s139-admin',
      },
    });
    lampId = await makeSku('LAMP139', 'Lamp139');
    await makeSku('BULB139', 'Bulb139');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM-009: upsert sets and updates channel content idempotently', async () => {
    const first = await api('PUT', `/api/v1/skus/${lampId}/channel-content/webshop`, tokenA, {
      title: 'Nordic Desk Lamp',
      description: 'Warm light for your desk.',
      attributes: { color: 'black' },
    });
    expect(first.status).toBe(200);
    expect(first.body.title).toBe('Nordic Desk Lamp');
    expect(first.body.canonicalName).toBe('Lamp139 Standard');

    const second = await api('PUT', `/api/v1/skus/${lampId}/channel-content/webshop`, tokenA, {
      title: 'Nordic Desk Lamp v2',
    });
    expect(second.status).toBe(200);
    expect(second.body.title).toBe('Nordic Desk Lamp v2');

    const list = await api('GET', `/api/v1/skus/${lampId}/channel-content`, tokenA);
    expect(list.status).toBe(200);
    const content = list.body.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(1);
    expect(content[0]?.channel).toBe('webshop');
    expect(content[0]?.title).toBe('Nordic Desk Lamp v2');
  });

  it('PIM-009: separate channels keep separate copy', async () => {
    const pos = await api('PUT', `/api/v1/skus/${lampId}/channel-content/pos`, tokenA, {
      title: 'Desk Lamp',
    });
    expect(pos.status).toBe(200);
    const list = await api('GET', `/api/v1/skus/${lampId}/channel-content`, tokenA);
    expect((list.body.content as unknown[]).length).toBe(2);
  });

  it('PIM-009: validation — bad channel code and empty title are rejected', async () => {
    const bad = await api('PUT', `/api/v1/skus/${lampId}/channel-content/BAD_CHANNEL!`, tokenA, {
      title: 'X',
    });
    expect(bad.status).toBe(400);
    const empty = await api('PUT', `/api/v1/skus/${lampId}/channel-content/webshop`, tokenA, {
      title: '',
    });
    expect(empty.status).toBe(400);
  });

  it('PIM-009: unknown SKU is 404', async () => {
    const r = await api(
      'PUT',
      '/api/v1/skus/00000000-0000-0000-0000-000000000000/channel-content/webshop',
      tokenA,
      { title: 'Ghost' },
    );
    expect(r.status).toBe(404);
  });

  it('PIM-009: readiness reports SKUs missing channel content', async () => {
    const r = await api('GET', '/api/v1/skus/channel-readiness?channel=webshop', tokenA);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.withContent).toBe(1);
    expect(r.body.missing).toEqual(['BULB139-STD']);
  });
});
