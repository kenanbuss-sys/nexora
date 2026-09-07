import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 129 acceptance tests: andon/alerts (MES-022) — downtime at or
 * beyond the configured threshold raises a work-queue alert; the andon
 * board lists open alerts; below-threshold downtime stays quiet.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 129 — andon', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s129a', subject: 'idp|s129-admin' });


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
      `TRUNCATE TABLE "rfq_quote", "rfq", "work_order_operation", "work_order",
       "downtime_event", "work_center",
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
      slug: 'test-s129a',
      name: 'Sprint129 Tenant',
      initialAdmin: {
        email: 'admin@s129a.example',
        displayName: 'S129 Admin',
        idpSubject: 'idp|s129-admin',
      },
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC129A',
      name: 'Press A',
    });
    await api('POST', '/api/v1/shopfloor/work-centers', tokenA, {
      code: 'WC129B',
      name: 'Press B',
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'AN129',
      name: 'AN129 product',
    });
    const lamp = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'AN129-STD',
      name: 'AN129 Std',
      baseUom: 'pcs',
    });
    const lampId = lamp.body.id as string;
    await api('POST', `/api/v1/skus/${lampId}/activate`, tokenA);
    const bolt = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'AN129-BOLT',
      name: 'AN129 Bolt',
      baseUom: 'pcs',
    });
    const boltId = bolt.body.id as string;
    await api('POST', `/api/v1/skus/${boltId}/activate`, tokenA);

    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: boltId,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Press',
      workCenter: 'WC129A',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH129',
      name: 'Sprint129 warehouse',
    });
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: boltId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-s129-bolts',
    });

    await api('POST', '/api/v1/work-orders', tokenA, {
      skuId: lampId,
      warehouseId: warehouse.body.id,
      quantity: 2,
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MES-022: threshold downtime raises an andon alert; short downtime stays quiet', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { mes: { andon: { downtimeMinutes: 30 } } },
    });
    const centers = await api('GET', '/api/v1/shopfloor/work-centers', tokenA);
    const workCenterId = (centers.body.workCenters as Array<{ id: string }>)[0]?.id as string;

    // 20 minutes — below the threshold, no alert.
    await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'SETUP',
      minutes: 20,
      reason: 'Zamjena alata',
    });
    const quiet = await api('GET', '/api/v1/shopfloor/andon', tokenA);
    expect((quiet.body.alerts as unknown[]).length).toBe(0);

    // 45 minutes — alert raised, audited.
    await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'BREAKDOWN',
      minutes: 45,
      reason: 'Puknuo remen',
    });
    const board = await api('GET', '/api/v1/shopfloor/andon', tokenA);
    const alerts = board.body.alerts as Array<{ title: string }>;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.title).toContain('ANDON');
    expect(alerts[0]?.title).toContain('BREAKDOWN');

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'mes.andon.raise' } });
    expect(audit).not.toBeNull();
  });

  it('MES-022: without configuration no alerts are raised', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, { config: {} });
    const centers = await api('GET', '/api/v1/shopfloor/work-centers', tokenA);
    const workCenterId = (centers.body.workCenters as Array<{ id: string }>)[0]?.id as string;
    await api('POST', '/api/v1/shopfloor/downtime', tokenA, {
      workCenterId,
      category: 'BREAKDOWN',
      minutes: 120,
      reason: 'Bez konfiguracije',
    });
    const board = await api('GET', '/api/v1/shopfloor/andon', tokenA);
    expect((board.body.alerts as unknown[]).length).toBe(1);
  });

  it('AUTHZ: the andon board needs production.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s129a', subject: 'idp|s129-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko129@primjer.example',
      displayName: 'Niko129',
      idpSubject: 'idp|s129-nobody',
    });
    const denied = await api('GET', '/api/v1/shopfloor/andon', stranger);
    expect(denied.status).toBe(403);
  });
});
