import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 150 acceptance tests: electronic-signature adapter (DOC-006)
 * — contracts go out for signature through the provider-neutral port;
 * one envelope per contract, completion recorded exactly once.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 150 — e-signature', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s150a', subject: 'idp|s150-admin' });

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
      `TRUNCATE TABLE "contract", "rfq_quote", "rfq", "work_order_operation", "work_order",
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
      slug: 'test-s150a',
      name: 'Sprint150 Tenant',
      initialAdmin: {
        email: 'admin@s150a.example',
        displayName: 'S150 Admin',
        idpSubject: 'idp|s150-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let contractId = '';

  it('DOC-006: a contract goes out for signature once', async () => {
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Potpisnik 150',
    });
    const contract = await api('POST', '/api/v1/contracts', tokenA, {
      title: 'Ugovor o saradnji',
      partyId: party.body.id,
      startsAt: new Date().toISOString(),
    });
    contractId = contract.body.id as string;

    const none = await api('GET', `/api/v1/contracts/${contractId}/signature`, tokenA);
    expect(none.status).toBe(200);
    expect(none.body.status).toBe('NONE');

    const sent = await api('POST', `/api/v1/contracts/${contractId}/signature`, tokenA, {
      signerEmail: 'potpisnik@primjer.example',
    });
    expect(sent.status).toBe(201);
    expect(sent.body.envelopeId).toMatch(/^env_/);
    expect(sent.body.status).toBe('SENT');

    const repeat = await api('POST', `/api/v1/contracts/${contractId}/signature`, tokenA, {
      signerEmail: 'potpisnik@primjer.example',
    });
    expect(repeat.status).toBe(409);
  });

  it('DOC-006: polling records completion exactly once', async () => {
    const first = await api('GET', `/api/v1/contracts/${contractId}/signature`, tokenA);
    expect(first.body.status).toBe('SIGNED');
    const again = await api('GET', `/api/v1/contracts/${contractId}/signature`, tokenA);
    expect(again.body.status).toBe('SIGNED');

    const markers = await prisma.auditEvent.count({
      where: { action: 'doc.contract.signed' },
    });
    expect(markers).toBe(1);
  });

  it('DOC-006: validation — bad email and unknown contracts', async () => {
    const bad = await api('POST', `/api/v1/contracts/${contractId}/signature`, tokenA, {
      signerEmail: 'nije-email',
    });
    expect(bad.status).toBe(400);
    const ghost = await api(
      'POST',
      '/api/v1/contracts/00000000-0000-0000-0000-000000000000/signature',
      tokenA,
      { signerEmail: 'a@b.example' },
    );
    expect(ghost.status).toBe(404);
  });
});
