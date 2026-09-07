import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 079 acceptance tests: quick order (COM-004)
 * — sales-rep entry by SKU code with honest unknown reporting;
 * permissioned.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 079 — quick order', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s79a', subject: 'idp|s79-admin' });

  let warehouseId = '';
  let accountId = '';
  let skuId = '';
  let scarceSkuId = '';

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
      slug: 'test-s79a',
      name: 'Sprint79 Tenant',
      initialAdmin: {
        email: 'admin@s79a.example',
        displayName: 'S79 Admin',
        idpSubject: 'idp|s79-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH79',
      name: 'Sprint79 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO79', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO79-STD',
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
      idempotencyKey: 'receipt-PRO79',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE79',
      name: 'S79',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE79-STD',
      name: 'S79 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
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

  it('COM-004: quick order builds a draft from SKU codes and reports unknowns', async () => {
    const created = await api('POST', '/api/v1/orders/quick', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [
        { code: 'PRO79-STD', quantity: 3 },
        { code: 'NEPOSTOJI', quantity: 1 },
      ],
    });
    expect(created.status).toBe(201);
    const order = created.body.order as { status: string; lines: Array<{ quantity: string }> };
    expect(order.status).toBe('DRAFT');
    expect(order.lines.length).toBe(1);
    expect(Number(order.lines[0]?.quantity)).toBe(3);
    expect(created.body.unknownCodes).toEqual(['NEPOSTOJI']);
  });

  it('COM-004: an entry with no resolvable codes is refused', async () => {
    const refused = await api('POST', '/api/v1/orders/quick', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [{ code: 'NISTA', quantity: 1 }],
    });
    expect(refused.status).toBe(400);
  });

  it('AUTHZ: quick orders need order.create', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s79a', subject: 'idp|s79-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko79@primjer.example',
      displayName: 'Niko79',
      idpSubject: 'idp|s79-nobody',
    });
    const denied = await api('POST', '/api/v1/orders/quick', stranger, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [{ code: 'PRO79-STD', quantity: 1 }],
    });
    expect(denied.status).toBe(403);
  });
});
