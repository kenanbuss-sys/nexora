import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 112 acceptance tests: framework orders (PROC-006) — blanket
 * agreements with guarded ceiling draw-down; call-offs open POs at the
 * agreed price and exhaust the agreement.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 0112 — three-way match', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s112a', subject: 'idp|s112-admin' });

  let warehouseId = '';
  let supplierId = '';
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
      `TRUNCATE TABLE "framework_agreement", "landed_cost", "package_line", "package", "rfq_quote", "rfq",
       "portal_user", "payment", "invoice",
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
      slug: 'test-s112a',
      name: 'Sprint112 Tenant',
      initialAdmin: {
        email: 'admin@s112a.example',
        displayName: 'S112 Admin',
        idpSubject: 'idp|s112-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH112',
      name: 'Sprint112 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 112' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'TWM112',
      name: 'TWM112 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'TWM112-STD',
      name: 'TWM112 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let agreementId = '';

  it('PROC-006: agreements draw down through call-offs at the agreed price', async () => {
    const agreement = await api('POST', '/api/v1/framework-agreements', tokenA, {
      supplierId,
      skuId,
      unitPrice: 12.5,
      maxQuantity: 100,
    });
    expect(agreement.status).toBe(201);
    expect(agreement.body.agreementNumber).toBe('FA-000001');
    agreementId = agreement.body.id as string;

    const callOff = await api(
      `POST`,
      `/api/v1/framework-agreements/${agreementId}/call-off`,
      tokenA,
      {
        warehouseId,
        quantity: 60,
      },
    );
    expect(callOff.status).toBe(201);
    expect(callOff.body.poNumber).toMatch(/^PO-/);
    const line = (callOff.body.lines as Array<{ unitPrice: string; quantity: string }>)[0];
    expect(Number(line?.unitPrice)).toBe(12.5);
    expect(Number(line?.quantity)).toBe(60);

    const list = await api('GET', '/api/v1/framework-agreements', tokenA);
    const row = (list.body.agreements as Array<{ calledQuantity: string; status: string }>)[0];
    expect(Number(row?.calledQuantity)).toBe(60);
    expect(row?.status).toBe('ACTIVE');

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'proc.framework.calloff' },
    });
    expect(audit).not.toBeNull();
  });

  it('PROC-006: the ceiling cannot be oversubscribed; exhaustion flips status', async () => {
    const over = await api(`POST`, `/api/v1/framework-agreements/${agreementId}/call-off`, tokenA, {
      warehouseId,
      quantity: 50,
    });
    expect(over.status).toBe(409);

    const rest = await api(`POST`, `/api/v1/framework-agreements/${agreementId}/call-off`, tokenA, {
      warehouseId,
      quantity: 40,
    });
    expect(rest.status).toBe(201);

    const list = await api('GET', '/api/v1/framework-agreements', tokenA);
    const row = (list.body.agreements as Array<{ status: string }>)[0];
    expect(row?.status).toBe('EXHAUSTED');

    const done = await api(`POST`, `/api/v1/framework-agreements/${agreementId}/call-off`, tokenA, {
      warehouseId,
      quantity: 1,
    });
    expect(done.status).toBe(409);
  });

  it('AUTHZ: agreements need purchase.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s112a', subject: 'idp|s112-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko112@primjer.example',
      displayName: 'Niko112',
      idpSubject: 'idp|s112-nobody',
    });
    const denied = await api('POST', '/api/v1/framework-agreements', stranger, {
      supplierId,
      skuId,
      unitPrice: 1,
      maxQuantity: 1,
    });
    expect(denied.status).toBe(403);
  });
});
