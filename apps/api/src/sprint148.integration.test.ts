import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 148 acceptance tests: container / import tracking (PROC-010)
 * — ISO-numbered containers linked to purchase orders move through a
 * forward-only audited lifecycle with an in-transit desk view.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 148 — container tracking', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s148a', subject: 'idp|s148-admin' });

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
      `TRUNCATE TABLE "container", "rfq_quote", "rfq",
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
      slug: 'test-s148a',
      name: 'Sprint148 Tenant',
      initialAdmin: {
        email: 'admin@s148a.example',
        displayName: 'S148 Admin',
        idpSubject: 'idp|s148-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH148',
      name: 'Sprint148 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 148' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN148',
      name: 'FIN148 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN148-STD',
      name: 'FIN148 Std',
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

  let containerId = '';

  it('PROC-010: containers are created with ISO numbers, linked to POs', async () => {
    const bad = await api('POST', '/api/v1/containers', tokenA, {
      containerNumber: 'NOT-A-NUM12',
    });
    expect(bad.status).toBe(400);

    const created = await api('POST', '/api/v1/containers', tokenA, {
      containerNumber: 'MSKU1234567',
      poId,
      carrier: 'Maersk',
      eta: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      notes: 'Kontejner iz Šangaja',
    });
    expect(created.status).toBe(201);
    containerId = created.body.id as string;
    expect(created.body.status).toBe('BOOKED');
    expect(created.body.poNumber).toContain('PO-');

    const duplicate = await api('POST', '/api/v1/containers', tokenA, {
      containerNumber: 'MSKU1234567',
    });
    expect(duplicate.status).toBe(409);

    const ghostPo = await api('POST', '/api/v1/containers', tokenA, {
      containerNumber: 'MSKU7654321',
      poId: '00000000-0000-0000-0000-000000000000',
    });
    expect(ghostPo.status).toBe(404);
  });

  it('PROC-010: the lifecycle advances forward one step at a time', async () => {
    const step1 = await api('POST', `/api/v1/containers/${containerId}/advance`, tokenA, {});
    expect(step1.status).toBe(201);
    expect(step1.body.status).toBe('AT_ORIGIN');
    const step2 = await api('POST', `/api/v1/containers/${containerId}/advance`, tokenA, {
      eta: new Date(Date.now() + 18 * 86_400_000).toISOString(),
      notes: 'Ukrcan, ranija ETA.',
    });
    expect(step2.body.status).toBe('ON_WATER');
  });

  it('PROC-010: the in-transit desk lists undelivered containers by ETA', async () => {
    await api('POST', '/api/v1/containers', tokenA, {
      containerNumber: 'HLXU9999990',
      eta: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    const desk = await api('GET', '/api/v1/containers/in-transit', tokenA);
    expect(desk.status).toBe(200);
    const rows = desk.body.containers as Array<{ containerNumber: string }>;
    expect(rows.length).toBe(2);
    expect(rows[0]?.containerNumber).toBe('HLXU9999990');
  });

  it('PROC-010: delivered containers cannot advance further', async () => {
    for (let i = 0; i < 3; i += 1) {
      await api('POST', `/api/v1/containers/${containerId}/advance`, tokenA, {});
    }
    const delivered = await api('GET', '/api/v1/containers?status=DELIVERED', tokenA);
    expect((delivered.body.containers as unknown[]).length).toBe(1);
    const beyond = await api('POST', `/api/v1/containers/${containerId}/advance`, tokenA, {});
    expect(beyond.status).toBe(409);
  });

  it('AUTHZ: container tracking needs purchase permissions', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s148a', subject: 'idp|s148-nobody' });
    const denied = await api('GET', '/api/v1/containers', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
