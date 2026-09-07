import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 128 acceptance tests: scan-first verification checks —
 * worker (VER-005), work order (VER-006), location (VER-010) and
 * operation sequence (VER-012), each audited pass/fail.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 128 — verification checks', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s128a', subject: 'idp|s128-admin' });

  let woId = '';
  let opId = '';

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
      slug: 'test-s128a',
      name: 'Sprint128 Tenant',
      initialAdmin: {
        email: 'admin@s128a.example',
        displayName: 'S128 Admin',
        idpSubject: 'idp|s128-admin',
      },
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC128A',
      name: 'Press A',
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC128B',
      name: 'Press B',
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'VC128',
      name: 'VC128 product',
    });
    const lamp = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'VC128-STD',
      name: 'VC128 Std',
      baseUom: 'pcs',
    });
    const lampId = lamp.body.id as string;
    await api('POST', `/api/v1/skus/${lampId}/activate`, tokenA);
    const bolt = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'VC128-BOLT',
      name: 'VC128 Bolt',
      baseUom: 'pcs',
    });
    const boltId = bolt.body.id as string;
    await api('POST', `/api/v1/skus/${boltId}/activate`, tokenA);

    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: boltId,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Press',
      workCenter: 'WC128A',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH128',
      name: 'Sprint128 warehouse',
    });
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: boltId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s128-bolts',
    });

    const wo = await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId: warehouse.body.id,
      quantity: 2,
    });
    woId = wo.body.id as string;
    opId = (wo.body.operations as Array<{ id: string }>)[0]?.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('VER-005/006: worker and work-order scans verify against live state', async () => {
    const worker = await api('POST', '/api/v1/scan-events/worker-check', tokenA, {
      idpSubject: 'idp|s128-admin',
    });
    expect(worker.status).toBe(201);
    expect(worker.body.ok).toBe(true);
    const ghost = await api('POST', '/api/v1/scan-events/worker-check', tokenA, {
      idpSubject: 'idp|ne-postoji',
    });
    expect(ghost.body.ok).toBe(false);

    const wo = await api('GET', `/api/v1/work-orders/${woId}`, tokenA);
    const check = await api('POST', '/api/v1/scan-events/work-order-check', tokenA, {
      woNumber: wo.body.woNumber,
      expectedStatus: 'PLANNED',
    });
    expect(check.body.ok).toBe(true);
    const wrongStatus = await api('POST', '/api/v1/scan-events/work-order-check', tokenA, {
      woNumber: wo.body.woNumber,
      expectedStatus: 'COMPLETED',
    });
    expect(wrongStatus.body.ok).toBe(false);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'ver.worker_check' } });
    expect(audit).not.toBeNull();
  });

  it('VER-010/012: location and sequence scans verify', async () => {
    const warehouses = await api('GET', '/api/v1/warehouses', tokenA);
    const warehouseId = (warehouses.body.warehouses as Array<{ id: string }>)[0]?.id as string;
    await api('POST', '/api/v1/warehouses/locations', tokenA, {
      warehouseId,
      code: 'B-128',
    });
    const good = await api('POST', '/api/v1/scan-events/location-check', tokenA, {
      warehouseId,
      code: 'B-128',
    });
    expect(good.body.ok).toBe(true);
    const bad = await api('POST', '/api/v1/scan-events/location-check', tokenA, {
      warehouseId,
      code: 'NE-POSTOJI',
    });
    expect(bad.body.ok).toBe(false);

    const sequence = await api('POST', '/api/v1/scan-events/sequence-check', tokenA, {
      workOrderId: woId,
      operationId: opId,
    });
    expect(sequence.body.ok).toBe(true);
    expect(sequence.body.expectedSeq).toBe(sequence.body.scannedSeq);
  });

  it('AUTHZ: verification checks need their read permissions', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s128a', subject: 'idp|s128-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko128@primjer.example',
      displayName: 'Niko128',
      idpSubject: 'idp|s128-nobody',
    });
    const denied = await api('POST', '/api/v1/scan-events/worker-check', stranger, {
      idpSubject: 'idp|s128-admin',
    });
    expect(denied.status).toBe(403);
  });
});
