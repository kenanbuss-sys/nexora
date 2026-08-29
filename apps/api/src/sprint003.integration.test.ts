import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 003 acceptance tests (docs/implementation/SPRINT_003_MDM_PIM.md):
 * canonical parties with duplicate detection and merge redirects, governed
 * external identity mapping; products, SKUs, lifecycle invariants, barcode
 * uniqueness and scan lookup, UOM conversions. Real PostgreSQL (INTEGRATION=1).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 003 — MDM + PIM', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s3a', subject: 'idp|s3-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s3b', subject: 'idp|s3b-admin' });

  let tenantAId = '';

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
    prisma = createDb({ connectionString: DB_URL, max: 3 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "uom_conversion", "barcode", "sku", "product",
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

    const a = await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s3a',
      name: 'Sprint3 Tenant A',
      initialAdmin: {
        email: 'admin@s3a.example',
        displayName: 'S3 Admin',
        idpSubject: 'idp|s3-admin',
      },
    });
    tenantAId = (a.body.tenant as { id: string }).id;
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s3b',
      name: 'Sprint3 Tenant B',
      initialAdmin: {
        email: 'admin@s3b.example',
        displayName: 'S3B Admin',
        idpSubject: 'idp|s3b-admin',
      },
    });
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MDM: parties, duplicate detection, merge with preserved redirect', async () => {
    const first = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Acme Industries',
      email: 'office@acme.example',
    });
    expect(first.status).toBe(201);
    const duplicate = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: '  acme   industries ',
      taxId: 'TX-1',
    });
    expect(duplicate.status).toBe(201);

    const dupes = await api('GET', '/api/v1/parties/duplicates', tokenA);
    const groups = dupes.body.duplicates as Array<{ name: string; partyIds: string[] }>;
    expect(groups.some((g) => g.name === 'acme industries' && g.partyIds.length === 2)).toBe(true);

    // Map an external identity to the loser BEFORE the merge.
    await api('POST', '/api/v1/parties/external-identities', tokenA, {
      partyId: duplicate.body.id,
      sourceSystem: 'legacy-erp',
      externalId: 'CUST-042',
    });

    const merged = await api('POST', '/api/v1/parties/merge', tokenA, {
      winnerId: first.body.id,
      loserId: duplicate.body.id,
    });
    expect(merged.status).toBe(201);
    expect(merged.body.id).toBe(first.body.id);

    // Reading the merged (loser) id redirects to the winner.
    const redirected = await api('GET', `/api/v1/parties/${duplicate.body.id}`, tokenA);
    expect(redirected.body.id).toBe(first.body.id);

    // The moved external identity now resolves to the winner.
    const resolved = await api('GET', '/api/v1/parties/resolve/legacy-erp/CUST-042', tokenA);
    expect(resolved.body.id).toBe(first.body.id);

    // Mapping the same external identity twice conflicts.
    const remap = await api('POST', '/api/v1/parties/external-identities', tokenA, {
      partyId: first.body.id,
      sourceSystem: 'legacy-erp',
      externalId: 'CUST-042',
    });
    expect(remap.status).toBe(409);

    // Merged party no longer appears in search; the winner does.
    const search = await api('GET', '/api/v1/parties?q=acme', tokenA);
    const found = search.body.parties as Array<{ id: string }>;
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(first.body.id);

    // party.created events reached the outbox.
    const events = await prisma.outboxEvent.count({
      where: { tenantId: tenantAId, eventType: 'party.created' },
    });
    expect(events).toBe(2);
  });

  it('MDM: tenant isolation for parties and external identities', async () => {
    const partyA = await prisma.party.findFirst({ where: { tenantId: tenantAId } });
    const foreign = await api('GET', `/api/v1/parties/${partyA?.id}`, tokenB);
    expect(foreign.status).toBe(404);
    const foreignResolve = await api('GET', '/api/v1/parties/resolve/legacy-erp/CUST-042', tokenB);
    expect(foreignResolve.status).toBe(404);
  });

  it('PIM: product -> SKU lifecycle with invariants', async () => {
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'CHAIR-01',
      name: 'Ergonomic Chair',
    });
    expect(product.status).toBe(201);

    const duplicateCode = await api('POST', '/api/v1/products', tokenA, {
      code: 'CHAIR-01',
      name: 'Another',
    });
    expect(duplicateCode.status).toBe(409);

    const published = await api('POST', `/api/v1/products/${product.body.id}/publish`, tokenA);
    expect(published.body.status).toBe('PUBLISHED');
    const again = await api('POST', `/api/v1/products/${product.body.id}/publish`, tokenA);
    expect(again.status).toBe(409);

    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'CHAIR-01-BLK',
      name: 'Ergonomic Chair — Black',
      baseUom: 'pcs',
    });
    expect(sku.status).toBe(201);
    expect(sku.body.status).toBe('DRAFT');

    const activated = await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    expect(activated.body.status).toBe('ACTIVE');

    const discontinued = await api('POST', `/api/v1/skus/${sku.body.id}/discontinue`, tokenA);
    expect(discontinued.body.status).toBe('DISCONTINUED');

    // A discontinued SKU cannot be reactivated.
    const reactivate = await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    expect(reactivate.status).toBe(409);

    const skuEvents = await prisma.outboxEvent.count({
      where: { tenantId: tenantAId, eventType: 'sku.activated' },
    });
    expect(skuEvents).toBe(1);
  });

  it('PIM: barcode uniqueness per tenant and scan lookup', async () => {
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'DESK-01',
      name: 'Standing Desk',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'DESK-01-OAK',
      name: 'Standing Desk — Oak',
      baseUom: 'pcs',
    });
    const assigned = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: sku.body.id,
      value: '3859890000015',
    });
    expect(assigned.status).toBe(201);

    // Same barcode again in the same tenant -> conflict.
    const conflict = await api('POST', '/api/v1/barcodes', tokenA, {
      skuId: sku.body.id,
      value: '3859890000015',
    });
    expect(conflict.status).toBe(409);

    // Scan-path lookup returns the SKU.
    const lookup = await api('GET', '/api/v1/barcodes/3859890000015', tokenA);
    expect(lookup.body.code).toBe('DESK-01-OAK');

    // Another tenant can use the same value (tenant-scoped uniqueness)…
    const productB = await api('POST', '/api/v1/products', tokenB, {
      code: 'DESK-01',
      name: 'Desk in tenant B',
    });
    const skuB = await api('POST', '/api/v1/skus', tokenB, {
      productId: productB.body.id,
      code: 'DESK-01-OAK',
      name: 'B desk',
      baseUom: 'pcs',
    });
    const assignedB = await api('POST', '/api/v1/barcodes', tokenB, {
      skuId: skuB.body.id,
      value: '3859890000015',
    });
    expect(assignedB.status).toBe(201);
    // …and lookups stay isolated.
    const lookupB = await api('GET', '/api/v1/barcodes/3859890000015', tokenB);
    expect(lookupB.body.code).toBe('DESK-01-OAK');
    expect((lookupB.body as { id: string }).id).toBe(skuB.body.id);
  });

  it('PIM: UOM conversions and catalog search', async () => {
    const sku = await prisma.sku.findFirst({
      where: { tenantId: tenantAId, code: 'DESK-01-OAK' },
    });
    const set = await api('PUT', `/api/v1/skus/${sku?.id}/uom-conversions`, tokenA, {
      fromUom: 'box',
      toUom: 'pcs',
      factor: 4,
    });
    expect(set.status).toBe(200);
    const conversions = await api('GET', `/api/v1/skus/${sku?.id}/uom-conversions`, tokenA);
    expect(conversions.body.conversions).toEqual([{ fromUom: 'box', toUom: 'pcs', factor: '4' }]);

    const invalid = await api('PUT', `/api/v1/skus/${sku?.id}/uom-conversions`, tokenA, {
      fromUom: 'box',
      toUom: 'pcs',
      factor: -1,
    });
    expect(invalid.status).toBe(400);

    const search = await api('GET', '/api/v1/products/search?q=desk', tokenA);
    expect((search.body.products as unknown[]).length).toBe(1);
    const searchB = await api('GET', '/api/v1/products/search?q=chair', tokenB);
    expect(searchB.body.products).toEqual([]);
  });
});
