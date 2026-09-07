import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 104 acceptance tests: split fulfillment (OMS-005) — partial
 * shipments issue stock idempotently per line, fulfilledQty tracks
 * progress, over-shipment is refused, and the order completes only
 * when every line is fully shipped.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 104 — split fulfillment', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s104a', subject: 'idp|s104-admin' });

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
      slug: 'test-s104a',
      name: 'Sprint104 Tenant',
      initialAdmin: {
        email: 'admin@s104a.example',
        displayName: 'S104 Admin',
        idpSubject: 'idp|s104-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH104',
      name: 'Sprint104 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'SPL104',
      name: 'SPL104 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'SPL104-STD',
      name: 'SPL104 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s104',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stocetiri',
      company: 'Stocetiri d.o.o.',
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

  it('OMS-005: a partial shipment issues stock and tracks fulfilledQty', async () => {
    const first = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, tokenA, {
      shipKey: 'split104-a',
      lines: [{ lineId, quantity: 4 }],
    });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('CONFIRMED');
    const line = (first.body.lines as Array<{ fulfilledQty: string }>)[0];
    expect(Number(line?.fulfilledQty)).toBe(4);
    expect(await onHand()).toBe(16);

    // Retry with the same key: no double issue, no double count.
    const retry = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, tokenA, {
      shipKey: 'split104-a',
      lines: [{ lineId, quantity: 4 }],
    });
    const retryLine = (retry.body.lines as Array<{ fulfilledQty: string }>)[0];
    expect(Number(retryLine?.fulfilledQty)).toBe(4);
    expect(await onHand()).toBe(16);
  });

  it('OMS-005: over-shipment is refused; the final shipment completes the order', async () => {
    const over = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, tokenA, {
      shipKey: 'split104-over',
      lines: [{ lineId, quantity: 7 }],
    });
    expect(over.status).toBe(409);

    const rest = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, tokenA, {
      shipKey: 'split104-b',
      lines: [{ lineId, quantity: 6 }],
    });
    expect(rest.status).toBe(201);
    expect(rest.body.status).toBe('FULFILLED');
    expect(await onHand()).toBe(10);
  });

  it('AUTHZ: split fulfillment needs order.confirm', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s104a', subject: 'idp|s104-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko104@primjer.example',
      displayName: 'Niko104',
      idpSubject: 'idp|s104-nobody',
    });
    const denied = await api('POST', `/api/v1/orders/${orderId}/fulfill-lines`, stranger, {
      shipKey: 'split104-h',
      lines: [{ lineId, quantity: 1 }],
    });
    expect(denied.status).toBe(403);
  });
});
