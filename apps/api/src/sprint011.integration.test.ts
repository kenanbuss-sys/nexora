import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 011 acceptance tests (docs/implementation/SPRINT_011_MES.md):
 * work orders against released BOM/routing, material issue at release
 * with compensation on failure, sequential operations, WIP transitions,
 * idempotent completion with good/scrap, and released cancellation
 * returning material.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 011 — MES', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s11a', subject: 'idp|s11-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s11b', subject: 'idp|s11b-admin' });

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
      `TRUNCATE TABLE "work_order_operation", "work_order",
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
      slug: 'test-s11a',
      name: 'Sprint11 Tenant A',
      initialAdmin: {
        email: 'admin@s11a.example',
        displayName: 'S11 Admin',
        idpSubject: 'idp|s11-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s11b',
      name: 'Sprint11 Tenant B',
      initialAdmin: {
        email: 'admin@s11b.example',
        displayName: 'S11B Admin',
        idpSubject: 'idp|s11b-admin',
      },
    });

    // lamp = 2x bulb (released BOM) with a 2-op released routing.
    lampId = await makeSku('LAMP', 'Lamp');
    bulbId = await makeSku('BULB', 'Bulb');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);

    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Wire',
      workCenter: 'BENCH-1',
      runMinutesPerUnit: 3,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Test',
      workCenter: 'QC-1',
      runMinutesPerUnit: 1,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH11',
      name: 'Sprint11 warehouse',
    });
    warehouseId = warehouse.body.id as string;

    // 20 bulbs on hand.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s11-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MES: full lifecycle — release issues material, completion receipts output', async () => {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 5,
    });
    expect(wo.status).toBe(201);
    expect((wo.body.operations as unknown[]).length).toBe(2);
    const woId = wo.body.id as string;

    // Release issues 10 bulbs (5 × 2).
    const released = await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    expect(released.body.status).toBe('RELEASED');
    expect(await onHand(bulbId)).toBe(10);

    // Start; cannot complete op 2 before op 1.
    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    const started = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    expect(started.body.status).toBe('IN_PROGRESS');
    const ops = started.body.operations as Array<{ id: string; seq: number }>;
    const [op1, op2] = ops;
    const outOfOrder = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${op2?.id}/complete`,
      tokenA,
    );
    expect(outOfOrder.status).toBe(409);

    // Completion requires all operations done.
    const early = await api('POST', `/api/v1/work-orders/${woId}/complete`, tokenA, {
      goodQuantity: 5,
    });
    expect(early.status).toBe(409);

    await api('POST', `/api/v1/work-orders/${woId}/operations/${op1?.id}/complete`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/operations/${op2?.id}/complete`, tokenA);

    // Pause/resume works while running.
    await api('POST', `/api/v1/work-orders/${woId}/pause`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);

    const completed = await api('POST', `/api/v1/work-orders/${woId}/complete`, tokenA, {
      goodQuantity: 4,
      scrapQuantity: 1,
    });
    expect(completed.body.status).toBe('COMPLETED');
    expect(completed.body.goodQuantity).toBe('4');
    expect(completed.body.scrapQuantity).toBe('1');
    expect(await onHand(lampId)).toBe(4);

    // Scrap event exists.
    const scrapEvents = await prisma.outboxEvent.count({
      where: { eventType: 'scrap.recorded', aggregateId: woId },
    });
    expect(scrapEvents).toBe(1);
  });

  it('MES: releasing beyond available material fails and compensates', async () => {
    // 10 bulbs left; WO for 8 lamps needs 16.
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 8,
    });
    const woId = wo.body.id as string;
    const before = await onHand(bulbId);

    const released = await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    expect(released.status).toBe(409);

    const after = await onHand(bulbId);
    expect(after).toBe(before);
    const still = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    expect(still.body.status).toBe('PLANNED');
  });

  it('MES: cancelling a released order returns issued material', async () => {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 3,
    });
    const woId = wo.body.id as string;
    const before = await onHand(bulbId);
    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    expect(await onHand(bulbId)).toBe(before - 6);

    const cancelled = await api('POST', `/api/v1/work-orders/${woId}/cancel`, tokenA);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(await onHand(bulbId)).toBe(before);

    // A completed/cancelled order refuses further transitions.
    const restart = await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    expect(restart.status).toBe(409);
  });

  it('MES: good + scrap cannot exceed the ordered quantity', async () => {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 2,
    });
    const woId = wo.body.id as string;
    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    const detail = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    for (const op of detail.body.operations as Array<{ id: string }>) {
      await api('POST', `/api/v1/work-orders/${woId}/operations/${op.id}/complete`, tokenA);
    }
    const tooMuch = await api('POST', `/api/v1/work-orders/${woId}/complete`, tokenA, {
      goodQuantity: 2,
      scrapQuantity: 1,
    });
    expect(tooMuch.status).toBe(400);
  });

  it('MES: a SKU without a released BOM cannot be produced', async () => {
    const refused = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: bulbId,
      warehouseId,
      quantity: 1,
    });
    expect(refused.status).toBe(409);
  });

  it('TENANCY: work orders are invisible across tenants', async () => {
    const listB = await api('GET', '/api/v1/work-orders', tokenB);
    expect((listB.body.workOrders as unknown[]).length).toBe(0);

    const listA = await api('GET', '/api/v1/work-orders', tokenA);
    const first = (listA.body.workOrders as Array<{ id: string }>)[0];
    const foreign = await api('GET', `/api/v1/work-orders/${first?.id}`, tokenB);
    expect(foreign.status).toBe(404);
  });
});
