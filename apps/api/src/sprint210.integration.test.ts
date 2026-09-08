import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 210 acceptance tests: field service (SVC-001..015) —
 * installed base, warranty, SLA-tracked requests, orders with
 * skills-based scheduling, customer approval, measurements, parts
 * through the ledger, proof of service, installation completion,
 * RMA lifecycle and service history.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 210 — field service', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s210a', subject: 'idp|s210-admin' });
  const approverToken = identity.signToken({
    tenantSlug: 'test-s210a',
    subject: 'idp|s210-approver',
  });

  let accountId = '';
  let warehouseId = '';
  let partSkuId = '';
  let technicianId = '';
  let assetId = '';
  let requestId = '';
  let orderId = '';
  let rmaId = '';

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
      `TRUNCATE TABLE "service_order_part", "service_order", "service_request",
       "installed_asset", "rma",
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
      slug: 'test-s210a',
      name: 'Sprint210 Tenant',
      initialAdmin: {
        email: 'admin@s210a.example',
        displayName: 'S210 Admin',
        idpSubject: 'idp|s210-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        svc: {
          sla: { URGENT: 4, HIGH: 8, NORMAL: 24 },
          warrantyNoticeDays: 30,
          requireCustomerApproval: true,
        },
      },
    });

    // A second user who acts on approvals (SoD).
    const approver = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'approver@s210a.example',
      displayName: 'S210 Approver',
      idpSubject: 'idp|s210-approver',
    });
    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'svc-approver',
      permissions: ['approval.act', 'service.read'],
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: approver.body.id,
      roleId: role.body.id,
    });

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Servis',
      company: 'Servisirani d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH210',
      name: 'Sprint210 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'DIO210',
      name: 'Rezervni dio 210',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'DIO210-STD',
      name: 'Dio Std',
      baseUom: 'pcs',
    });
    partSkuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${partSkuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId: partSkuId,
      movementType: 'RECEIPT',
      quantity: 50,
      idempotencyKey: 'receipt-s210',
    });

    const technician = await api('POST', '/api/v1/employees', tokenA, {
      name: 'Tehničar Prvi',
      title: 'Serviser',
    });
    technicianId = technician.body.id as string;
    await api('POST', `/api/v1/employees/${technicianId}/skills`, tokenA, {
      skills: ['rashladni-sistemi', 'elektro'],
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('SVC-001/002: the installed base tracks assets and warranty', async () => {
    const inWarranty = new Date(Date.now() + 20 * 86400_000).toISOString();
    const asset = await api('POST', '/api/v1/service/assets', tokenA, {
      accountId,
      name: 'Rashladna komora K1',
      serial: 'RK-001',
      location: 'Skladište Zenica',
      warrantyUntil: inWarranty,
    });
    expect(asset.status).toBe(201);
    assetId = asset.body.id as string;
    expect(asset.body.inWarranty).toBe(true);

    const base = await api('GET', `/api/v1/service/assets?accountId=${accountId}`, tokenA);
    expect((base.body.assets as unknown[]).length).toBe(1);

    // Expiring within 30 days → on the warranty report.
    const report = await api('GET', '/api/v1/service/reports/warranty', tokenA);
    const expiring = report.body.expiring as Array<{ name: string }>;
    expect(expiring.find((a) => a.name === 'Rashladna komora K1')).toBeTruthy();
  });

  it('SVC-003/014: requests get SLA due dates from configuration', async () => {
    const request = await api('POST', '/api/v1/service/requests', tokenA, {
      accountId,
      subject: 'Komora ne hladi',
      priority: 'URGENT',
      installedAssetId: assetId,
    });
    expect(request.status).toBe(201);
    requestId = request.body.id as string;
    expect(request.body.requestNumber).toMatch(/^SR-/);
    const due = new Date(request.body.slaDueAt as string).getTime();
    expect(due - Date.now()).toBeGreaterThan(3.5 * 3600_000);
    expect(due - Date.now()).toBeLessThan(4.5 * 3600_000);

    const sla = await api('GET', '/api/v1/service/reports/sla', tokenA);
    expect(sla.body.open).toBe(1);
    expect(sla.body.overdue).toEqual([]);
  });

  it('SVC-004/006/007: scheduling enforces skills and slot conflicts', async () => {
    const order = await api('POST', '/api/v1/service/orders', tokenA, {
      requestId,
      installedAssetId: assetId,
      skillsRequired: ['rashladni-sistemi'],
    });
    expect(order.status).toBe(201);
    orderId = order.body.id as string;
    expect(order.body.orderNumber).toMatch(/^SVO-/);

    const when = new Date(Date.now() + 86400_000).toISOString();

    // A second order demanding a skill the technician lacks is refused.
    const picky = await api('POST', '/api/v1/service/orders', tokenA, {
      accountId,
      skillsRequired: ['plinske-instalacije'],
    });
    const lacking = await api('POST', `/api/v1/service/orders/${picky.body.id}/schedule`, tokenA, {
      scheduledAt: when,
      employeeId: technicianId,
    });
    expect(lacking.status).toBe(409);

    const scheduled = await api('POST', `/api/v1/service/orders/${orderId}/schedule`, tokenA, {
      scheduledAt: when,
      employeeId: technicianId,
    });
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.status).toBe('SCHEDULED');

    // Same technician, overlapping slot → conflict.
    const other = await api('POST', '/api/v1/service/orders', tokenA, { accountId });
    const clash = await api('POST', `/api/v1/service/orders/${other.body.id}/schedule`, tokenA, {
      scheduledAt: new Date(Date.now() + 86400_000 + 3600_000).toISOString(),
      employeeId: technicianId,
    });
    expect(clash.status).toBe(409);
  });

  it('SVC-013: work starts only with the customer approval', async () => {
    const blocked = await api('POST', `/api/v1/service/orders/${orderId}/start`, tokenA);
    expect(blocked.status).toBe(409);

    const requested = await api('POST', `/api/v1/service/orders/${orderId}/approval`, tokenA);
    expect(requested.status).toBe(201);
    const approvalId = requested.body.approvalId as string;

    const stillBlocked = await api('POST', `/api/v1/service/orders/${orderId}/start`, tokenA);
    expect(stillBlocked.status).toBe(409);

    const granted = await api('POST', `/api/v1/approvals/${approvalId}/approve`, approverToken, {});
    expect([200, 201]).toContain(granted.status);

    const started = await api('POST', `/api/v1/service/orders/${orderId}/start`, tokenA);
    expect(started.status).toBe(201);
    expect(started.body.status).toBe('IN_PROGRESS');
  });

  it('SVC-009/012: measurements record and parts flow through the ledger', async () => {
    const measured = await api('POST', `/api/v1/service/orders/${orderId}/measurements`, tokenA, {
      key: 'temperatura',
      value: '-18.5',
      unit: '°C',
    });
    expect(measured.status).toBe(201);
    const list = await api('GET', `/api/v1/service/orders/${orderId}/measurements`, tokenA);
    expect((list.body.measurements as Array<{ key: string }>)[0]?.key).toBe('temperatura');

    const part = await api('POST', `/api/v1/service/orders/${orderId}/parts`, tokenA, {
      skuId: partSkuId,
      warehouseId,
      quantity: 2,
      key: 'p1',
    });
    expect(part.status).toBe(201);
    const replay = await api('POST', `/api/v1/service/orders/${orderId}/parts`, tokenA, {
      skuId: partSkuId,
      warehouseId,
      quantity: 2,
      key: 'p1',
    });
    expect(replay.body.duplicate).toBe(true);

    const issues = await prisma.stockMovement.count({
      where: { movementType: 'ISSUE', skuId: partSkuId },
    });
    expect(issues).toBe(1);
  });

  it('SVC-010/011: proof of service is once-only; completion resolves the request', async () => {
    const proof = await api('POST', `/api/v1/service/orders/${orderId}/proof`, tokenA, {
      name: 'Kupac Servis',
      pin: '1234',
    });
    expect(proof.status).toBe(201);
    const again = await api('POST', `/api/v1/service/orders/${orderId}/proof`, tokenA, {
      name: 'Kupac Servis',
      pin: '1234',
    });
    expect(again.status).toBe(409);

    const done = await api('POST', `/api/v1/service/orders/${orderId}/complete`, tokenA, {
      report: 'Zamijenjen kompresor, komora hladi na -18°C.',
      install: { name: 'Novi kompresor C2', warrantyMonths: 12 },
    });
    expect(done.status).toBe(201);
    expect(done.body.status).toBe('DONE');

    const request = await prisma.serviceRequest.findFirst({ where: { id: requestId } });
    expect(request?.status).toBe('RESOLVED');

    // The installation landed in the installed base with warranty.
    const base = await api('GET', `/api/v1/service/assets?accountId=${accountId}`, tokenA);
    const installed = (base.body.assets as Array<{ name: string; inWarranty: boolean }>).find(
      (a) => a.name === 'Novi kompresor C2',
    );
    expect(installed?.inWarranty).toBe(true);
  });

  it('SVC-005: the RMA lifecycle books received goods back into stock', async () => {
    const rma = await api('POST', '/api/v1/service/rmas', tokenA, {
      accountId,
      skuId: partSkuId,
      quantity: 1,
      reason: 'Dio neispravan po prijemu',
    });
    expect(rma.status).toBe(201);
    rmaId = rma.body.id as string;
    expect(rma.body.rmaNumber).toMatch(/^RMA-/);

    const badJump = await api('POST', `/api/v1/service/rmas/${rmaId}/transition`, tokenA, {
      status: 'RECEIVED',
      warehouseId,
    });
    expect(badJump.status).toBe(409);

    await api('POST', `/api/v1/service/rmas/${rmaId}/transition`, tokenA, { status: 'APPROVED' });
    const received = await api('POST', `/api/v1/service/rmas/${rmaId}/transition`, tokenA, {
      status: 'RECEIVED',
      warehouseId,
    });
    expect(received.status).toBe(201);

    const receipts = await prisma.stockMovement.count({
      where: { movementType: 'RECEIPT', skuId: partSkuId },
    });
    expect(receipts).toBe(2); // initial stock + RMA return
  });

  it('SVC-015: the asset history collects requests, orders and parts', async () => {
    const history = await api('GET', `/api/v1/service/assets/${assetId}/history`, tokenA);
    expect(history.status).toBe(200);
    expect((history.body.requests as unknown[]).length).toBe(1);
    const orders = history.body.orders as Array<{ parts: Array<{ quantity: number }> }>;
    expect(orders.length).toBe(1);
    expect(orders[0]?.parts).toEqual([{ skuId: partSkuId, quantity: 2 }]);
  });

  it('AUTHZ: service mutations need service.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s210a', subject: 'idp|s210-nobody' });
    const denied = await api('POST', '/api/v1/service/requests', stranger, {
      accountId,
      subject: 'X',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
