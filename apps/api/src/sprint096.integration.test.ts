import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 096 acceptance tests: compatibility rules (CPQ-008) — SKU
 * pairs declared incompatible in versioned configuration cannot be
 * quoted together; the rule set is fully configuration-driven.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 096 — compatibility rules', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s96a', subject: 'idp|s96-admin' });

  let skuAId = '';
  let skuBId = '';
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

  async function makeSku(code: string): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
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
      slug: 'test-s96a',
      name: 'Sprint96 Tenant',
      initialAdmin: {
        email: 'admin@s96a.example',
        displayName: 'S96 Admin',
        idpSubject: 'idp|s96-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { sales: { incompatibleSkuPairs: [['INC96A-STD', 'INC96B-STD']] } },
    });

    skuAId = await makeSku('INC96A');
    skuBId = await makeSku('INC96B');

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devedesetsest',
      company: 'Kupac96 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'PL96',
      name: 'Sprint96 list',
      currency: 'EUR',
    });
    priceListId = list.body.id as string;
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId: skuAId,
      unitPrice: 10,
    });
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId: skuBId,
      unitPrice: 20,
    });
    await api('POST', `/api/v1/price-lists/${priceListId}/publish`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CPQ-008: an incompatible pair cannot land on the same quote', async () => {
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const quoteId = quote.body.id as string;

    const first = await api('POST', `/api/v1/quotes/${quoteId}/lines`, tokenA, {
      skuId: skuAId,
      quantity: 1,
    });
    expect(first.status).toBe(201);

    const clash = await api('POST', `/api/v1/quotes/${quoteId}/lines`, tokenA, {
      skuId: skuBId,
      quantity: 1,
    });
    expect(clash.status).toBe(409);
    expect(JSON.stringify(clash.body)).toContain('incompatible');
  });

  it('CPQ-008: each SKU quotes fine on its own', async () => {
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const alone = await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId: skuBId,
      quantity: 2,
    });
    expect(alone.status).toBe(201);
  });

  it('CPQ-008: the rule set is versioned configuration — clearing it lifts the block', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { sales: { incompatibleSkuPairs: [] } },
    });
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId: skuAId,
      quantity: 1,
    });
    const nowFine = await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId: skuBId,
      quantity: 1,
    });
    expect(nowFine.status).toBe(201);
  });
});
