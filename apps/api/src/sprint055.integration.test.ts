import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 055 acceptance tests: serial numbers (PIM-011) — per-SKU
 * policy, registry with lifecycle transitions, idempotent
 * registration, and audited mutations.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 055 — serials', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s55a', subject: 'idp|s55-admin' });

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
      slug: 'test-s55a',
      name: 'Sprint55 Tenant',
      initialAdmin: {
        email: 'admin@s55a.example',
        displayName: 'S55 Admin',
        idpSubject: 'idp|s55-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH55',
      name: 'Sprint55 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    skuId = await makeSku('SER55', 5);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM-011: policy gates registration and registration is idempotent', async () => {
    const early = await api('POST', `/api/v1/skus/${skuId}/serials`, tokenA, {
      serials: ['SN-001'],
    });
    expect(early.status).toBe(409); // policy NONE

    const policy = await api('POST', `/api/v1/skus/${skuId}/serial-policy`, tokenA, {
      policy: 'REQUIRED',
    });
    expect(policy.status).toBe(201);

    const first = await api('POST', `/api/v1/skus/${skuId}/serials`, tokenA, {
      serials: ['SN-001', 'SN-002', 'SN-003'],
    });
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(3);

    const retry = await api('POST', `/api/v1/skus/${skuId}/serials`, tokenA, {
      serials: ['SN-002', 'SN-004'],
    });
    expect(retry.body.created).toBe(1);
    expect(retry.body.existing).toContain('SN-002');

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'pim.serial.register' } });
    expect(audit).not.toBeNull();
  });

  it('PIM-011: lifecycle transitions are enforced', async () => {
    const list = await api('GET', `/api/v1/skus/${skuId}/serials`, tokenA);
    expect(list.status).toBe(200);
    const sn = (list.body.serials as Array<{ id: string; serial: string }>).find(
      (x) => x.serial === 'SN-001',
    );
    expect(sn).toBeDefined();
    const id = sn?.id ?? '';

    const shipped = await api('POST', `/api/v1/skus/serials/${id}/status`, tokenA, {
      status: 'SHIPPED',
    });
    expect(shipped.status).toBe(201);

    const badScrap = await api('POST', `/api/v1/skus/serials/${id}/status`, tokenA, {
      status: 'SCRAPPED',
    });
    expect(badScrap.status).toBe(409); // SHIPPED can only be RETURNED

    const returned = await api('POST', `/api/v1/skus/serials/${id}/status`, tokenA, {
      status: 'RETURNED',
    });
    expect(returned.status).toBe(201);
    const scrapped = await api('POST', `/api/v1/skus/serials/${id}/status`, tokenA, {
      status: 'SCRAPPED',
    });
    expect(scrapped.status).toBe(201);
    const revive = await api('POST', `/api/v1/skus/serials/${id}/status`, tokenA, {
      status: 'IN_STOCK',
    });
    expect(revive.status).toBe(409); // SCRAPPED is terminal
  });

  it('PIM-011: tracking cannot be disabled while live serials exist', async () => {
    const refused = await api('POST', `/api/v1/skus/${skuId}/serial-policy`, tokenA, {
      policy: 'NONE',
    });
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: serial mutations need product.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s55a', subject: 'idp|s55-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko55@primjer.example',
      displayName: 'Niko55',
      idpSubject: 'idp|s55-nobody',
    });
    const denied = await api('POST', `/api/v1/skus/${skuId}/serials`, stranger, {
      serials: ['HAK-1'],
    });
    expect(denied.status).toBe(403);
  });
});
