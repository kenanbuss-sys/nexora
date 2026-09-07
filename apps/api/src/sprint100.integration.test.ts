import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 100 acceptance tests: connector framework (INT-001) —
 * provider-neutral connector port, connectors declared purely in
 * versioned configuration, adapter validation, audited test/push.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 100 — connector framework', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s100a', subject: 'idp|s100-admin' });

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
      slug: 'test-s100a',
      name: 'Sprint100 Tenant',
      initialAdmin: {
        email: 'admin@s100a.example',
        displayName: 'S100 Admin',
        idpSubject: 'idp|s100-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        int: {
          connectors: [
            { key: 'acct-main', kind: 'accounting', adapter: 'noop', config: {} },
            { key: 'shop-hook', kind: 'commerce', adapter: 'webhook', config: { url: 'nope' } },
            { key: 'weird', kind: 'courier', adapter: 'does-not-exist', config: {} },
          ],
        },
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('INT-001: connectors come from configuration with adapter validation', async () => {
    const list = await api('GET', '/api/v1/connectors', tokenA);
    expect(list.status).toBe(200);
    const rows = list.body.connectors as Array<{
      key: string;
      valid: boolean;
      problem: string | null;
    }>;
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.key === 'acct-main')?.valid).toBe(true);
    expect(rows.find((r) => r.key === 'shop-hook')?.valid).toBe(false);
    expect(rows.find((r) => r.key === 'weird')?.problem).toContain('unknown adapter');
  });

  it('INT-001: test and push work through the port and are audited', async () => {
    const test = await api('POST', '/api/v1/connectors/acct-main/test', tokenA);
    expect(test.status).toBe(201);
    expect(test.body.ok).toBe(true);

    const push = await api('POST', '/api/v1/connectors/acct-main/push', tokenA, {
      objectType: 'Invoice',
      objectId: 'INV-000001',
      payload: { total: '100.00' },
    });
    expect(push.status).toBe(201);
    expect(push.body.ok).toBe(true);
    expect(String(push.body.reference)).toContain('noop:Invoice');

    const testAudit = await prisma.auditEvent.findFirst({
      where: { action: 'int.connector.test' },
    });
    expect(testAudit).not.toBeNull();
    const pushAudit = await prisma.auditEvent.findFirst({
      where: { action: 'int.connector.push' },
    });
    expect(pushAudit).not.toBeNull();
  });

  it('INT-001: misconfigured and unknown connectors are refused', async () => {
    const bad = await api('POST', '/api/v1/connectors/shop-hook/test', tokenA);
    expect(bad.status).toBe(400);
    const missing = await api('POST', '/api/v1/connectors/ne-postoji/test', tokenA);
    expect(missing.status).toBe(404);
  });

  it('AUTHZ: testing connectors needs integration.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s100a', subject: 'idp|s100-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko100@primjer.example',
      displayName: 'Niko100',
      idpSubject: 'idp|s100-nobody',
    });
    const denied = await api('POST', '/api/v1/connectors/acct-main/test', stranger);
    expect(denied.status).toBe(403);
  });
});
