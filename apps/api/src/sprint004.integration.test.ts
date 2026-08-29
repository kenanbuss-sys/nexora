import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { InventoryService } from '@nexora/domain-wms';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 004 acceptance tests (docs/implementation/SPRINT_004_WMS_LEDGER.md):
 * warehouse topology, immutable movement ledger with idempotent posting,
 * derived stock projections, and concurrency proof that the reservation
 * policy cannot oversell. Real PostgreSQL (INTEGRATION=1).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 004 — WMS inventory ledger', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s4a', subject: 'idp|s4-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s4b', subject: 'idp|s4b-admin' });

  let tenantAId = '';
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
      `TRUNCATE TABLE "stock_reservation", "stock_movement", "warehouse_location", "warehouse",
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

    const a = await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s4a',
      name: 'Sprint4 Tenant A',
      initialAdmin: {
        email: 'admin@s4a.example',
        displayName: 'S4 Admin',
        idpSubject: 'idp|s4-admin',
      },
    });
    tenantAId = (a.body.tenant as { id: string }).id;
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s4b',
      name: 'Sprint4 Tenant B',
      initialAdmin: {
        email: 'admin@s4b.example',
        displayName: 'S4B Admin',
        idpSubject: 'idp|s4b-admin',
      },
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'WIDGET-01',
      name: 'Widget',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'WIDGET-01-STD',
      name: 'Widget Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH1',
      name: 'Main warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/warehouses/locations', tokenA, {
      warehouseId,
      code: 'A-01-01',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('LEDGER: receipts and issues derive the stock position; no editable stock field', async () => {
    const receipt = await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-0001-widget',
    });
    expect(receipt.status).toBe(201);
    expect(receipt.body.duplicate).toBe(false);

    const issue = await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'ISSUE',
      quantity: 3,
      idempotencyKey: 'issue-0001-widget',
    });
    expect(issue.status).toBe(201);

    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(position.body.onHand).toBe('7');
    expect(position.body.available).toBe('7');

    const events = await prisma.outboxEvent.count({
      where: { tenantId: tenantAId, eventType: 'stock.moved' },
    });
    expect(events).toBe(2);
  });

  it('IDEMPOTENCY: a duplicate receipt produces exactly one stock effect', async () => {
    const duplicate = await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-0001-widget',
    });
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.duplicate).toBe(true);

    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(position.body.onHand).toBe('7');
    const count = await prisma.stockMovement.count({
      where: { tenantId: tenantAId, idempotencyKey: 'receipt-0001-widget' },
    });
    expect(count).toBe(1);
  });

  it('LEDGER: outbound movement cannot drive on-hand negative', async () => {
    const tooMuch = await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'ISSUE',
      quantity: 100,
      idempotencyKey: 'issue-toolarge-01',
    });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.code).toBe('INVALID_STATE');
  });

  it('RESERVATIONS: atomic policy, release restores availability', async () => {
    const reserve = await api('POST', '/api/v1/stock/reservations', tokenA, {
      warehouseId,
      skuId,
      quantity: 5,
      reference: 'order-demo-1',
    });
    expect(reserve.status).toBe(201);

    const position = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(position.body.onHand).toBe('7');
    expect(position.body.reserved).toBe('5');
    expect(position.body.available).toBe('2');

    const overshoot = await api('POST', '/api/v1/stock/reservations', tokenA, {
      warehouseId,
      skuId,
      quantity: 3,
    });
    expect(overshoot.status).toBe(409);

    await api('POST', '/api/v1/stock/reservations/release', tokenA, {
      reservationId: reserve.body.reservationId,
    });
    const after = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(after.body.available).toBe('7');
  });

  it('CONCURRENCY: parallel reservations can never oversell', async () => {
    // Fresh SKU with exactly 10 on hand.
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'GADGET-01',
      name: 'Gadget',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'GADGET-01-STD',
      name: 'Gadget Standard',
      baseUom: 'pcs',
    });
    const gadgetId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${gadgetId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: gadgetId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-gadget-0001',
    });

    // 25 concurrent unit reservations against 10 available, via the service
    // (same code path as the API), sharing one connection pool.
    const inventory = new InventoryService(prisma, {
      getSkuState: async () => ({ exists: true, active: true }),
    });
    const ctx = {
      tenantId: tenantAId,
      tenantSlug: 'test-s4a',
      tenantStatus: 'ACTIVE' as const,
      actorType: 'SERVICE' as const,
      userId: undefined,
      userStatus: undefined,
      platformAdmin: false,
    };
    const attempts = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        inventory.reserveStock({ warehouseId, skuId: gadgetId, quantity: 1 }, ctx),
      ),
    );
    const succeeded = attempts.filter((a) => a.status === 'fulfilled').length;
    const failed = attempts.filter((a) => a.status === 'rejected').length;
    expect(succeeded).toBe(10);
    expect(failed).toBe(15);

    const active = await prisma.stockReservation.count({
      where: { tenantId: tenantAId, skuId: gadgetId, status: 'ACTIVE' },
    });
    expect(active).toBe(10);

    const position = await inventory.getStockPosition(warehouseId, gadgetId, ctx);
    expect(position.available).toBe('0');
    expect(Number(position.available)).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('ISOLATION: warehouses, stock and reservations are invisible across tenants', async () => {
    const foreignPosition = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenB,
    );
    expect(foreignPosition.status).toBe(404);
    const foreignMove = await api('POST', '/api/v1/stock/movements', tokenB, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 1,
      idempotencyKey: 'cross-tenant-attempt-1',
    });
    expect([403, 404]).toContain(foreignMove.status);
  });
});
