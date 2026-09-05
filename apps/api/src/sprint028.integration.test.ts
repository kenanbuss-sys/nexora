import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 028 acceptance tests: RMA lifecycle (OMS-012/COM-011) —
 * returnable-quantity guard, decision flow, idempotent stock re-entry.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 028 — returns (RMA)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s28a', subject: 'idp|s28-admin' });

  let warehouseId = '';
  let skuId = '';
  let orderId = '';
  let orderLineId = '';
  let returnId = '';

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
      `TRUNCATE TABLE "return_order_line", "return_order", "product_category",
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
      slug: 'test-s28a',
      name: 'Sprint28 Tenant',
      initialAdmin: {
        email: 'admin@s28a.example',
        displayName: 'S28 Admin',
        idpSubject: 'idp|s28-admin',
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'RMA28', name: 'R28' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'RMA28-STD',
      name: 'R28 Standard',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH28',
      name: 'Sprint28 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s28',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Dvadesetosam',
      company: 'Dvadesetosam d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId,
      quantity: 6,
      unitPrice: 30,
    });
    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    orderLineId = (confirmed.body.lines as Array<{ id: string }>)[0]!.id;
    await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('OMS-012: a return cannot exceed what was shipped', async () => {
    const tooMuch = await api('POST', '/api/v1/returns', tokenA, {
      orderId,
      reason: 'Oštećeno u transportu',
      lines: [{ orderLineId, quantity: 7 }],
    });
    expect(tooMuch.status).toBe(400);

    const created = await api('POST', '/api/v1/returns', tokenA, {
      orderId,
      reason: 'Oštećeno u transportu',
      lines: [{ orderLineId, quantity: 4 }],
    });
    expect(created.status).toBe(201);
    returnId = created.body.id as string;
    expect(created.body.rmaNumber).toBe('RMA-00001');
    expect(created.body.status).toBe('REQUESTED');

    // A second return can only claim the remainder.
    const overlap = await api('POST', '/api/v1/returns', tokenA, {
      orderId,
      reason: 'Još jedan povrat',
      lines: [{ orderLineId, quantity: 3 }],
    });
    expect(overlap.status).toBe(400);
  });

  it('OMS-012: approval and receipt put goods back into stock exactly once', async () => {
    const before = await onHand(); // 20 - 6 fulfilled = 14
    expect(before).toBe(14);

    const receiveEarly = await api('POST', `/api/v1/returns/${returnId}/receive`, tokenA);
    expect(receiveEarly.status).toBe(409);

    await api('POST', `/api/v1/returns/${returnId}/decide`, tokenA, { approve: true });
    const received = await api('POST', `/api/v1/returns/${returnId}/receive`, tokenA);
    expect(received.status).toBe(201);
    expect(received.body.status).toBe('CLOSED');
    expect(await onHand()).toBe(18);

    // Receiving again cannot double-book stock.
    const again = await api('POST', `/api/v1/returns/${returnId}/receive`, tokenA);
    expect(again.status).toBe(409);
    expect(await onHand()).toBe(18);
  });

  it('OMS-012: rejected returns free the claimed quantity', async () => {
    const second = await api('POST', '/api/v1/returns', tokenA, {
      orderId,
      reason: 'Pogrešna veličina',
      lines: [{ orderLineId, quantity: 2 }],
    });
    expect(second.status).toBe(201);
    await api('POST', `/api/v1/returns/${second.body.id}/decide`, tokenA, {
      approve: false,
      note: 'Van roka',
    });

    // 4 already returned, 2 rejected -> another 2 still returnable.
    const third = await api('POST', '/api/v1/returns', tokenA, {
      orderId,
      reason: 'Naknadni povrat',
      lines: [{ orderLineId, quantity: 2 }],
    });
    expect(third.status).toBe(201);
  });

  it('AUTH: requesting a return needs order.return', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s28a', subject: 'idp|s28-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko28@primjer.example',
      displayName: 'Niko28',
      idpSubject: 'idp|s28-nobody',
    });
    const denied = await api('POST', '/api/v1/returns', stranger, {
      orderId,
      reason: 'x'.repeat(5),
      lines: [{ orderLineId, quantity: 1 }],
    });
    expect(denied.status).toBe(403);
  });
});
