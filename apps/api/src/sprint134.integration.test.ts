import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 134 acceptance tests: genealogy (MES-020) — what a work order
 * consumed with lots, and where a lot was used, straight from the
 * immutable ledger.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 134 — genealogy', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s134a', subject: 'idp|s134-admin' });

  let woId = '';

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
      `TRUNCATE TABLE "rfq_quote", "rfq", "work_order_operation", "work_order",
       "downtime_event", "work_center",
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
      slug: 'test-s134a',
      name: 'Sprint134 Tenant',
      initialAdmin: {
        email: 'admin@s134a.example',
        displayName: 'S134 Admin',
        idpSubject: 'idp|s134-admin',
      },
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC134A',
      name: 'Press A',
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC134B',
      name: 'Press B',
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'GEN134',
      name: 'GEN134 product',
    });
    const lamp = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'GEN134-STD',
      name: 'GEN134 Std',
      baseUom: 'pcs',
    });
    const lampId = lamp.body.id as string;
    await api('POST', `/api/v1/skus/${lampId}/activate`, tokenA);
    const bolt = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'GEN134-BOLT',
      name: 'GEN134 Bolt',
      baseUom: 'pcs',
    });
    const boltId = bolt.body.id as string;
    await api('POST', `/api/v1/skus/${boltId}/activate`, tokenA);
    await api('POST', `/api/v1/skus/${boltId}/lot-policy`, tokenA, { lotTracked: true });

    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: boltId,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Press',
      workCenter: 'WC134A',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH134',
      name: 'Sprint134 warehouse',
    });
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: boltId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s134-bolts',
      lotNumber: 'LOT-134-A',
    });

    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId: warehouse.body.id,
      quantity: 2,
    });
    woId = wo.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MES-020: genealogy lists consumed components with their lots', async () => {
    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);

    const genealogy = await api('GET', `/api/v1/work-orders/${woId}/genealogy`, tokenA);
    expect(genealogy.status).toBe(200);
    const consumed = genealogy.body.consumed as Array<{
      code: string;
      quantity: string;
      lotNumber: string | null;
    }>;
    expect(consumed).toHaveLength(1);
    expect(consumed[0]?.code).toBe('GEN134-BOLT');
    expect(Number(consumed[0]?.quantity)).toBe(2);
    expect(consumed[0]?.lotNumber).toBe('LOT-134-A');
  });

  it('MES-020: where-used answers the recall question for a lot', async () => {
    const used = await api('GET', '/api/v1/work-orders/where-used?lot=LOT-134-A', tokenA);
    const rows = used.body.workOrders as Array<{ workOrderId: string; quantity: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.workOrderId).toBe(woId);
    expect(Number(rows[0]?.quantity)).toBe(2);

    const empty = await api('GET', '/api/v1/work-orders/where-used?lot=LOT-NEMA', tokenA);
    expect((empty.body.workOrders as unknown[]).length).toBe(0);
  });

  it('AUTHZ: genealogy needs production.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s134a', subject: 'idp|s134-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko134@primjer.example',
      displayName: 'Niko134',
      idpSubject: 'idp|s134-nobody',
    });
    const denied = await api('GET', `/api/v1/work-orders/${woId}/genealogy`, stranger);
    expect(denied.status).toBe(403);
  });
});
