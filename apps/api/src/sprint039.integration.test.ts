import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 039 acceptance tests: rule-based automatic discounts (CPQ) —
 * governed rule CRUD, best-match resolution on quote lines (specificity
 * then percentage), explicit overrides, and validity windows.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 039 — discount rules', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s39a', subject: 'idp|s39-admin' });

  let accountId = '';
  let skuId = '';
  let priceListId = '';
  let genericRuleId = '';

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

  async function newQuoteLine(discountPct?: number) {
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const withLine = await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
      ...(discountPct !== undefined ? { discountPct } : {}),
    });
    const lines = withLine.body.lines as Array<{ discountPct: string; netUnitPrice: string }>;
    return lines[0]!;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "discount_rule", "user_credential",
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
      slug: 'test-s39a',
      name: 'Sprint39 Tenant',
      initialAdmin: {
        email: 'admin@s39a.example',
        displayName: 'S39 Admin',
        idpSubject: 'idp|s39-admin',
      },
    });

    // Catalog + price list + customer.
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'D39', name: 'D39' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'D39-STD',
      name: 'D39 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);

    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'PL39',
      name: 'List 39',
      currency: 'EUR',
    });
    priceListId = list.body.id as string;
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId,
      unitPrice: 100,
    });
    await api('POST', `/api/v1/price-lists/${priceListId}/publish`, tokenA);

    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Kupac39 d.o.o.',
    });
    const account = await api('POST', '/api/v1/crm/accounts', tokenA, {
      partyId: party.body.id,
    });
    accountId = account.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CPQ: rules are governed, validated and audited', async () => {
    const bad = await api('POST', '/api/v1/discount-rules', tokenA, {
      name: 'Nemoguće',
      percentage: 150,
    });
    expect(bad.status).toBe(400);

    const generic = await api('POST', '/api/v1/discount-rules', tokenA, {
      name: 'Spring 5%',
      percentage: 5,
    });
    expect(generic.status).toBe(201);
    genericRuleId = generic.body.id as string;

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'cpq.discount_rule.create' },
    });
    expect(audit).not.toBeNull();
  });

  it('CPQ: the best matching rule sets the default line discount', async () => {
    // Only the generic 5% rule exists.
    const line1 = await newQuoteLine();
    expect(Number(line1.discountPct)).toBe(5);
    expect(Number(line1.netUnitPrice)).toBe(95);

    // A more specific account rule wins even at a lower percentage… no —
    // specificity first: account-scoped 3% beats generic 5%.
    await api('POST', '/api/v1/discount-rules', tokenA, {
      name: 'Kupac39 special',
      percentage: 3,
      accountId,
    });
    const line2 = await newQuoteLine();
    expect(Number(line2.discountPct)).toBe(3);

    // An explicit discount overrides every rule.
    const line3 = await newQuoteLine(1);
    expect(Number(line3.discountPct)).toBe(1);
  });

  it('CPQ: deactivated and out-of-window rules stop applying', async () => {
    // Remove the account rule; deactivate the generic one.
    const rules = await api('GET', '/api/v1/discount-rules', tokenA);
    for (const rule of rules.body.rules as Array<{ id: string; name: string }>) {
      if (rule.name === 'Kupac39 special') {
        await api('PUT', `/api/v1/discount-rules/${rule.id}/active`, tokenA, { active: false });
      }
    }
    await api('PUT', `/api/v1/discount-rules/${genericRuleId}/active`, tokenA, { active: false });
    const line = await newQuoteLine();
    expect(Number(line.discountPct)).toBe(0);

    // A rule valid only in the past never applies.
    await api('POST', '/api/v1/discount-rules', tokenA, {
      name: 'Expired promo',
      percentage: 50,
      validFrom: '2020-01-01T00:00:00Z',
      validTo: '2020-12-31T00:00:00Z',
    });
    const still = await newQuoteLine();
    expect(Number(still.discountPct)).toBe(0);
  });

  it('AUTHZ: managing rules needs pricing.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s39a', subject: 'idp|s39-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko39@primjer.example',
      displayName: 'Niko39',
      idpSubject: 'idp|s39-nobody',
    });
    const denied = await api('POST', '/api/v1/discount-rules', stranger, {
      name: 'Hak',
      percentage: 99,
    });
    expect(denied.status).toBe(403);
  });
});
