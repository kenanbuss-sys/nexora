import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 020 acceptance tests: webhook subscriptions (INT-008),
 * idempotent fan-out (INT-011), signed retrying deliveries (INT-012),
 * dead-lettering (INT-013), run history (INT-016) and health (INT-015).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 020 — integration hub', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let receiver: Server;
  let receiverPort = 0;
  const received: Array<{ body: string; signature: string; event: string }> = [];
  let failNext = false;

  const identity = new DevIdentityAdapter(SECRET);
  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s20a', subject: 'idp|s20-admin' });

  let webhookSecret = '';

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
      `TRUNCATE TABLE "webhook_delivery", "webhook_subscription",
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

    receiver = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        if (failNext) {
          res.statusCode = 500;
          res.end('boom');
          return;
        }
        received.push({
          body,
          signature: String(req.headers['x-nexora-signature'] ?? ''),
          event: String(req.headers['x-nexora-event'] ?? ''),
        });
        res.statusCode = 200;
        res.end('ok');
      });
    });
    await new Promise<void>((resolve) => {
      receiver.listen(0, '127.0.0.1', resolve);
    });
    receiverPort = (receiver.address() as { port: number }).port;

    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s20a',
      name: 'Sprint20 Tenant',
      initialAdmin: {
        email: 'admin@s20a.example',
        displayName: 'S20 Admin',
        idpSubject: 'idp|s20-admin',
      },
    });

    // A business event source: one confirmed order.
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'INT20', name: 'I20' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'INT20-STD',
      name: 'I20 Standard',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH20',
      name: 'Sprint20 warehouse',
    });
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 100,
      idempotencyKey: 'receipt-s20',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Dvadeset',
      company: 'Dvadeset d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    await api('POST', `/api/v1/orders/${order.body.id}/lines`, tokenA, {
      skuId: sku.body.id,
      quantity: 2,
      unitPrice: 10,
    });
    await api('POST', `/api/v1/orders/${order.body.id}/confirm`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await new Promise<void>((resolve) => {
      receiver?.close(() => resolve());
    });
  });

  it('INT-008/012: a subscription delivers signed events to the endpoint', async () => {
    const created = await api('POST', '/api/v1/integrations/webhooks', tokenA, {
      name: 'ERP most',
      url: `http://127.0.0.1:${receiverPort}/hook`,
      eventTypes: ['order.confirmed'],
    });
    expect(created.status).toBe(201);
    webhookSecret = created.body.secret as string;
    expect(webhookSecret.length).toBeGreaterThan(20);

    const processed = await api('POST', '/api/v1/integrations/process', tokenA);
    expect(processed.body.fannedOut).toBe(1);
    expect(processed.body.delivered).toBe(1);

    expect(received.length).toBe(1);
    const hit = received[0]!;
    expect(hit.event).toBe('order.confirmed');
    const expected = `sha256=${createHmac('sha256', webhookSecret).update(hit.body).digest('hex')}`;
    expect(hit.signature).toBe(expected);
    expect(JSON.parse(hit.body).eventType).toBe('order.confirmed');
  });

  it('INT-011: reprocessing never duplicates deliveries', async () => {
    const again = await api('POST', '/api/v1/integrations/process', tokenA);
    expect(again.body.fannedOut).toBe(0);
    expect(received.length).toBe(1);
    const deliveries = await api('GET', '/api/v1/integrations/deliveries', tokenA);
    expect((deliveries.body.deliveries as unknown[]).length).toBe(1);
  });

  it('INT-012/013: failures back off and eventually dead-letter', async () => {
    // A second event: fulfillment. The receiver now fails.
    failNext = true;
    const orders = await api('GET', '/api/v1/orders', tokenA);
    const orderId = (orders.body.orders as Array<{ id: string }>)[0]!.id;
    await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    // Subscribe fulfillment events on the same endpoint.
    await api('POST', '/api/v1/integrations/webhooks', tokenA, {
      name: 'Ispuna most',
      url: `http://127.0.0.1:${receiverPort}/hook`,
      eventTypes: ['order.fulfillment.planned'],
    });
    const processed = await api('POST', '/api/v1/integrations/process', tokenA);
    expect(processed.body.failed).toBe(1);

    let failedDelivery = await prisma.webhookDelivery.findFirst({
      where: { eventType: 'order.fulfillment.planned' },
    });
    expect(failedDelivery?.status).toBe('FAILED');
    expect(failedDelivery?.attempts).toBe(1);
    expect(failedDelivery!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Force it due repeatedly until the dead-letter cap.
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await prisma.webhookDelivery.update({
        where: { id: failedDelivery!.id },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
      await api('POST', '/api/v1/integrations/process', tokenA);
    }
    failedDelivery = await prisma.webhookDelivery.findFirst({
      where: { id: failedDelivery!.id },
    });
    expect(failedDelivery?.status).toBe('DEAD');
    expect(failedDelivery?.attempts).toBe(5);
    failNext = false;
  });

  it('INT-015/016: health and history reflect delivery state', async () => {
    const health = await api('GET', '/api/v1/integrations/health', tokenA);
    const rows = health.body.subscriptions as Array<{
      name: string;
      delivered: number;
      dead: number;
    }>;
    expect(rows.find((r) => r.name === 'ERP most')?.delivered).toBe(1);
    expect(rows.find((r) => r.name === 'Ispuna most')?.dead).toBe(1);

    const dead = await api('GET', '/api/v1/integrations/deliveries?status=DEAD', tokenA);
    expect((dead.body.deliveries as unknown[]).length).toBe(1);
  });

  it('AUTH: integration management needs its permission', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s20a', subject: 'idp|s20-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko20@primjer.example',
      displayName: 'Niko20',
      idpSubject: 'idp|s20-nobody',
    });
    const denied = await api('POST', '/api/v1/integrations/webhooks', stranger, {
      name: 'X',
      url: 'https://example.com',
      eventTypes: ['order.confirmed'],
    });
    expect(denied.status).toBe(403);
  });
});
