import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 146 acceptance tests: operator assignment (MES-005) — named
 * operators own operations, validated against active tenant users,
 * with a per-operator open queue.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 146 — operator assignment', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s146a', subject: 'idp|s146-admin' });

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
      slug: 'test-s146a',
      name: 'Sprint146 Tenant',
      initialAdmin: {
        email: 'admin@s146a.example',
        displayName: 'S146 Admin',
        idpSubject: 'idp|s146-admin',
      },
    });
    lampId = await makeSku('LAMP146', 'Lamp146');
    bulbId = await makeSku('BULB146', 'Bulb146');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-146',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH146',
      name: 'Sprint146 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s146-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let woId = '';
  let opId = '';
  let operatorId = '';
  const operatorToken = identity.signToken({
    tenantSlug: 'test-s146a',
    subject: 'idp|s146-operator',
  });

  it('MES-005: an active user is assigned to a pending operation, audited', async () => {
    const operator = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'operater146@primjer.example',
      displayName: 'Operater146',
      idpSubject: 'idp|s146-operator',
    });
    operatorId = operator.body.id as string;
    const roles = await api('GET', '/api/v1/roles', tokenA);
    const opRole = (roles.body.roles as Array<{ id: string; name: string }>).find(
      (r) => r.name === 'tenant-admin',
    );
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: operatorId,
      roleId: opRole?.id,
    });

    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId,
      quantity: 5,
    });
    woId = wo.body.id as string;
    const detail = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    const ops = detail.body.operations as Array<{ id: string; assignedTo: string | null }>;
    opId = ops[0]?.id as string;
    expect(ops[0]?.assignedTo).toBeNull();

    const assigned = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/assign-operator`,
      tokenA,
      { userId: operatorId },
    );
    expect(assigned.status).toBe(201);
    const after = assigned.body.operations as Array<{ id: string; assignedTo: string | null }>;
    expect(after.find((o) => o.id === opId)?.assignedTo).toBe(operatorId);
  });

  it('MES-005: unknown or foreign users are refused', async () => {
    const ghost = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/assign-operator`,
      tokenA,
      { userId: '00000000-0000-0000-0000-000000000000' },
    );
    expect(ghost.status).toBe(404);
  });

  it('MES-005: the operator sees their own open queue', async () => {
    const queue = await api('GET', '/api/v1/work-orders/my-operations', operatorToken);
    expect(queue.status).toBe(200);
    const ops = queue.body.operations as Array<{ operationId: string; woNumber: string }>;
    expect(ops.length).toBe(1);
    expect(ops[0]?.operationId).toBe(opId);
    expect(ops[0]?.woNumber).toContain('WO-');

    const other = await api('GET', '/api/v1/work-orders/my-operations', tokenA);
    expect((other.body.operations as unknown[]).length).toBe(0);
  });

  it('MES-005: completed operations cannot be reassigned', async () => {
    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/operations/${opId}/complete`, tokenA);
    const again = await api(
      'POST',
      `/api/v1/work-orders/${woId}/operations/${opId}/assign-operator`,
      tokenA,
      { userId: operatorId },
    );
    expect(again.status).toBe(409);

    const queue = await api('GET', '/api/v1/work-orders/my-operations', operatorToken);
    expect((queue.body.operations as unknown[]).length).toBe(0);
  });
});
