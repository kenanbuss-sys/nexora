import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 083 acceptance tests: case SLA & analytics (CSM-005/014)
 * — status counts, average resolution time, and priority-weighted
 * SLA overdue detection.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 083 — case analytics', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s83a', subject: 'idp|s83-admin' });

  let warehouseId = '';
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
      slug: 'test-s83a',
      name: 'Sprint83 Tenant',
      initialAdmin: {
        email: 'admin@s83a.example',
        displayName: 'S83 Admin',
        idpSubject: 'idp|s83-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH83',
      name: 'Sprint83 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO83', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO83-STD',
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
      idempotencyKey: 'receipt-PRO83',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE83',
      name: 'S83',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE83-STD',
      name: 'S83 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CSM-014: analytics count statuses and compute average resolution', async () => {
    const first = await api('POST', '/api/v1/support-cases', tokenA, {
      subject: 'Prvi slucaj 83',
    });
    await api('POST', `/api/v1/support-cases/${first.body.id}/transition`, tokenA, {
      status: 'RESOLVED',
    });
    await api('POST', '/api/v1/support-cases', tokenA, { subject: 'Drugi slucaj 83' });

    const stats = await api('GET', '/api/v1/support-cases/analytics', tokenA);
    expect(stats.status).toBe(200);
    expect(stats.body.open).toBe(1);
    expect(stats.body.resolved).toBe(1);
    expect(typeof stats.body.avgResolutionHours).toBe('number');
  });

  it('CSM-005: cases past their priority SLA surface as overdue', async () => {
    const urgent = await api('POST', '/api/v1/support-cases', tokenA, {
      subject: 'Hitni slucaj 83',
      priority: 'URGENT',
    });
    // Backdate 6h — past the 4h URGENT SLA (test-only time travel).
    await prisma.supportCase.update({
      where: { id: urgent.body.id as string },
      data: { createdAt: new Date(Date.now() - 6 * 3_600_000) },
    });
    const stats = await api('GET', '/api/v1/support-cases/analytics', tokenA);
    const overdue = stats.body.overdue as Array<{ id: string; ageHours: number }>;
    const row = overdue.find((o) => o.id === urgent.body.id);
    expect(row).toBeDefined();
    expect(row?.ageHours).toBeGreaterThanOrEqual(6);
  });

  it('AUTHZ: case analytics need crm.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s83a', subject: 'idp|s83-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko83@primjer.example',
      displayName: 'Niko83',
      idpSubject: 'idp|s83-nobody',
    });
    const denied = await api('GET', '/api/v1/support-cases/analytics', stranger);
    expect(denied.status).toBe(403);
  });
});
