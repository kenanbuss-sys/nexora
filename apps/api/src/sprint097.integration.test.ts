import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 097 acceptance tests: formula pricing (CPQ-009) — per-SKU
 * price formulas over cost and qty from versioned configuration,
 * evaluated with a strict arithmetic grammar, and used as the fallback
 * when a price list has no explicit entry.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 097 — formula pricing', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s97a', subject: 'idp|s97-admin' });

  let skuId = '';
  let accountId = '';
  let priceListId = '';

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
      slug: 'test-s97a',
      name: 'Sprint97 Tenant',
      initialAdmin: {
        email: 'admin@s97a.example',
        displayName: 'S97 Admin',
        idpSubject: 'idp|s97-admin',
      },
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'FOR97',
      name: 'FOR97 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'FOR97-STD',
      name: 'FOR97 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', `/api/v1/finance/valuation/skus/${skuId}/cost`, tokenA, { cost: 50 });

    // cost * 1.4 + 5 → 75 at cost 50; qty gives a volume kick-down.
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        sales: {
          pricingFormulas: [{ skuCode: 'FOR97-STD', formula: 'cost * 1.4 + 5 - qty / 10' }],
        },
      },
    });

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devedesetsedam',
      company: 'Kupac97 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    // Price list with NO entry for the SKU — formula is the fallback.
    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'PL97',
      name: 'Sprint97 list',
      currency: 'EUR',
    });
    priceListId = list.body.id as string;
    await api('POST', `/api/v1/price-lists/${priceListId}/publish`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CPQ-009: the formula endpoint evaluates cost and qty', async () => {
    const price = await api(
      'GET',
      `/api/v1/price-lists/formula-price?skuId=${skuId}&qty=10`,
      tokenA,
    );
    expect(price.status).toBe(200);
    const value = price.body.price as { unitPrice: string; formula: string };
    // 50 * 1.4 + 5 - 10/10 = 74
    expect(Number(value.unitPrice)).toBeCloseTo(74, 4);
  });

  it('CPQ-009: quotes fall back to the formula when the list has no entry', async () => {
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const line = await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
    });
    expect(line.status).toBe(201);
    const first = (line.body.lines as Array<{ listUnitPrice: string }>)[0];
    expect(Number(first?.listUnitPrice)).toBeCloseTo(74, 4);
  });

  it('CPQ-009: a malformed formula never prices anything', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        sales: { pricingFormulas: [{ skuCode: 'FOR97-STD', formula: 'cost * (1.4' }] },
      },
    });
    const price = await api('GET', `/api/v1/price-lists/formula-price?skuId=${skuId}`, tokenA);
    expect(price.body.price).toBeNull();
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const refused = await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId,
      quantity: 1,
    });
    expect(refused.status).toBe(404);
  });
});
