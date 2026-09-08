import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 168 acceptance tests: RFID & NFC (VER-003/004) — tags
 * resolve to active SKUs and badges to active workers through the
 * configured registries, audited per check.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 168 — RFID & NFC', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s168a', subject: 'idp|s168-admin' });

  let lampId = '';
  let bulbId = '';
  let warehouseId = '';

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
      slug: 'test-s168a',
      name: 'Sprint168 Tenant',
      initialAdmin: {
        email: 'admin@s168a.example',
        displayName: 'S168 Admin',
        idpSubject: 'idp|s168-admin',
      },
    });
    lampId = await makeSku('LAMP168', 'Lamp168');
    bulbId = await makeSku('BULB168', 'Bulb168');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-168',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH168',
      name: 'Sprint168 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s168-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });


  it('VER-003: RFID tags resolve to active SKUs', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        ver: {
          rfidTags: [
            { tag: 'E2000017221101441890', skuCode: 'LAMP168-STD' },
            { tag: 'E2000017221101449999', skuCode: 'GHOST-SKU' },
          ],
          nfcBadges: [{ badge: '04A224E2C63080', idpSubject: 'idp|s168-admin' }],
        },
      },
    });

    const ok = await api('POST', '/api/v1/scan-events/rfid-check', tokenA, {
      tag: 'e2000017221101441890',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.skuCode).toBe('LAMP168-STD');

    const missing = await api('POST', '/api/v1/scan-events/rfid-check', tokenA, {
      tag: 'E2000017221101449999',
    });
    expect(missing.body.ok).toBe(false);
    expect(missing.body.reason).toBe('SKU_MISSING');

    const unknown = await api('POST', '/api/v1/scan-events/rfid-check', tokenA, {
      tag: 'DEADBEEF00000000',
    });
    expect(unknown.body.ok).toBe(false);
    expect(unknown.body.reason).toBe('UNKNOWN_TAG');
  });

  it('VER-004: NFC badges resolve to active workers', async () => {
    const ok = await api('POST', '/api/v1/scan-events/nfc-check', tokenA, {
      badge: '04a224e2c63080',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.displayName).toBe('S168 Admin');

    const unknown = await api('POST', '/api/v1/scan-events/nfc-check', tokenA, {
      badge: 'FFFFFFFFFFFF',
    });
    expect(unknown.body.ok).toBe(false);
    expect(unknown.body.reason).toBe('UNKNOWN_BADGE');
  });

  it('VER-003/004: checks are audited', async () => {
    const rfid = await prisma.auditEvent.count({ where: { action: 'ver.rfid_check' } });
    const nfc = await prisma.auditEvent.count({ where: { action: 'ver.nfc_check' } });
    expect(rfid).toBe(3);
    expect(nfc).toBe(2);
  });

  it('AUTHZ: RFID/NFC checks need inventory.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s168a', subject: 'idp|s168-nobody' });
    const denied = await api('POST', '/api/v1/scan-events/rfid-check', stranger, {
      tag: 'E2000017221101441890',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
