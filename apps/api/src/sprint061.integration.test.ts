import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 061 acceptance tests: contract pricing (B2B-004/CPQ-014)
 * — customer-bound price lists resolve for their account only and
 * feed quote prices; other accounts are refused.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 061 — contract pricing', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s61a', subject: 'idp|s61-admin' });

  let warehouseId = '';
  let accountId = '';
  let skuId = '';
  let scarceSkuId = '';
  let contractListId = '';

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

  async function draftOrder(quantity: number, unitPrice: number): Promise<string> {
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId,
      quantity,
      unitPrice,
    });
    return order.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "serial_number", "bundle_component",
       "promotion_redemption", "promotion",
       "consent_record", "exchange_rate", "sales_team_member", "sales_team",
       "territory", "packaging_level", "sku_substitution", "discount_rule",
       "user_credential",
       "downtime_event", "work_center",
       "stock_count_line", "stock_count",
       "return_order_line", "return_order", "product_category",
       "security_event", "api_key",
       "webhook_delivery", "webhook_subscription",
       "budget", "cost_center",
       "comment", "attachment_blob", "attachment", "number_sequence",
       "portal_user", "payment", "invoice",
       "qc_inspection_item", "qc_inspection", "qc_plan_item", "qc_plan", "ncr",
       "work_order_operation", "work_order",
       "mrp_suggestion", "mrp_run", "planning_policy",
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
      slug: 'test-s61a',
      name: 'Sprint61 Tenant',
      initialAdmin: {
        email: 'admin@s61a.example',
        displayName: 'S61 Admin',
        idpSubject: 'idp|s61-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH61',
      name: 'Sprint61 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO61', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO61-STD',
      name: 'P53 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-PRO61',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE61',
      name: 'S61',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE61-STD',
      name: 'S61 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Pedesettri',
      company: 'Pedesettri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('B2B-004: a contract list serves only its account', async () => {
    // General list for everyone; contract list bound to accountA.
    const contract = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'CON61',
      name: 'Contract 61',
      currency: 'EUR',
      accountId,
    });
    expect(contract.status).toBe(201);
    contractListId = contract.body.id as string;
    await api('PUT', `/api/v1/price-lists/${contractListId}/entries`, tokenA, {
      skuId,
      unitPrice: 80,
    });
    await api('POST', `/api/v1/price-lists/${contractListId}/publish`, tokenA);

    // The contract resolves for its account…
    const found = await api('GET', `/api/v1/price-lists/contract/${accountId}`, tokenA);
    expect(found.status).toBe(200);
    expect((found.body.contract as { id: string }).id).toBe(contractListId);

    // …and a quote for a DIFFERENT account may not use it.
    const otherLead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Drugi61',
      company: 'Drugi61 d.o.o.',
    });
    const otherConverted = await api(
      'POST',
      `/api/v1/crm/leads/${otherLead.body.id}/convert`,
      tokenA,
      {},
    );
    const refused = await api('POST', '/api/v1/quotes', tokenA, {
      accountId: otherConverted.body.accountId,
      priceListId: contractListId,
    });
    expect(refused.status).toBe(400);
  });

  it('CPQ-014: the bound account quotes from its contract prices', async () => {
    const quote = await api('POST', '/api/v1/quotes', tokenA, {
      accountId,
      priceListId: contractListId,
    });
    expect(quote.status).toBe(201);
    const line = await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId,
      quantity: 1,
    });
    expect(line.status).toBe(201);
    const lines = line.body.lines as Array<{ netUnitPrice: string }>;
    expect(Number(lines[0]?.netUnitPrice)).toBe(80);
  });

  it('B2B-004: an account without a contract resolves null', async () => {
    const none = await api(
      'GET',
      `/api/v1/price-lists/contract/00000000-0000-4000-8000-000000000000`,
      tokenA,
    );
    expect(none.status).toBe(200);
    expect(none.body.contract).toBeNull();
  });

  it('AUTHZ: contract lookup needs pricing.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s61a', subject: 'idp|s61-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko61@primjer.example',
      displayName: 'Niko61',
      idpSubject: 'idp|s61-nobody',
    });
    const denied = await api('GET', `/api/v1/price-lists/contract/${accountId}`, stranger);
    expect(denied.status).toBe(403);
  });
});
