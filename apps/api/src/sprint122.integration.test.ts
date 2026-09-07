import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 122 acceptance tests: customer-side approvals (B2B-007) —
 * portal orders above the configured threshold hold as drafts until an
 * approver from the same account clears them; SoD forbids
 * self-approval; the seller cannot confirm a held draft.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 122 — customer approvals', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s122a', subject: 'idp|s122-admin' });
  const customerToken = identity.signToken({
    tenantSlug: 'test-s122a',
    subject: 'idp|s122-customer',
  });

  let skuId = '';
  let accountId = '';

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
       "portal_user", "payment", "invoice",
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
      slug: 'test-s122a',
      name: 'Sprint122 Tenant',
      initialAdmin: {
        email: 'admin@s122a.example',
        displayName: 'S122 Admin',
        idpSubject: 'idp|s122-admin',
      },
    });
    await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH122', name: 'Sprint122 warehouse' });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'POR122',
      name: 'POR122 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'POR122-STD',
      name: 'POR122 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Devedesetpet',
      company: 'Kupac122 d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;

    const portalRole = await api('POST', '/api/v1/roles', tokenA, {
      name: 'portal-customer',
      permissions: ['portal.access'],
    });
    const customer = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'kupac122@primjer.example',
      displayName: 'Kupac122',
      idpSubject: 'idp|s122-customer',
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: customer.body.id,
      roleId: portalRole.body.id,
    });
    await api('POST', '/api/v1/portal-users', tokenA, {
      accountId,
      idpSubject: 'idp|s122-customer',
      displayName: 'Kupac122',
    });

    const approver = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'odobravatelj122@primjer.example',
      displayName: 'Odobravatelj122',
      idpSubject: 'idp|s122-approver',
    });
    const roles = await api('GET', '/api/v1/roles', tokenA);
    const portalRoleId = (roles.body.roles as Array<{ id: string; name: string }>).find(
      (r) => r.name === 'portal-customer',
    )?.id;
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: approver.body.id,
      roleId: portalRoleId,
    });
    await api('POST', '/api/v1/portal-users', tokenA, {
      accountId,
      idpSubject: 'idp|s122-approver',
      displayName: 'Odobravatelj122',
    });
    // Orders of 100+ need customer-side approval.
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: { b2b: { customerApprovalThreshold: 100 } },
    });

    // Contract: only POR122-STD, at 42.
    const contract = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'CON122',
      name: 'Contract 95',
      currency: 'EUR',
      accountId,
    });
    await api('PUT', `/api/v1/price-lists/${contract.body.id}/entries`, tokenA, {
      skuId,
      unitPrice: 42,
    });
    await api('POST', `/api/v1/price-lists/${contract.body.id}/publish`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const approverToken = identity.signToken({
    tenantSlug: 'test-s122a',
    subject: 'idp|s122-approver',
  });

  it('B2B-007: an above-threshold order holds; the seller cannot confirm it', async () => {
    // 3 × 42 = 126 ≥ 100 → needs approval.
    const placed = await api('POST', '/api/v1/portal/orders', customerToken, {
      lines: [{ skuId, quantity: 3 }],
    });
    expect(placed.status).toBe(201);
    expect(placed.body.needsApproval).toBe(true);
    const orderId = placed.body.id as string;

    const blocked = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {});
    expect(blocked.status).toBe(409);

    // The placer cannot approve their own order (SoD).
    const selfApprove = await api(
      'POST',
      `/api/v1/portal/orders/${orderId}/decide`,
      customerToken,
      {
        approve: true,
      },
    );
    expect(selfApprove.status).toBe(403);

    // The account's approver clears it; the seller can now confirm.
    const approved = await api('POST', `/api/v1/portal/orders/${orderId}/decide`, approverToken, {
      approve: true,
    });
    expect(approved.status).toBe(201);
    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {
      allowBackorder: true,
    });
    expect(confirmed.status).toBe(201);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'b2b.portal.order_decision' },
    });
    expect(audit).not.toBeNull();
  });

  it('B2B-007: below-threshold orders flow straight through', async () => {
    const placed = await api('POST', '/api/v1/portal/orders', customerToken, {
      lines: [{ skuId, quantity: 1 }],
    });
    expect(placed.body.needsApproval).toBe(false);
    const confirmed = await api('POST', `/api/v1/orders/${placed.body.id}/confirm`, tokenA, {
      allowBackorder: true,
    });
    expect(confirmed.status).toBe(201);
  });

  it('AUTHZ: deciding needs portal.access on the same account', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s122a', subject: 'idp|s122-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko122@primjer.example',
      displayName: 'Niko122',
      idpSubject: 'idp|s122-nobody',
    });
    const denied = await api(
      'POST',
      '/api/v1/portal/orders/00000000-0000-0000-0000-000000000000/decide',
      stranger,
      { approve: true },
    );
    expect(denied.status).toBe(403);
  });
});
