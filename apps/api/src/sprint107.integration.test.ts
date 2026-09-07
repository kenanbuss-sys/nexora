import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 107 acceptance tests: template lifecycle (DOC-005) — DRAFT/
 * ACTIVE/RETIRED on document templates; retired templates refuse to
 * render while immutable versions stay for history; audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 107 — template lifecycle', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s107a', subject: 'idp|s107-admin' });

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
      slug: 'test-s107a',
      name: 'Sprint107 Tenant',
      initialAdmin: {
        email: 'admin@s107a.example',
        displayName: 'S107 Admin',
        idpSubject: 'idp|s107-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('DOC-005: lifecycle transitions are audited; retired templates refuse to render', async () => {
    const published = await api('POST', '/api/v1/document-templates/publish', tokenA, {
      key: 'ponuda-107',
      name: 'Ponuda 107',
      content: 'Postovani {{name}},',
    });
    expect(published.status).toBe(201);
    expect(published.body.status).toBe('ACTIVE');

    const list = await api('GET', '/api/v1/document-templates', tokenA);
    const row = (list.body.templates as Array<{ key: string; status: string }>).find(
      (t) => t.key === 'ponuda-107',
    );
    expect(row?.status).toBe('ACTIVE');

    const retired = await api('POST', '/api/v1/document-templates/ponuda-107/status', tokenA, {
      status: 'RETIRED',
    });
    expect(retired.status).toBe(201);

    const refused = await api('GET', '/api/v1/document-templates/ponuda-107', tokenA);
    expect(refused.status).toBe(409);

    // Immutable history survives retirement.
    const versions = await prisma.documentTemplateVersion.count({
      where: { tenantId: (await prisma.tenant.findFirst({ where: { slug: 'test-s107a' } }))?.id },
    });
    expect(versions).toBe(1);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'document.template.status' },
    });
    expect(audit).not.toBeNull();
  });

  it('DOC-005: reactivating restores rendering; new versions still publish', async () => {
    await api('POST', '/api/v1/document-templates/ponuda-107/status', tokenA, {
      status: 'ACTIVE',
    });
    const again = await api('GET', '/api/v1/document-templates/ponuda-107', tokenA);
    expect(again.status).toBe(200);

    const v2 = await api('POST', '/api/v1/document-templates/publish', tokenA, {
      key: 'ponuda-107',
      name: 'Ponuda 107',
      content: 'Postovani {{name}}, v2',
    });
    expect(v2.body.version).toBe(2);
  });

  it('AUTHZ: lifecycle changes need document.issue', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s107a', subject: 'idp|s107-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko107@primjer.example',
      displayName: 'Niko107',
      idpSubject: 'idp|s107-nobody',
    });
    const denied = await api('POST', '/api/v1/document-templates/ponuda-107/status', stranger, {
      status: 'RETIRED',
    });
    expect(denied.status).toBe(403);
  });
});
