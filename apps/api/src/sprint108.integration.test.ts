import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 108 acceptance tests: warehouse labor tasks (WMS-024) — open
 * WMS documents become CORE work-queue tasks exactly once; the labor
 * queue joins tasks to document status.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 108 — labor tasks', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s108a', subject: 'idp|s108-admin' });

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
      `TRUNCATE TABLE "rfq_quote", "rfq",
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
      slug: 'test-s108a',
      name: 'Sprint108 Tenant',
      initialAdmin: {
        email: 'admin@s108a.example',
        displayName: 'S108 Admin',
        idpSubject: 'idp|s108-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH108',
      name: 'Sprint108 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'PUT108',
      name: 'PUT108 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PUT108-STD',
      name: 'PUT108 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s108',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WMS-024: open documents become tasks exactly once', async () => {
    const receiving = await api('POST', '/api/v1/wms/orders', tokenA, {
      orderType: 'RECEIVING',
      warehouseId,
      reference: 'ASN-108',
      lines: [{ skuId, expectedQty: 5 }],
    });
    expect(receiving.status).toBe(201);

    const first = await api('POST', '/api/v1/wms/orders/labor-generate', tokenA);
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(1);
    expect(first.body.skipped).toBe(0);

    // Re-run: nothing duplicates.
    const again = await api('POST', '/api/v1/wms/orders/labor-generate', tokenA);
    expect(again.body.created).toBe(0);
    expect(again.body.skipped).toBe(1);

    const queue = await api('GET', '/api/v1/wms/orders/labor-queue', tokenA);
    const rows = queue.body.queue as Array<{ title: string; wmsOrderStatus: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toContain('RECEIVING');
    expect(rows[0]?.wmsOrderStatus).toBe('DRAFT');

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'wms.labor.generate' } });
    expect(audit).not.toBeNull();
  });

  it('WMS-024: completed documents stop generating tasks', async () => {
    const done = await prisma.wmsOrder.findFirst({ where: { reference: 'ASN-108' } });
    await prisma.wmsOrder.update({
      where: { id: done?.id ?? '' },
      data: { status: 'CANCELLED' },
    });
    const run = await api('POST', '/api/v1/wms/orders/labor-generate', tokenA);
    expect(run.body.open).toBe(0);
    expect(run.body.created).toBe(0);
  });

  it('AUTHZ: generating labor tasks needs inventory.adjust', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s108a', subject: 'idp|s108-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko108@primjer.example',
      displayName: 'Niko108',
      idpSubject: 'idp|s108-nobody',
    });
    const denied = await api('POST', '/api/v1/wms/orders/labor-generate', stranger);
    expect(denied.status).toBe(403);
  });
});
