import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 130 acceptance tests: digital work instructions (MES-016) and
 * setup/changeover reporting (MES-015) — instructions per SKU and
 * operation from versioned configuration; SETUP downtime aggregated
 * per work center.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 130 — work instructions', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s130a', subject: 'idp|s130-admin' });

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
      slug: 'test-s130a',
      name: 'Sprint130 Tenant',
      initialAdmin: {
        email: 'admin@s130a.example',
        displayName: 'S130 Admin',
        idpSubject: 'idp|s130-admin',
      },
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC130A',
      name: 'Press A',
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC130B',
      name: 'Press B',
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'WI130',
      name: 'WI130 product',
    });
    const lamp = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'WI130-STD',
      name: 'WI130 Std',
      baseUom: 'pcs',
    });
    const lampId = lamp.body.id as string;
    await api('POST', `/api/v1/skus/${lampId}/activate`, tokenA);
    const bolt = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'WI130-BOLT',
      name: 'WI130 Bolt',
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
      workCenter: 'WC130A',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH130',
      name: 'Sprint130 warehouse',
    });
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: boltId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s130-bolts',
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

  it('MES-016: operators see the steps for their SKU and operation', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        mes: {
          workInstructions: [
            {
              skuCode: 'WI130-STD',
              operation: 'Press',
              steps: ['Postavi ploču u presu', 'Pokreni ciklus 3 s', 'Vizuelno provjeri rub'],
            },
          ],
        },
      },
    });
    const instructions = await api(
      'GET',
      `/api/v1/work-orders/${woId}/operations/${opId}/instructions`,
      tokenA,
    );
    expect(instructions.status).toBe(200);
    expect(instructions.body.operation).toBe('Press');
    expect(instructions.body.steps as string[]).toHaveLength(3);
    expect((instructions.body.steps as string[])[0]).toContain('Postavi');
  });

  it('MES-015: SETUP downtime aggregates into the changeover report', async () => {
    const centers = await api('GET', '/api/v1/shopfloor/work-centers', tokenA);
    const workCenterId = (centers.body.workCenters as Array<{ id: string; code: string }>).find(
      (c) => c.code === 'WC130A',
    )?.id as string;
    await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'SETUP',
      minutes: 25,
      reason: 'Zamjena alata A',
    });
    await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'SETUP',
      minutes: 15,
      reason: 'Zamjena alata B',
    });
    await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'BREAKDOWN',
      minutes: 60,
      reason: 'Ne računa se u setup',
    });
    const report = await api('GET', '/api/v1/work-orders/setup-report?days=7', tokenA);
    const row = (
      report.body.report as Array<{ workCenter: string; changeovers: number; setupMinutes: number }>
    ).find((r) => r.workCenter === 'WC130A');
    expect(row?.changeovers).toBe(2);
    expect(row?.setupMinutes).toBe(40);
  });

  it('AUTHZ: instructions need production.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s130a', subject: 'idp|s130-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko130@primjer.example',
      displayName: 'Niko130',
      idpSubject: 'idp|s130-nobody',
    });
    const denied = await api(
      'GET',
      `/api/v1/work-orders/${woId}/operations/${opId}/instructions`,
      stranger,
    );
    expect(denied.status).toBe(403);
  });
});
