import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 066 acceptance tests: customer onboarding (CRM-012)
 * — checklist from versioned tenant configuration through the CORE
 * task engine, idempotent start, live progress.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 066 — onboarding', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s66a', subject: 'idp|s66-admin' });

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
      slug: 'test-s66a',
      name: 'Sprint66 Tenant',
      initialAdmin: {
        email: 'admin@s66a.example',
        displayName: 'S66 Admin',
        idpSubject: 'idp|s66-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH66',
      name: 'Sprint66 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO66', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO66-STD',
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
      idempotencyKey: 'receipt-PRO66',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE66',
      name: 'S66',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE66-STD',
      name: 'S66 Std',
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

  it('CRM-012: starting onboarding creates the default checklist exactly once', async () => {
    const started = await api('POST', `/api/v1/crm/accounts/${accountId}/onboarding/start`, tokenA);
    expect(started.status).toBe(201);
    expect(started.body.started).toBe(true);
    expect(started.body.total).toBe(5);
    expect(started.body.done).toBe(0);

    const again = await api('POST', `/api/v1/crm/accounts/${accountId}/onboarding/start`, tokenA);
    expect(again.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'crm.onboarding.start' } });
    expect(audit).not.toBeNull();
  });

  it('CRM-012: completing tasks moves the progress', async () => {
    const status = await api('GET', `/api/v1/crm/accounts/${accountId}/onboarding`, tokenA);
    const first = (status.body.tasks as Array<{ id: string }>)[0];
    const done = await api('POST', `/api/v1/tasks/${first?.id}/complete`, tokenA);
    expect([200, 201]).toContain(done.status);
    const after = await api('GET', `/api/v1/crm/accounts/${accountId}/onboarding`, tokenA);
    expect(after.body.done).toBe(1);
  });

  it('CRM-012: the checklist honours versioned tenant configuration', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { crm: { onboardingSteps: ['Potpisati ugovor', 'Uvesti artikle'] } },
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Konfig66',
      company: 'Konfig66 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const started = await api(
      'POST',
      `/api/v1/crm/accounts/${converted.body.accountId}/onboarding/start`,
      tokenA,
    );
    expect(started.body.total).toBe(2);
    const titles = (started.body.tasks as Array<{ title: string }>).map((t) => t.title);
    expect(titles).toContain('Potpisati ugovor');
  });

  it('AUTHZ: starting onboarding needs crm.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s66a', subject: 'idp|s66-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko66@primjer.example',
      displayName: 'Niko66',
      idpSubject: 'idp|s66-nobody',
    });
    const denied = await api(
      'POST',
      `/api/v1/crm/accounts/${accountId}/onboarding/start`,
      stranger,
    );
    expect(denied.status).toBe(403);
  });
});
