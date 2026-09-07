import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 101 acceptance tests: putaway (WMS-007) — received stock moves
 * into bins as idempotent transfer pairs; per-bin stock derives live
 * from location-tagged movements; the ledger stays the only truth.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 101 — putaway', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s101a', subject: 'idp|s101-admin' });

  let warehouseId = '';
  let skuId = '';
  let binId = '';

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
      slug: 'test-s101a',
      name: 'Sprint101 Tenant',
      initialAdmin: {
        email: 'admin@s101a.example',
        displayName: 'S101 Admin',
        idpSubject: 'idp|s101-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH101',
      name: 'Sprint101 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const bin = await api('POST', '/api/v1/warehouses/locations', tokenA, {
      warehouseId,
      code: 'A-01-01',
    });
    binId = bin.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PUT101',
      name: 'PUT101 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PUT101-STD',
      name: 'PUT101 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s101',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WMS-007: putaway moves stock into the bin exactly once', async () => {
    const first = await api('POST', '/api/v1/stock/putaway', tokenA, {
      warehouseId,
      skuId,
      quantity: 6,
      toLocationId: binId,
      putawayKey: 'put101-first',
    });
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const bins = await api('GET', `/api/v1/stock/by-location?warehouseId=${warehouseId}`, tokenA);
    const row = (
      bins.body.rows as Array<{ locationCode: string; skuId: string; onHand: string }>
    ).find((r) => r.skuId === skuId);
    expect(row?.locationCode).toBe('A-01-01');
    expect(Number(row?.onHand)).toBe(6);

    // Total on-hand unchanged — putaway only relocates.
    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(Number(position.body.onHand)).toBe(10);

    // Retry with the same key: no double movement.
    const retry = await api('POST', '/api/v1/stock/putaway', tokenA, {
      warehouseId,
      skuId,
      quantity: 6,
      toLocationId: binId,
      putawayKey: 'put101-first',
    });
    expect(retry.body.duplicate).toBe(true);
    const binsAfter = await api(
      'GET',
      `/api/v1/stock/by-location?warehouseId=${warehouseId}`,
      tokenA,
    );
    const rowAfter = (bins.body.rows as Array<{ skuId: string; onHand: string }>).find(
      (r) => r.skuId === skuId,
    );
    expect(Number(rowAfter?.onHand)).toBe(6);
    expect(binsAfter.status).toBe(200);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'wms.putaway' } });
    expect(audit).not.toBeNull();
  });

  it('WMS-007: unknown bins and over-putaway are refused', async () => {
    const badBin = await api('POST', '/api/v1/stock/putaway', tokenA, {
      warehouseId,
      skuId,
      quantity: 1,
      toLocationId: '00000000-0000-0000-0000-000000000000',
      putawayKey: 'put101-nobin',
    });
    expect(badBin.status).toBe(404);

    const tooMuch = await api('POST', '/api/v1/stock/putaway', tokenA, {
      warehouseId,
      skuId,
      quantity: 999,
      toLocationId: binId,
      putawayKey: 'put101-toomuch',
    });
    expect(tooMuch.status).toBe(409);
  });

  it('AUTHZ: putaway needs inventory.adjust', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s101a', subject: 'idp|s101-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko101@primjer.example',
      displayName: 'Niko101',
      idpSubject: 'idp|s101-nobody',
    });
    const denied = await api('POST', '/api/v1/stock/putaway', stranger, {
      warehouseId,
      skuId,
      quantity: 1,
      toLocationId: binId,
      putawayKey: 'put101-hak00',
    });
    expect(denied.status).toBe(403);
  });
});
