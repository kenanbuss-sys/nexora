import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 127 acceptance tests: contract approvals (DOC-008) —
 * activating a contract at or above the configured value threshold
 * needs a granted WF approval; SoD forbids self-approval.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 127 — contract approvals', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s127a', subject: 'idp|s127-admin' });

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
      slug: 'test-s127a',
      name: 'Sprint127 Tenant',
      initialAdmin: {
        email: 'admin@s127a.example',
        displayName: 'S127 Admin',
        idpSubject: 'idp|s127-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('DOC-008: activation above the threshold needs a granted approval; SoD holds', async () => {
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { doc: { contractApprovalThreshold: 10000 } },
    });
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Ugovorna Strana 127',
    });
    const contract = await api('POST', '/api/v1/contracts', tokenA, {
      title: 'Veliki okvirni ugovor',
      partyId: party.body.id,
      startsAt: new Date().toISOString(),
      value: 50000,
      currency: 'EUR',
    });
    const contractId = contract.body.id as string;

    // First activation attempt raises the approval and refuses.
    const first = await api('POST', `/api/v1/contracts/${contractId}/transition`, tokenA, {
      status: 'ACTIVE',
    });
    expect(first.status).toBe(409);
    const approval = await prisma.approval.findFirst({
      where: { subjectObjectType: 'contract', subjectObjectId: contractId },
    });
    expect(approval?.status).toBe('REQUESTED');

    // While pending, activation still refuses; self-approval is forbidden.
    const pending = await api('POST', `/api/v1/contracts/${contractId}/transition`, tokenA, {
      status: 'ACTIVE',
    });
    expect(pending.status).toBe(409);
    const selfApprove = await api(`POST`, `/api/v1/approvals/${approval?.id}/approve`, tokenA, {});
    expect(selfApprove.status).toBe(403);

    // A second user with approval.act grants it; activation now passes.
    const approverRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'odobravatelj',
      permissions: ['approval.act'],
    });
    const approver = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'odobravatelj127@primjer.example',
      displayName: 'Odobravatelj127',
      idpSubject: 'idp|s127-approver',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: approver.body.id,
      roleId: approverRole.body.id,
    });
    const approverToken = identity.signToken({
      tenantSlug: 'test-s127a',
      subject: 'idp|s127-approver',
    });
    const granted = await api(
      `POST`,
      `/api/v1/approvals/${approval?.id}/approve`,
      approverToken,
      {},
    );
    expect(granted.status).toBe(201);

    const activated = await api('POST', `/api/v1/contracts/${contractId}/transition`, tokenA, {
      status: 'ACTIVE',
    });
    expect(activated.status).toBe(201);
    expect(activated.body.status).toBe('ACTIVE');
  });

  it('DOC-008: below-threshold contracts activate directly', async () => {
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Mala Strana 127',
    });
    const contract = await api('POST', '/api/v1/contracts', tokenA, {
      title: 'Mali ugovor',
      partyId: party.body.id,
      startsAt: new Date().toISOString(),
      value: 500,
      currency: 'EUR',
    });
    const activated = await api(
      'POST',
      `/api/v1/contracts/${contract.body.id}/transition`,
      tokenA,
      {
        status: 'ACTIVE',
      },
    );
    expect(activated.status).toBe(201);
  });
});
