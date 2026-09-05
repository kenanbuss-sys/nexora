import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 031 acceptance tests: work-center master data (MES-003),
 * downtime logging (MES-014) and measured OEE inputs (MES-021).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 031 — MES depth', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s31a', subject: 'idp|s31-admin' });

  let workCenterId = '';

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
      `TRUNCATE TABLE "downtime_event", "work_center",
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
      slug: 'test-s31a',
      name: 'Sprint31 Tenant',
      initialAdmin: {
        email: 'admin@s31a.example',
        displayName: 'S31 Admin',
        idpSubject: 'idp|s31-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MES-003: work centers are unique master data', async () => {
    const created = await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'CNC-01',
      name: 'CNC glodalica',
    });
    expect(created.status).toBe(201);
    workCenterId = created.body.id as string;

    const duplicate = await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'CNC-01',
      name: 'Dup',
    });
    expect(duplicate.status).toBe(409);
  });

  it('MES-014: downtime logs validated minutes and categories', async () => {
    const logged = await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'BREAKDOWN',
      minutes: 45,
      reason: 'Puknuo remen',
    });
    expect(logged.status).toBe(201);
    await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'SETUP',
      minutes: 20,
      reason: 'Zamjena alata',
    });

    const invalid = await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'BREAKDOWN',
      minutes: 0,
      reason: 'Ništa',
    });
    expect(invalid.status).toBe(400);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'mes.downtime.log' } });
    expect(audit).not.toBeNull();
  });

  it('MES-021: OEE inputs aggregate downtime by category', async () => {
    const oee = await api('GET', '/api/v1/shopfloor/oee?days=7', tokenA);
    expect(oee.status).toBe(200);
    const row = (
      oee.body.rows as Array<{
        workCenterCode: string;
        downtimeMinutes: number;
        downtimeByCategory: Record<string, number>;
      }>
    )[0]!;
    expect(row.workCenterCode).toBe('CNC-01');
    expect(row.downtimeMinutes).toBe(65);
    expect(row.downtimeByCategory.BREAKDOWN).toBe(45);
    expect(row.downtimeByCategory.SETUP).toBe(20);
  });

  it('AUTH: downtime logging needs production.execute', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s31a', subject: 'idp|s31-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko31@primjer.example',
      displayName: 'Niko31',
      idpSubject: 'idp|s31-nobody',
    });
    const denied = await api('POST', '/api/v1/shopfloor/downtime', stranger, {
      workCenterId,
      category: 'OTHER',
      minutes: 5,
      reason: 'Nešto',
    });
    expect(denied.status).toBe(403);
  });
});
