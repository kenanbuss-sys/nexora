import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 099 acceptance tests: claims/service (B2B-013) — portal users
 * file claims about their own orders; each claim lands as a CRM
 * support case bound to the account and order, audited, and only own
 * claims are listed.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 099 — portal claims', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s99a', subject: 'idp|s99-admin' });
  const customerToken = identity.signToken({
    tenantSlug: 'test-s99a',
    subject: 'idp|s99-customer',
  });

  let skuId = '';
  let strangeSkuId = '';
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
      slug: 'test-s99a',
      name: 'Sprint99 Tenant',
      initialAdmin: {
        email: 'admin@s99a.example',
        displayName: 'S99 Admin',
        idpSubject: 'idp|s99-admin',
      },
    });
    await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH99', name: 'Sprint99 warehouse' });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'POR99',
      name: 'POR99 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'POR99-STD',
      name: 'POR99 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const strangeSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'POR99-OFF',
      name: 'POR99 Off-contract',
      baseUom: 'pcs',
    });
    strangeSkuId = strangeSku.body.id as string;
    await api('POST', `/api/v1/skus/${strangeSkuId}/activate`, tokenA);

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devedesetpet',
      company: 'Kupac99 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    const portalRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'portal-customer',
      permissions: ['portal.access'],
    });
    const customer = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'kupac99@primjer.example',
      displayName: 'Kupac99',
      idpSubject: 'idp|s99-customer',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: customer.body.id,
      roleId: portalRole.body.id,
    });
    await api('POST', '/api/v1/portal-users', tokenA, {
      accountId,
      idpSubject: 'idp|s99-customer',
      displayName: 'Kupac99',
    });

    // Contract: only POR99-STD, at 42.
    const contract = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'CON99',
      name: 'Contract 99',
      currency: 'EUR',
      accountId,
    });
    await api('PUT', `/api/v1/price-lists/${contract.body.id}/entries`, tokenA, {
      skuId,
      unitPrice: 42,
    });
    await api('POST', `/api/v1/price-lists/${contract.body.id}/publish`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('B2B-013: a claim on an own order lands as a support case, audited', async () => {
    const placed = await api('POST', '/api/v1/portal/orders', customerToken, {
      lines: [{ skuId, quantity: 1 }],
    });
    expect(placed.status).toBe(201);

    const claim = await api('POST', '/api/v1/portal/claims', customerToken, {
      orderId: placed.body.id,
      subject: 'Oštećena ambalaža na isporuci',
    });
    expect(claim.status).toBe(201);
    expect(claim.body.caseNumber).toBeDefined();

    const mine = await api('GET', '/api/v1/portal/claims', customerToken);
    const rows = mine.body.claims as Array<{ id: string; status: string }>;
    expect(rows.some((r) => r.id === claim.body.id)).toBe(true);

    const supportCase = await prisma.supportCase.findFirst({
      where: { id: claim.body.id as string },
    });
    expect(supportCase?.accountId).toBe(accountId);
    expect(supportCase?.orderId).toBe(placed.body.id);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'b2b.portal.claim' } });
    expect(audit).not.toBeNull();
  });

  it('B2B-013: claims on orders outside the own account are refused', async () => {
    // Seller-side order for a different account.
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Drugi Kupac 99',
      company: 'Drugi99 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const warehouses = await api('GET', '/api/v1/warehouses', tokenA);
    const otherOrder = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: (warehouses.body.warehouses as Array<{ id: string }>)[0]?.id,
      currency: 'EUR',
    });
    const denied = await api('POST', '/api/v1/portal/claims', customerToken, {
      orderId: otherOrder.body.id,
      subject: 'Ovo nije moja narudžba',
    });
    expect(denied.status).toBe(404);
  });

  it('AUTHZ: filing claims needs portal.access', async () => {
    const denied = await api('POST', '/api/v1/portal/claims', tokenA, {
      orderId: '00000000-0000-0000-0000-000000000000',
      subject: 'Bez pristupa',
    });
    expect(denied.status).toBe(403);
  });
});
