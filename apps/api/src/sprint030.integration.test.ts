import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 030 acceptance tests: stock counting (WMS-015) with governed,
 * idempotent variance adjustments and segregation of duties (WMS-016).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 030 — stock counting', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s30a', subject: 'idp|s30-admin' });
  const counterToken = identity.signToken({ tenantSlug: 'test-s30a', subject: 'idp|s30-counter' });

  let warehouseId = '';
  let skuId = '';
  let countId = '';

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

  async function onHand(): Promise<number> {
    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    return Number(position.body.onHand);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "stock_count_line", "stock_count",
       "return_order_line", "return_order", "product_category",
       "security_event", "api_key",
       "webhook_delivery", "webhook_subscription",
       "budget", "cost_center",
       "comment", "attachment_blob", "attachment", "number_sequence",
       "portal_user", "payment", "invoice",
       "qc_inspection_item", "qc_inspection", "qc_plan_item", "qc_plan", "ncr",
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
      slug: 'test-s30a',
      name: 'Sprint30 Tenant',
      initialAdmin: {
        email: 'admin@s30a.example',
        displayName: 'S30 Admin',
        idpSubject: 'idp|s30-admin',
      },
    });

    // A second user who counts (SoD partner for the admin who posts).
    const counter = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'popisivac@primjer.example',
      displayName: 'Popisivač',
      idpSubject: 'idp|s30-counter',
    });
    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'counter',
      permissions: ['inventory.count', 'inventory.read'],
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: counter.body.id,
      roleId: role.body.id,
    });

    const product = await api('POST', '/api/v1/products', tokenA, { code: 'CNT30', name: 'C30' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'CNT30-STD',
      name: 'C30 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH30',
      name: 'Sprint30 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 40,
      idempotencyKey: 'receipt-s30',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WMS-015: a count snapshots expected stock and records variances', async () => {
    const created = await api('POST', '/api/v1/stock/counts', counterToken, { warehouseId });
    expect(created.status).toBe(201);
    countId = created.body.id as string;
    expect(created.body.countNumber).toBe('CNT-00001');

    // Physically counted 37 against an expected 40.
    const recorded = await api('POST', `/api/v1/stock/counts/${countId}/lines`, counterToken, {
      skuId,
      countedQty: 37,
    });
    expect(recorded.status).toBe(201);
    const line = (recorded.body.lines as Array<Record<string, string>>)[0]!;
    expect(line.expectedQty).toBe('40');
    expect(line.variance).toBe('-3');
  });

  it('WMS-016: the creator cannot post their own count (SoD)', async () => {
    const sod = await api('POST', `/api/v1/stock/counts/${countId}/post`, counterToken);
    // The counter also lacks inventory.adjust.approve → 403 before SoD.
    expect(sod.status).toBe(403);

    // Give the counter approve rights: SoD still refuses them.
    const approveRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'approver',
      permissions: ['inventory.adjust.approve'],
    });
    const users = await api('GET', '/api/v1/users', tokenA);
    const counter = (users.body.users as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'popisivac@primjer.example',
    )!;
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: counter.id,
      roleId: approveRole.body.id,
    });
    const sodAgain = await api('POST', `/api/v1/stock/counts/${countId}/post`, counterToken);
    expect(sodAgain.status).toBe(409);
    expect(String(sodAgain.body.message)).toContain('Segregation');
  });

  it('WMS-016: posting adjusts the ledger exactly once', async () => {
    expect(await onHand()).toBe(40);
    const posted = await api('POST', `/api/v1/stock/counts/${countId}/post`, tokenA);
    expect(posted.status).toBe(201);
    expect(posted.body.status).toBe('POSTED');
    expect(await onHand()).toBe(37);

    // Re-posting is refused; stock stays.
    const again = await api('POST', `/api/v1/stock/counts/${countId}/post`, tokenA);
    expect(again.status).toBe(409);
    expect(await onHand()).toBe(37);

    const adjustment = await prisma.stockMovement.findFirst({
      where: { movementType: 'ADJUSTMENT_OUT', idempotencyKey: { startsWith: `count:${countId}` } },
    });
    expect(Number(adjustment?.quantity)).toBe(3);
  });

  it('WMS-015: zero-variance lines post without ledger noise', async () => {
    const count = await api('POST', '/api/v1/stock/counts', counterToken, { warehouseId });
    await api('POST', `/api/v1/stock/counts/${count.body.id}/lines`, counterToken, {
      skuId,
      countedQty: 37,
    });
    const before = await prisma.stockMovement.count();
    const posted = await api('POST', `/api/v1/stock/counts/${count.body.id}/post`, tokenA);
    expect(posted.status).toBe(201);
    expect(await prisma.stockMovement.count()).toBe(before);
  });
});
