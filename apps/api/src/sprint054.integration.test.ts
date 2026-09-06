import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 054 acceptance tests: bundles/kits (PIM-015) — single-level
 * composition with live buildable quantity from the stock ledger,
 * nesting guards, and audited mutations.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 054 — bundles', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s54a', subject: 'idp|s54-admin' });

  let warehouseId = '';
  let bundleId = '';
  let boltId = '';
  let plateId = '';

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

  async function makeSku(code: string, receipt: number): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    if (receipt > 0) {
      await api('POST', '/api/v1/stock/movements', tokenA, {
        warehouseId,
        skuId: sku.body.id,
        movementType: 'RECEIPT',
        quantity: receipt,
        idempotencyKey: `receipt-${code}`,
      });
    }
    return sku.body.id as string;
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
      slug: 'test-s54a',
      name: 'Sprint54 Tenant',
      initialAdmin: {
        email: 'admin@s54a.example',
        displayName: 'S54 Admin',
        idpSubject: 'idp|s54-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH54',
      name: 'Sprint54 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    bundleId = await makeSku('KIT54', 0);
    boltId = await makeSku('BOLT54', 10);
    plateId = await makeSku('PLATE54', 4);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM-015: composition builds and buildable derives from the ledger', async () => {
    const first = await api('POST', `/api/v1/skus/${bundleId}/bundle`, tokenA, {
      componentSkuId: boltId,
      quantity: 4,
    });
    expect(first.status).toBe(201);
    await api('POST', `/api/v1/skus/${bundleId}/bundle`, tokenA, {
      componentSkuId: plateId,
      quantity: 1,
    });

    const view = await api('GET', `/api/v1/skus/${bundleId}/bundle`, tokenA);
    expect(view.status).toBe(200);
    expect((view.body.components as unknown[]).length).toBe(2);
    // bolts: floor(10/4)=2, plates: floor(4/1)=4 -> buildable 2
    expect(view.body.buildable).toBe(2);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'pim.bundle.set_component' },
    });
    expect(audit).not.toBeNull();
  });

  it('PIM-015: guards — no self, no nesting, no inactive components', async () => {
    const self = await api('POST', `/api/v1/skus/${bundleId}/bundle`, tokenA, {
      componentSkuId: bundleId,
      quantity: 1,
    });
    expect(self.status).toBe(400);

    // A component of a bundle cannot become a bundle itself…
    const nested = await api('POST', `/api/v1/skus/${boltId}/bundle`, tokenA, {
      componentSkuId: plateId,
      quantity: 1,
    });
    expect(nested.status).toBe(409);

    // …and a bundle cannot be used as someone's component.
    const other = await makeSku('OTHER54', 0);
    const bundleAsComponent = await api('POST', `/api/v1/skus/${other}/bundle`, tokenA, {
      componentSkuId: bundleId,
      quantity: 1,
    });
    expect(bundleAsComponent.status).toBe(409);
  });

  it('PIM-015: removing a component recalculates buildable', async () => {
    const view = await api('GET', `/api/v1/skus/${bundleId}/bundle`, tokenA);
    const bolt = (view.body.components as Array<{ id: string; componentCode: string }>).find(
      (c) => c.componentCode === 'BOLT54-STD',
    );
    expect(bolt).toBeDefined();
    const removed = await api(
      'POST',
      `/api/v1/skus/${bundleId}/bundle/${bolt?.id ?? ''}/remove`,
      tokenA,
    );
    expect(removed.status).toBe(201);
    const after = await api('GET', `/api/v1/skus/${bundleId}/bundle`, tokenA);
    expect(after.body.buildable).toBe(4); // only plates remain: floor(4/1)
  });

  it('AUTHZ: composing bundles needs product.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s54a', subject: 'idp|s54-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko54@primjer.example',
      displayName: 'Niko54',
      idpSubject: 'idp|s54-nobody',
    });
    const denied = await api('POST', `/api/v1/skus/${bundleId}/bundle`, stranger, {
      componentSkuId: plateId,
      quantity: 1,
    });
    expect(denied.status).toBe(403);
  });
});
