import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 149 acceptance tests: machine & tool checks (VER-008/009) —
 * scan-first verification of machines against the work-center registry
 * and routing, and of tools against the configured tool registry with
 * calibration and operation approval.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 149 — machine & tool checks', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s149a', subject: 'idp|s149-admin' });

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
      slug: 'test-s149a',
      name: 'Sprint149 Tenant',
      initialAdmin: {
        email: 'admin@s149a.example',
        displayName: 'S149 Admin',
        idpSubject: 'idp|s149-admin',
      },
    });
    lampId = await makeSku('LAMP149', 'Lamp149');
    bulbId = await makeSku('BULB149', 'Bulb149');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-149',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH149',
      name: 'Sprint149 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s149-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let woId = '';
  let opId = '';

  it('VER-008: machine check validates registry, activity and routing', async () => {
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'BENCH-149',
      name: 'Klupa 149',
    });
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 2,
    });
    woId = wo.body.id as string;
    const detail = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    opId = (detail.body.operations as Array<{ id: string }>)[0]?.id as string;

    const ok = await api('POST', '/api/v1/scan-events/machine-check', tokenA, {
      code: 'BENCH-149',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.ok).toBe(true);

    const routed = await api('POST', '/api/v1/scan-events/machine-check', tokenA, {
      code: 'BENCH-149',
      operationId: opId,
    });
    expect(routed.body.ok).toBe(true);
    expect(routed.body.routedTo).toBe('BENCH-149');

    const unknown = await api('POST', '/api/v1/scan-events/machine-check', tokenA, {
      code: 'GHOST-1',
    });
    expect(unknown.body.ok).toBe(false);
  });

  it('VER-008: a machine that is not the routed center fails the check', async () => {
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'PRESA-149',
      name: 'Presa 149',
    });
    const wrong = await api('POST', '/api/v1/scan-events/machine-check', tokenA, {
      code: 'PRESA-149',
      operationId: opId,
    });
    expect(wrong.body.ok).toBe(false);
    expect(wrong.body.routedTo).toBe('BENCH-149');
  });

  it('VER-009: tool checks pass on registered, calibrated, approved tools', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        ver: {
          tools: [
            {
              code: 'TORQUE-01',
              name: 'Moment ključ',
              calibratedUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
              operations: ['Assemble'],
            },
            {
              code: 'DRILL-09',
              name: 'Bušilica',
              calibratedUntil: new Date(Date.now() - 86_400_000).toISOString(),
            },
          ],
        },
      },
    });

    const ok = await api('POST', '/api/v1/scan-events/tool-check', tokenA, {
      code: 'TORQUE-01',
      operation: 'Assemble',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.name).toBe('Moment ključ');

    const wrongOp = await api('POST', '/api/v1/scan-events/tool-check', tokenA, {
      code: 'TORQUE-01',
      operation: 'Paint',
    });
    expect(wrongOp.body.ok).toBe(false);
    expect(wrongOp.body.reason).toBe('NOT_APPROVED_FOR_OPERATION');
  });

  it('VER-009: expired calibration and unknown tools fail', async () => {
    const expired = await api('POST', '/api/v1/scan-events/tool-check', tokenA, {
      code: 'DRILL-09',
    });
    expect(expired.body.ok).toBe(false);
    expect(expired.body.reason).toBe('CALIBRATION_EXPIRED');

    const unknown = await api('POST', '/api/v1/scan-events/tool-check', tokenA, {
      code: 'HAMMER-77',
    });
    expect(unknown.body.ok).toBe(false);
    expect(unknown.body.reason).toBe('UNKNOWN_TOOL');
  });
});
