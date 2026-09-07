import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 113 acceptance tests: field-level permissions (IAM-004) —
 * configuration-declared sensitive fields are redacted server-side for
 * callers lacking the named permission; hidden UI is not authorization.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 113 — field-level permissions', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s113a', subject: 'idp|s113-admin' });

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
      slug: 'test-s113a',
      name: 'Sprint113 Tenant',
      initialAdmin: {
        email: 'admin@s113a.example',
        displayName: 'S113 Admin',
        idpSubject: 'idp|s113-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('IAM-004: readers without the named permission see redacted fields', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        iam: {
          fieldPermissions: [
            { objectType: 'party', field: 'email', permission: 'mdm.steward' },
            { objectType: 'party', field: 'taxId', permission: 'mdm.steward' },
          ],
        },
      },
    });
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'PERSON',
      name: 'Amar Osoba',
      email: 'amar@primjer.example',
      taxId: '4200000000001',
    });
    expect(party.status).toBe(201);

    // The admin holds mdm.steward → sees the values.
    const full = await api('GET', `/api/v1/parties/${party.body.id}`, tokenA);
    expect(full.body.email).toBe('amar@primjer.example');

    // A reader with only mdm.read gets the redaction marker.
    const readerRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'citac',
      permissions: ['mdm.read'],
    });
    const reader = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'citac113@primjer.example',
      displayName: 'Citac113',
      idpSubject: 'idp|s113-reader',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: reader.body.id,
      roleId: readerRole.body.id,
    });
    const readerToken = identity.signToken({
      tenantSlug: 'test-s113a',
      subject: 'idp|s113-reader',
    });
    const redacted = await api('GET', `/api/v1/parties/${party.body.id}`, readerToken);
    expect(redacted.status).toBe(200);
    expect(redacted.body.email).toBe('•••');
    expect(redacted.body.taxId).toBe('•••');
    expect(redacted.body.name).toBe('Amar Osoba');

    const search = await api('GET', '/api/v1/parties?q=Amar', readerToken);
    const row = (search.body.parties as Array<{ email: string | null }>)[0];
    expect(row?.email).toBe('•••');
  });

  it('IAM-004: clearing the rules restores visibility (versioned configuration)', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { iam: { fieldPermissions: [] } },
    });
    const readerToken = identity.signToken({
      tenantSlug: 'test-s113a',
      subject: 'idp|s113-reader',
    });
    const search = await api('GET', '/api/v1/parties?q=Amar', readerToken);
    const row = (search.body.parties as Array<{ email: string | null }>)[0];
    expect(row?.email).toBe('amar@primjer.example');
  });
});
