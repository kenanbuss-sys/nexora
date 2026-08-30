import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 006 acceptance tests (docs/implementation/SPRINT_006_CRM_CPQ.md):
 * lead conversion, opportunity state machine, price lists with quantity
 * breaks, quote lifecycle with margin-floor approvals (SoD enforced by WF).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 006 — CRM + CPQ', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s6a', subject: 'idp|s6-admin' });
  const approverToken = identity.signToken({ tenantSlug: 'test-s6a', subject: 'idp|s6-approver' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s6b', subject: 'idp|s6b-admin' });

  let skuId = '';
  let accountId = '';
  let priceListId = '';

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
      `TRUNCATE TABLE "quote_line", "quote", "price_list_entry", "price_list",
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
      slug: 'test-s6a',
      name: 'Sprint6 Tenant A',
      initialAdmin: {
        email: 'admin@s6a.example',
        displayName: 'S6 Admin',
        idpSubject: 'idp|s6-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s6b',
      name: 'Sprint6 Tenant B',
      initialAdmin: {
        email: 'admin@s6b.example',
        displayName: 'S6B Admin',
        idpSubject: 'idp|s6b-admin',
      },
    });

    // A second user with approval + quote rights (SoD: requester != approver).
    const approver = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'approver@s6a.example',
      displayName: 'S6 Approver',
      idpSubject: 'idp|s6-approver',
    });
    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'sales-approver',
      permissions: ['approval.act', 'quote.read', 'quote.approve', 'crm.read'],
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: approver.body.id,
      roleId: role.body.id,
    });

    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'SRV-01',
      name: 'Consulting Day',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'SRV-01-STD',
      name: 'Consulting Day Standard',
      baseUom: 'day',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CRM: lead converts into party + account + opportunity exactly once', async () => {
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Iva Kupac',
      company: 'Kupac Group',
      email: 'iva@kupac.example',
    });
    expect(lead.status).toBe(201);

    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    expect(converted.status).toBe(201);
    accountId = converted.body.accountId as string;
    expect(converted.body.opportunityId).toBeTruthy();

    // Double conversion is refused.
    const again = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    expect(again.status).toBe(409);

    // The MDM party was created through the owning domain.
    const parties = await api('GET', '/api/v1/parties?q=kupac', tokenA);
    expect((parties.body.parties as unknown[]).length).toBe(1);

    const accounts = await api('GET', '/api/v1/crm/accounts', tokenA);
    const account = (accounts.body.accounts as Array<Record<string, unknown>>)[0];
    expect(account?.partyName).toBe('Kupac Group');
  });

  it('CRM: opportunity stage machine refuses illegal jumps', async () => {
    const opportunities = await api('GET', '/api/v1/crm/opportunities', tokenA);
    const opportunity = (opportunities.body.opportunities as Array<{ id: string }>)[0];
    expect(opportunity).toBeTruthy();
    const id = opportunity?.id as string;

    // NEW -> WON is not allowed.
    const illegal = await api('POST', `/api/v1/crm/opportunities/${id}/move`, tokenA, {
      stage: 'WON',
    });
    expect(illegal.status).toBe(409);

    await api('POST', `/api/v1/crm/opportunities/${id}/move`, tokenA, { stage: 'QUALIFIED' });
    await api('POST', `/api/v1/crm/opportunities/${id}/move`, tokenA, { stage: 'PROPOSAL' });
    const won = await api('POST', `/api/v1/crm/opportunities/${id}/move`, tokenA, {
      stage: 'WON',
    });
    expect(won.body.stage).toBe('WON');
  });

  it('CPQ: price list with quantity breaks resolves the right unit price', async () => {
    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'STD',
      name: 'Standard',
      currency: 'EUR',
    });
    priceListId = list.body.id as string;
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId,
      unitPrice: 1000,
    });
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId,
      minQty: 10,
      unitPrice: 900,
    });
    await api('POST', `/api/v1/price-lists/${priceListId}/publish`, tokenA);

    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    expect(quote.status).toBe(201);
    const small = await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId,
      quantity: 2,
    });
    const bigger = await api('POST', `/api/v1/quotes/${quote.body.id}/lines`, tokenA, {
      skuId,
      quantity: 12,
    });
    const lines = bigger.body.lines as Array<{ listUnitPrice: string }>;
    expect(lines[0]?.listUnitPrice).toBe('1000');
    expect(lines[1]?.listUnitPrice).toBe('900');
    expect(small.status).toBe(201);
  });

  it('CPQ: a modest discount auto-approves; quote can be sent and accepted', async () => {
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const quoteId = quote.body.id as string;
    await api('POST', `/api/v1/quotes/${quoteId}/lines`, tokenA, {
      skuId,
      quantity: 5,
      discountPct: 10,
    });
    const submitted = await api('POST', `/api/v1/quotes/${quoteId}/submit`, tokenA);
    expect(submitted.body.status).toBe('APPROVED');

    const sent = await api('POST', `/api/v1/quotes/${quoteId}/send`, tokenA);
    expect(sent.body.status).toBe('SENT');
    const accepted = await api('POST', `/api/v1/quotes/${quoteId}/accept`, tokenA);
    expect(accepted.body.status).toBe('ACCEPTED');

    const events = await prisma.outboxEvent.count({
      where: { eventType: 'quote.accepted' },
    });
    expect(events).toBeGreaterThan(0);
  });

  it('CPQ: a discount over the floor needs approval; SoD blocks self-approval', async () => {
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const quoteId = quote.body.id as string;
    await api('POST', `/api/v1/quotes/${quoteId}/lines`, tokenA, {
      skuId,
      quantity: 5,
      discountPct: 35,
    });
    const submitted = await api('POST', `/api/v1/quotes/${quoteId}/submit`, tokenA);
    expect(submitted.body.status).toBe('PENDING_APPROVAL');
    const approvalId = submitted.body.approvalId as string;
    expect(approvalId).toBeTruthy();

    // The requester cannot approve their own discount (SoD in WF).
    const selfApprove = await api('POST', `/api/v1/approvals/${approvalId}/approve`, tokenA);
    expect(selfApprove.status).toBe(403);

    // Another user with approval.act grants it.
    const granted = await api('POST', `/api/v1/approvals/${approvalId}/approve`, approverToken);
    expect([200, 201]).toContain(granted.status);

    const synced = await api('POST', `/api/v1/quotes/${quoteId}/sync-approval`, tokenA);
    expect(synced.body.status).toBe('APPROVED');
  });

  it('CPQ: versioning supersedes a sent quote', async () => {
    const quote = await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId });
    const quoteId = quote.body.id as string;
    await api('POST', `/api/v1/quotes/${quoteId}/lines`, tokenA, { skuId, quantity: 1 });
    await api('POST', `/api/v1/quotes/${quoteId}/submit`, tokenA);
    await api('POST', `/api/v1/quotes/${quoteId}/send`, tokenA);

    const revised = await api('POST', `/api/v1/quotes/${quoteId}/new-version`, tokenA);
    expect(revised.status).toBe(201);
    expect(revised.body.version).toBe(2);
    expect(revised.body.status).toBe('DRAFT');
    expect(revised.body.supersedesId).toBe(quoteId);
    expect((revised.body.lines as unknown[]).length).toBe(1);
  });

  it('ISOLATION: CRM and CPQ data is invisible across tenants', async () => {
    const accounts = await api('GET', '/api/v1/crm/accounts', tokenB);
    expect((accounts.body.accounts as unknown[]).length).toBe(0);
    const quotes = await api('GET', '/api/v1/quotes', tokenB);
    expect((quotes.body.quotes as unknown[]).length).toBe(0);
    const foreign = await api('GET', `/api/v1/crm/accounts/${accountId}`, tokenB);
    expect(foreign.status).toBe(404);
  });
});
