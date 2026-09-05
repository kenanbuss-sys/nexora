import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 041 acceptance tests: packaging hierarchy (PIM) — governed pack
 * levels, barcode namespace shared with unit barcodes, and pack-aware
 * barcode resolution with the multiplier.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 041 — packaging hierarchy', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s41a', subject: 'idp|s41-admin' });

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

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "packaging_level", "sku_substitution", "discount_rule", "user_credential",
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
      slug: 'test-s41a',
      name: 'Sprint41 Tenant',
      initialAdmin: {
        email: 'admin@s41a.example',
        displayName: 'S41 Admin',
        idpSubject: 'idp|s41-admin',
      },
    });

    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PK41', name: 'PK41' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PK41-STD',
      name: 'PK41 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    // A unit barcode occupies the shared namespace.
    await api('POST', '/api/v1/barcodes', tokenA, { skuId, value: '3859000000017' });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM: pack levels are governed and validated', async () => {
    const tooSmall = await api('POST', `/api/v1/skus/${skuId}/packaging`, tokenA, {
      name: 'Solo',
      unitsPerPack: 1,
    });
    expect(tooSmall.status).toBe(400);

    const box = await api('POST', `/api/v1/skus/${skuId}/packaging`, tokenA, {
      name: 'Box of 12',
      unitsPerPack: 12,
      barcodeValue: '3859000000024',
    });
    expect(box.status).toBe(201);

    const pallet = await api('POST', `/api/v1/skus/${skuId}/packaging`, tokenA, {
      name: 'Pallet',
      unitsPerPack: 480,
    });
    expect(pallet.status).toBe(201);

    // The pack barcode namespace is shared with unit barcodes.
    const clash = await api('POST', `/api/v1/skus/${skuId}/packaging`, tokenA, {
      name: 'Clash',
      unitsPerPack: 6,
      barcodeValue: '3859000000017',
    });
    expect(clash.status).toBe(409);

    const duplicateName = await api('POST', `/api/v1/skus/${skuId}/packaging`, tokenA, {
      name: 'Box of 12',
      unitsPerPack: 24,
    });
    expect(duplicateName.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'pim.packaging.add' } });
    expect(audit).not.toBeNull();
  });

  it('PIM: barcode lookup resolves pack barcodes with the multiplier', async () => {
    const unit = await api('GET', '/api/v1/barcodes/3859000000017', tokenA);
    expect(unit.status).toBe(200);
    expect(unit.body.code).toBe('PK41-STD');
    expect(unit.body.unitsPerPack).toBeUndefined();

    const pack = await api('GET', '/api/v1/barcodes/3859000000024', tokenA);
    expect(pack.status).toBe(200);
    expect(pack.body.code).toBe('PK41-STD');
    expect(pack.body.packName).toBe('Box of 12');
    expect(pack.body.unitsPerPack).toBe('12');

    const unknown = await api('GET', '/api/v1/barcodes/0000000000000', tokenA);
    expect(unknown.status).toBe(404);
  });

  it('PIM: levels list in size order and removal is audited', async () => {
    const listed = await api('GET', `/api/v1/skus/${skuId}/packaging`, tokenA);
    const levels = listed.body.levels as Array<{ id: string; name: string }>;
    expect(levels.map((l) => l.name)).toEqual(['Box of 12', 'Pallet']);

    await api('POST', `/api/v1/skus/${skuId}/packaging/${levels[1]!.id}/remove`, tokenA);
    const after = await api('GET', `/api/v1/skus/${skuId}/packaging`, tokenA);
    expect((after.body.levels as unknown[]).length).toBe(1);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'pim.packaging.remove' },
    });
    expect(audit).not.toBeNull();
  });

  it('AUTHZ: managing packaging needs product.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s41a', subject: 'idp|s41-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko41@primjer.example',
      displayName: 'Niko41',
      idpSubject: 'idp|s41-nobody',
    });
    const denied = await api('POST', `/api/v1/skus/${skuId}/packaging`, stranger, {
      name: 'Hak',
      unitsPerPack: 5,
    });
    expect(denied.status).toBe(403);
  });
});
