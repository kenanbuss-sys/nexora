import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 140 acceptance tests: SSCC logistics labels (WMS-020) —
 * GS1 SSCC-18 assigned per package from the configured company
 * prefix, idempotent, refused after shipping.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 140 — SSCC labels', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s140a', subject: 'idp|s140-admin' });

  let orderId = '';
  let lineId = '';
  let packageId = '';

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
      `TRUNCATE TABLE "package_line", "package", "landed_cost", "rfq_quote", "rfq",
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
      slug: 'test-s140a',
      name: 'Sprint140 Tenant',
      initialAdmin: {
        email: 'admin@s140a.example',
        displayName: 'S140 Admin',
        idpSubject: 'idp|s140-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH140',
      name: 'Sprint140 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK140',
      name: 'PAK140 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK140-STD',
      name: 'PAK140 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s140',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stotri',
      company: 'Stotri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { wms: { gs1CompanyPrefix: '3859999' } },
    });

    orderId = order.body.id as string;
    const withLine = await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId: sku.body.id,
      quantity: 12,
      unitPrice: 5,
    });
    lineId = (withLine.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WMS-020: SSCC-18 is assigned from the configured GS1 prefix, idempotently', async () => {
    const pkg = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 6 }],
    });
    expect(pkg.status).toBe(201);
    packageId = pkg.body.id as string;
    expect(pkg.body.ssccCode).toBeNull();

    const labeled = await api('POST', `/api/v1/packages/${packageId}/sscc`, tokenA);
    expect(labeled.status).toBe(201);
    const sscc = labeled.body.ssccCode as string;
    expect(sscc).toMatch(/^\d{18}$/);
    expect(sscc.startsWith('03859999')).toBe(true);

    // GS1 mod-10 check digit holds.
    const digits = sscc.split('').map(Number);
    const sum = digits.slice(0, 17).reduce((acc, n, i) => acc + (i % 2 === 0 ? n * 3 : n), 0);
    expect((10 - (sum % 10)) % 10).toBe(digits[17]);

    const again = await api('POST', `/api/v1/packages/${packageId}/sscc`, tokenA);
    expect(again.body.ssccCode).toBe(sscc);
  });

  it('WMS-020: distinct packages get distinct SSCCs', async () => {
    const second = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 4 }],
    });
    const labeled = await api('POST', `/api/v1/packages/${second.body.id}/sscc`, tokenA);
    const first = await api('GET', `/api/v1/packages?orderId=${orderId}`, tokenA);
    const codes = (first.body.packages as Array<{ ssccCode: string | null }>)
      .map((p) => p.ssccCode)
      .filter(Boolean);
    expect(labeled.body.ssccCode).toMatch(/^\d{18}$/);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBe(2);
  });

  it('WMS-020: shipped packages cannot be labeled anymore', async () => {
    await api('POST', `/api/v1/packages/${packageId}/stage`, tokenA);
    await api('POST', `/api/v1/packages/${packageId}/ship`, tokenA);
    // Already labeled → idempotent return still works after shipping.
    const again = await api('POST', `/api/v1/packages/${packageId}/sscc`, tokenA);
    expect(again.status).toBe(201);

    const bare = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 2 }],
    });
    await api('POST', `/api/v1/packages/${bare.body.id}/stage`, tokenA);
    await api('POST', `/api/v1/packages/${bare.body.id}/ship`, tokenA);
    const refused = await api('POST', `/api/v1/packages/${bare.body.id}/sscc`, tokenA);
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: SSCC assignment needs inventory.adjust', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s140a', subject: 'idp|s140-nobody' });
    const denied = await api('POST', `/api/v1/packages/${packageId}/sscc`, stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
