import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 042 acceptance tests: sales territories (CRM-005) — governed
 * territory master, audited account assignment, counts and isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 042 — sales territories', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s42a', subject: 'idp|s42-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s42b', subject: 'idp|s42b-admin' });

  let accountId = '';
  let territoryId = '';

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
      `TRUNCATE TABLE "territory", "packaging_level", "sku_substitution", "discount_rule",
       "user_credential",
       "downtime_event", "work_center",
       "stock_count_line", "stock_count",
       "return_order_line", "return_order", "product_category",
       "security_event", "api_key",
       "webhook_delivery", "webhook_subscription",
       "budget", "cost_center",
       "comment", "attachment_blob", "attachment", "number_sequence",
       "portal_user", "payment", "invoice",
       "qc_inspection_item", "qc_inspection", "qc_plan_item", "qc_plan", "ncr",
       "work_order_operation", "work_order",
       "mrp_suggestion", "mrp_run", "planning_policy",
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
       "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
       "quote_line", "quote", "price_list_entry", "price_list",
       "crm_activity", "opportunity", "lead", "crm_account",
       "wms_order_line", "wms_order", "scan_event", "device",
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

    for (const [slug, subject] of [
      ['test-s42a', 'idp|s42-admin'],
      ['test-s42b', 'idp|s42b-admin'],
    ] as const) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Tenant ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: 'Admin',
          idpSubject: subject,
        },
      });
    }

    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Kupac42 d.o.o.',
    });
    const account = await api('POST', '/api/v1/crm/accounts', tokenA, { partyId: party.body.id });
    accountId = account.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CRM-005: territories are governed master data', async () => {
    const created = await api('POST', '/api/v1/crm/territories', tokenA, {
      code: 'bih-sjever',
      name: 'BiH — sjever',
    });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe('BIH-SJEVER');
    territoryId = created.body.id as string;

    const duplicate = await api('POST', '/api/v1/crm/territories', tokenA, {
      code: 'BIH-SJEVER',
      name: 'Dup',
    });
    expect(duplicate.status).toBe(409);

    const ghostOwner = await api('POST', '/api/v1/crm/territories', tokenA, {
      code: 'X-1',
      name: 'Ghost',
      ownerUserId: '00000000-0000-0000-0000-000000000000',
    });
    expect(ghostOwner.status).toBe(404);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'crm.territory.create' } });
    expect(audit).not.toBeNull();
  });

  it('CRM-005: account assignment is audited and counted', async () => {
    const assigned = await api('POST', `/api/v1/crm/accounts/${accountId}/territory`, tokenA, {
      territoryId,
    });
    expect(assigned.status).toBe(201);

    const accounts = await api('GET', '/api/v1/crm/accounts', tokenA);
    const account = (
      accounts.body.accounts as Array<{ id: string; territoryId: string | null }>
    ).find((a) => a.id === accountId)!;
    expect(account.territoryId).toBe(territoryId);

    const territories = await api('GET', '/api/v1/crm/territories', tokenA);
    const territory = (
      territories.body.territories as Array<{ id: string; accountCount: number }>
    ).find((t) => t.id === territoryId)!;
    expect(territory.accountCount).toBe(1);

    // Clearing works with null.
    await api('POST', `/api/v1/crm/accounts/${accountId}/territory`, tokenA, {
      territoryId: null,
    });
    const after = await api('GET', '/api/v1/crm/territories', tokenA);
    expect(
      (after.body.territories as Array<{ id: string; accountCount: number }>).find(
        (t) => t.id === territoryId,
      )!.accountCount,
    ).toBe(0);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'crm.account.territory' },
    });
    expect(audit).not.toBeNull();
  });

  it('TENANCY: territories are isolated; assignment across tenants fails', async () => {
    const other = await api('GET', '/api/v1/crm/territories', tokenB);
    expect((other.body.territories as unknown[]).length).toBe(0);

    const party = await api('POST', '/api/v1/parties', tokenB, {
      partyType: 'ORGANIZATION',
      name: 'Tudji kupac d.o.o.',
    });
    const foreign = await api('POST', '/api/v1/crm/accounts', tokenB, { partyId: party.body.id });
    const cross = await api('POST', `/api/v1/crm/accounts/${foreign.body.id}/territory`, tokenB, {
      territoryId,
    });
    expect(cross.status).toBe(404);
  });
});
