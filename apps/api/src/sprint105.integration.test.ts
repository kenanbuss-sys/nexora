import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 105 acceptance tests: landed cost (PROC-011) — freight/duty/
 * insurance recorded against a PO and allocated over received value,
 * producing landed unit costs; audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 0105 — three-way match', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s105a', subject: 'idp|s105-admin' });

  let warehouseId = '';
  let supplierId = '';
  let skuId = '';
  let poId = '';
  let lineId = '';

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
      `TRUNCATE TABLE "landed_cost", "package_line", "package", "rfq_quote", "rfq",
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
      slug: 'test-s105a',
      name: 'Sprint105 Tenant',
      initialAdmin: {
        email: 'admin@s105a.example',
        displayName: 'S105 Admin',
        idpSubject: 'idp|s105-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH105',
      name: 'Sprint105 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 105' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'TWM105',
      name: 'TWM105 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'TWM105-STD',
      name: 'TWM105 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);

    // Requisition below the approval threshold: 10 pcs @ 50 = 500.
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
      estUnitPrice: 50,
    });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, tokenA);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId: requisition.body.id,
      supplierId,
      warehouseId,
    });
    poId = po.body.id as string;
    lineId = (po.body.lines as Array<{ id: string }>)[0]?.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PROC-011: costs allocate over received value into landed unit costs', async () => {
    // Receive all 10 @ 50 → received value 500.
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 'lc105-all',
      lines: [{ lineId, quantity: 10 }],
    });
    const freight = await api('POST', `/api/v1/purchase-orders/${poId}/landed-costs`, tokenA, {
      costType: 'FREIGHT',
      amount: 80,
      note: 'Prevoz iz luke',
    });
    expect(freight.status).toBe(201);
    await api('POST', `/api/v1/purchase-orders/${poId}/landed-costs`, tokenA, {
      costType: 'DUTY',
      amount: 20,
    });

    const report = await api('GET', `/api/v1/purchase-orders/${poId}/landed-costs`, tokenA);
    expect(report.status).toBe(200);
    expect(report.body.totalExtra).toBe('100.00');
    const line = (
      report.body.lines as Array<{ allocatedExtra: string; landedUnitCost: string }>
    )[0];
    // All value on one line → full 100 allocated; landed unit = 50 + 10.
    expect(line?.allocatedExtra).toBe('100.00');
    expect(line?.landedUnitCost).toBe('60.0000');

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'proc.landed_cost.add' } });
    expect(audit).not.toBeNull();
  });

  it('PROC-011: invalid amounts and unknown POs are refused', async () => {
    const bad = await api('POST', `/api/v1/purchase-orders/${poId}/landed-costs`, tokenA, {
      costType: 'OTHER',
      amount: -5,
    });
    expect(bad.status).toBe(400);
    const missing = await api(
      'POST',
      '/api/v1/purchase-orders/00000000-0000-0000-0000-000000000000/landed-costs',
      tokenA,
      { costType: 'OTHER', amount: 5 },
    );
    expect(missing.status).toBe(404);
  });

  it('AUTHZ: adding landed costs needs purchase.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s105a', subject: 'idp|s105-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko105@primjer.example',
      displayName: 'Niko105',
      idpSubject: 'idp|s105-nobody',
    });
    const denied = await api('POST', `/api/v1/purchase-orders/${poId}/landed-costs`, stranger, {
      costType: 'FREIGHT',
      amount: 10,
    });
    expect(denied.status).toBe(403);
  });
});
