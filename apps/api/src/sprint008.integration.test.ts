import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 008 acceptance tests (docs/implementation/SPRINT_008_PROCUREMENT.md):
 * supplier master through MDM, requisitions with threshold approvals,
 * PO conversion (exactly once), idempotent goods receipt into the stock
 * ledger, and purchase price history.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 008 — Procurement', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s8a', subject: 'idp|s8-admin' });
  const approverToken = identity.signToken({ tenantSlug: 'test-s8a', subject: 'idp|s8-approver' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s8b', subject: 'idp|s8b-admin' });

  let skuId = '';
  let warehouseId = '';
  let supplierId = '';

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

  async function position(): Promise<{ onHand: number }> {
    const r = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    return { onHand: Number(r.body.onHand) };
  }

  async function approvedRequisition(qty: number, price: number): Promise<string> {
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: qty,
      estUnitPrice: price,
    });
    const submitted = await api(
      'POST',
      `/api/v1/requisitions/${requisition.body.id}/submit`,
      tokenA,
    );
    expect(submitted.body.status).toBe('APPROVED');
    return requisition.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "purchase_order_line", "purchase_order",
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
      slug: 'test-s8a',
      name: 'Sprint8 Tenant A',
      initialAdmin: {
        email: 'admin@s8a.example',
        displayName: 'S8 Admin',
        idpSubject: 'idp|s8-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s8b',
      name: 'Sprint8 Tenant B',
      initialAdmin: {
        email: 'admin@s8b.example',
        displayName: 'S8B Admin',
        idpSubject: 'idp|s8b-admin',
      },
    });

    // A second user who can approve purchases (SoD: requester != approver).
    const approver = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'approver@s8a.example',
      displayName: 'S8 Approver',
      idpSubject: 'idp|s8-approver',
    });
    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'purchase-approver',
      permissions: ['approval.act', 'purchase.read'],
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: approver.body.id,
      roleId: role.body.id,
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'RAW-01',
      name: 'Raw Material',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'RAW-01-STD',
      name: 'Raw Material Standard',
      baseUom: 'kg',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH8',
      name: 'Sprint8 warehouse',
    });
    warehouseId = warehouse.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PROC: supplier is created through the MDM party domain', async () => {
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, {
      name: 'Dobavljac d.o.o.',
      leadTimeDays: 7,
    });
    expect(supplier.status).toBe(201);
    expect(supplier.body.supplierNumber).toMatch(/^SUP-/);
    supplierId = supplier.body.id as string;

    // The party exists in MDM (created via the owning domain's interface).
    const parties = await api('GET', '/api/v1/parties?q=dobavljac', tokenA);
    expect((parties.body.parties as unknown[]).length).toBe(1);
  });

  it('PROC: small requisitions auto-approve; large ones need a WF approval', async () => {
    // Small: 10 × 50 = 500 <= 1000 threshold.
    const small = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${small.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
      estUnitPrice: 50,
    });
    const smallSubmitted = await api(
      'POST',
      `/api/v1/requisitions/${small.body.id}/submit`,
      tokenA,
    );
    expect(smallSubmitted.body.status).toBe('APPROVED');

    // Large: 100 × 50 = 5000 > 1000 → PENDING_APPROVAL.
    const large = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${large.body.id}/lines`, tokenA, {
      skuId,
      quantity: 100,
      estUnitPrice: 50,
    });
    const largeSubmitted = await api(
      'POST',
      `/api/v1/requisitions/${large.body.id}/submit`,
      tokenA,
    );
    expect(largeSubmitted.body.status).toBe('PENDING_APPROVAL');
    const approvalId = largeSubmitted.body.approvalId as string;
    expect(approvalId).toBeTruthy();

    // The approver (not the requester) grants it.
    const granted = await api('POST', `/api/v1/approvals/${approvalId}/approve`, approverToken, {});
    expect(granted.status).toBe(201);

    const synced = await api('POST', `/api/v1/requisitions/${large.body.id}/sync-approval`, tokenA);
    expect(synced.body.status).toBe('APPROVED');
  });

  it('PROC: an approved requisition converts to a PO exactly once', async () => {
    const requisitionId = await approvedRequisition(10, 20);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId,
      supplierId,
      warehouseId,
    });
    expect(po.status).toBe(201);
    expect(po.body.poNumber).toMatch(/^PO-/);
    expect((po.body.lines as unknown[]).length).toBe(1);

    // Second conversion refused: requisition is CONVERTED now.
    const again = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId,
      supplierId,
      warehouseId,
    });
    expect(again.status).toBe(409);
  });

  it('PROC: receiving posts idempotent ledger receipts and tracks quantities', async () => {
    const requisitionId = await approvedRequisition(30, 10);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId,
      supplierId,
      warehouseId,
    });
    const poId = po.body.id as string;
    const lineId = (po.body.lines as Array<{ id: string }>)[0]?.id as string;

    const before = await position();

    // Partial receipt: 12 of 30.
    const first = await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'r-0001',
      lines: [{ lineId, quantity: 12 }],
    });
    expect(first.body.status).toBe('PARTIALLY_RECEIVED');

    // Same receiptKey retried: no double stock, no double received qty.
    const retry = await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'r-0001',
      lines: [{ lineId, quantity: 12 }],
    });
    expect(retry.status).toBe(201);
    const retryLine = (retry.body.lines as Array<{ receivedQty: string }>)[0];
    expect(Number(retryLine?.receivedQty)).toBe(12);

    const mid = await position();
    expect(mid.onHand).toBe(before.onHand + 12);

    // Final receipt completes the PO.
    const second = await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'r-0002',
      lines: [{ lineId, quantity: 18 }],
    });
    expect(second.body.status).toBe('RECEIVED');

    const after = await position();
    expect(after.onHand).toBe(before.onHand + 30);

    // A fully received PO refuses more receipts.
    const overflow = await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'r-0003',
      lines: [{ lineId, quantity: 1 }],
    });
    expect(overflow.status).toBe(409);
  });

  it('PROC: purchase price history derives from PO lines', async () => {
    const history = await api(
      'GET',
      `/api/v1/purchase-orders/price-history?skuId=${skuId}`,
      tokenA,
    );
    expect(history.status).toBe(200);
    const entries = history.body.history as Array<{ unitPrice: string; poNumber: string }>;
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((e) => e.poNumber.startsWith('PO-'))).toBe(true);
  });

  it('TENANCY: procurement records are invisible across tenants', async () => {
    const suppliers = await api('GET', '/api/v1/suppliers', tokenB);
    expect((suppliers.body.suppliers as unknown[]).length).toBe(0);
    const requisitions = await api('GET', '/api/v1/requisitions', tokenB);
    expect((requisitions.body.requisitions as unknown[]).length).toBe(0);

    const pos = await api('GET', '/api/v1/purchase-orders', tokenA);
    const first = (pos.body.purchaseOrders as Array<{ id: string }>)[0];
    const foreign = await api('GET', `/api/v1/purchase-orders/${first?.id}`, tokenB);
    expect(foreign.status).toBe(404);
  });
});
