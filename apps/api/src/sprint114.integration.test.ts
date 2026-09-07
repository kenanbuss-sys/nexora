import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 114 acceptance tests: record-level access (IAM-005) — owner
 * rules from versioned configuration restrict reads to records the
 * caller owns unless they hold the exempt permission.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 114 — record-level access', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s114a', subject: 'idp|s114-admin' });

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
      slug: 'test-s114a',
      name: 'Sprint114 Tenant',
      initialAdmin: {
        email: 'admin@s114a.example',
        displayName: 'S114 Admin',
        idpSubject: 'idp|s114-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('IAM-005: owner rules scope account reads; exempt permission sees all', async () => {
    // Rule: crm_account visible only to its owner unless crm.manage held.
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        iam: {
          recordRules: [
            { objectType: 'crm_account', mode: 'owner', exemptPermission: 'crm.manage' },
          ],
        },
      },
    });

    // Admin creates two accounts (admin becomes owner of both).
    for (const name of ['Vlasnikov Kupac', 'Tudji Kupac']) {
      const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
        name,
        company: `${name} d.o.o.`,
      });
      await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    }

    // A sales user without crm.manage owns nothing → sees nothing.
    const salesRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'prodavac',
      permissions: ['crm.read'],
    });
    const sales = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'prodavac114@primjer.example',
      displayName: 'Prodavac114',
      idpSubject: 'idp|s114-sales',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: sales.body.id,
      roleId: salesRole.body.id,
    });
    const salesToken = identity.signToken({ tenantSlug: 'test-s114a', subject: 'idp|s114-sales' });
    const empty = await api('GET', '/api/v1/crm/accounts', salesToken);
    expect(empty.status).toBe(200);
    expect((empty.body.accounts as unknown[]).length).toBe(0);

    // Assign one account to the sales user → exactly that one appears.
    const all = await api('GET', '/api/v1/crm/accounts', tokenA);
    expect((all.body.accounts as unknown[]).length).toBe(2);
    const first = (all.body.accounts as Array<{ id: string }>)[0];
    await prisma.crmAccount.update({
      where: { id: first?.id ?? '' },
      data: { ownerUserId: sales.body.id as string },
    });
    const mine = await api('GET', '/api/v1/crm/accounts', salesToken);
    expect((mine.body.accounts as unknown[]).length).toBe(1);

    // Direct read of a foreign account 404s under the owner rule.
    const second = (all.body.accounts as Array<{ id: string }>)[1];
    const denied = await api('GET', `/api/v1/crm/accounts/${second?.id}`, salesToken);
    expect(denied.status).toBe(404);
    const ownRead = await api('GET', `/api/v1/crm/accounts/${first?.id}`, salesToken);
    expect(ownRead.status).toBe(200);
  });

  it('IAM-005: clearing the rule restores full visibility', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { iam: { recordRules: [] } },
    });
    const salesToken = identity.signToken({ tenantSlug: 'test-s114a', subject: 'idp|s114-sales' });
    const all = await api('GET', '/api/v1/crm/accounts', salesToken);
    expect((all.body.accounts as unknown[]).length).toBe(2);
  });
});
