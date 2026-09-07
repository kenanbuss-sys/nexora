import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 090 acceptance tests: UOM master (MDM-004) — a governed unit
 * catalog (defaults + versioned tenant additions) that SKU base units
 * and conversions must come from.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 090 — UOM master', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s90a', subject: 'idp|s90-admin' });

  let productId = '';

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
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
       "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
       "wms_order_line", "wms_order", "scan_event", "device",
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
      slug: 'test-s90a',
      name: 'Sprint90 Tenant',
      initialAdmin: {
        email: 'admin@s90a.example',
        displayName: 'S90 Admin',
        idpSubject: 'idp|s90-admin',
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'UOM90',
      name: 'UOM90 product',
    });
    productId = product.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MDM-004: catalog lists defaults; unknown base units are refused', async () => {
    const list = await api('GET', '/api/v1/uoms', tokenA);
    expect(list.status).toBe(200);
    const uoms = list.body.uoms as Array<{ code: string; custom: boolean }>;
    expect(uoms.some((u) => u.code === 'pcs' && !u.custom)).toBe(true);
    expect(uoms.some((u) => u.code === 'kg')).toBe(true);

    const refused = await api('POST', '/api/v1/skus', tokenA, {
      productId,
      code: 'UOM90-BAD',
      name: 'Bad unit',
      baseUom: 'flurb',
    });
    expect(refused.status).toBe(400);
  });

  it('MDM-004: tenant additions come from versioned configuration', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { mdm: { uoms: [{ code: 'bag25', name: 'Bag of 25 kg' }] } },
    });
    const list = await api('GET', '/api/v1/uoms', tokenA);
    const uoms = list.body.uoms as Array<{ code: string; custom: boolean }>;
    expect(uoms.some((u) => u.code === 'bag25' && u.custom)).toBe(true);

    const created = await api('POST', '/api/v1/skus', tokenA, {
      productId,
      code: 'UOM90-BAG',
      name: 'Bagged goods',
      baseUom: 'bag25',
    });
    expect(created.status).toBe(201);

    // Conversions must also use catalog units.
    const badConv = await api('PUT', `/api/v1/skus/${created.body.id}/uom-conversions`, tokenA, {
      fromUom: 'zork',
      toUom: 'bag25',
      factor: 10,
    });
    expect(badConv.status).toBe(400);
    const goodConv = await api('PUT', `/api/v1/skus/${created.body.id}/uom-conversions`, tokenA, {
      fromUom: 'pallet',
      toUom: 'bag25',
      factor: 40,
    });
    expect(goodConv.status).toBe(200);
  });

  it('MDM-004: stewards see how widely a unit is used', async () => {
    const usage = await api('GET', '/api/v1/uoms/bag25/usage', tokenA);
    expect(usage.status).toBe(200);
    expect(usage.body.skus).toBe(1);
    expect(usage.body.conversions).toBe(1);
  });

  it('AUTHZ: usage introspection needs mdm.steward', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s90a', subject: 'idp|s90-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko90@primjer.example',
      displayName: 'Niko90',
      idpSubject: 'idp|s90-nobody',
    });
    const denied = await api('GET', '/api/v1/uoms/pcs/usage', stranger);
    expect(denied.status).toBe(403);
  });
});
