import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 203 acceptance tests: workforce (HCM-002/003/004/006/007/009/012) —
 * time & attendance, shift planning, leave with approval, certifications,
 * performance and payroll export through a connector.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 203 — workforce', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s203a', subject: 'idp|s203-admin' });

  let employeeId = '';
  let leaveKey = '';

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
      `TRUNCATE TABLE "order_event", "sales_order_line", "sales_order",
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
      slug: 'test-s203a',
      name: 'Sprint203 Tenant',
      initialAdmin: {
        email: 'admin@s203a.example',
        displayName: 'S203 Admin',
        idpSubject: 'idp|s203-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        hcm: {
          shifts: [
            { key: 'prva', name: 'Prva smjena' },
            { key: 'druga', name: 'Druga smjena' },
          ],
        },
        int: {
          connectors: [{ key: 'payroll-main', kind: 'other', adapter: 'noop', config: {} }],
        },
      },
    });
    const employee = await api('POST', '/api/v1/employees', tokenA, {
      name: 'Radnik Prvi',
      title: 'Operater',
    });
    employeeId = employee.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('HCM-003: clock events are sequenced and idempotent; attendance pairs hours', async () => {
    const clockIn = await api('POST', `/api/v1/workforce/employees/${employeeId}/clock`, tokenA, {
      event: 'IN',
      eventId: 'e1',
    });
    expect(clockIn.status).toBe(201);
    expect(clockIn.body.duplicate).toBe(false);

    // Replay of the same event id is a no-op duplicate.
    const replay = await api('POST', `/api/v1/workforce/employees/${employeeId}/clock`, tokenA, {
      event: 'IN',
      eventId: 'e1',
    });
    expect(replay.body.duplicate).toBe(true);

    // A second distinct IN without an OUT is refused.
    const doubleIn = await api('POST', `/api/v1/workforce/employees/${employeeId}/clock`, tokenA, {
      event: 'IN',
      eventId: 'e2',
    });
    expect(doubleIn.status).toBe(409);

    const clockOut = await api('POST', `/api/v1/workforce/employees/${employeeId}/clock`, tokenA, {
      event: 'OUT',
      eventId: 'e3',
    });
    expect(clockOut.status).toBe(201);

    const report = await api('GET', `/api/v1/workforce/employees/${employeeId}/attendance`, tokenA);
    expect(report.status).toBe(200);
    expect(report.body.sessions).toBe(1);
    expect(report.body.open).toBe(false);
  });

  it('HCM-004: shifts come from configuration; the roster reflects assignments', async () => {
    const bad = await api('POST', '/api/v1/workforce/shifts/assign', tokenA, {
      employeeId,
      shiftKey: 'treca',
      date: '2026-09-10',
    });
    expect(bad.status).toBe(400);

    const ok = await api('POST', '/api/v1/workforce/shifts/assign', tokenA, {
      employeeId,
      shiftKey: 'prva',
      date: '2026-09-10',
    });
    expect(ok.status).toBe(201);

    // Reassignment wins — latest assignment per employee per date.
    await api('POST', '/api/v1/workforce/shifts/assign', tokenA, {
      employeeId,
      shiftKey: 'druga',
      date: '2026-09-10',
    });
    const roster = await api('GET', '/api/v1/workforce/roster?date=2026-09-10', tokenA);
    expect(roster.status).toBe(200);
    const entries = roster.body.roster as Array<{ employeeId: string; shiftKey: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.shiftKey).toBe('druga');
  });

  it('HCM-002: leave goes through approval; a duplicate request conflicts', async () => {
    const leave = await api('POST', '/api/v1/workforce/leave', tokenA, {
      employeeId,
      from: '2026-10-01',
      to: '2026-10-05',
      type: 'godisnji',
    });
    expect(leave.status).toBe(201);
    expect(leave.body.approvalId).toBeTruthy();
    leaveKey = leave.body.leaveKey as string;

    const status = await api(
      'GET',
      `/api/v1/workforce/leave/status?key=${encodeURIComponent(leaveKey)}`,
      tokenA,
    );
    expect(status.body.status).toBe('REQUESTED');

    const again = await api('POST', '/api/v1/workforce/leave', tokenA, {
      employeeId,
      from: '2026-10-01',
      to: '2026-10-05',
      type: 'godisnji',
    });
    expect(again.status).toBe(409);
  });

  it('HCM-006/007: certifications are recorded and expiry is flagged', async () => {
    const set = await api(
      'POST',
      `/api/v1/workforce/employees/${employeeId}/certifications`,
      tokenA,
      {
        certifications: [
          { name: 'Viljuškar', until: '2027-01-01' },
          { name: 'Zavarivanje', until: '2025-01-01' },
        ],
      },
    );
    expect(set.status).toBe(201);

    const list = await api(
      'GET',
      `/api/v1/workforce/employees/${employeeId}/certifications`,
      tokenA,
    );
    const certs = list.body.certifications as Array<{ name: string; expired: boolean }>;
    expect(certs).toHaveLength(2);
    expect(certs.find((c) => c.name === 'Viljuškar')?.expired).toBe(false);
    expect(certs.find((c) => c.name === 'Zavarivanje')?.expired).toBe(true);
  });

  it('HCM-009: the performance snapshot combines operations and attendance', async () => {
    const perf = await api('GET', `/api/v1/workforce/employees/${employeeId}/performance`, tokenA);
    expect(perf.status).toBe(200);
    expect(perf.body.completedOperations).toBe(0);
    expect(Number(perf.body.attendanceHours)).toBeGreaterThanOrEqual(0);
  });

  it('HCM-012: payroll export pushes through the connector exactly once per period', async () => {
    const first = await api('POST', '/api/v1/workforce/payroll/export', tokenA, {
      connectorKey: 'payroll-main',
      period: '2026-09',
    });
    expect(first.status).toBe(201);
    expect(first.body.existing).toBe(false);
    expect(first.body.employees).toBe(1);
    const reference = first.body.reference as string;
    expect(reference).toBeTruthy();

    const replay = await api('POST', '/api/v1/workforce/payroll/export', tokenA, {
      connectorKey: 'payroll-main',
      period: '2026-09',
    });
    expect(replay.body.existing).toBe(true);
    expect(replay.body.reference).toBe(reference);
  });

  it('AUTHZ: workforce mutations need hcm.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s203a', subject: 'idp|s203-nobody' });
    const denied = await api('POST', `/api/v1/workforce/employees/${employeeId}/clock`, stranger, {
      event: 'IN',
      eventId: 'x1',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
