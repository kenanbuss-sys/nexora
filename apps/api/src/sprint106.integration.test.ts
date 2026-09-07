import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 106 acceptance tests: click & collect (COM-007) and project
 * ordering (B2B-009) — pickup orders flow ready-for-collection on the
 * timeline; delivery orders cannot; project references ride the order.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 106 — click & collect', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s106a', subject: 'idp|s106-admin' });

  let warehouseId = '';
  let skuId = '';
  let orderId = '';

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
      slug: 'test-s106a',
      name: 'Sprint106 Tenant',
      initialAdmin: {
        email: 'admin@s106a.example',
        displayName: 'S106 Admin',
        idpSubject: 'idp|s106-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH106',
      name: 'Sprint106 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'SPL106',
      name: 'SPL106 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'SPL106-STD',
      name: 'SPL106 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s106',
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
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId,
      quantity: 10,
      unitPrice: 5,
    });
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('COM-007/B2B-009: a pickup order carries its project ref and goes ready-for-collection', async () => {
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Pickup 106',
      company: 'Pickup106 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const pickup = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId,
      currency: 'EUR',
      fulfillmentType: 'PICKUP',
      projectRef: 'GRADILISTE-A7',
    });
    expect(pickup.status).toBe(201);
    expect(pickup.body.fulfillmentType).toBe('PICKUP');
    expect(pickup.body.projectRef).toBe('GRADILISTE-A7');
    const pid = pickup.body.id as string;
    await api('POST', `/api/v1/orders/${pid}/lines`, tokenA, {
      skuId,
      quantity: 1,
      unitPrice: 5,
    });

    // Not confirmed yet → refused.
    const early = await api('POST', `/api/v1/orders/${pid}/ready-for-pickup`, tokenA);
    expect(early.status).toBe(409);

    await api('POST', `/api/v1/orders/${pid}/confirm`, tokenA, {});
    const ready = await api('POST', `/api/v1/orders/${pid}/ready-for-pickup`, tokenA);
    expect(ready.status).toBe(201);

    const timeline = await api('GET', `/api/v1/orders/${pid}/timeline`, tokenA);
    expect(JSON.stringify(timeline.body)).toContain('order.pickup.ready');
  });

  it('COM-007: delivery orders cannot be flagged for pickup', async () => {
    const refused = await api('POST', `/api/v1/orders/${orderId}/ready-for-pickup`, tokenA);
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: ready-for-pickup needs order.confirm', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s106a', subject: 'idp|s106-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko106@primjer.example',
      displayName: 'Niko106',
      idpSubject: 'idp|s106-nobody',
    });
    const denied = await api('POST', `/api/v1/orders/${orderId}/ready-for-pickup`, stranger);
    expect(denied.status).toBe(403);
  });
});
