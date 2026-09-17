import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 222 acceptance tests: idempotent portal ordering — the client
 * request key is namespaced to the authorized account and stored on the
 * sales order row itself (atomic with the order). Same key + same
 * content replays the same order; same key + different content is a
 * conflict; concurrent duplicates race on the unique constraint and
 * never double business effects; keys never leak across accounts or
 * tenants.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 222 — idempotent portal ordering', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s222a', subject: 'idp|s222-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s222b', subject: 'idp|s222b-admin' });
  const customer1 = identity.signToken({
    tenantSlug: 'test-s222a',
    subject: 'idp|s222-kupac1',
  });
  const customer2 = identity.signToken({
    tenantSlug: 'test-s222a',
    subject: 'idp|s222-kupac2',
  });
  const customerB = identity.signToken({
    tenantSlug: 'test-s222b',
    subject: 'idp|s222b-kupac',
  });

  let skuId = '';
  let skuBId = '';

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

  /** Provisions one tenant with a contract-priced portal customer. */
  async function provisionTenant(
    adminToken: string,
    tag: string,
    customerSubject: string,
    extraCustomerSubject?: string,
  ) {
    await api('POST', '/api/v1/warehouses', adminToken, {
      code: `WH${tag}`,
      name: `Warehouse ${tag}`,
    });
    const product = await api('POST', '/api/v1/products', adminToken, {
      code: `IDP${tag}`,
      name: `Product ${tag}`,
    });
    const sku = await api('POST', '/api/v1/skus', adminToken, {
      productId: product.body.id,
      code: `IDP${tag}-STD`,
      name: `SKU ${tag}`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id as string}/activate`, adminToken);
    const role = await api('POST', '/api/v1/roles', adminToken, {
      name: 'portal-customer',
      permissions: ['portal.access'],
    });

    async function customer(subject: string, name: string) {
      const lead = await api('POST', '/api/v1/crm/leads', adminToken, {
        name,
        company: `${name} d.o.o.`,
      });
      const converted = await api(
        'POST',
        `/api/v1/crm/leads/${lead.body.id as string}/convert`,
        adminToken,
        {},
      );
      const accountId = converted.body.accountId as string;
      const user = await api('POST', '/api/v1/users/invite', adminToken, {
        email: `${subject.replace(/[^a-z0-9]/gi, '')}@primjer.example`,
        displayName: name,
        idpSubject: subject,
      });
      await api('POST', '/api/v1/roles/assign', adminToken, {
        userId: user.body.id,
        roleId: role.body.id,
      });
      await api('POST', '/api/v1/portal-users', adminToken, {
        accountId,
        idpSubject: subject,
        displayName: name,
      });
      const contract = await api('POST', '/api/v1/price-lists', adminToken, {
        code: `CON${tag}${subject.slice(-1)}`,
        name: `Contract ${tag} ${name}`,
        currency: 'EUR',
        accountId,
      });
      await api('PUT', `/api/v1/price-lists/${contract.body.id as string}/entries`, adminToken, {
        skuId: sku.body.id,
        unitPrice: 50,
      });
      await api('POST', `/api/v1/price-lists/${contract.body.id as string}/publish`, adminToken);
      return accountId;
    }

    await customer(customerSubject, `Kupac ${tag}1`);
    if (extraCustomerSubject) await customer(extraCustomerSubject, `Kupac ${tag}2`);
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
      slug: 'test-s222a',
      name: 'Sprint222 Tenant A',
      initialAdmin: {
        email: 'admin@s222a.example',
        displayName: 'S222 Admin',
        idpSubject: 'idp|s222-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s222b',
      name: 'Sprint222 Tenant B',
      initialAdmin: {
        email: 'admin@s222b.example',
        displayName: 'S222B Admin',
        idpSubject: 'idp|s222b-admin',
      },
    });
    skuId = await provisionTenant(tokenA, '222A', 'idp|s222-kupac1', 'idp|s222-kupac2');
    skuBId = await provisionTenant(tokenB, '222B', 'idp|s222b-kupac');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('replay after success returns the same order without new effects', async () => {
    const payload = { requestKey: 'kljuc-ponovi-01', lines: [{ skuId, quantity: 2 }] };
    const first = await api('POST', '/api/v1/portal/orders', customer1, payload);
    expect(first.status).toBe(201);
    const replay = await api('POST', '/api/v1/portal/orders', customer1, payload);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.orderNumber).toBe(first.body.orderNumber);
    expect(replay.body.lines).toBe(1);

    const orders = await prisma.salesOrder.count({
      where: { requestKey: { contains: 'kljuc-ponovi-01' } },
    });
    expect(orders).toBe(1);
    const events = await prisma.orderEvent.count({
      where: { orderId: first.body.id as string },
    });
    expect(events).toBe(1); // ORDER_CREATED once — no repeated business effects
  });

  it('same key with different content is a conflict', async () => {
    const key = 'kljuc-izmjena-01';
    const first = await api('POST', '/api/v1/portal/orders', customer1, {
      requestKey: key,
      lines: [{ skuId, quantity: 1 }],
    });
    expect(first.status).toBe(201);
    const changed = await api('POST', '/api/v1/portal/orders', customer1, {
      requestKey: key,
      lines: [{ skuId, quantity: 9 }],
    });
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe('CONFLICT');
  });

  it('concurrent duplicates create exactly one order', async () => {
    const payload = { requestKey: 'kljuc-paralela-1', lines: [{ skuId, quantity: 4 }] };
    const results = await Promise.all([
      api('POST', '/api/v1/portal/orders', customer1, payload),
      api('POST', '/api/v1/portal/orders', customer1, payload),
      api('POST', '/api/v1/portal/orders', customer1, payload),
    ]);
    for (const r of results) expect(r.status).toBe(201);
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(1);
    const orders = await prisma.salesOrder.count({
      where: { requestKey: { contains: 'kljuc-paralela-1' } },
    });
    expect(orders).toBe(1);
  });

  it('the same key is independent per account and per tenant', async () => {
    const key = 'kljuc-izolacija1';
    const a = await api('POST', '/api/v1/portal/orders', customer1, {
      requestKey: key,
      lines: [{ skuId, quantity: 1 }],
    });
    const b = await api('POST', '/api/v1/portal/orders', customer2, {
      requestKey: key,
      lines: [{ skuId, quantity: 1 }],
    });
    const c = await api('POST', '/api/v1/portal/orders', customerB, {
      requestKey: key,
      lines: [{ skuId: skuBId, quantity: 1 }],
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(c.status).toBe(201);
    const ids = new Set([a.body.id, b.body.id, c.body.id]);
    expect(ids.size).toBe(3); // no cross-account or cross-tenant replay/probe
  });

  it('orders without a request key still work (backward compatible)', async () => {
    const first = await api('POST', '/api/v1/portal/orders', customer1, {
      lines: [{ skuId, quantity: 1 }],
    });
    const second = await api('POST', '/api/v1/portal/orders', customer1, {
      lines: [{ skuId, quantity: 1 }],
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
  });
});
