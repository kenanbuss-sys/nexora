import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 115 acceptance tests: mapping engine (INT-010) — declarative
 * field mappings per connector reshape outbound payloads: dot-paths,
 * transforms, preview, and application on push.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 115 — mapping engine', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s115a', subject: 'idp|s115-admin' });

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
      `TRUNCATE TABLE "rfq_quote", "rfq",
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
      slug: 'test-s115a',
      name: 'Sprint115 Tenant',
      initialAdmin: {
        email: 'admin@s115a.example',
        displayName: 'S115 Admin',
        idpSubject: 'idp|s115-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [{ key: 'acct-main', kind: 'accounting', adapter: 'noop', config: {} }],
          mappings: [
            {
              key: 'acct-main',
              rules: [
                { from: 'invoiceNumber', to: 'DocNum', transform: 'uppercase' },
                { from: 'total', to: 'Amounts.Gross', transform: 'number' },
                { from: 'customer.name', to: 'Partner' },
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

  it('INT-010: preview maps dot-paths and transforms without pushing', async () => {
    const preview = await api('POST', '/api/v1/connectors/acct-main/preview-mapping', tokenA, {
      payload: {
        invoiceNumber: 'inv-000042',
        total: '150.50',
        customer: { name: 'Kupac d.o.o.' },
        internalNote: 'ne izlazi napolje',
      },
    });
    expect(preview.status).toBe(201);
    expect(preview.body.rules).toBe(3);
    const mapped = preview.body.mapped as Record<string, unknown>;
    expect(mapped.DocNum).toBe('INV-000042');
    expect((mapped.Amounts as { Gross: number }).Gross).toBe(150.5);
    expect(mapped.Partner).toBe('Kupac d.o.o.');
    // Unmapped fields never leave the system.
    expect(mapped.internalNote).toBeUndefined();
  });

  it('INT-010: push applies the mapping through the port, audited', async () => {
    const push = await api('POST', '/api/v1/connectors/acct-main/push', tokenA, {
      objectType: 'Invoice',
      objectId: 'INV-000042',
      payload: { invoiceNumber: 'inv-000042', total: '150.50' },
    });
    expect(push.status).toBe(201);
    expect(push.body.ok).toBe(true);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'int.connector.push' } });
    expect(audit).not.toBeNull();
  });

  it('AUTHZ: mapping preview needs integration.read', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s115a', subject: 'idp|s115-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko115@primjer.example',
      displayName: 'Niko115',
      idpSubject: 'idp|s115-nobody',
    });
    const denied = await api('POST', '/api/v1/connectors/acct-main/preview-mapping', stranger, {
      payload: {},
    });
    expect(denied.status).toBe(403);
  });
});
