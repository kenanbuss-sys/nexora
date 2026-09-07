import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 135 acceptance tests: retention (DOC-011) — attachments past
 * the configured age per entity type are purged (blob and record),
 * audited per run; younger files and other types stay.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 135 — retention', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s135a', subject: 'idp|s135-admin' });

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
      slug: 'test-s135a',
      name: 'Sprint135 Tenant',
      initialAdmin: {
        email: 'admin@s135a.example',
        displayName: 'S135 Admin',
        idpSubject: 'idp|s135-admin',
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
      code: 'WH135',
      name: 'Sprint135 warehouse',
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
      idempotencyKey: 'receipt-s135',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('DOC-011: only configured, aged attachments purge; the run is audited', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { doc: { retention: [{ entityType: 'sales_order', days: 30 }] } },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH135R',
      name: 'Sprint135 retention warehouse',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Retencija',
      company: 'Retencija d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    const payload = Buffer.from('stari dokument');

    const oldFile = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'sales_order',
      entityId: order.body.id,
      fileName: 'stari.txt',
      contentType: 'text/plain',
      dataBase64: payload.toString('base64'),
    });
    const freshFile = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'sales_order',
      entityId: order.body.id,
      fileName: 'novi.txt',
      contentType: 'text/plain',
      dataBase64: payload.toString('base64'),
    });
    expect(oldFile.status).toBe(201);
    expect(freshFile.status).toBe(201);
    // Backdate one attachment beyond the 30-day window.
    await prisma.attachment.update({
      where: { id: oldFile.body.id as string },
      data: { createdAt: new Date(Date.now() - 60 * 86_400_000) },
    });

    const run = await api('POST', '/api/v1/attachments/retention/run', tokenA);
    expect(run.status).toBe(201);
    const result = (run.body.results as Array<{ entityType: string; purged: number }>)[0];
    expect(result?.entityType).toBe('sales_order');
    expect(result?.purged).toBe(1);

    const gone = await api('GET', `/api/v1/attachments/${oldFile.body.id}/download`, tokenA);
    expect(gone.status).toBe(404);
    const kept = await api('GET', `/api/v1/attachments/${freshFile.body.id}/download`, tokenA);
    expect(kept.status).toBe(200);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'doc.retention.purge' } });
    expect(audit).not.toBeNull();
  });

  it('DOC-011: no configuration means nothing purges', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, { config: {} });
    const run = await api('POST', '/api/v1/attachments/retention/run', tokenA);
    expect((run.body.results as unknown[]).length).toBe(0);
  });

  it('AUTHZ: the retention run needs document.issue', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s135a', subject: 'idp|s135-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko135@primjer.example',
      displayName: 'Niko135',
      idpSubject: 'idp|s135-nobody',
    });
    const denied = await api('POST', '/api/v1/attachments/retention/run', stranger);
    expect(denied.status).toBe(403);
  });
});
