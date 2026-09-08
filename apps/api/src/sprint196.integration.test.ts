import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 196 acceptance tests: copilots & controlled agents
 * (AI-001/002/012/013) — role-scoped context, sourced answers,
 * audited exchanges, and agent actions that escalate to approval
 * unless on the safe list.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 196 — copilots & agents', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s196a', subject: 'idp|s196-admin' });

  let lampId = '';
  let bulbId = '';
  let warehouseId = '';

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

  async function makeSku(code: string, name: string): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${name} Standard`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "rfq_quote", "rfq", "work_order_operation", "work_order",
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
      slug: 'test-s196a',
      name: 'Sprint196 Tenant',
      initialAdmin: {
        email: 'admin@s196a.example',
        displayName: 'S196 Admin',
        idpSubject: 'idp|s196-admin',
      },
    });
    lampId = await makeSku('LAMP196', 'Lamp196');
    bulbId = await makeSku('BULB196', 'Bulb196');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: bulbId,
      quantity: 2,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: lampId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-196',
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH196',
      name: 'Sprint196 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: bulbId,
      movementType: 'RECEIPT',
      quantity: 20,
      idempotencyKey: 'receipt-s196-bulbs',
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('AI-001/002: role copilots answer from approved context with sources', async () => {
    const executive = await api('POST', '/api/v1/copilot/ask', tokenA, {
      role: 'executive',
      question: 'Kako stojimo ovog mjeseca?',
    });
    expect(executive.status).toBe(201);
    expect(executive.body.answer).toContain('Sažetak');
    expect(executive.body.sources).toContain('executiveSummary');

    const finance = await api('POST', '/api/v1/copilot/ask', tokenA, {
      role: 'finance',
      question: 'Koliko imamo otvorenih potraživanja?',
    });
    expect(finance.body.sources).toContain('treasury');

    const unknown = await api('POST', '/api/v1/copilot/ask', tokenA, {
      role: 'hacking',
      question: 'Šta ima?',
    });
    expect(unknown.status).toBe(400);
  });

  it('AI-014: copilot exchanges are audited with role and sources', async () => {
    const audits = await prisma.auditEvent.findMany({ where: { action: 'ai.copilot' } });
    expect(audits.length).toBe(2);
    expect(audits.map((a) => a.objectId).sort()).toEqual(['executive', 'finance']);
  });

  it('AI-012: safe agent actions execute; everything else escalates to approval', async () => {
    const safe = await api('POST', '/api/v1/copilot/agent/actions', tokenA, {
      action: 'create_task',
      title: 'Provjeri zalihe sijalica',
    });
    expect(safe.status).toBe(201);
    expect(safe.body.executed).toBe(true);
    expect(safe.body.taskId).toBeTruthy();

    const unsafe = await api('POST', '/api/v1/copilot/agent/actions', tokenA, {
      action: 'cancel_order',
      title: 'Otkaži narudžbu SO-000001',
    });
    expect(unsafe.status).toBe(201);
    expect(unsafe.body.executed).toBe(false);
    expect(unsafe.body.approvalId).toBeTruthy();
    expect(unsafe.body.reason).toContain('approval');

    const escalations = await prisma.auditEvent.count({ where: { action: 'ai.agent.escalate' } });
    expect(escalations).toBe(1);
  });
});
