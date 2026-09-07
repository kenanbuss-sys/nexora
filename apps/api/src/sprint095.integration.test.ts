import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 095 acceptance tests: B2B portal ordering (COM-002) — a portal
 * user places orders for their own account only, priced strictly from
 * the contract catalog, landing as DRAFT in the seller's OMS.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 095 — portal ordering', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s95a', subject: 'idp|s95-admin' });
  const customerToken = identity.signToken({
    tenantSlug: 'test-s95a',
    subject: 'idp|s95-customer',
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
      slug: 'test-s95a',
      name: 'Sprint95 Tenant',
      initialAdmin: {
        email: 'admin@s95a.example',
        displayName: 'S95 Admin',
        idpSubject: 'idp|s95-admin',
      },
    });
    await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH95', name: 'Sprint95 warehouse' });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'POR95',
      name: 'POR95 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'POR95-STD',
      name: 'POR95 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    const strangeSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'POR95-OFF',
      name: 'POR95 Off-contract',
      baseUom: 'pcs',
    });
    strangeSkuId = strangeSku.body.id as string;
    await api('POST', `/api/v1/skus/${strangeSkuId}/activate`, tokenA);

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devedesetpet',
      company: 'Kupac95 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    const portalRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'portal-customer',
      permissions: ['portal.access'],
    });
    const customer = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'kupac95@primjer.example',
      displayName: 'Kupac95',
      idpSubject: 'idp|s95-customer',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: customer.body.id,
      roleId: portalRole.body.id,
    });
    await api('POST', '/api/v1/portal-users', tokenA, {
      accountId,
      idpSubject: 'idp|s95-customer',
      displayName: 'Kupac95',
    });

    // Contract: only POR95-STD, at 42.
    const contract = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'CON95',
      name: 'Contract 95',
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

  it('COM-002: a portal order lands as DRAFT at contract prices, audited', async () => {
    const placed = await api('POST', '/api/v1/portal/orders', customerToken, {
      lines: [{ skuId, quantity: 3 }],
    });
    expect(placed.status).toBe(201);
    expect(placed.body.lines).toBe(1);

    const order = await api('GET', `/api/v1/orders/${placed.body.id}`, tokenA);
    expect(order.body.status).toBe('DRAFT');
    expect(order.body.accountId).toBe(accountId);
    const line = (order.body.lines as Array<{ unitPrice: string; quantity: string }>)[0];
    expect(Number(line?.unitPrice)).toBe(42);
    expect(Number(line?.quantity)).toBe(3);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'b2b.portal.order' } });
    expect(audit).not.toBeNull();

    const mine = await api('GET', '/api/v1/portal/orders', customerToken);
    expect((mine.body.orders as Array<{ id: string }>).some((o) => o.id === placed.body.id)).toBe(
      true,
    );
  });

  it('COM-002: lines outside the contract catalog are refused', async () => {
    const refused = await api('POST', '/api/v1/portal/orders', customerToken, {
      lines: [{ skuId: strangeSkuId, quantity: 1 }],
    });
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: placing portal orders needs portal.access', async () => {
    const denied = await api('POST', '/api/v1/portal/orders', tokenA, {
      lines: [{ skuId, quantity: 1 }],
    });
    expect(denied.status).toBe(403);
  });
});
