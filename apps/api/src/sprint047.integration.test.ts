import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 047 acceptance tests: effective-dated exchange rates —
 * immutable rows, as-of resolution, inverse fallback and isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 047 — exchange rates', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s47a', subject: 'idp|s47-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s47b', subject: 'idp|s47b-admin' });

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
      `TRUNCATE TABLE "exchange_rate", "sales_team_member", "sales_team", "territory",
       "packaging_level", "sku_substitution", "discount_rule",
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
      ['test-s47a', 'idp|s47-admin'],
      ['test-s47b', 'idp|s47b-admin'],
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('FIN: rates are validated, immutable and audited', async () => {
    const bad = await api('POST', '/api/v1/finance/exchange-rates', tokenA, {
      baseCurrency: 'EUR',
      quoteCurrency: 'EUR',
      rate: 1,
    });
    expect(bad.status).toBe(400);

    const old = await api('POST', '/api/v1/finance/exchange-rates', tokenA, {
      baseCurrency: 'EUR',
      quoteCurrency: 'BAM',
      rate: 1.9,
      validFrom: '2026-01-01T00:00:00Z',
    });
    expect(old.status).toBe(201);

    const current = await api('POST', '/api/v1/finance/exchange-rates', tokenA, {
      baseCurrency: 'EUR',
      quoteCurrency: 'BAM',
      rate: 1.95583,
      validFrom: '2026-06-01T00:00:00Z',
    });
    expect(current.status).toBe(201);

    const duplicate = await api('POST', '/api/v1/finance/exchange-rates', tokenA, {
      baseCurrency: 'EUR',
      quoteCurrency: 'BAM',
      rate: 2,
      validFrom: '2026-06-01T00:00:00Z',
    });
    expect(duplicate.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'fin.rate.set' } });
    expect(audit).not.toBeNull();
  });

  it('FIN: conversion resolves as-of dates and inverse pairs', async () => {
    // Today uses the newest rate.
    const now = await api(
      'GET',
      '/api/v1/finance/exchange-rates/convert?from=EUR&to=BAM&amount=100',
      tokenA,
    );
    expect(now.status).toBe(200);
    expect(now.body.converted).toBe('195.58');

    // A date before June resolves the older rate — history is reproducible.
    const past = await api(
      'GET',
      '/api/v1/finance/exchange-rates/convert?from=EUR&to=BAM&amount=100&on=2026-03-01T00:00:00Z',
      tokenA,
    );
    expect(past.body.converted).toBe('190.00');

    // The inverse pair falls back to the reciprocal.
    const inverse = await api(
      'GET',
      '/api/v1/finance/exchange-rates/convert?from=BAM&to=EUR&amount=195.58',
      tokenA,
    );
    expect(Number(inverse.body.converted)).toBeCloseTo(100, 1);

    // An unmaintained pair is refused, not guessed.
    const missing = await api(
      'GET',
      '/api/v1/finance/exchange-rates/convert?from=USD&to=JPY&amount=1',
      tokenA,
    );
    expect(missing.status).toBe(400);
  });

  it('TENANCY+AUTHZ: rates are isolated and writes permissioned', async () => {
    const other = await api('GET', '/api/v1/finance/exchange-rates', tokenB);
    expect((other.body.rates as unknown[]).length).toBe(0);

    const stranger = identity.signToken({ tenantSlug: 'test-s47a', subject: 'idp|s47-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko47@primjer.example',
      displayName: 'Niko47',
      idpSubject: 'idp|s47-nobody',
    });
    const denied = await api('POST', '/api/v1/finance/exchange-rates', stranger, {
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      rate: 1.1,
    });
    expect(denied.status).toBe(403);
  });
});
