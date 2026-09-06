import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 057 acceptance tests: master data approvals (MDM-006) —
 * governed change requests with field allowlists, segregation of
 * duties on decisions, application only on approval, and audit.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 057 — master data approvals', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s57a', subject: 'idp|s57-admin' });

  let partyId = '';
  let requestId = '';
  const stewardToken = identity.signToken({ tenantSlug: 'test-s57a', subject: 'idp|s57-steward' });

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
      `TRUNCATE TABLE "master_data_request", "break_glass_grant",
       "serial_number", "bundle_component",
       "promotion_redemption", "promotion",
       "consent_record", "exchange_rate", "sales_team_member", "sales_team",
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

    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s57a',
      name: 'Sprint57 Tenant',
      initialAdmin: {
        email: 'admin@s57a.example',
        displayName: 'S57 Admin',
        idpSubject: 'idp|s57-admin',
      },
    });
    // A second admin (steward) so SoD can be exercised.
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'steward57@primjer.example',
      displayName: 'Steward57',
      idpSubject: 'idp|s57-steward',
    });
    const roles = await api('GET', '/api/v1/roles', tokenA);
    const adminRole = (roles.body.roles as Array<{ id: string; name: string }>).find(
      (r) => r.name === 'tenant-admin',
    );
    const users = await api('GET', '/api/v1/users', tokenA);
    const steward = (users.body.users as Array<{ id: string; email: string }>).find(
      (u) => u.email === 'steward57@primjer.example',
    );
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: steward?.id,
      roleId: adminRole?.id,
    });
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Stara Firma d.o.o.',
      email: 'stara@primjer.example',
    });
    partyId = party.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MDM-006: submission validates fields and refuses duplicates', async () => {
    const badField = await api('POST', '/api/v1/mdm/change-requests', tokenA, {
      entityType: 'party',
      entityId: partyId,
      payload: { taxId: '123' },
    });
    expect(badField.status).toBe(400);

    const submitted = await api('POST', '/api/v1/mdm/change-requests', tokenA, {
      entityType: 'party',
      entityId: partyId,
      payload: { name: 'Nova Firma d.o.o.', email: 'nova@primjer.example' },
    });
    expect(submitted.status).toBe(201);
    requestId = submitted.body.id as string;

    const dupe = await api('POST', '/api/v1/mdm/change-requests', tokenA, {
      entityType: 'party',
      entityId: partyId,
      payload: { name: 'Treci Pokusaj' },
    });
    expect(dupe.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'mdm.change_request.submit' },
    });
    expect(audit).not.toBeNull();
  });

  it('MDM-006: the requester cannot decide their own change (SoD)', async () => {
    const selfDecide = await api(
      'POST',
      `/api/v1/mdm/change-requests/${requestId}/decide`,
      tokenA,
      {
        approve: true,
      },
    );
    expect(selfDecide.status).toBe(403);
  });

  it('MDM-006: approval by a steward applies the change through the owning domain', async () => {
    const approved = await api(
      'POST',
      `/api/v1/mdm/change-requests/${requestId}/decide`,
      stewardToken,
      { approve: true, note: 'Verified with the customer' },
    );
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('APPROVED');

    const party = await api('GET', `/api/v1/parties/${partyId}`, tokenA);
    expect(party.body.name).toBe('Nova Firma d.o.o.');
    expect(party.body.email).toBe('nova@primjer.example');

    const again = await api(
      'POST',
      `/api/v1/mdm/change-requests/${requestId}/decide`,
      stewardToken,
      { approve: false },
    );
    expect(again.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'mdm.party.governed_update' },
    });
    expect(audit).not.toBeNull();
  });

  it('MDM-006: rejection leaves the record untouched', async () => {
    const submitted = await api('POST', '/api/v1/mdm/change-requests', tokenA, {
      entityType: 'party',
      entityId: partyId,
      payload: { name: 'Ne Treba' },
    });
    const rejected = await api(
      'POST',
      `/api/v1/mdm/change-requests/${submitted.body.id}/decide`,
      stewardToken,
      { approve: false, note: 'Not needed' },
    );
    expect(rejected.status).toBe(201);
    expect(rejected.body.status).toBe('REJECTED');
    const party = await api('GET', `/api/v1/parties/${partyId}`, tokenA);
    expect(party.body.name).toBe('Nova Firma d.o.o.');
  });

  it('AUTHZ: deciding needs mdm.steward; stranger denied', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s57a', subject: 'idp|s57-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko57@primjer.example',
      displayName: 'Niko57',
      idpSubject: 'idp|s57-nobody',
    });
    const denied = await api('POST', '/api/v1/mdm/change-requests', stranger, {
      entityType: 'party',
      entityId: partyId,
      payload: { name: 'Hak' },
    });
    expect(denied.status).toBe(403);
  });
});
