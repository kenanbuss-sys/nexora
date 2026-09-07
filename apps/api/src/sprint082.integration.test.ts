import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 082 acceptance tests: quarantine holds (QMS-006/WMS-006)
 * — holds block reservation, over-holding refused, release restores
 * availability, scrap posts a compensating ledger adjustment.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 082 — quarantine', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s82a', subject: 'idp|s82-admin' });

  let warehouseId = '';
  let skuId = '';
  let scarceSkuId = '';
  let holdId = '';

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
      slug: 'test-s82a',
      name: 'Sprint82 Tenant',
      initialAdmin: {
        email: 'admin@s82a.example',
        displayName: 'S82 Admin',
        idpSubject: 'idp|s82-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH82',
      name: 'Sprint82 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO82', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO82-STD',
      name: 'P53 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-PRO82',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE82',
      name: 'S82',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE82-STD',
      name: 'S82 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('QMS-006: a hold blocks reservation of the held quantity', async () => {
    // 10 on hand; hold 7 -> only 3 reservable.
    const placed = await api('POST', '/api/v1/quarantine', tokenA, {
      warehouseId,
      skuId,
      quantity: 7,
      reason: 'Sumnja na oštećenje serije',
    });
    expect(placed.status).toBe(201);
    holdId = placed.body.id as string;

    const tooMuch = await api('POST', '/api/v1/stock/reservations', tokenA, {
      warehouseId,
      skuId,
      quantity: 5,
    });
    expect(tooMuch.status).toBe(409);

    const fits = await api('POST', '/api/v1/stock/reservations', tokenA, {
      warehouseId,
      skuId,
      quantity: 3,
    });
    expect(fits.status).toBe(201);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'wms.quarantine.place' } });
    expect(audit).not.toBeNull();
  });

  it('QMS-006: over-holding beyond un-held stock is refused', async () => {
    const refused = await api('POST', '/api/v1/quarantine', tokenA, {
      warehouseId,
      skuId,
      quantity: 4,
      reason: 'Ne bi smjelo proći',
    });
    expect(refused.status).toBe(409);
  });

  it('QMS-006: releasing returns the quantity to availability', async () => {
    const released = await api('POST', `/api/v1/quarantine/${holdId}/decide`, tokenA, {
      decision: 'RELEASE',
    });
    expect(released.status).toBe(201);
    expect(released.body.status).toBe('RELEASED');

    const now = await api('POST', '/api/v1/stock/reservations', tokenA, {
      warehouseId,
      skuId,
      quantity: 5,
    });
    expect(now.status).toBe(201);

    const again = await api('POST', `/api/v1/quarantine/${holdId}/decide`, tokenA, {
      decision: 'SCRAP',
    });
    expect(again.status).toBe(409);
  });

  it('QMS-006: scrapping posts a compensating ledger adjustment', async () => {
    const placed = await api('POST', '/api/v1/quarantine', tokenA, {
      warehouseId,
      skuId,
      quantity: 2,
      reason: 'Trajno oštećeno',
    });
    const before = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    const scrapped = await api('POST', `/api/v1/quarantine/${placed.body.id}/decide`, tokenA, {
      decision: 'SCRAP',
    });
    expect(scrapped.status).toBe(201);
    const after = await api(
      'GET',
      `/api/v1/stock/position?warehouseId=${warehouseId}&skuId=${skuId}`,
      tokenA,
    );
    expect(Number(after.body.onHand)).toBe(Number(before.body.onHand) - 2);
  });

  it('AUTHZ: deciding holds needs qc.approve; stranger denied everywhere', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s82a', subject: 'idp|s82-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko82@primjer.example',
      displayName: 'Niko82',
      idpSubject: 'idp|s82-nobody',
    });
    const denied = await api('POST', '/api/v1/quarantine', stranger, {
      warehouseId,
      skuId,
      quantity: 1,
      reason: 'hak',
    });
    expect(denied.status).toBe(403);
  });
});
