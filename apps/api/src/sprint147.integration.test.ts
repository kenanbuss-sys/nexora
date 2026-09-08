import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 147 acceptance tests: production confirmations (MES-024) —
 * operators report produced quantity per operation; confirmations
 * accumulate, are idempotent per key and never exceed the order.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 147 — production confirmations', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s147a', subject: 'idp|s147-admin' });

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
      slug: 'test-s147a',
      name: 'Sprint147 Tenant',
      initialAdmin: {
        email: 'admin@s147a.example',
        displayName: 'S147 Admin',
        idpSubject: 'idp|s147-admin',
      },
    });
    lampId = await makeSku('LAMP147', 'Lamp147');
    bulbId = await makeSku('BULB147', 'Bulb147');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-147',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH147',
      name: 'Sprint147 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s147-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let woId = '';
  let opId = '';

  it('MES-024: confirmations accumulate on a running operation, idempotently', async () => {
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 5,
    });
    woId = wo.body.id as string;
    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    const detail = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    opId = (detail.body.operations as Array<{ id: string }>)[0]?.id as string;

    const first = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/confirm`,
      tokenA,
      { quantity: 2, confirmationKey: 'shift1' },
    );
    expect(first.status).toBe(201);
    const ops1 = first.body.operations as Array<{ id: string; confirmedQty: string }>;
    expect(Number(ops1.find((o) => o.id === opId)?.confirmedQty)).toBe(2);

    // Idempotent retry: same key, no double count.
    const retry = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/confirm`,
      tokenA,
      { quantity: 2, confirmationKey: 'shift1' },
    );
    expect(retry.status).toBe(201);
    const opsR = retry.body.operations as Array<{ id: string; confirmedQty: string }>;
    expect(Number(opsR.find((o) => o.id === opId)?.confirmedQty)).toBe(2);

    const second = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/confirm`,
      tokenA,
      { quantity: 3, confirmationKey: 'shift2' },
    );
    const ops2 = second.body.operations as Array<{ id: string; confirmedQty: string }>;
    expect(Number(ops2.find((o) => o.id === opId)?.confirmedQty)).toBe(5);
  });

  it('MES-024: confirmations never exceed the ordered quantity', async () => {
    const over = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/confirm`,
      tokenA,
      { quantity: 1, confirmationKey: 'shift3' },
    );
    expect(over.status).toBe(409);
  });

  it('MES-024: validation — non-positive quantity and bad keys', async () => {
    const zero = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/confirm`,
      tokenA,
      { quantity: 0, confirmationKey: 'x1' },
    );
    expect(zero.status).toBe(400);
    const badKey = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/confirm`,
      tokenA,
      { quantity: 1, confirmationKey: 'bad key!!' },
    );
    expect(badKey.status).toBe(400);
  });

  it('MES-024: done operations refuse further confirmations', async () => {
    await api('POST', `/api/v1/work-orders/${woId}/operations/${opId}/complete`, tokenA);
    const after = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/confirm`,
      tokenA,
      { quantity: 1, confirmationKey: 'late1' },
    );
    expect(after.status).toBe(409);
  });
});
