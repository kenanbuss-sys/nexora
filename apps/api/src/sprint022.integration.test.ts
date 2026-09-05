import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 022 acceptance tests: lot policy on SKUs (PIM-010/012), the
 * lot dimension on the stock ledger (WMS-017) and FEFO issuing with
 * expiry control (WMS-019).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 022 — lot control & FEFO', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s22a', subject: 'idp|s22-admin' });

  let warehouseId = '';
  let skuId = '';

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
      `TRUNCATE TABLE "security_event", "api_key",
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
      slug: 'test-s22a',
      name: 'Sprint22 Tenant',
      initialAdmin: {
        email: 'admin@s22a.example',
        displayName: 'S22 Admin',
        idpSubject: 'idp|s22-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH22',
      name: 'Sprint22 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'LOT22', name: 'L22' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'LOT22-STD',
      name: 'L22 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', `/api/v1/skus/${skuId}/lot-policy`, tokenA, {
      lotTracked: true,
      shelfLifeDays: 180,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function move(payload: Record<string, unknown>) {
    return api('POST', '/api/v1/stock/movements', tokenA, payload);
  }

  it('PIM-010/012: receipts demand a lot; shelf life derives expiry', async () => {
    const missingLot = await move({
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'r22-nolot',
    });
    expect(missingLot.status).toBe(400);

    const withLot = await move({
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'r22-lot-a',
      lotNumber: 'LOT-A',
    });
    expect(withLot.status).toBe(201);

    const movement = await prisma.stockMovement.findFirst({
      where: { lotNumber: 'LOT-A', movementType: 'RECEIPT' },
    });
    expect(movement?.expiresAt).not.toBeNull();
    const days = (movement!.expiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(175);
    expect(days).toBeLessThan(185);
  });

  it('WMS-017: lot balances derive from the ledger', async () => {
    // A second lot with a NEARER explicit expiry (30 days).
    await move({
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 6,
      idempotencyKey: 'r22-lot-b',
      lotNumber: 'LOT-B',
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    const lots = await api(
      'GET',
      `/api/v1/stock/lots?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    const rows = lots.body.lots as Array<{
      lotNumber: string;
      onHand: string;
      expiringSoon: boolean;
    }>;
    expect(rows.length).toBe(2);
    // FEFO ordering: LOT-B (30 days) sorts before LOT-A (180 days).
    expect(rows[0]?.lotNumber).toBe('LOT-B');
    expect(rows[0]?.onHand).toBe('6');
    expect(rows[0]?.expiringSoon).toBe(true);
    expect(rows[1]?.lotNumber).toBe('LOT-A');
    expect(rows[1]?.onHand).toBe('10');
  });

  it('WMS-019: FEFO issue consumes the earliest expiry and splits lots', async () => {
    // 8 pieces: 6 from LOT-B (expires first), 2 from LOT-A.
    const issued = await move({
      warehouseId,
      skuId,
      movementType: 'ISSUE',
      quantity: 8,
      idempotencyKey: 'i22-fefo-1',
    });
    expect(issued.status).toBe(201);

    const lots = await api(
      'GET',
      `/api/v1/stock/lots?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    const byLot = Object.fromEntries(
      (lots.body.lots as Array<{ lotNumber: string; onHand: string }>).map((l) => [
        l.lotNumber,
        l.onHand,
      ]),
    );
    expect(byLot['LOT-B']).toBe('0');
    expect(byLot['LOT-A']).toBe('8');

    const parts = await prisma.stockMovement.findMany({
      where: { movementType: 'ISSUE', idempotencyKey: { startsWith: 'i22-fefo-1' } },
    });
    expect(parts.length).toBe(2);
  });

  it('WMS-019: explicit lot issues respect balance and expiry', async () => {
    const overdraw = await move({
      warehouseId,
      skuId,
      movementType: 'ISSUE',
      quantity: 100,
      idempotencyKey: 'i22-over',
      lotNumber: 'LOT-A',
    });
    expect(overdraw.status).toBe(409);

    // An expired lot: receipt in the past, then only a write-off may move it.
    await move({
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 3,
      idempotencyKey: 'r22-lot-x',
      lotNumber: 'LOT-X',
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    await prisma.stockMovement.updateMany({
      where: { lotNumber: 'LOT-X' },
      data: { expiresAt: new Date(Date.now() - 86_400_000) },
    });
    const expiredIssue = await move({
      warehouseId,
      skuId,
      movementType: 'ISSUE',
      quantity: 1,
      idempotencyKey: 'i22-expired',
      lotNumber: 'LOT-X',
    });
    expect(expiredIssue.status).toBe(409);
    expect(String(expiredIssue.body.message)).toContain('expired');

    const writeOff = await move({
      warehouseId,
      skuId,
      movementType: 'ADJUSTMENT_OUT',
      quantity: 3,
      idempotencyKey: 'a22-writeoff',
      lotNumber: 'LOT-X',
    });
    expect(writeOff.status).toBe(201);
  });

  it('WMS: FEFO retry with the same idempotency key is a no-op', async () => {
    const before = await prisma.stockMovement.count({ where: { movementType: 'ISSUE' } });
    const retry = await move({
      warehouseId,
      skuId,
      movementType: 'ISSUE',
      quantity: 8,
      idempotencyKey: 'i22-fefo-1',
    });
    expect(retry.status).toBe(201);
    expect(retry.body.duplicate).toBe(true);
    const after = await prisma.stockMovement.count({ where: { movementType: 'ISSUE' } });
    expect(after).toBe(before);
  });
});
