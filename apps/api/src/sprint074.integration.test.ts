import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 074 acceptance tests: segregation of duties (IAM-011)
 * — conflicting-permission assignments are refused, tenant-admin
 * stays exempt by design, and violations report live.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 074 — segregation of duties', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s74a', subject: 'idp|s74-admin' });

  let warehouseId = '';
  let skuId = '';
  let scarceSkuId = '';
  let targetUserId = '';

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
      slug: 'test-s74a',
      name: 'Sprint74 Tenant',
      initialAdmin: {
        email: 'admin@s74a.example',
        displayName: 'S74 Admin',
        idpSubject: 'idp|s74-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH74',
      name: 'Sprint74 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO74', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO74-STD',
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
      idempotencyKey: 'receipt-PRO74',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE74',
      name: 'S74',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE74-STD',
      name: 'S74 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('IAM-011: an assignment combining conflicting permissions is refused', async () => {
    // Two specialized roles whose union violates the default SoD rules.
    const approver = await api('POST', '/api/v1/roles', tokenA, { name: 'po-approver' });
    await api('PUT', `/api/v1/roles/${approver.body.id}/permissions`, tokenA, {
      permissions: ['purchase.approve'],
    });
    const buyer = await api('POST', '/api/v1/roles', tokenA, { name: 'po-buyer' });
    await api('PUT', `/api/v1/roles/${buyer.body.id}/permissions`, tokenA, {
      permissions: ['purchase.manage'],
    });

    const invited = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'nabavljac74@primjer.example',
      displayName: 'Nabavljac74',
      idpSubject: 'idp|s74-buyer',
    });
    targetUserId = invited.body.id as string;

    const first = await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: targetUserId,
      roleId: buyer.body.id,
    });
    expect(first.status).toBe(201);

    const conflict = await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: targetUserId,
      roleId: approver.body.id,
    });
    expect(conflict.status).toBe(409);
    expect(String(conflict.body.message)).toContain('Segregation of duties');
  });

  it('IAM-011: the built-in tenant-admin role stays exempt', async () => {
    const roles = await api('GET', '/api/v1/roles', tokenA);
    const admin = (roles.body.roles as Array<{ id: string; name: string }>).find(
      (r) => r.name === 'tenant-admin',
    );
    const assigned = await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: targetUserId,
      roleId: admin?.id,
    });
    expect(assigned.status).toBe(201);
  });

  it('IAM-011: the violation report lists offenders live', async () => {
    // The target user now holds tenant-admin (all permissions) => conflicts.
    const report = await api('GET', '/api/v1/roles/sod-violations', tokenA);
    expect(report.status).toBe(200);
    const row = (report.body.violations as Array<{ userId: string; conflicts: unknown[] }>).find(
      (v) => v.userId === targetUserId,
    );
    expect(row).toBeDefined();
    expect(row?.conflicts.length).toBeGreaterThan(0);
  });

  it('AUTHZ: the SoD report needs iam.role.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s74a', subject: 'idp|s74-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko74@primjer.example',
      displayName: 'Niko74',
      idpSubject: 'idp|s74-nobody',
    });
    const denied = await api('GET', '/api/v1/roles/sod-violations', stranger);
    expect(denied.status).toBe(403);
  });
});
