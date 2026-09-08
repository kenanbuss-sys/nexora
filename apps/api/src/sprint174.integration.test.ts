import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 174 acceptance tests: project profitability (FIN-018) —
 * revenue from project-tagged orders and cost from project-attributed
 * supplier invoices roll into one margin view per project.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 174 — project profitability', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s174a', subject: 'idp|s174-admin' });

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
      slug: 'test-s174a',
      name: 'Sprint174 Tenant',
      initialAdmin: {
        email: 'admin@s174a.example',
        displayName: 'S174 Admin',
        idpSubject: 'idp|s174-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH174',
      name: 'Sprint174 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, { name: 'Dobavljac 174' });
    supplierId = supplier.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FIN174',
      name: 'FIN174 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FIN174-STD',
      name: 'FIN174 Std',
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

  it('FIN-018: revenue and cost roll up per project', async () => {
    // Cost side: receive + supplier invoice attributed to MOST-1.
    await api('POST', `/api/v1/purchase-orders/${poId}/receive`, tokenA, {
      receiptKey: 's174-all',
      lines: [{ lineId, quantity: 10 }],
    });
    const ap = await api('POST', '/api/v1/finance/invoices/supplier', tokenA, {
      poId,
      dueInDays: 14,
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { fin: { dimensions: [{ key: 'project' }] } },
    });
    await api('POST', `/api/v1/finance/invoices/${ap.body.id}/dimensions`, tokenA, {
      dimensions: { project: 'MOST-1' },
    });

    // Revenue side: a project-tagged order, fulfilled and invoiced.
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Projektni kupac',
      company: 'Mostogradnja d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId,
      currency: 'EUR',
      projectRef: 'MOST-1',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity: 8,
      unitPrice: 100,
    });
    await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA, {});
    await api('POST', `/api/v1/orders/${order.body.id}/fulfill`, tokenA);
    const ar = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId: order.body.id,
    });
    expect(ar.status).toBe(201);

    const report = await api('GET', '/api/v1/finance/projects', tokenA);
    expect(report.status).toBe(200);
    const rows = report.body.rows as Array<Record<string, unknown>>;
    const most = rows.find((r) => r.project === 'MOST-1');
    expect(Number(most?.revenue)).toBe(800);
    expect(Number(most?.cost)).toBe(500);
    expect(Number(most?.margin)).toBe(300);
    expect(most?.marginPct).toBe('37.5');
  });

  it('FIN-018: untagged activity stays out of the report', async () => {
    const report = await api('GET', '/api/v1/finance/projects', tokenA);
    expect((report.body.rows as unknown[]).length).toBe(1);
  });

  it('AUTHZ: project profitability needs finance.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s174a', subject: 'idp|s174-nobody' });
    const denied = await api('GET', '/api/v1/finance/projects', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
