import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 094 acceptance tests: abandoned-order hooks (COM-014) — stale
 * DRAFT orders surface in a report, and the notify run publishes one
 * order.abandoned outbox event per order, exactly once.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 094 — abandoned orders', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s94a', subject: 'idp|s94-admin' });

  let warehouseId = '';
  let accountId = '';
  let staleOrderId = '';

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
      slug: 'test-s94a',
      name: 'Sprint94 Tenant',
      initialAdmin: {
        email: 'admin@s94a.example',
        displayName: 'S94 Admin',
        idpSubject: 'idp|s94-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH94',
      name: 'Sprint94 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devedesetcetiri',
      company: 'Kupac94 d.o.o.',
      email: 'kupac94@primjer.example',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    // One stale draft (backdated 30h) and one fresh draft.
    const stale = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId,
      currency: 'EUR',
    });
    staleOrderId = stale.body.id as string;
    await prisma.salesOrder.update({
      where: { id: staleOrderId },
      data: { updatedAt: new Date(Date.now() - 30 * 3_600_000) },
    });
    await api('POST', '/api/v1/orders', tokenA, { accountId, warehouseId, currency: 'EUR' });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('COM-014: only stale drafts show in the report', async () => {
    const report = await api('GET', '/api/v1/orders/abandoned?hours=24', tokenA);
    expect(report.status).toBe(200);
    const orders = report.body.orders as Array<{ id: string; ageHours: number }>;
    expect(orders).toHaveLength(1);
    expect(orders[0]?.id).toBe(staleOrderId);
    expect(orders[0]?.ageHours).toBeGreaterThanOrEqual(30);
  });

  it('COM-014: notify publishes one outbox event per order, exactly once', async () => {
    const first = await api('POST', '/api/v1/orders/abandoned/notify?hours=24', tokenA);
    expect(first.status).toBe(201);
    expect(first.body.notified).toBe(1);
    expect(first.body.skipped).toBe(0);

    const again = await api('POST', '/api/v1/orders/abandoned/notify?hours=24', tokenA);
    expect(again.body.notified).toBe(0);
    expect(again.body.skipped).toBe(1);

    const events = await prisma.outboxEvent.findMany({
      where: { eventType: 'order.abandoned', aggregateId: staleOrderId },
    });
    expect(events).toHaveLength(1);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'oms.abandoned.notify' } });
    expect(audit).not.toBeNull();
  });

  it('AUTHZ: the notify run needs order.confirm', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s94a', subject: 'idp|s94-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko94@primjer.example',
      displayName: 'Niko94',
      idpSubject: 'idp|s94-nobody',
    });
    const denied = await api('POST', '/api/v1/orders/abandoned/notify', stranger);
    expect(denied.status).toBe(403);
  });
});
