import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 111 acceptance tests: custom objects & form builder
 * (CORE-016/017) — tenant-defined object types with server-side record
 * validation against the field definitions.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 111 — custom objects', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s111a', subject: 'idp|s111-admin' });

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
      `TRUNCATE TABLE "custom_object_record", "custom_object_definition", "framework_agreement", "rfq_quote", "rfq",
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
      slug: 'test-s111a',
      name: 'Sprint111 Tenant',
      initialAdmin: {
        email: 'admin@s111a.example',
        displayName: 'S111 Admin',
        idpSubject: 'idp|s111-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CORE-016: definitions validate and records enforce them', async () => {
    const defined = await api('POST', '/api/v1/custom-objects', tokenA, {
      key: 'vozilo',
      name: 'Vozilo',
      fields: [
        { key: 'registracija', label: 'Registracija', type: 'text', required: true },
        { key: 'nosivost', label: 'Nosivost (t)', type: 'number', required: false },
        {
          key: 'vrsta',
          label: 'Vrsta',
          type: 'select',
          required: true,
          options: ['kamion', 'kombi'],
        },
      ],
    });
    expect(defined.status).toBe(201);
    expect((defined.body.fields as unknown[]).length).toBe(3);

    // Duplicate key refused.
    const dup = await api('POST', '/api/v1/custom-objects', tokenA, {
      key: 'vozilo',
      name: 'Vozilo 2',
      fields: [{ key: 'xx', label: 'X', type: 'text', required: false }],
    });
    expect(dup.status).toBe(409);

    // Bad field type refused.
    const badDef = await api('POST', '/api/v1/custom-objects', tokenA, {
      key: 'losa_definicija',
      name: 'Loša',
      fields: [{ key: 'xx', label: 'X', type: 'blob', required: false }],
    });
    expect(badDef.status).toBe(400);

    const saved = await api('POST', '/api/v1/custom-objects/vozilo/records', tokenA, {
      data: { registracija: 'ZE-123-AB', nosivost: 7.5, vrsta: 'kamion' },
    });
    expect(saved.status).toBe(201);

    // Missing required field / bad select value / unknown field — refused.
    const missing = await api('POST', '/api/v1/custom-objects/vozilo/records', tokenA, {
      data: { vrsta: 'kamion' },
    });
    expect(missing.status).toBe(400);
    const badSelect = await api('POST', '/api/v1/custom-objects/vozilo/records', tokenA, {
      data: { registracija: 'ZE-1', vrsta: 'bicikl' },
    });
    expect(badSelect.status).toBe(400);
    const unknown = await api('POST', '/api/v1/custom-objects/vozilo/records', tokenA, {
      data: { registracija: 'ZE-1', vrsta: 'kombi', boja: 'plava' },
    });
    expect(unknown.status).toBe(400);

    const records = await api('GET', '/api/v1/custom-objects/vozilo/records', tokenA);
    expect((records.body.records as unknown[]).length).toBe(1);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'core.custom_object.define' },
    });
    expect(audit).not.toBeNull();
  });

  it('CORE-016: retired objects take no new records', async () => {
    await api('POST', '/api/v1/custom-objects/vozilo/status', tokenA, { status: 'RETIRED' });
    const refused = await api('POST', '/api/v1/custom-objects/vozilo/records', tokenA, {
      data: { registracija: 'ZE-9', vrsta: 'kombi' },
    });
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: defining objects needs configuration.publish', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s111a', subject: 'idp|s111-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko111@primjer.example',
      displayName: 'Niko111',
      idpSubject: 'idp|s111-nobody',
    });
    const denied = await api('POST', '/api/v1/custom-objects', stranger, {
      key: 'hak',
      name: 'Hak',
      fields: [{ key: 'xx', label: 'X', type: 'text', required: false }],
    });
    expect(denied.status).toBe(403);
  });
});
