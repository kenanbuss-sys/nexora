import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 025 acceptance tests: category tree (PIM-004), variant
 * generation (PIM-002) and typed product attributes (PIM-003).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 025 — PIM depth', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s25a', subject: 'idp|s25-admin' });

  let productId = '';
  let categoryId = '';

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
      `TRUNCATE TABLE "product_category",
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
      slug: 'test-s25a',
      name: 'Sprint25 Tenant',
      initialAdmin: {
        email: 'admin@s25a.example',
        displayName: 'S25 Admin',
        idpSubject: 'idp|s25-admin',
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'LAMP25',
      name: 'Stolna lampa',
    });
    productId = product.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PIM-004: categories form a tree and count assigned products', async () => {
    const root = await api('POST', '/api/v1/catalog/categories', tokenA, {
      code: 'LIGHTING',
      name: 'Rasvjeta',
    });
    expect(root.status).toBe(201);
    categoryId = root.body.id as string;
    const child = await api('POST', '/api/v1/catalog/categories', tokenA, {
      code: 'DESK',
      name: 'Stolne lampe',
      parentId: categoryId,
    });
    expect(child.body.parentId).toBe(categoryId);

    const duplicate = await api('POST', '/api/v1/catalog/categories', tokenA, {
      code: 'LIGHTING',
      name: 'Dup',
    });
    expect(duplicate.status).toBe(409);

    await api('POST', `/api/v1/catalog/products/${productId}/category`, tokenA, {
      categoryId: child.body.id,
    });
    const list = await api('GET', '/api/v1/catalog/categories', tokenA);
    const rows = list.body.categories as Array<{ code: string; productCount: number }>;
    expect(rows.find((c) => c.code === 'DESK')?.productCount).toBe(1);
    expect(rows.find((c) => c.code === 'LIGHTING')?.productCount).toBe(0);
  });

  it('PIM-002: variant generation creates one SKU per combination', async () => {
    const generated = await api('POST', `/api/v1/catalog/products/${productId}/variants`, tokenA, {
      axes: { color: ['white', 'black'], size: ['S', 'L'] },
      baseUom: 'pcs',
    });
    expect(generated.status).toBe(201);
    const created = generated.body.created as Array<{
      code: string;
      variantValues: Record<string, string>;
    }>;
    expect(created.length).toBe(4);
    const codes = created.map((c) => c.code).sort();
    expect(codes).toEqual(['LAMP25-BLACK-L', 'LAMP25-BLACK-S', 'LAMP25-WHITE-L', 'LAMP25-WHITE-S']);
    expect(created[0]?.variantValues.color).toBeDefined();

    // Re-running with an extra value only adds the new combinations.
    const more = await api('POST', `/api/v1/catalog/products/${productId}/variants`, tokenA, {
      axes: { color: ['white', 'black', 'red'], size: ['S', 'L'] },
      baseUom: 'pcs',
    });
    expect((more.body.created as unknown[]).length).toBe(2);
    expect((more.body.skipped as unknown[]).length).toBe(4);

    const detail = await api('GET', `/api/v1/products/${productId}`, tokenA);
    expect((detail.body.skus as unknown[]).length).toBe(6);
  });

  it('PIM-003: attributes validate against custom field definitions', async () => {
    // Define product attributes via the custom-field framework.
    await api('POST', '/api/v1/configuration/custom-fields', tokenA, {
      objectType: 'product',
      key: 'wattage',
      label: 'Wattage',
      fieldType: 'NUMBER',
    });
    await api('POST', '/api/v1/configuration/custom-fields', tokenA, {
      objectType: 'product',
      key: 'material',
      label: 'Material',
      fieldType: 'TEXT',
    });

    const wrongType = await api(
      'POST',
      `/api/v1/catalog/products/${productId}/attributes`,
      tokenA,
      {
        attributes: { wattage: 'many' },
      },
    );
    expect(wrongType.status).toBe(400);

    const unknown = await api('POST', `/api/v1/catalog/products/${productId}/attributes`, tokenA, {
      attributes: { colorway: 'x' },
    });
    expect(unknown.status).toBe(400);

    const ok = await api('POST', `/api/v1/catalog/products/${productId}/attributes`, tokenA, {
      attributes: { wattage: 9, material: 'aluminij' },
    });
    expect(ok.status).toBe(201);
    const stored = await prisma.product.findFirst({ where: { id: productId } });
    expect((stored?.attributes as Record<string, unknown>).wattage).toBe(9);
  });
});
