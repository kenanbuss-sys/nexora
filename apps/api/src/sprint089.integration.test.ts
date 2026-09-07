import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 089 acceptance tests: backflush (MES-007) — with
 * mes.issueMode = 'backflush' components are not issued at release;
 * they are consumed at completion scaled to actual production, and
 * cancelling a released order returns nothing (nothing was issued).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 089 — backflush', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s89a', subject: 'idp|s89-admin' });

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

  async function onHand(skuId: string): Promise<number> {
    const r = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    return Number(r.body.onHand);
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
      slug: 'test-s89a',
      name: 'Sprint89 Tenant',
      initialAdmin: {
        email: 'admin@s89a.example',
        displayName: 'S89 Admin',
        idpSubject: 'idp|s89-admin',
      },
    });
    // Turn on backflush for this tenant (versioned configuration).
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { mes: { issueMode: 'backflush' } },
    });

    lampId = await makeSku('LAMP89', 'Lamp89');
    bulbId = await makeSku('BULB89', 'Bulb89');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-89',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH89',
      name: 'Sprint89 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s89-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MES-007: release issues nothing; completion backflushes actual production', async () => {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 5,
    });
    expect(wo.status).toBe(201);
    const woId = wo.body.id as string;

    const released = await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    expect(released.body.status).toBe('RELEASED');
    // Backflush mode: no material issued at release.
    expect(await onHand(bulbId)).toBe(20);

    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    const started = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    const ops = started.body.operations as Array<{ id: string }>;
    await api('POST', `/api/v1/work-orders/${woId}/operations/${ops[0]?.id}/complete`, tokenA);

    const completed = await api('POST', `/api/v1/work-orders/${woId}/complete`, tokenA, {
      goodQuantity: 4,
      scrapQuantity: 1,
    });
    expect(completed.status).toBe(201);
    expect(completed.body.status).toBe('COMPLETED');
    // Consumed for what was produced: (4 + 1) × 2 = 10 bulbs.
    expect(await onHand(bulbId)).toBe(10);
    expect(await onHand(lampId)).toBe(4);
  });

  it('MES-007: cancelling a released backflush order returns nothing', async () => {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 3,
    });
    const woId = wo.body.id as string;
    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    const before = await onHand(bulbId);
    const cancelled = await api('POST', `/api/v1/work-orders/${woId}/cancel`, tokenA);
    expect(cancelled.body.status).toBe('CANCELLED');
    // Nothing was issued, so nothing may come back.
    expect(await onHand(bulbId)).toBe(before);
  });

  it('AUTHZ: creating work orders needs production.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s89a', subject: 'idp|s89-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko89@primjer.example',
      displayName: 'Niko89',
      idpSubject: 'idp|s89-nobody',
    });
    const denied = await api('POST', '/api/v1/work-orders', stranger, {
      skuId: lampId,
      warehouseId,
      quantity: 1,
    });
    expect(denied.status).toBe(403);
  });
});
