import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 012 acceptance tests (docs/implementation/
 * SPRINT_012_PRODUCTION_VERIFY_QC.md): QC plans, inspections with SoD
 * finalization, automatic NCRs on failure, and production completion
 * blocked until QC passes.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 012 — Quality', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s12a', subject: 'idp|s12-admin' });
  const supervisorToken = identity.signToken({
    tenantSlug: 'test-s12a',
    subject: 'idp|s12-supervisor',
  });
  const tokenB = identity.signToken({ tenantSlug: 'test-s12b', subject: 'idp|s12b-admin' });

  let widgetId = '';
  let partId = '';
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

  /** Creates a running WO with all operations done (none here — no routing). */
  async function runningWorkOrder(quantity: number): Promise<string> {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: widgetId,
      warehouseId,
      quantity,
    });
    await api('POST', `/api/v1/work-orders/${wo.body.id}/release`, tokenA);
    await api('POST', `/api/v1/work-orders/${wo.body.id}/start`, tokenA);
    return wo.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "qc_inspection_item", "qc_inspection", "qc_plan_item", "qc_plan", "ncr",
       "work_order_operation", "work_order",
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
      slug: 'test-s12a',
      name: 'Sprint12 Tenant A',
      initialAdmin: {
        email: 'admin@s12a.example',
        displayName: 'S12 Admin',
        idpSubject: 'idp|s12-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s12b',
      name: 'Sprint12 Tenant B',
      initialAdmin: {
        email: 'admin@s12b.example',
        displayName: 'S12B Admin',
        idpSubject: 'idp|s12b-admin',
      },
    });

    // Supervisor user (SoD: different from the recording admin).
    const supervisor = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'supervisor@s12a.example',
      displayName: 'S12 Supervisor',
      idpSubject: 'idp|s12-supervisor',
    });
    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'qc-supervisor',
      permissions: ['qc.read', 'qc.approve'],
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: supervisor.body.id,
      roleId: role.body.id,
    });

    widgetId = await makeSku('WIDGET12', 'Widget12');
    partId = await makeSku('PART12', 'Part12');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: widgetId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: partId,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH12',
      name: 'Sprint12 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: partId,
      movementType: 'RECEIPT',
      quantity: 100,
      idempotencyKey: 'receipt-s12-parts',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('QC: a plan blocks production completion until an inspection passes', async () => {
    // Plan for the widget: production now requires QC.
    const plan = await api('POST', '/api/v1/qc/plans', tokenA, {
      skuId: widgetId,
      name: 'Widget final check',
      items: [
        { name: 'Dimensions', requirement: 'Within ±0.1mm' },
        { name: 'Finish', requirement: 'No visible scratches' },
      ],
    });
    expect(plan.status).toBe(201);

    const woId = await runningWorkOrder(5);
    const blocked = await api('POST', `/api/v1/work-orders/${woId}/complete`, tokenA, {
      goodQuantity: 5,
    });
    expect(blocked.status).toBe(409);

    // Inspect: record both items pass, supervisor finalizes.
    const inspection = await api('POST', '/api/v1/qc/inspections', tokenA, {
      workOrderId: woId,
    });
    expect(inspection.status).toBe(201);
    const items = inspection.body.items as Array<{ id: string }>;
    expect(items.length).toBe(2);
    for (const item of items) {
      await api('POST', `/api/v1/qc/inspections/${inspection.body.id}/items`, tokenA, {
        itemId: item.id,
        passed: true,
      });
    }

    // SoD: the recorder cannot finalize.
    const selfFinalize = await api(
      'POST',
      `/api/v1/qc/inspections/${inspection.body.id}/finalize`,
      tokenA,
    );
    expect(selfFinalize.status).toBe(403);

    const finalized = await api(
      'POST',
      `/api/v1/qc/inspections/${inspection.body.id}/finalize`,
      supervisorToken,
    );
    expect(finalized.body.status).toBe('PASSED');

    // Completion is unblocked now.
    const completed = await api('POST', `/api/v1/work-orders/${woId}/complete`, tokenA, {
      goodQuantity: 5,
    });
    expect(completed.status).toBe(201);
    expect(completed.body.status).toBe('COMPLETED');
  });

  it('QC: a failed inspection opens an NCR and keeps production blocked', async () => {
    const woId = await runningWorkOrder(3);
    const inspection = await api('POST', '/api/v1/qc/inspections', tokenA, {
      workOrderId: woId,
    });
    const items = inspection.body.items as Array<{ id: string }>;
    await api('POST', `/api/v1/qc/inspections/${inspection.body.id}/items`, tokenA, {
      itemId: items[0]!.id,
      passed: true,
    });
    await api('POST', `/api/v1/qc/inspections/${inspection.body.id}/items`, tokenA, {
      itemId: items[1]!.id,
      passed: false,
      note: 'Deep scratch on the housing',
    });

    // Finalization needs every result recorded — already done; supervisor fails it.
    const finalized = await api(
      'POST',
      `/api/v1/qc/inspections/${inspection.body.id}/finalize`,
      supervisorToken,
    );
    expect(finalized.body.status).toBe('FAILED');

    // NCR opened automatically.
    const ncrs = await api('GET', '/api/v1/qc/ncrs', tokenA);
    const list = ncrs.body.ncrs as Array<{ status: string; description: string }>;
    expect(list.some((n) => n.status === 'OPEN' && n.description.includes('Finish'))).toBe(true);

    // Completion still blocked (FAILED).
    const blocked = await api('POST', `/api/v1/work-orders/${woId}/complete`, tokenA, {
      goodQuantity: 3,
    });
    expect(blocked.status).toBe(409);

    // qc.failed event exists.
    const failedEvents = await prisma.outboxEvent.count({
      where: { eventType: 'qc.failed', aggregateId: inspection.body.id as string },
    });
    expect(failedEvents).toBe(1);
  });

  it('QC: NCR resolution is a supervisor action and is audited', async () => {
    const ncrs = await api('GET', '/api/v1/qc/ncrs', tokenA);
    const open = (ncrs.body.ncrs as Array<{ id: string; status: string }>).find(
      (n) => n.status === 'OPEN',
    );
    expect(open).toBeTruthy();

    const resolved = await api('POST', `/api/v1/qc/ncrs/${open?.id}/resolve`, supervisorToken, {
      resolution: 'Rework completed; housing replaced',
    });
    expect(resolved.body.status).toBe('RESOLVED');

    // A second resolve is refused.
    const again = await api('POST', `/api/v1/qc/ncrs/${open?.id}/resolve`, supervisorToken, {
      resolution: 'duplicate',
    });
    expect(again.status).toBe(409);
  });

  it('QC: finalization requires every check recorded', async () => {
    const woId = await runningWorkOrder(2);
    const inspection = await api('POST', '/api/v1/qc/inspections', tokenA, {
      workOrderId: woId,
    });
    const early = await api(
      'POST',
      `/api/v1/qc/inspections/${inspection.body.id}/finalize`,
      supervisorToken,
    );
    expect(early.status).toBe(400);
  });

  it('TENANCY: QC data is invisible across tenants', async () => {
    const plans = await api('GET', '/api/v1/qc/plans', tokenB);
    expect((plans.body.plans as unknown[]).length).toBe(0);
    const inspections = await api('GET', '/api/v1/qc/inspections', tokenB);
    expect((inspections.body.inspections as unknown[]).length).toBe(0);
    const ncrs = await api('GET', '/api/v1/qc/ncrs', tokenB);
    expect((ncrs.body.ncrs as unknown[]).length).toBe(0);
  });
});
