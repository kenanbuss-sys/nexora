import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 045 acceptance tests: product media (PIM) through the collab
 * attachment interface — product entity type, image round-trip, caps.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

// A 1×1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

integration('Sprint 045 — product media', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s45a', subject: 'idp|s45-admin' });

  let productId = '';

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
      `TRUNCATE TABLE "territory", "packaging_level", "sku_substitution", "discount_rule",
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
      slug: 'test-s45a',
      name: 'Sprint45 Tenant',
      initialAdmin: {
        email: 'admin@s45a.example',
        displayName: 'S45 Admin',
        idpSubject: 'idp|s45-admin',
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'IMG45', name: 'IMG45' });
    productId = product.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM: product images round-trip through the attachment interface', async () => {
    const uploaded = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'product',
      entityId: productId,
      fileName: 'front.png',
      contentType: 'image/png',
      dataBase64: PNG_BASE64,
    });
    expect(uploaded.status).toBe(201);

    const listed = await api(
      'GET',
      `/api/v1/attachments?entityType=product&entityId=${productId}`,
      tokenA,
    );
    const attachments = listed.body.attachments as Array<{ id: string; fileName: string }>;
    expect(attachments.length).toBe(1);
    expect(attachments[0]!.fileName).toBe('front.png');

    const downloaded = await api(
      'GET',
      `/api/v1/attachments/${attachments[0]!.id}/download`,
      tokenA,
    );
    expect(downloaded.body.contentType).toBe('image/png');
    expect(downloaded.body.dataBase64).toBe(PNG_BASE64);
  });

  it('PIM: unknown entity types are still refused', async () => {
    const bad = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'spaceship',
      entityId: productId,
      fileName: 'x.png',
      contentType: 'image/png',
      dataBase64: PNG_BASE64,
    });
    expect(bad.status).toBe(400);
  });

  it('AUTHZ: uploads need collab.use', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s45a', subject: 'idp|s45-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko45@primjer.example',
      displayName: 'Niko45',
      idpSubject: 'idp|s45-nobody',
    });
    const denied = await api('POST', '/api/v1/attachments', stranger, {
      entityType: 'product',
      entityId: productId,
      fileName: 'x.png',
      contentType: 'image/png',
      dataBase64: PNG_BASE64,
    });
    expect(denied.status).toBe(403);
  });
});
