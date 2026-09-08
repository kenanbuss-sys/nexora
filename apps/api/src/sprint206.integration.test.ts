import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 206 acceptance tests: marketing (MKT-001..012) — campaigns,
 * segments, consent-aware sends through connectors, lead capture,
 * coupons, promotion linkage, attribution, experiments, analytics.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 206 — marketing', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s206a', subject: 'idp|s206-admin' });

  let accountId = '';
  let orderId = '';
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
      `TRUNCATE TABLE "order_event", "sales_order_line", "sales_order",
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
      slug: 'test-s206a',
      name: 'Sprint206 Tenant',
      initialAdmin: {
        email: 'admin@s206a.example',
        displayName: 'S206 Admin',
        idpSubject: 'idp|s206-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        mkt: {
          segments: [
            { key: 'svi', name: 'Svi kupci', rule: 'all' },
            { key: 'bez-narudzbi', name: 'Bez narudžbi', rule: 'without-orders' },
          ],
          journeys: {
            'KAMP-1': [
              { step: 'dobrodoslica', afterDays: 0 },
              { step: 'podsjetnik', afterDays: 7 },
            ],
          },
          forms: [{ key: 'newsletter', required: ['name', 'email'] }],
          coupons: [{ code: 'LJETO10', campaign: 'KAMP-1', discountPct: 10 }],
        },
        int: {
          connectors: [{ key: 'mail-main', kind: 'other', adapter: 'noop', config: {} }],
        },
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH206',
      name: 'Sprint206 warehouse',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Marketing',
      company: 'Marketing d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    accountId = converted.body.accountId as string;
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'PROMO206',
      name: 'Promo 206',
      currency: 'EUR',
    });
    priceListId = list.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MKT-001: campaigns live in the governed register', async () => {
    const setup = await api('POST', '/api/v1/marketing/setup', tokenA);
    expect(setup.status).toBe(201);

    const created = await api('POST', '/api/v1/custom-objects/mkt_campaign/records', tokenA, {
      data: { code: 'KAMP-1', naziv: 'Ljetna kampanja', kanal: 'email', status: 'aktivna' },
    });
    expect(created.status).toBe(201);

    const list = await api('GET', '/api/v1/marketing/campaigns', tokenA);
    const campaigns = list.body.campaigns as Array<{ code: string; channel: string }>;
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]?.channel).toBe('email');
  });

  it('MKT-002/003: segments come from config and materialize into lists', async () => {
    const segments = await api('GET', '/api/v1/marketing/segments', tokenA);
    expect((segments.body.segments as unknown[]).length).toBe(2);

    const all = await api('POST', '/api/v1/marketing/lists/build', tokenA, { segmentKey: 'svi' });
    expect(all.status).toBe(201);
    expect(all.body.members).toBe(1);

    const cold = await api('POST', '/api/v1/marketing/lists/build', tokenA, {
      segmentKey: 'bez-narudzbi',
    });
    // The account has an order (DRAFT still counts) → excluded.
    expect(cold.body.members).toBe(0);
  });

  it('MKT-004: journeys are ordered steps from configuration', async () => {
    const journey = await api('GET', '/api/v1/marketing/campaigns/KAMP-1/journey', tokenA);
    const steps = journey.body.steps as Array<{ step: string; afterDays: number }>;
    expect(steps.map((s) => s.step)).toEqual(['dobrodoslica', 'podsjetnik']);
  });

  it('MKT-005/009: sends go through the connector and honour consent', async () => {
    // No consent yet → everyone is filtered out.
    const first = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/send', tokenA, {
      step: 'dobrodoslica',
      segmentKey: 'svi',
      connectorKey: 'mail-main',
    });
    expect(first.status).toBe(201);
    expect(first.body.sent).toBe(0);
    expect(first.body.skippedNoConsent).toBe(1);

    await api('POST', '/api/v1/marketing/consent', tokenA, {
      accountId,
      channel: 'email',
      granted: true,
    });
    const second = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/send', tokenA, {
      step: 'podsjetnik',
      segmentKey: 'svi',
      connectorKey: 'mail-main',
    });
    expect(second.body.sent).toBe(1);

    // Exactly-once per campaign+step+segment.
    const replay = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/send', tokenA, {
      step: 'podsjetnik',
      segmentKey: 'svi',
      connectorKey: 'mail-main',
    });
    expect(replay.body.existing).toBe(true);
    expect(replay.body.sent).toBe(1);
  });

  it('MKT-006: lead-capture forms validate and create a lead once', async () => {
    const missing = await api('POST', '/api/v1/marketing/forms/submit', tokenA, {
      formKey: 'newsletter',
      submissionId: 'sub-1',
      values: { name: 'Bez Emaila' },
    });
    expect(missing.status).toBe(400);

    const submitted = await api('POST', '/api/v1/marketing/forms/submit', tokenA, {
      formKey: 'newsletter',
      submissionId: 'sub-1',
      values: { name: 'Novi Kontakt', email: 'novi@example.com' },
    });
    expect(submitted.status).toBe(201);
    expect(submitted.body.leadId).toBeTruthy();

    const replay = await api('POST', '/api/v1/marketing/forms/submit', tokenA, {
      formKey: 'newsletter',
      submissionId: 'sub-1',
      values: { name: 'Novi Kontakt', email: 'novi@example.com' },
    });
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.leadId).toBe(submitted.body.leadId);
  });

  it('MKT-007/008: coupons validate against active campaigns; promos link once', async () => {
    const valid = await api('POST', '/api/v1/marketing/coupons/validate', tokenA, {
      code: 'LJETO10',
    });
    expect(valid.body.valid).toBe(true);
    expect(valid.body.discountPct).toBe(10);

    const unknown = await api('POST', '/api/v1/marketing/coupons/validate', tokenA, {
      code: 'NEPOSTOJI',
    });
    expect(unknown.body.valid).toBe(false);

    const promo = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/promotion', tokenA, {
      priceListId,
    });
    expect(promo.status).toBe(201);
    const dup = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/promotion', tokenA, {
      priceListId,
    });
    expect(dup.body.duplicate).toBe(true);
  });

  it('MKT-010/011/012: attribution, analytics and deterministic variants', async () => {
    const attributed = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/attribution', tokenA, {
      orderId,
    });
    expect(attributed.status).toBe(201);
    const dup = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/attribution', tokenA, {
      orderId,
    });
    expect(dup.body.duplicate).toBe(true);

    const analytics = await api('GET', '/api/v1/marketing/campaigns/KAMP-1/analytics', tokenA);
    expect(analytics.body.sends).toBe(2);
    expect(analytics.body.recipients).toBe(1);
    expect(analytics.body.attributedOrders).toBe(1);

    const v1 = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/variant', tokenA, {
      subjectId: accountId,
    });
    const v2 = await api('POST', '/api/v1/marketing/campaigns/KAMP-1/variant', tokenA, {
      subjectId: accountId,
    });
    expect(['A', 'B']).toContain(v1.body.variant);
    expect(v2.body.variant).toBe(v1.body.variant);
  });

  it('AUTHZ: marketing mutations need crm.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s206a', subject: 'idp|s206-nobody' });
    const denied = await api('POST', '/api/v1/marketing/lists/build', stranger, {
      segmentKey: 'svi',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
