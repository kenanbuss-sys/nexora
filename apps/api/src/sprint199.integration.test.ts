import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 199 acceptance tests: GRC registers (GRC-001..009) — one
 * setup call provisions governed registers as custom objects; records
 * validate; the overview aggregates high-severity flags.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 199 — GRC registers', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s199a', subject: 'idp|s199-admin' });

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
       "mrp_suggestion", "mrp_run", "planning_policy",
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
       "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
       "wms_order_line", "wms_order", "scan_event", "device",
       "stock_reservation", "stock_movement", "warehouse_location", "warehouse",
       "sku_channel_content", "uom_conversion", "barcode", "sku", "product",
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
      slug: 'test-s199a',
      name: 'Sprint199 Tenant',
      initialAdmin: {
        email: 'admin@s199a.example',
        displayName: 'S199 Admin',
        idpSubject: 'idp|s199-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('GRC: setup provisions the registers once', async () => {
    const before = await api('GET', '/api/v1/grc/overview', tokenA);
    expect(before.status).toBe(409);

    const setup = await api('POST', '/api/v1/grc/setup', tokenA);
    expect(setup.status).toBe(201);
    expect((setup.body.created as string[]).length).toBe(8);

    const again = await api('POST', '/api/v1/grc/setup', tokenA);
    expect((again.body.created as string[]).length).toBe(0);
    expect((again.body.existing as string[]).length).toBe(8);
  });

  it('GRC-002/006: records validate against the register fields', async () => {
    const objects = await api('GET', '/api/v1/custom-objects', tokenA);
    const defs = objects.body.objects as Array<{ key: string }>;
    expect(defs.some((d) => d.key === 'grc_risk')).toBe(true);

    const badRisk = await api('POST', '/api/v1/custom-objects/grc_risk/records', tokenA, {
      data: { naziv: 'Požar u skladištu', vjerovatnoca: 'ogromna', uticaj: 'visok' },
    });
    expect(badRisk.status).toBe(400);

    const risk = await api('POST', '/api/v1/custom-objects/grc_risk/records', tokenA, {
      data: { naziv: 'Požar u skladištu', vjerovatnoca: 'visoka', uticaj: 'visok' },
    });
    expect(risk.status).toBe(201);

    const incident = await api('POST', '/api/v1/custom-objects/grc_incident/records', tokenA, {
      data: { naslov: 'Pad palete', ozbiljnost: 'kriticna', opis: 'Paleta pala s regala.' },
    });
    expect(incident.status).toBe(201);
  });

  it('GRC: the overview aggregates registers and severity flags', async () => {
    const overview = await api('GET', '/api/v1/grc/overview', tokenA);
    expect(overview.status).toBe(200);
    const registers = overview.body.registers as Array<Record<string, unknown>>;
    expect(registers).toHaveLength(8);
    expect(registers.find((r) => r.key === 'grc_risk')?.records).toBe(1);
    expect(overview.body.highRisks).toBe(1);
    expect(overview.body.criticalIncidents).toBe(1);
  });

  it('AUTHZ: GRC setup needs configuration.publish', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s199a', subject: 'idp|s199-nobody' });
    const denied = await api('POST', '/api/v1/grc/setup', stranger);
    expect([401, 403]).toContain(denied.status);
  });
});
