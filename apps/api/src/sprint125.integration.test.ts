import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 125 acceptance tests: endless aisle (COM-009) — one kiosk
 * call captures SKU codes, confirms with backorders allowed and flags
 * pickup; unknown codes are reported, everything audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 125 — endless aisle', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s125a', subject: 'idp|s125-admin' });

  let warehouseId = '';
  let skuId = '';
  let accountId = '';

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
      slug: 'test-s125a',
      name: 'Sprint125 Tenant',
      initialAdmin: {
        email: 'admin@s125a.example',
        displayName: 'S125 Admin',
        idpSubject: 'idp|s125-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH125',
      name: 'Sprint125 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'EA125',
      name: 'EA125 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'EA125-STD',
      name: 'EA125 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Stodvadesetpet',
      company: 'Kupac125 d.o.o.',
      email: 'kupac125@primjer.example',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('COM-009: one call captures, confirms with backorder and flags pickup', async () => {
    // Only 2 in stock; the customer wants 5 — endless aisle takes it anyway.
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 2,
      idempotencyKey: 'receipt-s125',
    });
    const placed = await api('POST', '/api/v1/orders/endless-aisle', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [
        { code: 'EA125-STD', quantity: 5 },
        { code: 'NEPOSTOJI', quantity: 1 },
      ],
    });
    expect(placed.status).toBe(201);
    const order = placed.body.order as {
      id: string;
      status: string;
      fulfillmentType: string;
      lines: Array<{ backordered: boolean }>;
    };
    expect(order.status).toBe('CONFIRMED');
    expect(order.fulfillmentType).toBe('PICKUP');
    expect(order.lines[0]?.backordered).toBe(true);
    expect(placed.body.unknownCodes).toEqual(['NEPOSTOJI']);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'com.endless_aisle' } });
    expect(audit).not.toBeNull();
  });

  it('COM-009: nothing resolvable refuses the order', async () => {
    const refused = await api('POST', '/api/v1/orders/endless-aisle', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [{ code: 'SASVIM-NEPOZNAT', quantity: 1 }],
    });
    expect(refused.status).toBe(400);
  });

  it('AUTHZ: endless aisle needs order.create', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s125a', subject: 'idp|s125-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko125@primjer.example',
      displayName: 'Niko125',
      idpSubject: 'idp|s125-nobody',
    });
    const denied = await api('POST', '/api/v1/orders/endless-aisle', stranger, {
      accountId,
      warehouseId,
      currency: 'EUR',
      lines: [{ code: 'EA125-STD', quantity: 1 }],
    });
    expect(denied.status).toBe(403);
  });
});
