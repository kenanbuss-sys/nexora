import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 103 acceptance tests: packing & shipping staging
 * (WMS-011/012) — confirmed order lines pack into packages with
 * over-pack protection; PACKED → STAGED → SHIPPED transitions are
 * audited status flips only.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 103 — packing', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s103a', subject: 'idp|s103-admin' });

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
      slug: 'test-s103a',
      name: 'Sprint103 Tenant',
      initialAdmin: {
        email: 'admin@s103a.example',
        displayName: 'S103 Admin',
        idpSubject: 'idp|s103-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH103',
      name: 'Sprint103 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK103',
      name: 'PAK103 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK103-STD',
      name: 'PAK103 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s103',
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
    orderId = order.body.id as string;
    const withLine = await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId: sku.body.id,
      quantity: 10,
      unitPrice: 5,
    });
    lineId = (withLine.body.lines as Array<{ id: string }>)[0]?.id as string;
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WMS-011: confirmed lines pack into a numbered package, audited', async () => {
    const pkg = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 6 }],
      weightKg: 4.2,
    });
    expect(pkg.status).toBe(201);
    expect(pkg.body.packageNumber).toBe('PKG-000001');
    expect(pkg.body.status).toBe('PACKED');
    packageId = pkg.body.id as string;

    // Over-packing beyond the ordered quantity is refused (6 + 5 > 10).
    const over = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 5 }],
    });
    expect(over.status).toBe(409);

    // The remainder packs fine.
    const rest = await api('POST', '/api/v1/packages', tokenA, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 4 }],
    });
    expect(rest.status).toBe(201);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'wms.package.create' } });
    expect(audit).not.toBeNull();
  });

  it('WMS-012: staging and shipping are ordered, audited status flips', async () => {
    const staged = await api('POST', `/api/v1/packages/${packageId}/stage`, tokenA);
    expect(staged.status).toBe(201);
    expect(staged.body.status).toBe('STAGED');

    // Cannot stage twice.
    const again = await api('POST', `/api/v1/packages/${packageId}/stage`, tokenA);
    expect(again.status).toBe(409);

    const shipped = await api('POST', `/api/v1/packages/${packageId}/ship`, tokenA);
    expect(shipped.body.status).toBe('SHIPPED');

    const list = await api('GET', `/api/v1/packages?orderId=${orderId}`, tokenA);
    expect((list.body.packages as unknown[]).length).toBe(2);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'wms.package.transition' },
    });
    expect(audit).not.toBeNull();
  });

  it('AUTHZ: packing needs inventory.adjust', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s103a', subject: 'idp|s103-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko103@primjer.example',
      displayName: 'Niko103',
      idpSubject: 'idp|s103-nobody',
    });
    const denied = await api('POST', '/api/v1/packages', stranger, {
      orderId,
      lines: [{ orderLineId: lineId, quantity: 1 }],
    });
    expect(denied.status).toBe(403);
  });
});
