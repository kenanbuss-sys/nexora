import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 167 acceptance tests: mobile production (MES-019) —
 * production confirmations queued offline as scan events drain into
 * operation confirmations exactly once.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 167 — mobile production', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s167a', subject: 'idp|s167-admin' });

  let orderId = '';
  let accountId = '';
  let warehouseId = '';
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
      slug: 'test-s167a',
      name: 'Sprint167 Tenant',
      initialAdmin: {
        email: 'admin@s167a.example',
        displayName: 'S167 Admin',
        idpSubject: 'idp|s167-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH167',
      name: 'Sprint167 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PAK167',
      name: 'PAK167 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PAK167-STD',
      name: 'PAK167 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s167',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stotri',
      company: 'Stotri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
    warehouseId = warehouse.body.id as string;
    skuId = sku.body.id as string;
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId,
      quantity: 2,
      unitPrice: 5,
    });
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let woId = '';
  let opId = '';
  let deviceToken = '';

  it('MES-019: offline confirmations replay into operations exactly once', async () => {
    // Minimal BOM + routing so a work order can exist.
    const compProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'COMP167',
      name: 'Komponenta 167',
    });
    const compSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: compProduct.body.id,
      code: 'COMP167-STD',
      name: 'Komponenta 167 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${compSku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: compSku.body.id,
      movementType: 'RECEIPT',
      quantity: 100,
      idempotencyKey: 'receipt-s167-comp',
    });
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: compSku.body.id,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Montaža',
      workCenter: 'BENCH-167',
      runMinutesPerUnit: 1,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);
    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId,
      warehouseId,
      quantity: 10,
    });
    woId = wo.body.id as string;
    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    const detail = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    opId = (detail.body.operations as Array<{ id: string }>)[0]?.id as string;

    const registered = await api('POST', '/api/v1/devices', tokenA, {
      code: 'HH-167',
      name: 'Ručni 167',
      deviceType: 'SCANNER',
    });
    deviceToken = registered.body.enrollmentToken as string;
    await api('POST', '/api/v1/devices/enroll', tokenA, {
      enrollmentToken: deviceToken,
      appVersion: '1.0.0',
    });
    await api('POST', '/api/v1/scan-events', tokenA, {
      enrollmentToken: deviceToken,
      events: [
        {
          clientEventId: 'conf-167-1',
          kind: 'QR',
          value: `mes-conf:${woId}:${opId}:4`,
          capturedAt: new Date().toISOString(),
        },
        {
          clientEventId: 'conf-167-2',
          kind: 'QR',
          value: `mes-conf:${woId}:${opId}:3`,
          capturedAt: new Date().toISOString(),
        },
        {
          clientEventId: 'conf-167-3',
          kind: 'QR',
          value: 'mes-conf:nonsense',
          capturedAt: new Date().toISOString(),
        },
      ],
    });

    const drained = await api('POST', '/api/v1/work-orders/offline/confirmations', tokenA);
    expect(drained.status).toBe(201);
    expect(drained.body.scanned).toBe(3);
    expect(drained.body.applied).toBe(2);
    expect((drained.body.failed as unknown[]).length).toBe(1);

    const after = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    const op = (after.body.operations as Array<{ id: string; confirmedQty: string }>).find(
      (o) => o.id === opId,
    );
    expect(Number(op?.confirmedQty)).toBe(7);
  });

  it('MES-019: a second drain confirms nothing new', async () => {
    const again = await api('POST', '/api/v1/work-orders/offline/confirmations', tokenA);
    expect(again.body.applied).toBe(0);
    const after = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    const op = (after.body.operations as Array<{ id: string; confirmedQty: string }>).find(
      (o) => o.id === opId,
    );
    expect(Number(op?.confirmedQty)).toBe(7);
  });

  it('AUTHZ: draining needs production.execute', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s167a', subject: 'idp|s167-nobody' });
    const denied = await api('POST', '/api/v1/work-orders/offline/confirmations', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
