import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 202 acceptance tests: maintenance (EAM-003..013) —
 * preventive schedules, breakdown-to-service flow with spare parts
 * through the ledger, meters, tool checkout and the asset report.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 202 — maintenance', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s202a', subject: 'idp|s202-admin' });

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
      slug: 'test-s202a',
      name: 'Sprint202 Tenant',
      initialAdmin: {
        email: 'admin@s202a.example',
        displayName: 'S202 Admin',
        idpSubject: 'idp|s202-admin',
      },
    });
    lampId = await makeSku('LAMP202', 'Lamp202');
    bulbId = await makeSku('BULB202', 'Bulb202');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-202',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH202',
      name: 'Sprint202 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s202-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let assetId = '';

  it('EAM-003/008: preventive plans fire one task per period', async () => {
    const asset = await api('POST', '/api/v1/assets', tokenA, {
      name: 'Hidraulična presa',
      category: 'MACHINE',
    });
    expect(asset.status).toBe(201);
    assetId = asset.body.id as string;
    const assetNumber = asset.body.assetNumber as string;

    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        eam: {
          preventive: [{ assetNumber, everyDays: 30, checklist: ['ulje', 'filteri', 'brtve'] }],
          warranties: [{ assetNumber, until: '2027-01-01T00:00:00Z' }],
        },
      },
    });
    const run = await api('POST', '/api/v1/maintenance/preventive/run', tokenA);
    expect(run.status).toBe(201);
    expect(run.body.created).toBe(1);
    const rerun = await api('POST', '/api/v1/maintenance/preventive/run', tokenA);
    expect(rerun.body.created).toBe(0);
    expect(rerun.body.skipped).toBe(1);

    const task = await prisma.task.findFirst({
      where: { title: { contains: 'Preventivno' } },
      select: { description: true },
    });
    expect(task?.description).toContain('ulje');
  });

  it('EAM-004/006/013: breakdown → parts through the ledger → back in service', async () => {
    const broken = await api('POST', `/api/v1/maintenance/assets/${assetId}/breakdown`, tokenA, {
      description: 'Curi hidraulika na cilindru.',
    });
    expect(broken.status).toBe(201);

    const complete = await api('POST', `/api/v1/maintenance/assets/${assetId}/complete`, tokenA, {
      completionKey: 'fix-202',
      laborHours: 3,
      laborRate: 40,
      parts: [{ skuId: bulbId, warehouseId, quantity: 2 }],
    });
    expect(complete.status).toBe(201);
    expect(complete.body.cost).toBe('120.00');
    expect(complete.body.duplicate).toBe(false);

    const replay = await api('POST', `/api/v1/maintenance/assets/${assetId}/complete`, tokenA, {
      completionKey: 'fix-202',
      laborHours: 3,
      laborRate: 40,
    });
    expect(replay.body.duplicate).toBe(true);

    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${bulbId}`,
      tokenA,
    );
    expect(Number(position.body.onHand)).toBe(18); // 20 - 2 spare parts
  });

  it('EAM-009/011: meters record idempotently; tools check out one holder at a time', async () => {
    const meter = await api('POST', `/api/v1/maintenance/assets/${assetId}/meters`, tokenA, {
      meter: 'radni_sati',
      value: 1250,
      readingId: 'm-202-1',
    });
    expect(meter.body.duplicate).toBe(false);
    const replay = await api('POST', `/api/v1/maintenance/assets/${assetId}/meters`, tokenA, {
      meter: 'radni_sati',
      value: 1250,
      readingId: 'm-202-1',
    });
    expect(replay.body.duplicate).toBe(true);

    const out = await api('POST', `/api/v1/maintenance/assets/${assetId}/checkout`, tokenA, {
      event: 'OUT',
      holder: 'Amir Serviser',
    });
    expect(out.status).toBe(201);
    const doubleOut = await api('POST', `/api/v1/maintenance/assets/${assetId}/checkout`, tokenA, {
      event: 'OUT',
      holder: 'Neko Drugi',
    });
    expect(doubleOut.status).toBe(409);
    const back = await api('POST', `/api/v1/maintenance/assets/${assetId}/checkout`, tokenA, {
      event: 'IN',
      holder: 'Amir Serviser',
    });
    expect(back.body.holder).toBeNull();
  });

  it('EAM-005/012/013: the asset report aggregates cost, downtime signals and warranty', async () => {
    const report = await api('GET', `/api/v1/maintenance/assets/${assetId}/report`, tokenA);
    expect(report.status).toBe(200);
    expect(report.body.maintenanceCost).toBe('120.00');
    expect(report.body.completions).toBe(1);
    expect(report.body.breakdowns).toBe(1);
    expect(report.body.warrantyExpired).toBe(false);
  });
});
