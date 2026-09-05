import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 048 acceptance tests: consent management (MDM/GDPR) —
 * append-only records, latest-wins state, audit and isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 048 — consent management', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s48a', subject: 'idp|s48-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s48b', subject: 'idp|s48b-admin' });

  let partyId = '';

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
      `TRUNCATE TABLE "consent_record", "exchange_rate", "sales_team_member", "sales_team",
       "territory", "packaging_level", "sku_substitution", "discount_rule",
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
      ['test-s48a', 'idp|s48-admin'],
      ['test-s48b', 'idp|s48b-admin'],
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
      partyType: 'PERSON',
      name: 'Osoba48',
      email: 'osoba48@primjer.example',
    });
    partyId = party.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MDM: consent starts unasked, records append-only and latest wins', async () => {
    const initial = await api('GET', `/api/v1/parties/${partyId}/consents`, tokenA);
    expect(initial.status).toBe(200);
    const email = (
      initial.body.current as Array<{ channel: string; granted: boolean | null }>
    ).find((c) => c.channel === 'EMAIL')!;
    expect(email.granted).toBeNull();

    await api('POST', `/api/v1/parties/${partyId}/consents`, tokenA, {
      channel: 'EMAIL',
      granted: true,
      note: 'Sajam 2026',
    });
    await api('POST', `/api/v1/parties/${partyId}/consents`, tokenA, {
      channel: 'EMAIL',
      granted: false,
      note: 'Poziv korisnika',
    });

    const after = await api('GET', `/api/v1/parties/${partyId}/consents`, tokenA);
    const emailAfter = (
      after.body.current as Array<{ channel: string; granted: boolean | null }>
    ).find((c) => c.channel === 'EMAIL')!;
    expect(emailAfter.granted).toBe(false);

    // History keeps both rows — nothing was overwritten.
    const history = after.body.history as Array<{ channel: string; granted: boolean }>;
    expect(history.filter((h) => h.channel === 'EMAIL').length).toBe(2);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'mdm.consent.record' } });
    expect(audit).not.toBeNull();
  });

  it('MDM: channels are independent', async () => {
    await api('POST', `/api/v1/parties/${partyId}/consents`, tokenA, {
      channel: 'SMS',
      granted: true,
    });
    const state = await api('GET', `/api/v1/parties/${partyId}/consents`, tokenA);
    const byChannel = Object.fromEntries(
      (state.body.current as Array<{ channel: string; granted: boolean | null }>).map((c) => [
        c.channel,
        c.granted,
      ]),
    );
    expect(byChannel.SMS).toBe(true);
    expect(byChannel.EMAIL).toBe(false);
    expect(byChannel.PHONE).toBeNull();
  });

  it('TENANCY+AUTHZ: cross-tenant reads fail; recording needs mdm.steward', async () => {
    const cross = await api('GET', `/api/v1/parties/${partyId}/consents`, tokenB);
    expect(cross.status).toBe(404);

    const stranger = identity.signToken({ tenantSlug: 'test-s48a', subject: 'idp|s48-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko48@primjer.example',
      displayName: 'Niko48',
      idpSubject: 'idp|s48-nobody',
    });
    const denied = await api('POST', `/api/v1/parties/${partyId}/consents`, stranger, {
      channel: 'EMAIL',
      granted: true,
    });
    expect(denied.status).toBe(403);
  });
});
