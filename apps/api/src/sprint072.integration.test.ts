import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 072-073 acceptance tests: employee master & asset registry (HCM-001/005, EAM-001)
 * — numbered employees with validated skills, numbered assets with
 * an enforced service lifecycle, all audited and permissioned.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 072-073 — people & assets', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s72a', subject: 'idp|s72-admin' });

  let warehouseId = '';
  let skuId = '';
  let scarceSkuId = '';
  let employeeId = '';

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
      slug: 'test-s72a',
      name: 'Sprint72 Tenant',
      initialAdmin: {
        email: 'admin@s72a.example',
        displayName: 'S72 Admin',
        idpSubject: 'idp|s72-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH72',
      name: 'Sprint72 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO72', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO72-STD',
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
      idempotencyKey: 'receipt-PRO72',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE72',
      name: 'S72',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE72-STD',
      name: 'S72 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('HCM-001: employees are numbered, audited, and lifecycle guarded', async () => {
    const created = await api('POST', '/api/v1/employees', tokenA, {
      name: 'Amir Radnik',
      title: 'CNC operater',
    });
    expect(created.status).toBe(201);
    expect(created.body.employeeNumber).toMatch(/^EMP-/);
    employeeId = created.body.id as string;

    const again = await api('POST', `/api/v1/employees/${employeeId}/status`, tokenA, {
      status: 'ACTIVE',
    });
    expect(again.status).toBe(409); // already ACTIVE

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'hcm.employee.create' } });
    expect(audit).not.toBeNull();
  });

  it('HCM-005: skills are validated, deduplicated and audited', async () => {
    const set = await api('POST', `/api/v1/employees/${employeeId}/skills`, tokenA, {
      skills: ['CNC', 'zavarivanje', 'CNC '],
    });
    expect(set.status).toBe(201);
    expect(set.body.skills).toEqual(['CNC', 'zavarivanje']);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'hcm.employee.skills' } });
    expect(audit).not.toBeNull();
  });

  it('EAM-001: assets are numbered with an enforced service lifecycle', async () => {
    const created = await api('POST', '/api/v1/assets', tokenA, {
      name: 'CNC glodalica',
      category: 'machine',
      serialNumber: 'CNC-2024-001',
      value: 85000,
    });
    expect(created.status).toBe(201);
    expect(created.body.assetNumber).toMatch(/^AST-/);
    const assetId = created.body.id as string;

    const maint = await api('POST', `/api/v1/assets/${assetId}/transition`, tokenA, {
      status: 'UNDER_MAINTENANCE',
    });
    expect(maint.status).toBe(201);
    const retire = await api('POST', `/api/v1/assets/${assetId}/transition`, tokenA, {
      status: 'RETIRED',
    });
    expect(retire.status).toBe(201);
    const revive = await api('POST', `/api/v1/assets/${assetId}/transition`, tokenA, {
      status: 'IN_SERVICE',
    });
    expect(revive.status).toBe(409); // RETIRED is terminal

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'eam.asset.create' } });
    expect(audit).not.toBeNull();
  });

  it('AUTHZ: HCM and EAM mutations are permissioned; stranger denied', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s72a', subject: 'idp|s72-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko72@primjer.example',
      displayName: 'Niko72',
      idpSubject: 'idp|s72-nobody',
    });
    const deniedEmp = await api('POST', '/api/v1/employees', stranger, { name: 'Hak' });
    expect(deniedEmp.status).toBe(403);
    const deniedAsset = await api('POST', '/api/v1/assets', stranger, {
      name: 'Hak',
      category: 'x',
    });
    expect(deniedAsset.status).toBe(403);
  });
});
