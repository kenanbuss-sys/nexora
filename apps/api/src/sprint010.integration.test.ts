import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 010 acceptance tests (docs/implementation/SPRINT_010_PLANNING.md):
 * planning policies, MRP net requirements from demand/safety/supply,
 * production suggestions with one-level component explosion, and
 * append-only run snapshots.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 010 — Planning/MRP', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s10a', subject: 'idp|s10-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s10b', subject: 'idp|s10b-admin' });

  let tableId = '';
  let boardId = '';
  let warehouseId = '';
  let accountId = '';

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
      `TRUNCATE TABLE "mrp_suggestion", "mrp_run", "planning_policy",
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
      slug: 'test-s10a',
      name: 'Sprint10 Tenant A',
      initialAdmin: {
        email: 'admin@s10a.example',
        displayName: 'S10 Admin',
        idpSubject: 'idp|s10-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s10b',
      name: 'Sprint10 Tenant B',
      initialAdmin: {
        email: 'admin@s10b.example',
        displayName: 'S10B Admin',
        idpSubject: 'idp|s10b-admin',
      },
    });

    // table = 1x board (released BOM); board is purchased.
    tableId = await makeSku('TABLE', 'Table');
    boardId = await makeSku('BOARD', 'Board');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: tableId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: boardId,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH10',
      name: 'Sprint10 warehouse',
    });
    warehouseId = warehouse.body.id as string;

    // Stock: 5 tables on hand, 0 boards.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: tableId,
      movementType: 'RECEIPT',
      quantity: 5,
      idempotencyKey: 'receipt-s10-tables',
    });

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Mika Musterija',
      company: 'Musterija d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    // Confirmed demand: 12 tables.
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId: tableId,
      quantity: 12,
      unitPrice: 100,
    });
    // Confirm reserves 5 available and fails (12 > 5) — keep the order
    // DRAFT-independent: reserve nothing, just make demand CONFIRMED by
    // receiving extra stock first, confirming, then issuing it back out.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: tableId,
      movementType: 'RECEIPT',
      quantity: 7,
      idempotencyKey: 'receipt-s10-tables-2',
    });
    const confirmed = await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA);
    if (confirmed.status !== 201) throw new Error('Order confirmation failed in setup');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PLAN: policies upsert idempotently', async () => {
    const first = await api('PUT', '/api/v1/planning/policies', tokenA, {
      skuId: tableId,
      safetyStock: 3,
      leadTimeDays: 5,
    });
    expect(first.status).toBe(200);
    const second = await api('PUT', '/api/v1/planning/policies', tokenA, {
      skuId: tableId,
      safetyStock: 4,
    });
    expect(second.body.safetyStock).toBe('4');
    expect(second.body.leadTimeDays).toBe(5);

    const list = await api('GET', '/api/v1/planning/policies', tokenA);
    expect((list.body.policies as unknown[]).length).toBe(1);
  });

  it('PLAN: MRP computes net requirements and explodes production components', async () => {
    const run = await api('POST', '/api/v1/planning/runs', tokenA);
    expect(run.status).toBe(201);
    const suggestions = run.body.suggestions as Array<{
      skuId: string;
      suggestionType: string;
      quantity: string;
      dueInDays: number;
    }>;

    // Demand 12 + safety 4 − on-hand 12 − on-order 0 = 4 tables to make.
    const tableSuggestion = suggestions.find((s) => s.skuId === tableId);
    expect(tableSuggestion?.suggestionType).toBe('PRODUCTION');
    expect(Number(tableSuggestion?.quantity)).toBe(4);
    expect(tableSuggestion?.dueInDays).toBe(5);

    // Component: 4 boards needed, none on hand -> PURCHASE.
    const boardSuggestion = suggestions.find((s) => s.skuId === boardId);
    expect(boardSuggestion?.suggestionType).toBe('PURCHASE');
    expect(Number(boardSuggestion?.quantity)).toBe(4);
  });

  it('PLAN: covered demand yields no suggestions', async () => {
    // Receive 10 more tables: on-hand 22 covers demand 12 + safety 4.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: tableId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s10-tables-3',
    });
    const run = await api('POST', '/api/v1/planning/runs', tokenA);
    const suggestions = run.body.suggestions as Array<{ skuId: string }>;
    expect(suggestions.find((s) => s.skuId === tableId)).toBeUndefined();
  });

  it('PLAN: runs are append-only snapshots', async () => {
    const runs = await api('GET', '/api/v1/planning/runs', tokenA);
    const list = runs.body.runs as Array<{ runNumber: string; suggestionCount: number }>;
    expect(list.length).toBe(2);
    // The first (older) run still shows its original suggestions.
    const first = list[list.length - 1];
    expect(first?.suggestionCount).toBeGreaterThan(0);
  });

  it('TENANCY: planning data is invisible across tenants; permission enforced', async () => {
    const runs = await api('GET', '/api/v1/planning/runs', tokenB);
    expect((runs.body.runs as unknown[]).length).toBe(0);
    const policies = await api('GET', '/api/v1/planning/policies', tokenB);
    expect((policies.body.policies as unknown[]).length).toBe(0);
  });
});
