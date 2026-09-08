import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 179 acceptance tests: conditional forms & validation rules
 * (WF-006/007) — config-driven forms with showIf conditions and
 * server-side validation; hidden fields are neither required nor
 * accepted.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 179 — conditional forms', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s179a', subject: 'idp|s179-admin' });

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
      slug: 'test-s179a',
      name: 'Sprint179 Tenant',
      initialAdmin: {
        email: 'admin@s179a.example',
        displayName: 'S179 Admin',
        idpSubject: 'idp|s179-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        wf: {
          forms: [
            {
              key: 'reklamacija',
              title: 'Reklamacija kupca',
              fields: [
                {
                  key: 'vrsta',
                  label: 'Vrsta',
                  type: 'choice',
                  required: true,
                  choices: ['osteceno', 'pogresno', 'ostalo'],
                },
                {
                  key: 'opis',
                  label: 'Opis',
                  type: 'text',
                  required: true,
                  max: 200,
                },
                {
                  key: 'iznosPovrata',
                  label: 'Iznos povrata',
                  type: 'number',
                  required: true,
                  min: 1,
                  max: 10000,
                  showIf: { field: 'vrsta', op: 'eq', value: 'osteceno' },
                },
                {
                  key: 'email',
                  label: 'Email',
                  type: 'text',
                  required: false,
                  pattern: '^[^@]+@[^@]+$',
                },
              ],
            },
          ],
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('WF-006: the effective form applies showIf conditions', async () => {
    const list = await api('GET', '/api/v1/forms', tokenA);
    expect(list.status).toBe(200);
    expect((list.body.forms as unknown[]).length).toBe(1);

    const hidden = await api('POST', '/api/v1/forms/reklamacija/effective', tokenA, {
      data: { vrsta: 'ostalo' },
    });
    const hiddenKeys = (hidden.body.fields as Array<{ key: string }>).map((f) => f.key);
    expect(hiddenKeys).not.toContain('iznosPovrata');

    const shown = await api('POST', '/api/v1/forms/reklamacija/effective', tokenA, {
      data: { vrsta: 'osteceno' },
    });
    const shownKeys = (shown.body.fields as Array<{ key: string }>).map((f) => f.key);
    expect(shownKeys).toContain('iznosPovrata');

    const ghost = await api('POST', '/api/v1/forms/nepostojeci/effective', tokenA, { data: {} });
    expect(ghost.status).toBe(404);
  });

  it('WF-007: submissions validate server-side per rule', async () => {
    const ok = await api('POST', '/api/v1/forms/reklamacija/submit', tokenA, {
      data: { vrsta: 'osteceno', opis: 'Razbijeno staklo', iznosPovrata: 120, email: 'a@b.ba' },
    });
    expect(ok.status).toBe(201);
    expect((ok.body.data as Record<string, unknown>).iznosPovrata).toBe(120);

    const missing = await api('POST', '/api/v1/forms/reklamacija/submit', tokenA, {
      data: { vrsta: 'osteceno', opis: 'x' },
    });
    expect(missing.status).toBe(400);

    const badChoice = await api('POST', '/api/v1/forms/reklamacija/submit', tokenA, {
      data: { vrsta: 'nepoznato', opis: 'x' },
    });
    expect(badChoice.status).toBe(400);

    const badEmail = await api('POST', '/api/v1/forms/reklamacija/submit', tokenA, {
      data: { vrsta: 'ostalo', opis: 'x', email: 'nije-email' },
    });
    expect(badEmail.status).toBe(400);

    const overMax = await api('POST', '/api/v1/forms/reklamacija/submit', tokenA, {
      data: { vrsta: 'osteceno', opis: 'x', iznosPovrata: 99999 },
    });
    expect(overMax.status).toBe(400);
  });

  it('WF-006: hidden fields are rejected when submitted', async () => {
    const smuggled = await api('POST', '/api/v1/forms/reklamacija/submit', tokenA, {
      data: { vrsta: 'ostalo', opis: 'x', iznosPovrata: 50 },
    });
    expect(smuggled.status).toBe(400);
  });

  it('WF-007: valid submissions are audited', async () => {
    const audits = await prisma.auditEvent.count({
      where: { action: 'wf.form.submit', objectId: 'reklamacija' },
    });
    expect(audits).toBe(1);
  });
});
