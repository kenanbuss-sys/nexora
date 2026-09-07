import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 084 acceptance tests: kitting/assembly (WMS-022) — single-level
 * composition with live buildable quantity from the stock ledger,
 * nesting guards, and audited mutations.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 084 — kitting', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s84a', subject: 'idp|s84-admin' });

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
      `TRUNCATE TABLE "quarantine_hold", "asset", "employee", "contract", "support_case",
       "master_data_request", "break_glass_grant", "loyalty_transaction", "loyalty_account",
       "promotion_redemption", "promotion",
       "serial_number", "bundle_component",
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
      slug: 'test-s84a',
      name: 'Sprint84 Tenant',
      initialAdmin: {
        email: 'admin@s84a.example',
        displayName: 'S84 Admin',
        idpSubject: 'idp|s84-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH84',
      name: 'Sprint84 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    bundleId = await makeSku('KIT84', 0);
    boltId = await makeSku('BOLT84', 10);
    plateId = await makeSku('PLATE84', 4);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WMS-022: assembly consumes components and receives bundles, exactly once', async () => {
    // Composition: 4 bolts + 1 plate per kit; bolts 10, plates 4 -> buildable 2.
    await api('POST', `/api/v1/skus/${bundleId}/bundle`, tokenA, {
      componentSkuId: boltId,
      quantity: 4,
    });
    await api('POST', `/api/v1/skus/${bundleId}/bundle`, tokenA, {
      componentSkuId: plateId,
      quantity: 1,
    });

    const assembled = await api('POST', `/api/v1/skus/${bundleId}/bundle/assemble`, tokenA, {
      warehouseId,
      quantity: 2,
      assembleKey: 'kit84-first',
    });
    expect(assembled.status).toBe(201);
    expect(assembled.body.assembled).toBe(2);
    expect(assembled.body.duplicate).toBe(false);

    // Ledger effects: bolts 10-8=2, plates 4-2=2, bundles 0+2=2.
    const boltPos = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${boltId}`,
      tokenA,
    );
    expect(Number(boltPos.body.onHand)).toBe(2);
    const kitPos = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${bundleId}`,
      tokenA,
    );
    expect(Number(kitPos.body.onHand)).toBe(2);

    // Retry with the same key: no double movement.
    const retry = await api('POST', `/api/v1/skus/${bundleId}/bundle/assemble`, tokenA, {
      warehouseId,
      quantity: 2,
      assembleKey: 'kit84-first',
    });
    expect(retry.body.duplicate).toBe(true);
    const boltAfter = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${boltId}`,
      tokenA,
    );
    expect(Number(boltAfter.body.onHand)).toBe(2);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'pim.bundle.assemble' } });
    expect(audit).not.toBeNull();
  });

  it('WMS-022: assembling beyond buildable is refused', async () => {
    const refused = await api('POST', `/api/v1/skus/${bundleId}/bundle/assemble`, tokenA, {
      warehouseId,
      quantity: 5,
      assembleKey: 'kit84-toomany',
    });
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: assembly needs inventory.adjust', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s84a', subject: 'idp|s84-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko84@primjer.example',
      displayName: 'Niko84',
      idpSubject: 'idp|s84-nobody',
    });
    const denied = await api('POST', `/api/v1/skus/${bundleId}/bundle/assemble`, stranger, {
      warehouseId,
      quantity: 1,
      assembleKey: 'kit84-hak00',
    });
    expect(denied.status).toBe(403);
  });
});
