import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 208 acceptance tests: advanced planning (PLAN-001/002/003/
 * 010/011/012/013/014) — forecast versions, S&OP balancing, capacity
 * requirements, finite scheduling, sequencing rules, constraints and
 * what-if simulation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 208 — advanced planning', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s208a', subject: 'idp|s208-admin' });

  let lampId = '';
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
      `TRUNCATE TABLE "work_order_operation", "work_order",
       "mrp_suggestion", "mrp_run", "planning_policy",
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
       "order_event", "sales_order_line", "sales_order",
       "crm_activity", "opportunity", "lead", "crm_account",
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
      slug: 'test-s208a',
      name: 'Sprint208 Tenant',
      initialAdmin: {
        email: 'admin@s208a.example',
        displayName: 'S208 Admin',
        idpSubject: 'idp|s208-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        plan: {
          capacity: [
            { workCenter: 'BENCH-1', minutesPerDay: 60 },
            { workCenter: 'QC-1', minutesPerDay: 480 },
          ],
          sequenceRule: 'SPT',
        },
      },
    });

    lampId = await makeSku('LAMPA208', 'Lampa 208');
    const bulbId = await makeSku('SIJ208', 'Sijalica 208');

    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);

    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Montaža',
      workCenter: 'BENCH-1',
      runMinutesPerUnit: 3,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Kontrola',
      workCenter: 'QC-1',
      runMinutesPerUnit: 1,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH208',
      name: 'Sprint208 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 100,
      idempotencyKey: 'receipt-s208',
    });
    // 10 lamps on hand as finished stock.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: lampId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s208-fg',
    });

    // Two open work orders: 20 and 5 lamps.
    for (const quantity of [20, 5]) {
      const wo = await api('POST', '/api/v1/work-orders', tokenA, {
        skuId: lampId,
        warehouseId,
        quantity,
      });
      await api('POST', `/api/v1/work-orders/${wo.body.id}/release`, tokenA);
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PLAN-001/002: forecast versions publish immutably and list', async () => {
    const published = await api('POST', '/api/v1/planning/advanced/forecasts', tokenA, {
      version: 'v1',
      entries: [{ skuCode: 'LAMPA208-STD', period: '2026-10', qty: 50 }],
    });
    expect(published.status).toBe(201);
    expect(published.body.duplicate).toBe(false);

    const replay = await api('POST', '/api/v1/planning/advanced/forecasts', tokenA, {
      version: 'v1',
      entries: [{ skuCode: 'LAMPA208-STD', period: '2026-10', qty: 999 }],
    });
    expect(replay.body.duplicate).toBe(true);

    await api('POST', '/api/v1/planning/advanced/forecasts', tokenA, {
      version: 'v2',
      entries: [{ skuCode: 'LAMPA208-STD', period: '2026-10', qty: 60 }],
    });
    const versions = await api('GET', '/api/v1/planning/advanced/forecasts', tokenA);
    expect((versions.body.versions as unknown[]).length).toBe(2);

    const v1 = await api('GET', '/api/v1/planning/advanced/forecasts/v1', tokenA);
    expect((v1.body.entries as Array<{ qty: number }>)[0]?.qty).toBe(50);
  });

  it('PLAN-003: S&OP balances demand against stock and open production', async () => {
    const sop = await api('POST', '/api/v1/planning/advanced/sop', tokenA, {
      version: 'v1',
      period: '2026-10',
    });
    const rows = sop.body.rows as Array<{
      demand: number;
      onHand: number;
      inProduction: number;
      gap: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.demand).toBe(50);
    expect(rows[0]?.onHand).toBe(10);
    expect(rows[0]?.inProduction).toBe(25);
    expect(rows[0]?.gap).toBe(15);
  });

  it('PLAN-010/013: capacity requirements expose the bottleneck', async () => {
    const capacity = await api('GET', '/api/v1/planning/advanced/capacity', tokenA);
    const rows = capacity.body.capacity as Array<{
      workCenter: string;
      loadMinutes: number;
      utilizationPct: number;
    }>;
    const bench = rows.find((r) => r.workCenter === 'BENCH-1');
    // 25 lamps × 3 min = 75 min against 60 min/day.
    expect(bench?.loadMinutes).toBe(75);
    expect(bench?.utilizationPct).toBe(125);

    const constraints = await api('GET', '/api/v1/planning/advanced/constraints', tokenA);
    expect(constraints.body.bottleneck).toBe('BENCH-1');
    expect(constraints.body.overloaded).toEqual(['BENCH-1']);
    expect(constraints.body.suggestion).toBeTruthy();
  });

  it('PLAN-011/012: the finite schedule sequences by SPT and packs days', async () => {
    const schedule = await api('GET', '/api/v1/planning/advanced/schedule', tokenA);
    const centers = schedule.body.schedule as Array<{
      workCenter: string;
      queue: Array<{ minutes: number; startDay: number }>;
    }>;
    const bench = centers.find((c) => c.workCenter === 'BENCH-1');
    expect(bench?.queue).toHaveLength(2);
    // SPT: the 5-lamp order (15 min) runs before the 20-lamp order (60 min).
    expect(bench?.queue[0]?.minutes).toBe(15);
    expect(bench?.queue[0]?.startDay).toBe(1);
    expect(bench?.queue[1]?.minutes).toBe(60);
    expect(bench?.queue[1]?.startDay).toBe(2);
  });

  it('PLAN-014: what-if simulation shifts utilization without persisting', async () => {
    const whatIf = await api('POST', '/api/v1/planning/advanced/capacity/what-if', tokenA, {
      extraMinutesPerDay: 60,
    });
    const rows = whatIf.body.capacity as Array<{ workCenter: string; utilizationPct: number }>;
    const bench = rows.find((r) => r.workCenter === 'BENCH-1');
    expect(bench?.utilizationPct).toBe(62.5); // 75 / 120

    const baseline = await api('GET', '/api/v1/planning/advanced/capacity', tokenA);
    const benchBase = (
      baseline.body.capacity as Array<{ workCenter: string; utilizationPct: number }>
    ).find((r) => r.workCenter === 'BENCH-1');
    expect(benchBase?.utilizationPct).toBe(125);
  });

  it('AUTHZ: forecast publishing needs plan.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s208a', subject: 'idp|s208-nobody' });
    const denied = await api('POST', '/api/v1/planning/advanced/forecasts', stranger, {
      version: 'vX',
      entries: [{ skuCode: 'LAMPA208-STD', period: '2026-10', qty: 1 }],
    });
    expect([401, 403]).toContain(denied.status);
  });
});
