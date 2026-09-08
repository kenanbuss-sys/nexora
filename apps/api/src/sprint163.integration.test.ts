import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 163 acceptance tests: EDI (INT-007) — purchase orders go out
 * as canonical EDIFACT ORDERS interchanges, exactly once per
 * (connector, PO), with the document preserved in the audit trail.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 163 — EDI', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s163a', subject: 'idp|s163-admin' });

  let warehouseId = '';
  let supplierId = '';
  let skuId = '';
  let poId = '';

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
      `TRUNCATE TABLE "rfq_quote", "rfq",
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
      slug: 'test-s163a',
      name: 'Sprint163 Tenant',
      initialAdmin: {
        email: 'admin@s163a.example',
        displayName: 'S163 Admin',
        idpSubject: 'idp|s163-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH163',
      name: 'Sprint163 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 163' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN163',
      name: 'FIN163 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN163-STD',
      name: 'FIN163 Std',
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('INT-007: a PO goes out as an EDIFACT ORDERS interchange, exactly once', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'edi-gw', kind: 'edi', adapter: 'noop', config: {} },
            { key: 'shop', kind: 'commerce', adapter: 'noop', config: {} },
          ],
        },
      },
    });

    const first = await api('POST', '/api/v1/connectors/edi-gw/edi/orders', tokenA, { poId });
    expect(first.status).toBe(201);
    expect(first.body.existing).toBe(false);
    const document = first.body.document as string;
    expect(document).toContain("UNH+1+ORDERS:D:96A:UN'");
    expect(document).toContain('BGM+220+PO-');
    expect(document).toContain('LIN+1++FIN163-STD:BP');
    expect(document).toContain('MOA+128:500');

    const retry = await api('POST', '/api/v1/connectors/edi-gw/edi/orders', tokenA, { poId });
    expect(retry.body.existing).toBe(true);
    expect(retry.body.interchangeRef).toBe(first.body.interchangeRef);
  });

  it('INT-007: only EDI connectors send interchanges; unknown POs are 404', async () => {
    const wrong = await api('POST', '/api/v1/connectors/shop/edi/orders', tokenA, { poId });
    expect(wrong.status).toBe(409);
    const ghost = await api('POST', '/api/v1/connectors/edi-gw/edi/orders', tokenA, {
      poId: '00000000-0000-0000-0000-000000000000',
    });
    expect(ghost.status).toBe(404);
  });

  it('AUTHZ: EDI sending needs purchase.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s163a', subject: 'idp|s163-nobody' });
    const denied = await api('POST', '/api/v1/connectors/edi-gw/edi/orders', stranger, { poId });
    expect([401, 403]).toContain(denied.status);
  });
});
