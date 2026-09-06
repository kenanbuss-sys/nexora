import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 064 acceptance tests: support cases (CSM-001/003)
 * — numbered cases, validated links, assignment, and an enforced
 * lifecycle with reopen and a terminal CLOSED state.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 064 — support cases', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s64a', subject: 'idp|s64-admin' });

  let warehouseId = '';
  let accountId = '';
  let skuId = '';
  let scarceSkuId = '';
  let caseId = '';

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

  async function draftOrder(quantity: number, unitPrice: number): Promise<string> {
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity,
      unitPrice,
    });
    return order.body.id as string;
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
      slug: 'test-s64a',
      name: 'Sprint64 Tenant',
      initialAdmin: {
        email: 'admin@s64a.example',
        displayName: 'S64 Admin',
        idpSubject: 'idp|s64-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH64',
      name: 'Sprint64 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO64', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO64-STD',
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
      idempotencyKey: 'receipt-PRO64',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE64',
      name: 'S64',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE64-STD',
      name: 'S64 Std',
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

  it('CSM-001: cases are numbered, validated and audited', async () => {
    const created = await api('POST', '/api/v1/support-cases', tokenA, {
      subject: 'Isporuka kasni',
      priority: 'HIGH',
      accountId,
    });
    expect(created.status).toBe(201);
    expect(created.body.caseNumber).toMatch(/^CS-/);
    caseId = created.body.id as string;

    const badAccount = await api('POST', '/api/v1/support-cases', tokenA, {
      subject: 'Nepostojeci kupac',
      accountId: '00000000-0000-4000-8000-000000000000',
    });
    expect(badAccount.status).toBe(404);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'csm.case.create' } });
    expect(audit).not.toBeNull();
  });

  it('CSM-003: assignment demands an active user of this tenant', async () => {
    const users = await api('GET', '/api/v1/users', tokenA);
    const admin = (users.body.users as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'admin@s64a.example',
    );
    const assigned = await api('POST', `/api/v1/support-cases/${caseId}/assign`, tokenA, {
      userId: admin?.id,
    });
    expect(assigned.status).toBe(201);
    expect(assigned.body.assignedTo).toBe(admin?.id);
  });

  it('CSM-001: the lifecycle is enforced — no skipping, reopen allowed, closed is terminal', async () => {
    const skip = await api('POST', `/api/v1/support-cases/${caseId}/transition`, tokenA, {
      status: 'CLOSED',
    });
    expect(skip.status).toBe(409);

    await api('POST', `/api/v1/support-cases/${caseId}/transition`, tokenA, {
      status: 'IN_PROGRESS',
    });
    const resolved = await api('POST', `/api/v1/support-cases/${caseId}/transition`, tokenA, {
      status: 'RESOLVED',
    });
    expect(resolved.status).toBe(201);
    expect(resolved.body.resolvedAt).toBeTruthy();

    // Reopen, resolve again, close; closed is terminal.
    await api('POST', `/api/v1/support-cases/${caseId}/transition`, tokenA, {
      status: 'IN_PROGRESS',
    });
    await api('POST', `/api/v1/support-cases/${caseId}/transition`, tokenA, {
      status: 'RESOLVED',
    });
    const closed = await api('POST', `/api/v1/support-cases/${caseId}/transition`, tokenA, {
      status: 'CLOSED',
    });
    expect(closed.status).toBe(201);
    const reopen = await api('POST', `/api/v1/support-cases/${caseId}/transition`, tokenA, {
      status: 'OPEN',
    });
    expect(reopen.status).toBe(409);
  });

  it('AUTHZ: managing cases needs crm.manage; stranger denied', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s64a', subject: 'idp|s64-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko64@primjer.example',
      displayName: 'Niko64',
      idpSubject: 'idp|s64-nobody',
    });
    const denied = await api('POST', '/api/v1/support-cases', stranger, { subject: 'hak' });
    expect(denied.status).toBe(403);
  });
});
