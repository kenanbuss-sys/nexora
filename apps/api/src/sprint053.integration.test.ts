import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 053 acceptance tests: promotions & voucher codes
 * (CPQ-006/COM-012) — creation guardrails, redemption against DRAFT
 * orders with budget/minimum enforcement, per-order idempotency, and
 * order totals that honour the discount.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 053 — promotions', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s53a', subject: 'idp|s53-admin' });

  let warehouseId = '';
  let accountId = '';
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

  async function draftOrder(quantity: number, unitPrice: number): Promise<string> {
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity,
      unitPrice,
    });
    return order.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "serial_number", "bundle_component",
       "promotion_redemption", "promotion",
       "consent_record", "exchange_rate", "sales_team_member", "sales_team",
       "territory", "packaging_level", "sku_substitution", "discount_rule",
       "user_credential",
       "downtime_event", "work_center",
       "stock_count_line", "stock_count",
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
      slug: 'test-s53a',
      name: 'Sprint53 Tenant',
      initialAdmin: {
        email: 'admin@s53a.example',
        displayName: 'S53 Admin',
        idpSubject: 'idp|s53-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH53',
      name: 'Sprint53 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO53', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO53-STD',
      name: 'P53 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Pedesettri',
      company: 'Pedesettri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CPQ-006: creation validates and duplicate codes conflict', async () => {
    const bad = await api('POST', '/api/v1/promotions', tokenA, {
      code: 'X',
      name: 'Too short',
      discountPct: 10,
    });
    expect(bad.status).toBe(400);

    const created = await api('POST', '/api/v1/promotions', tokenA, {
      code: 'ljeto10',
      name: 'Summer 10',
      discountPct: 10,
      minOrderTotal: 100,
      maxRedemptions: 2,
    });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe('LJETO10');

    const dupe = await api('POST', '/api/v1/promotions', tokenA, {
      code: 'LJETO10',
      name: 'Again',
      discountPct: 5,
    });
    expect(dupe.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'cpq.promotion.create' } });
    expect(audit).not.toBeNull();
  });

  it('COM-012: redemption discounts the order total and is idempotent per order', async () => {
    const orderId = await draftOrder(2, 100); // gross 200

    const applied = await api('POST', `/api/v1/orders/${orderId}/apply-promotion`, tokenA, {
      code: 'ljeto10',
    });
    expect(applied.status).toBe(201);
    expect(applied.body.total).toBe('180');

    const again = await api('POST', `/api/v1/orders/${orderId}/apply-promotion`, tokenA, {
      code: 'LJETO10',
    });
    expect(again.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'cpq.promotion.redeem' } });
    expect(audit).not.toBeNull();
  });

  it('CPQ-006: minimum order total is enforced', async () => {
    const smallOrder = await draftOrder(1, 50); // below min 100
    const refused = await api('POST', `/api/v1/orders/${smallOrder}/apply-promotion`, tokenA, {
      code: 'LJETO10',
    });
    expect(refused.status).toBe(400);
  });

  it('CPQ-006: the redemption budget is exhausted after maxRedemptions', async () => {
    // Budget 2: one redemption used already; use the second, third fails.
    const second = await draftOrder(1, 150);
    const ok = await api('POST', `/api/v1/orders/${second}/apply-promotion`, tokenA, {
      code: 'LJETO10',
    });
    expect(ok.status).toBe(201);

    const third = await draftOrder(1, 150);
    const exhausted = await api('POST', `/api/v1/orders/${third}/apply-promotion`, tokenA, {
      code: 'LJETO10',
    });
    expect(exhausted.status).toBe(409);
  });

  it('CPQ-006: deactivated promotions refuse redemption', async () => {
    const promo = await api('POST', '/api/v1/promotions', tokenA, {
      code: 'ZIMA5',
      name: 'Winter 5',
      discountPct: 5,
    });
    await api('PUT', `/api/v1/promotions/${promo.body.id}/active`, tokenA, { active: false });
    const orderId = await draftOrder(1, 80);
    const refused = await api('POST', `/api/v1/orders/${orderId}/apply-promotion`, tokenA, {
      code: 'ZIMA5',
    });
    expect(refused.status).toBe(400);
  });

  it('AUTHZ: managing promotions needs pricing.manage; stranger denied', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s53a', subject: 'idp|s53-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko53@primjer.example',
      displayName: 'Niko53',
      idpSubject: 'idp|s53-nobody',
    });
    const denied = await api('POST', '/api/v1/promotions', stranger, {
      code: 'HAK53',
      name: 'Nope',
      discountPct: 50,
    });
    expect(denied.status).toBe(403);
  });

  it('TENANT: promotions are invisible across tenants', async () => {
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s53b',
      name: 'Sprint53 B',
      initialAdmin: {
        email: 'admin@s53b.example',
        displayName: 'S53B Admin',
        idpSubject: 'idp|s53b-admin',
      },
    });
    const tokenB = identity.signToken({ tenantSlug: 'test-s53b', subject: 'idp|s53b-admin' });
    const list = await api('GET', '/api/v1/promotions', tokenB);
    expect(list.status).toBe(200);
    expect((list.body.promotions as unknown[]).length).toBe(0);
  });
});
