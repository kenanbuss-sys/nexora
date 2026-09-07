import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 098 acceptance tests: machine assignment (MES-004) — pending
 * operations move between registered work centers (audited), the load
 * view shows the queue per center, and history is never rewritten.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 098 — machine assignment', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s98a', subject: 'idp|s98-admin' });

  let woId = '';
  let opId = '';

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
      `TRUNCATE TABLE "rfq_quote", "rfq", "work_order_operation", "work_order",
       "downtime_event", "work_center",
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
      slug: 'test-s98a',
      name: 'Sprint98 Tenant',
      initialAdmin: {
        email: 'admin@s98a.example',
        displayName: 'S98 Admin',
        idpSubject: 'idp|s98-admin',
      },
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC98A',
      name: 'Press A',
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC98B',
      name: 'Press B',
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'MA98',
      name: 'MA98 product',
    });
    const lamp = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'MA98-STD',
      name: 'MA98 Std',
      baseUom: 'pcs',
    });
    const lampId = lamp.body.id as string;
    await api('POST', `/api/v1/skus/${lampId}/activate`, tokenA);
    const bolt = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'MA98-BOLT',
      name: 'MA98 Bolt',
      baseUom: 'pcs',
    });
    const boltId = bolt.body.id as string;
    await api('POST', `/api/v1/skus/${boltId}/activate`, tokenA);

    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: boltId,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Press',
      workCenter: 'WC98A',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH98',
      name: 'Sprint98 warehouse',
    });
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: boltId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s98-bolts',
    });

    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId: warehouse.body.id,
      quantity: 2,
    });
    woId = wo.body.id as string;
    opId = (wo.body.operations as Array<{ id: string }>)[0]?.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MES-004: a pending operation moves to another registered center, audited', async () => {
    const moved = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/assign`,
      tokenA,
      {
        workCenterCode: 'WC98B',
      },
    );
    expect(moved.status).toBe(201);
    const op = (moved.body.operations as Array<{ workCenter: string }>)[0];
    expect(op?.workCenter).toBe('WC98B');

    const load = await api('GET', '/api/v1/work-orders/work-center-load', tokenA);
    // The work order is still PLANNED, so no open load yet; release it.
    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    const loadAfter = await api('GET', '/api/v1/work-orders/work-center-load', tokenA);
    const rows = loadAfter.body.load as Array<{ code: string; pending: number }>;
    expect(rows.find((r) => r.code === 'WC98B')?.pending).toBe(1);
    expect(rows.find((r) => r.code === 'WC98A')?.pending).toBe(0);
    expect(load.status).toBe(200);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'mes.operation.assign' } });
    expect(audit).not.toBeNull();
  });

  it('MES-004: unknown centers are refused; finished operations keep history', async () => {
    const unknown = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/assign`,
      tokenA,
      { workCenterCode: 'WC-NEMA' },
    );
    expect(unknown.status).toBe(404);

    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/operations/${opId}/complete`, tokenA);
    const done = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/assign`,
      tokenA,
      { workCenterCode: 'WC98A' },
    );
    expect(done.status).toBe(409);
  });

  it('AUTHZ: assignment needs production.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s98a', subject: 'idp|s98-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko98@primjer.example',
      displayName: 'Niko98',
      idpSubject: 'idp|s98-nobody',
    });
    const denied = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/assign`,
      stranger,
      { workCenterCode: 'WC98A' },
    );
    expect(denied.status).toBe(403);
  });
});
