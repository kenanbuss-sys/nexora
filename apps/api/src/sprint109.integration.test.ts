import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 109 acceptance tests: cross-docking (WMS-021) — incoming
 * receiving quantities matched live against open sales demand in the
 * same warehouse, suggesting dock-to-staging flow past putaway.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 109 — cross-docking', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s109a', subject: 'idp|s109-admin' });

  let warehouseId = '';
  let skuId = '';

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
      slug: 'test-s109a',
      name: 'Sprint109 Tenant',
      initialAdmin: {
        email: 'admin@s109a.example',
        displayName: 'S109 Admin',
        idpSubject: 'idp|s109-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH109',
      name: 'Sprint109 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PUT109',
      name: 'PUT109 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PUT109-STD',
      name: 'PUT109 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s109',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WMS-021: incoming vs demand yields cross-dock suggestions', async () => {
    // Inbound: 8 expected. Demand: confirmed order for 5 (backordered).
    await api('POST', '/api/v1/wms/orders', tokenA, {
      orderType: 'RECEIVING',
      warehouseId,
      reference: 'ASN-109',
      lines: [{ skuId, expectedQty: 8 }],
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stodevet',
      company: 'Stodevet d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity: 5,
      unitPrice: 3,
    });
    await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA, {
      allowBackorder: true,
    });

    const report = await api(
      'GET',
      `/api/v1/wms/orders/cross-dock?warehouseId=${warehouseId}`,
      tokenA,
    );
    expect(report.status).toBe(200);
    const rows = report.body.opportunities as Array<{
      code: string;
      incoming: string;
      demand: string;
      crossDock: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.incoming).toBe('8');
    expect(rows[0]?.demand).toBe('5');
    expect(rows[0]?.crossDock).toBe('5');
  });

  it('WMS-021: no demand means no suggestions', async () => {
    // Fulfil nothing; cancel the sales order → demand disappears.
    const orders = await prisma.salesOrder.findMany({ where: { status: 'CONFIRMED' } });
    for (const o of orders) {
      await api('POST', `/api/v1/orders/${o.id}/cancel`, tokenA);
    }
    const report = await api(
      'GET',
      `/api/v1/wms/orders/cross-dock?warehouseId=${warehouseId}`,
      tokenA,
    );
    expect((report.body.opportunities as unknown[]).length).toBe(0);
  });

  it('AUTHZ: the cross-dock report needs inventory.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s109a', subject: 'idp|s109-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko109@primjer.example',
      displayName: 'Niko109',
      idpSubject: 'idp|s109-nobody',
    });
    const denied = await api(
      'GET',
      `/api/v1/wms/orders/cross-dock?warehouseId=${warehouseId}`,
      stranger,
    );
    expect(denied.status).toBe(403);
  });
});
