import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 136 acceptance tests: document access policy (DOC-012) —
 * attachments of a configured entity type are readable only by holders
 * of the named permission, enforced server-side on list and download.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 136 — document access policy', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s136a', subject: 'idp|s136-admin' });

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
       "webhook_delivery", "webhook_subscription",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
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
      slug: 'test-s136a',
      name: 'Sprint136 Tenant',
      initialAdmin: {
        email: 'admin@s136a.example',
        displayName: 'S136 Admin',
        idpSubject: 'idp|s136-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'shop-main', kind: 'commerce', adapter: 'noop', config: {} },
            { key: 'acct-main', kind: 'accounting', adapter: 'noop', config: {} },
          ],
        },
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH136',
      name: 'Sprint136 warehouse',
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'CHN121',
      name: 'CHN121 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'CHN121-STD',
      name: 'CHN121 Std',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 15,
      idempotencyKey: 'receipt-s136',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('DOC-012: readers without the named permission are refused', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        doc: { accessPolicy: [{ entityType: 'sales_order', permission: 'finance.read' }] },
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH136R',
      name: 'Sprint136 docs warehouse',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Pristup',
      company: 'Pristup d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    const uploaded = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'sales_order',
      entityId: order.body.id,
      fileName: 'povjerljivo.txt',
      contentType: 'text/plain',
      dataBase64: Buffer.from('povjerljiv sadržaj').toString('base64'),
    });
    expect(uploaded.status).toBe(201);

    // Admin holds finance.read → sees the document.
    const adminList = await api(
      'GET',
      `/api/v1/attachments?entityType=sales_order&entityId=${order.body.id}`,
      tokenA,
    );
    expect(adminList.status).toBe(200);

    // A collab-only user cannot list or download sales-order documents.
    const clerkRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'pisar',
      permissions: ['collab.use'],
    });
    const clerk = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'pisar136@primjer.example',
      displayName: 'Pisar136',
      idpSubject: 'idp|s136-clerk',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: clerk.body.id,
      roleId: clerkRole.body.id,
    });
    const clerkToken = identity.signToken({ tenantSlug: 'test-s136a', subject: 'idp|s136-clerk' });
    const deniedList = await api(
      'GET',
      `/api/v1/attachments?entityType=sales_order&entityId=${order.body.id}`,
      clerkToken,
    );
    expect(deniedList.status).toBe(403);
    const deniedDownload = await api(
      'GET',
      `/api/v1/attachments/${uploaded.body.id}/download`,
      clerkToken,
    );
    expect(deniedDownload.status).toBe(403);

    // Clearing the policy restores access for the clerk.
    await api('POST', '/api/v1/tenant/configuration', tokenA, { config: {} });
    const nowAllowed = await api(
      'GET',
      `/api/v1/attachments/${uploaded.body.id}/download`,
      clerkToken,
    );
    expect(nowAllowed.status).toBe(200);
  });
});
