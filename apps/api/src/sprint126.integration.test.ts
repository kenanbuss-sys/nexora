import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 126 acceptance tests: ship from store (COM-008) — partial
 * shipments can issue from a different site's ledger than the order's
 * warehouse; totals and idempotency hold per site.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 126 — ship from store', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s126a', subject: 'idp|s126-admin' });

  let warehouseId = '';
  let skuId = '';
  let orderId = '';
  let lineId = '';

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

  async function onHand(): Promise<number> {
    const r = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    return Number(r.body.onHand);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "package_line", "package", "landed_cost", "rfq_quote", "rfq",
       "loyalty_transaction", "loyalty_account",
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
      slug: 'test-s126a',
      name: 'Sprint126 Tenant',
      initialAdmin: {
        email: 'admin@s126a.example',
        displayName: 'S126 Admin',
        idpSubject: 'idp|s126-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH126',
      name: 'Sprint126 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'SFS126',
      name: 'SFS126 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'SFS126-STD',
      name: 'SFS126 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s126',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stodvadesetsest',
      company: 'Stodvadesetsest d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
    const withLine = await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId,
      quantity: 10,
      unitPrice: 5,
    });
    lineId = (withLine.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let storeId = '';

  it('COM-008: a store ships part of the order from its own ledger', async () => {
    // The store carries 4; the central warehouse keeps its 20.
    const store = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'STORE126',
      name: 'Poslovnica Store 126',
    });
    storeId = store.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: storeId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 4,
      idempotencyKey: 'receipt-s126-store',
    });

    const shipped = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, tokenA, {
      shipKey: 'sfs126-a',
      sourceWarehouseId: storeId,
      lines: [{ lineId, quantity: 4 }],
    });
    expect(shipped.status).toBe(201);
    const line = (shipped.body.lines as Array<{ fulfilledQty: string }>)[0];
    expect(Number(line?.fulfilledQty)).toBe(4);

    // The store's ledger paid for it; the central warehouse did not.
    const storePos = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${storeId}&skuId=${skuId}`,
      tokenA,
    );
    expect(Number(storePos.body.onHand)).toBe(0);
    expect(await onHand()).toBe(20);
  });

  it('COM-008: the rest ships from the order warehouse; unknown stores 404', async () => {
    const missing = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, tokenA, {
      shipKey: 'sfs126-x',
      sourceWarehouseId: '00000000-0000-0000-0000-000000000000',
      lines: [{ lineId, quantity: 1 }],
    });
    expect(missing.status).toBe(404);

    const rest = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, tokenA, {
      shipKey: 'sfs126-b',
      lines: [{ lineId, quantity: 6 }],
    });
    expect(rest.status).toBe(201);
    expect(rest.body.status).toBe('FULFILLED');
    expect(await onHand()).toBe(14);
  });

  it('AUTHZ: ship-from-store needs order.confirm', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s126a', subject: 'idp|s126-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko126@primjer.example',
      displayName: 'Niko126',
      idpSubject: 'idp|s126-nobody',
    });
    const denied = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, stranger, {
      shipKey: 'sfs126-h',
      sourceWarehouseId: storeId,
      lines: [{ lineId, quantity: 1 }],
    });
    expect(denied.status).toBe(403);
  });
});
