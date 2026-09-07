import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 092 acceptance tests: cost-aware pricing (CPQ-010) — price
 * suggestions from standard cost plus target margin, and a quote-line
 * floor that refuses selling below cost plus the configured minimum
 * margin.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 092 — cost-aware pricing', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s92a', subject: 'idp|s92-admin' });

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
      slug: 'test-s92a',
      name: 'Sprint92 Tenant',
      initialAdmin: {
        email: 'admin@s92a.example',
        displayName: 'S92 Admin',
        idpSubject: 'idp|s92-admin',
      },
    });
    // Minimum margin: 10% over standard cost.
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { sales: { minMarginPct: 10 } },
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'CAP92',
      name: 'CAP92 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'CAP92-STD',
      name: 'CAP92 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    // Standard cost 100 → floor at 10% margin = 110.
    await api('POST', `/api/v1/finance/valuation/skus/${skuId}/cost`, tokenA, { cost: 100 });

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devedesetdva',
      company: 'Kupac92 d.o.o.',
      email: 'kupac92@primjer.example',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'PL92',
      name: 'Sprint92 list',
      currency: 'EUR',
    });
    priceListId = list.body.id as string;
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId,
      unitPrice: 120,
    });
    await api('POST', `/api/v1/price-lists/${priceListId}/publish`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CPQ-010: suggestions propose cost plus target margin', async () => {
    const r = await api('GET', '/api/v1/price-lists/cost-suggestions?marginPct=25', tokenA);
    expect(r.status).toBe(200);
    const row = (
      r.body.suggestions as Array<{ code: string; standardCost: string; suggested: string }>
    ).find((x) => x.code === 'CAP92-STD');
    expect(row).toBeDefined();
    expect(row?.standardCost).toBe('100.00');
    expect(row?.suggested).toBe('125.00');
  });

  it('CPQ-010: quoting below the cost floor is refused; above it passes', async () => {
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const quoteId = quote.body.id as string;

    // 120 with 15% discount → 102 net, below floor 110 → refused.
    const refused = await api('POST', `/api/v1/quotes/${quoteId}/lines`, tokenA, {
      skuId,
      quantity: 1,
      discountPct: 15,
    });
    expect(refused.status).toBe(409);

    // 120 with 5% discount → 114 net, above floor 110 → accepted.
    const accepted = await api('POST', `/api/v1/quotes/${quoteId}/lines`, tokenA, {
      skuId,
      quantity: 1,
      discountPct: 5,
    });
    expect(accepted.status).toBe(201);
    const line = (accepted.body.lines as Array<{ netUnitPrice: string }>)[0];
    expect(Number(line?.netUnitPrice)).toBeCloseTo(114, 5);
  });

  it('AUTHZ: cost suggestions need pricing.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s92a', subject: 'idp|s92-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko92@primjer.example',
      displayName: 'Niko92',
      idpSubject: 'idp|s92-nobody',
    });
    const denied = await api('GET', '/api/v1/price-lists/cost-suggestions', stranger);
    expect(denied.status).toBe(403);
  });
});
