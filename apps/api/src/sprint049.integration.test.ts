import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 049 acceptance tests: SKU logistics data (PIM-009) — governed
 * weight/dimensions and honest order totals that count missing data.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 049 — SKU logistics', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s49a', subject: 'idp|s49-admin' });

  let skuWithData = '';
  let skuWithout = '';
  let orderId = '';

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

  async function makeSku(code: string): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "consent_record", "exchange_rate", "sales_team_member", "sales_team",
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
      slug: 'test-s49a',
      name: 'Sprint49 Tenant',
      initialAdmin: {
        email: 'admin@s49a.example',
        displayName: 'S49 Admin',
        idpSubject: 'idp|s49-admin',
      },
    });

    skuWithData = await makeSku('LOG49');
    skuWithout = await makeSku('LOG49B');

    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Kupac49 d.o.o.',
    });
    const account = await api('POST', '/api/v1/crm/accounts', tokenA, { partyId: party.body.id });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH49',
      name: 'W49',
    });
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: account.body.id,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId: skuWithData,
      quantity: 10,
      unitPrice: 5,
    });
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId: skuWithout,
      quantity: 3,
      unitPrice: 7,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM-009: logistics data is validated and audited', async () => {
    const bad = await api('POST', `/api/v1/skus/${skuWithData}/logistics`, tokenA, {
      weightKg: -1,
    });
    expect(bad.status).toBe(400);

    const set = await api('POST', `/api/v1/skus/${skuWithData}/logistics`, tokenA, {
      weightKg: 2.5,
      lengthCm: 50,
      widthCm: 40,
      heightCm: 20,
    });
    expect(set.status).toBe(201);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'pim.sku.logistics' } });
    expect(audit).not.toBeNull();
  });

  it('OMS: the order logistics summary is honest about missing data', async () => {
    const summary = await api('GET', `/api/v1/orders/${orderId}/logistics`, tokenA);
    expect(summary.status).toBe(200);
    // 10 × 2.5 kg; 10 × (50×40×20 cm = 0.04 m³).
    expect(summary.body.totalWeightKg).toBe('25.000');
    expect(summary.body.totalVolumeM3).toBe('0.400');
    // The second SKU has no data — counted, not zeroed silently.
    expect(summary.body.linesMissingData).toBe(1);
  });

  it('AUTHZ: setting logistics needs product.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s49a', subject: 'idp|s49-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko49@primjer.example',
      displayName: 'Niko49',
      idpSubject: 'idp|s49-nobody',
    });
    const denied = await api('POST', `/api/v1/skus/${skuWithData}/logistics`, stranger, {
      weightKg: 1,
    });
    expect(denied.status).toBe(403);
  });
});
