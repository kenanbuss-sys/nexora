import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 040 acceptance tests: SKU substitutions (PIM) — governed
 * directed edges, live availability through the WMS interface, and
 * inactive substitutes filtered out of alternatives.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 040 — SKU substitutions', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s40a', subject: 'idp|s40-admin' });

  let primary = '';
  let altGood = '';
  let altInactive = '';
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

  async function makeSku(code: string, activate: boolean): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom: 'pcs',
    });
    if (activate) await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "sku_substitution", "discount_rule", "user_credential",
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
      slug: 'test-s40a',
      name: 'Sprint40 Tenant',
      initialAdmin: {
        email: 'admin@s40a.example',
        displayName: 'S40 Admin',
        idpSubject: 'idp|s40-admin',
      },
    });

    primary = await makeSku('SUB40', true);
    altGood = await makeSku('SUB40B', true);
    altInactive = await makeSku('SUB40C', false);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH40',
      name: 'W40',
    });
    warehouseId = warehouse.body.id as string;
    // 30 on hand for the good substitute, 10 of it reserved.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: altGood,
      movementType: 'RECEIPT',
      quantity: 30,
      idempotencyKey: 'receipt-s40b',
    });
    await api('POST', '/api/v1/stock/reservations', tokenA, {
      warehouseId,
      skuId: altGood,
      quantity: 10,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM: substitutions are governed, validated and audited', async () => {
    const self = await api('POST', `/api/v1/skus/${primary}/substitutions`, tokenA, {
      substituteSkuId: primary,
    });
    expect(self.status).toBe(400);

    const good = await api('POST', `/api/v1/skus/${primary}/substitutions`, tokenA, {
      substituteSkuId: altGood,
      priority: 1,
    });
    expect(good.status).toBe(201);
    expect(good.body.substituteCode).toBe('SUB40B-STD');

    const duplicate = await api('POST', `/api/v1/skus/${primary}/substitutions`, tokenA, {
      substituteSkuId: altGood,
    });
    expect(duplicate.status).toBe(409);

    await api('POST', `/api/v1/skus/${primary}/substitutions`, tokenA, {
      substituteSkuId: altInactive,
      priority: 2,
    });

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'pim.substitution.add' } });
    expect(audit).not.toBeNull();
  });

  it('PIM: alternatives carry live availability and skip inactive SKUs', async () => {
    const listed = await api('GET', `/api/v1/skus/${primary}/substitutions`, tokenA);
    expect((listed.body.substitutions as unknown[]).length).toBe(2);

    const alternatives = await api('GET', `/api/v1/skus/${primary}/alternatives`, tokenA);
    const rows = alternatives.body.alternatives as Array<{
      substituteCode: string;
      onHand: string;
      available: string;
    }>;
    // The inactive substitute is filtered out.
    expect(rows.length).toBe(1);
    expect(rows[0]!.substituteCode).toBe('SUB40B-STD');
    expect(Number(rows[0]!.onHand)).toBe(30);
    expect(Number(rows[0]!.available)).toBe(20);
  });

  it('PIM: removal is audited and definitive', async () => {
    const listed = await api('GET', `/api/v1/skus/${primary}/substitutions`, tokenA);
    const rows = listed.body.substitutions as Array<{ id: string; substituteCode: string }>;
    const inactiveRow = rows.find((r) => r.substituteCode === 'SUB40C-STD')!;
    const removed = await api(
      'POST',
      `/api/v1/skus/${primary}/substitutions/${inactiveRow.id}/remove`,
      tokenA,
    );
    expect(removed.status).toBe(201);
    const after = await api('GET', `/api/v1/skus/${primary}/substitutions`, tokenA);
    expect((after.body.substitutions as unknown[]).length).toBe(1);
  });

  it('AUTHZ: managing substitutions needs product.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s40a', subject: 'idp|s40-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko40@primjer.example',
      displayName: 'Niko40',
      idpSubject: 'idp|s40-nobody',
    });
    const denied = await api('POST', `/api/v1/skus/${primary}/substitutions`, stranger, {
      substituteSkuId: altGood,
    });
    expect(denied.status).toBe(403);
  });
});
