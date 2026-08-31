import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 009 acceptance tests (docs/implementation/SPRINT_009_ENGINEERING.md):
 * versioned BOMs with one released revision, cycle guard, deterministic
 * multi-level explosion with scrap, routings with standard-time roll-up,
 * and engineering changes with separated decision rights.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 009 — Engineering', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s9a', subject: 'idp|s9-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s9b', subject: 'idp|s9b-admin' });

  // Product structure: chair = 4x leg + 1x seat; seat = 2x plank.
  let chairId = '';
  let legId = '';
  let seatId = '';
  let plankId = '';

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

  async function makeSku(code: string, name: string): Promise<string> {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${name} Standard`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
  }

  async function releasedBom(skuId: string, lines: Array<[string, number, number?]>) {
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId });
    expect(bom.status).toBe(201);
    for (const [componentSkuId, quantity, scrapPct] of lines) {
      const line = await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
        componentSkuId,
        quantity,
        ...(scrapPct !== undefined ? { scrapPct } : {}),
      });
      expect(line.status).toBe(201);
    }
    const released = await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    expect(released.body.status).toBe('RELEASED');
    return bom.body.id as string;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "routing_operation", "routing", "bom_line", "bom",
       "engineering_change",
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
      slug: 'test-s9a',
      name: 'Sprint9 Tenant A',
      initialAdmin: {
        email: 'admin@s9a.example',
        displayName: 'S9 Admin',
        idpSubject: 'idp|s9-admin',
      },
    });
    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s9b',
      name: 'Sprint9 Tenant B',
      initialAdmin: {
        email: 'admin@s9b.example',
        displayName: 'S9B Admin',
        idpSubject: 'idp|s9b-admin',
      },
    });

    chairId = await makeSku('CHAIR', 'Chair');
    legId = await makeSku('LEG', 'Chair Leg');
    seatId = await makeSku('SEAT', 'Seat');
    plankId = await makeSku('PLANK', 'Plank');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ENG: released revisions are exclusive per SKU; versions increment', async () => {
    await releasedBom(seatId, [[plankId, 2]]);
    const v1 = await api('GET', `/api/v1/boms?skuId=${seatId}`, tokenA);
    expect((v1.body.boms as Array<{ status: string }>)[0]?.status).toBe('RELEASED');

    // New draft becomes v2; releasing obsoletes v1.
    const draft = await api('POST', '/api/v1/boms', tokenA, { skuId: seatId });
    expect(draft.body.version).toBe(2);
    await api('POST', `/api/v1/boms/${draft.body.id}/lines`, tokenA, {
      componentSkuId: plankId,
      quantity: 3,
    });
    await api('POST', `/api/v1/boms/${draft.body.id}/release`, tokenA);

    const all = await api('GET', `/api/v1/boms?skuId=${seatId}`, tokenA);
    const statuses = (all.body.boms as Array<{ version: number; status: string }>).map(
      (b) => `${b.version}:${b.status}`,
    );
    expect(statuses).toContain('2:RELEASED');
    expect(statuses).toContain('1:OBSOLETE');

    // Only one draft per SKU at a time.
    const draft2 = await api('POST', '/api/v1/boms', tokenA, { skuId: seatId });
    expect(draft2.status).toBe(201);
    const draft3 = await api('POST', '/api/v1/boms', tokenA, { skuId: seatId });
    expect(draft3.status).toBe(409);
  });

  it('ENG: multi-level explosion multiplies quantities and applies scrap', async () => {
    // chair = 4x leg (+25% scrap) + 1x seat; seat(v2) = 3x plank.
    await releasedBom(chairId, [
      [legId, 4, 25],
      [seatId, 1],
    ]);

    const exploded = await api('GET', `/api/v1/boms/explode?skuId=${chairId}&quantity=10`, tokenA);
    expect(exploded.status).toBe(200);
    const components = exploded.body.components as Array<{
      skuId: string;
      quantity: string;
      level: number;
    }>;
    const legs = components.find((c) => c.skuId === legId);
    const seats = components.find((c) => c.skuId === seatId);
    const planks = components.find((c) => c.skuId === plankId);
    expect(Number(legs?.quantity)).toBe(50); // 10 × 4 × 1.25
    expect(Number(seats?.quantity)).toBe(10);
    expect(planks?.level).toBe(2);
    expect(Number(planks?.quantity)).toBe(30); // 10 × 1 × 3
  });

  it('ENG: BOM cycles are refused', async () => {
    // plank cannot contain chair (chair -> seat -> plank exists).
    const draft = await api('POST', '/api/v1/boms', tokenA, { skuId: plankId });
    const cyclic = await api('POST', `/api/v1/boms/${draft.body.id}/lines`, tokenA, {
      componentSkuId: chairId,
      quantity: 1,
    });
    expect(cyclic.status).toBe(400);

    // Direct self-reference refused too.
    const self = await api('POST', `/api/v1/boms/${draft.body.id}/lines`, tokenA, {
      componentSkuId: plankId,
      quantity: 1,
    });
    expect(self.status).toBe(400);
  });

  it('ENG: routing releases and rolls up standard time', async () => {
    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: chairId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Cut',
      workCenter: 'SAW-1',
      setupMinutes: 15,
      runMinutesPerUnit: 2,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Assemble',
      workCenter: 'BENCH-2',
      setupMinutes: 5,
      runMinutesPerUnit: 8,
    });
    const released = await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);
    expect(released.body.status).toBe('RELEASED');

    const time = await api(
      'GET',
      `/api/v1/boms/standard-time?skuId=${chairId}&quantity=10`,
      tokenA,
    );
    // 15 + 2×10 + 5 + 8×10 = 120
    expect(time.body.totalMinutes).toBe('120');
    expect(time.body.operations).toBe(2);
  });

  it('ENG: the requester cannot decide their own engineering change', async () => {
    const change = await api('POST', '/api/v1/engineering-changes', tokenA, {
      targetSkuId: chairId,
      title: 'Thicker legs',
    });
    expect(change.status).toBe(201);

    const selfDecide = await api(
      'POST',
      `/api/v1/engineering-changes/${change.body.id}/approve`,
      tokenA,
    );
    expect(selfDecide.status).toBe(403);
  });

  it('TENANCY: engineering data is invisible across tenants', async () => {
    const boms = await api('GET', '/api/v1/boms', tokenB);
    expect((boms.body.boms as unknown[]).length).toBe(0);
    const explodeForeign = await api(
      'GET',
      `/api/v1/boms/explode?skuId=${chairId}&quantity=1`,
      tokenB,
    );
    expect((explodeForeign.body.components as unknown[]).length).toBe(0);
  });
});
