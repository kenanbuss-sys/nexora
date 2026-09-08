import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 204 acceptance tests: projects (PRJ-001..012) — governed
 * project registers, milestones, timesheets, costs, change orders,
 * procurement and inventory linkage, and profitability.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 204 — projects', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s204a', subject: 'idp|s204-admin' });

  let employeeId = '';
  let warehouseId = '';
  let skuId = '';
  let supplierId = '';
  let poId = '';
  let milestoneId = '';

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
      `TRUNCATE TABLE "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
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
      slug: 'test-s204a',
      name: 'Sprint204 Tenant',
      initialAdmin: {
        email: 'admin@s204a.example',
        displayName: 'S204 Admin',
        idpSubject: 'idp|s204-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { prj: { laborRate: 30 } },
    });
    const employee = await api('POST', '/api/v1/employees', tokenA, {
      name: 'Majstor Prvi',
      title: 'Monter',
    });
    employeeId = employee.body.id as string;

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH204',
      name: 'Sprint204 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'GRA204',
      name: 'Građa 204',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'GRA204-STD',
      name: 'Građa Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 100,
      idempotencyKey: 'receipt-s204',
    });

    const supplier = await api('POST', '/api/v1/suppliers', tokenA, {
      name: 'Podizvođač d.o.o.',
    });
    supplierId = supplier.body.id as string;
    const requisition = await api('POST', '/api/v1/requisitions', tokenA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/lines`, tokenA, {
      skuId,
      quantity: 10,
      estUnitPrice: 25,
    });
    await api('POST', `/api/v1/requisitions/${requisition.body.id}/submit`, tokenA);
    const po = await api('POST', '/api/v1/purchase-orders', tokenA, {
      requisitionId: requisition.body.id,
      supplierId,
      warehouseId,
    });
    poId = po.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('PRJ-001/002/003: setup provisions the registers; records validate', async () => {
    const setup = await api('POST', '/api/v1/projects/setup', tokenA);
    expect(setup.status).toBe(201);
    expect(setup.body.objects).toContain('prj_project');

    // Idempotent re-run.
    const again = await api('POST', '/api/v1/projects/setup', tokenA);
    expect(again.status).toBe(201);

    const project = await api('POST', '/api/v1/custom-objects/prj_project/records', tokenA, {
      data: { code: 'PRJ-1', naziv: 'Hala Zenica', status: 'aktivan', budzet: 50000 },
    });
    expect(project.status).toBe(201);

    await api('POST', '/api/v1/custom-objects/prj_site/records', tokenA, {
      data: { projekt: 'PRJ-1', naziv: 'Gradilište istok', adresa: 'Zenica bb' },
    });
    const milestone = await api('POST', '/api/v1/custom-objects/prj_milestone/records', tokenA, {
      data: { projekt: 'PRJ-1', naziv: 'Temelji', rok: '2026-10-15' },
    });
    milestoneId = milestone.body.id as string;

    const list = await api('GET', '/api/v1/projects', tokenA);
    expect(list.status).toBe(200);
    const projects = list.body.projects as Array<{ code: string; budget: number }>;
    expect(projects).toHaveLength(1);
    expect(projects[0]?.code).toBe('PRJ-1');
    expect(projects[0]?.budget).toBe(50000);
  });

  it('PRJ-003: milestones complete idempotently and report done', async () => {
    const done = await api('POST', '/api/v1/projects/PRJ-1/milestones/complete', tokenA, {
      milestoneRecordId: milestoneId,
    });
    expect(done.status).toBe(201);
    expect(done.body.duplicate).toBe(false);

    const replay = await api('POST', '/api/v1/projects/PRJ-1/milestones/complete', tokenA, {
      milestoneRecordId: milestoneId,
    });
    expect(replay.body.duplicate).toBe(true);

    const list = await api('GET', '/api/v1/projects/PRJ-1/milestones', tokenA);
    const milestones = list.body.milestones as Array<{ id: string; done: boolean }>;
    expect(milestones.find((m) => m.id === milestoneId)?.done).toBe(true);
  });

  it('PRJ-005/008/009: costs and timesheets land in the job-cost ledger', async () => {
    const sub = await api('POST', '/api/v1/projects/PRJ-1/costs', tokenA, {
      entryId: 'sub-1',
      kind: 'subcontract',
      amount: 4000,
      description: 'Elektroinstalacije — podizvođač',
    });
    expect(sub.status).toBe(201);
    const dupCost = await api('POST', '/api/v1/projects/PRJ-1/costs', tokenA, {
      entryId: 'sub-1',
      kind: 'subcontract',
      amount: 4000,
      description: 'Elektroinstalacije — podizvođač',
    });
    expect(dupCost.body.duplicate).toBe(true);

    const ts = await api('POST', '/api/v1/projects/PRJ-1/timesheets', tokenA, {
      employeeId,
      date: '2026-09-08',
      hours: 8,
    });
    expect(ts.status).toBe(201);
    expect(ts.body.cost).toBe('240.00'); // 8h × 30

    const dupTs = await api('POST', '/api/v1/projects/PRJ-1/timesheets', tokenA, {
      employeeId,
      date: '2026-09-08',
      hours: 8,
    });
    expect(dupTs.body.duplicate).toBe(true);
  });

  it('PRJ-006/007: procurement links and ledger-backed material issues', async () => {
    const link = await api('POST', '/api/v1/projects/PRJ-1/purchase-orders', tokenA, {
      purchaseOrderId: poId,
    });
    expect(link.status).toBe(201);
    const dupLink = await api('POST', '/api/v1/projects/PRJ-1/purchase-orders', tokenA, {
      purchaseOrderId: poId,
    });
    expect(dupLink.body.duplicate).toBe(true);

    const issue = await api('POST', '/api/v1/projects/PRJ-1/material-issues', tokenA, {
      warehouseId,
      skuId,
      quantity: 20,
      unitCost: 12.5,
      key: 'iss-1',
    });
    expect(issue.status).toBe(201);
    const dupIssue = await api('POST', '/api/v1/projects/PRJ-1/material-issues', tokenA, {
      warehouseId,
      skuId,
      quantity: 20,
      unitCost: 12.5,
      key: 'iss-1',
    });
    expect(dupIssue.body.duplicate).toBe(true);

    const onHand = await prisma.stockMovement.count({
      where: { movementType: 'ISSUE', quantity: 20 },
    });
    expect(onHand).toBe(1);
  });

  it('PRJ-004/011/012: change orders shift the budget; profitability adds up', async () => {
    const co = await api('POST', '/api/v1/projects/PRJ-1/change-orders', tokenA, {
      key: 'co-1',
      delta: 5000,
      reason: 'Dodatni radovi na krovu',
    });
    expect(co.status).toBe(201);

    await api('POST', '/api/v1/projects/PRJ-1/revenue', tokenA, { amount: 60000 });

    const costing = await api('GET', '/api/v1/projects/PRJ-1/costing', tokenA);
    expect(costing.status).toBe(200);
    expect(costing.body.budget).toBe('50000.00');
    expect(costing.body.effectiveBudget).toBe('55000.00');
    const costs = costing.body.costs as Record<string, string>;
    expect(costs.subcontract).toBe('4000.00');
    expect(costs.labor).toBe('240.00');
    expect(costs.material).toBe('250.00'); // 20 × 12.50
    expect(costing.body.procurement).toBe('250.00'); // PO 10 × 25
    expect(costing.body.totalCost).toBe('4740.00');
    expect(costing.body.remaining).toBe('50260.00');

    const profit = await api('GET', '/api/v1/projects/PRJ-1/profitability', tokenA);
    expect(profit.body.revenue).toBe('60000.00');
    expect(profit.body.profit).toBe('55260.00');
    expect(Number(profit.body.marginPct)).toBeCloseTo(92.1, 1);
  });

  it('PRJ-010: project documents are the attachments on the record', async () => {
    const documents = await api('GET', '/api/v1/projects/PRJ-1/documents', tokenA);
    expect(documents.status).toBe(200);
    expect(documents.body.documents).toEqual([]);
  });

  it('AUTHZ: project mutations need project.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s204a', subject: 'idp|s204-nobody' });
    const denied = await api('POST', '/api/v1/projects/PRJ-1/costs', stranger, {
      entryId: 'x-1',
      kind: 'other',
      amount: 10,
      description: 'Neovlašteno',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
