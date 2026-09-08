import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 207 acceptance tests: sustainability (ESG-001..010) —
 * energy/waste ledgers, emissions from configured factors, material
 * and supplier attributes, KPIs and targets, compliance evidence,
 * report export and analytics.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 207 — sustainability', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s207a', subject: 'idp|s207-admin' });

  let supplierId = '';

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
      `TRUNCATE TABLE "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
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
      slug: 'test-s207a',
      name: 'Sprint207 Tenant',
      initialAdmin: {
        email: 'admin@s207a.example',
        displayName: 'S207 Admin',
        idpSubject: 'idp|s207-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        esg: {
          kpis: [
            { key: 'energy-kwh', name: 'Potrošnja energije', unit: 'kWh', target: 2000 },
            { key: 'recycling-pct', name: 'Stopa recikliranja', unit: '%', target: 50 },
          ],
          emissionFactors: { struja: 0.35, plin: 0.2 },
          materials: [{ skuCode: 'EKO207-STD', recycledPct: 80, hazardous: false }],
        },
        int: {
          connectors: [{ key: 'esg-report', kind: 'other', adapter: 'noop', config: {} }],
        },
      },
    });
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'EKO207',
      name: 'Eko proizvod',
    });
    await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'EKO207-STD',
      name: 'Eko Std',
      baseUom: 'pcs',
    });
    const supplier = await api('POST', '/api/v1/suppliers', tokenA, {
      name: 'Zeleni dobavljač d.o.o.',
    });
    supplierId = supplier.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ESG-001/002: energy and waste record idempotently', async () => {
    const energy = await api('POST', '/api/v1/esg/energy', tokenA, {
      facility: 'pogon-1',
      period: '2026-09',
      source: 'struja',
      kwh: 1200,
    });
    expect(energy.status).toBe(201);
    expect(energy.body.duplicate).toBe(false);

    const replay = await api('POST', '/api/v1/esg/energy', tokenA, {
      facility: 'pogon-1',
      period: '2026-09',
      source: 'struja',
      kwh: 1200,
    });
    expect(replay.body.duplicate).toBe(true);

    await api('POST', '/api/v1/esg/energy', tokenA, {
      facility: 'pogon-1',
      period: '2026-09',
      source: 'plin',
      kwh: 500,
    });
    await api('POST', '/api/v1/esg/waste', tokenA, {
      facility: 'pogon-1',
      period: '2026-09',
      kind: 'karton',
      kg: 300,
      disposal: 'recikliranje',
    });
    const waste = await api('POST', '/api/v1/esg/waste', tokenA, {
      facility: 'pogon-1',
      period: '2026-09',
      kind: 'mijesani',
      kg: 100,
      disposal: 'deponija',
    });
    expect(waste.status).toBe(201);
  });

  it('ESG-005: emissions derive from configured factors', async () => {
    const emissions = await api('GET', '/api/v1/esg/emissions/2026-09', tokenA);
    expect(emissions.status).toBe(200);
    // 1200×0.35 + 500×0.2 = 420 + 100 = 520
    expect(emissions.body.totalKgCo2).toBe(520);
    expect((emissions.body.bySource as Record<string, number>).struja).toBe(420);
  });

  it('ESG-003: material attributes join config to the SKU catalogue', async () => {
    const materials = await api('GET', '/api/v1/esg/materials', tokenA);
    const rows = materials.body.materials as Array<{
      skuCode: string;
      known: boolean;
      recycledPct: number;
    }>;
    const eko = rows.find((r) => r.skuCode === 'EKO207-STD');
    expect(eko?.known).toBe(true);
    expect(eko?.recycledPct).toBe(80);
  });

  it('ESG-004/008: KPI targets evaluate against measured actuals', async () => {
    const targets = await api('GET', '/api/v1/esg/targets/2026-09', tokenA);
    const rows = targets.body.targets as Array<{ key: string; actual: number; met: boolean }>;
    const energy = rows.find((r) => r.key === 'energy-kwh');
    expect(energy?.actual).toBe(1700);
    expect(energy?.met).toBe(true); // cap 2000
    const recycling = rows.find((r) => r.key === 'recycling-pct');
    expect(recycling?.actual).toBe(75); // 300 / 400
    expect(recycling?.met).toBe(true); // floor 50
  });

  it('ESG-006: supplier sustainability ratings — the latest wins', async () => {
    await api('POST', '/api/v1/esg/suppliers/rating', tokenA, {
      supplierId,
      score: 3,
    });
    await api('POST', '/api/v1/esg/suppliers/rating', tokenA, {
      supplierId,
      score: 5,
      certification: 'ISO 14001',
    });
    const ratings = await api('GET', '/api/v1/esg/suppliers/ratings', tokenA);
    const rows = ratings.body.ratings as Array<{ score: number; certification: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.score).toBe(5);
    expect(rows[0]?.certification).toBe('ISO 14001');
  });

  it('ESG-007: compliance evidence flags expiry', async () => {
    await api('POST', '/api/v1/esg/setup', tokenA);
    await api('POST', '/api/v1/custom-objects/esg_evidence/records', tokenA, {
      data: { naziv: 'Okolinska dozvola', vrsta: 'dozvola', vrijedi_do: '2027-06-30' },
    });
    await api('POST', '/api/v1/custom-objects/esg_evidence/records', tokenA, {
      data: { naziv: 'Stari certifikat', vrsta: 'certifikat', vrijedi_do: '2025-01-01' },
    });
    const evidence = await api('GET', '/api/v1/esg/evidence', tokenA);
    const rows = evidence.body.evidence as Array<{ name: string; expired: boolean }>;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.name === 'Okolinska dozvola')?.expired).toBe(false);
    expect(rows.find((r) => r.name === 'Stari certifikat')?.expired).toBe(true);
  });

  it('ESG-009/010: analytics summarize the period; export is exactly-once', async () => {
    const analytics = await api('GET', '/api/v1/esg/analytics/2026-09', tokenA);
    expect(analytics.body.energyKwh).toBe(1700);
    expect(analytics.body.wasteKg).toBe(400);
    expect(analytics.body.recyclingPct).toBe(75);
    expect(analytics.body.totalKgCo2).toBe(520);

    const first = await api('POST', '/api/v1/esg/reports/export', tokenA, {
      connectorKey: 'esg-report',
      period: '2026-09',
    });
    expect(first.status).toBe(201);
    expect(first.body.existing).toBe(false);
    const replay = await api('POST', '/api/v1/esg/reports/export', tokenA, {
      connectorKey: 'esg-report',
      period: '2026-09',
    });
    expect(replay.body.existing).toBe(true);
    expect(replay.body.reference).toBe(first.body.reference);
  });

  it('AUTHZ: ESG mutations need organization.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s207a', subject: 'idp|s207-nobody' });
    const denied = await api('POST', '/api/v1/esg/energy', stranger, {
      facility: 'pogon-1',
      period: '2026-09',
      source: 'struja',
      kwh: 1,
    });
    expect([401, 403]).toContain(denied.status);
  });
});
