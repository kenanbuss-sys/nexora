import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 209 acceptance tests: engineering operations (ENG-004/005/
 * 009/010/012/014/015) — parametric BOMs, alternates, drawings, PDM
 * export, work instructions, tooling and compliance specs.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 209 — engineering operations', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s209a', subject: 'idp|s209-admin' });

  let bomId = '';

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

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "work_order_operation", "work_order",
       "routing_operation", "routing", "bom_line", "bom", "engineering_change",
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
      slug: 'test-s209a',
      name: 'Sprint209 Tenant',
      initialAdmin: {
        email: 'admin@s209a.example',
        displayName: 'S209 Admin',
        idpSubject: 'idp|s209-admin',
      },
    });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        eng: {
          parametric: {
            'ORMAR209-STD': [
              { component: 'PLOCA209-STD', base: 2, factor: 0.5, parameter: 'sirina' },
              { component: 'VIJAK209-STD', base: 8, factor: 0, parameter: null },
            ],
          },
          alternates: [
            {
              component: 'PLOCA209-STD',
              alternates: ['PLOCA209B-STD', 'NEPOSTOJECI-STD'],
            },
          ],
          complianceRequired: [{ skuCode: 'ORMAR209-STD', standards: ['EN 14749', 'CE'] }],
        },
        int: {
          connectors: [{ key: 'pdm-main', kind: 'other', adapter: 'noop', config: {} }],
        },
      },
    });

    const cabinetId = await makeSku('ORMAR209', 'Ormar 209');
    const boardId = await makeSku('PLOCA209', 'Ploča 209');
    await makeSku('PLOCA209B', 'Ploča 209 B');
    await makeSku('VIJAK209', 'Vijak 209');

    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: cabinetId });
    bomId = bom.body.id as string;
    await api('POST', `/api/v1/boms/${bomId}/lines`, tokenA, {
      componentSkuId: boardId,
      quantity: 4,
    });
    await api('POST', `/api/v1/boms/${bomId}/release`, tokenA);

    const routing = await api('POST', '/api/v1/routings', tokenA, { skuId: cabinetId });
    await api('POST', `/api/v1/routings/${routing.body.id}/operations`, tokenA, {
      name: 'Rezanje',
      workCenter: 'CNC-1',
      runMinutesPerUnit: 5,
    });
    await api('POST', `/api/v1/routings/${routing.body.id}/release`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ENG-004: parametric BOMs compute quantities from declared rules', async () => {
    const resolved = await api('POST', '/api/v1/engineering/ops/parametric/resolve', tokenA, {
      skuCode: 'ORMAR209-STD',
      parameters: { sirina: 4 },
    });
    expect(resolved.status).toBe(201);
    const lines = resolved.body.lines as Array<{ component: string; quantity: number }>;
    expect(lines.find((l) => l.component === 'PLOCA209-STD')?.quantity).toBe(4); // 2 + 0.5×4
    expect(lines.find((l) => l.component === 'VIJAK209-STD')?.quantity).toBe(8);

    const missing = await api('POST', '/api/v1/engineering/ops/parametric/resolve', tokenA, {
      skuCode: 'ORMAR209-STD',
      parameters: {},
    });
    expect(missing.status).toBe(400);
  });

  it('ENG-005: alternates validate against the SKU catalogue', async () => {
    const alternates = await api('GET', '/api/v1/engineering/ops/alternates', tokenA);
    const rows = alternates.body.alternates as Array<{
      component: string;
      alternates: string[];
      unknown: string[];
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.alternates).toEqual(['PLOCA209B-STD']);
    expect(rows[0]?.unknown).toEqual(['NEPOSTOJECI-STD']);
  });

  it('ENG-009: the drawing register keeps the latest revision', async () => {
    await api('POST', '/api/v1/engineering/ops/drawings', tokenA, {
      skuCode: 'ORMAR209-STD',
      drawingNumber: 'CRT-100',
      revision: 'A',
    });
    await api('POST', '/api/v1/engineering/ops/drawings', tokenA, {
      skuCode: 'ORMAR209-STD',
      drawingNumber: 'CRT-100',
      revision: 'B',
    });
    const drawings = await api('GET', '/api/v1/engineering/ops/drawings/ORMAR209-STD', tokenA);
    const rows = drawings.body.drawings as Array<{ drawingNumber: string; revision: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revision).toBe('B');
  });

  it('ENG-010: released BOMs export to PDM exactly once', async () => {
    const first = await api('POST', '/api/v1/engineering/ops/pdm/export', tokenA, {
      bomId,
      connectorKey: 'pdm-main',
    });
    expect(first.status).toBe(201);
    expect(first.body.existing).toBe(false);
    const replay = await api('POST', '/api/v1/engineering/ops/pdm/export', tokenA, {
      bomId,
      connectorKey: 'pdm-main',
    });
    expect(replay.body.existing).toBe(true);
    expect(replay.body.reference).toBe(first.body.reference);
  });

  it('ENG-012/014: the operator sheet merges instructions and tooling', async () => {
    await api('POST', '/api/v1/engineering/ops/instructions', tokenA, {
      skuCode: 'ORMAR209-STD',
      seq: 10,
      text: 'Postaviti ploču na CNC sto i poravnati sa graničnikom.',
    });
    await api('POST', '/api/v1/engineering/ops/tooling', tokenA, {
      skuCode: 'ORMAR209-STD',
      seq: 10,
      tools: ['Glodalo 8mm', 'Stega'],
    });
    const sheet = await api('GET', '/api/v1/engineering/ops/operator-sheet/ORMAR209-STD', tokenA);
    const operations = sheet.body.operations as Array<{
      seq: number;
      instruction: string | null;
      tools: string[];
    }>;
    expect(operations).toHaveLength(1);
    expect(operations[0]?.instruction).toContain('CNC sto');
    expect(operations[0]?.tools).toEqual(['Glodalo 8mm', 'Stega']);
  });

  it('ENG-015: the compliance report shows declared vs required standards', async () => {
    await api('POST', '/api/v1/engineering/ops/compliance', tokenA, {
      skuCode: 'ORMAR209-STD',
      standards: [{ name: 'CE' }],
    });
    const report = await api('GET', '/api/v1/engineering/ops/compliance/report', tokenA);
    const rows = report.body.rows as Array<{ declared: string[]; missing: string[] }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.declared).toEqual(['CE']);
    expect(rows[0]?.missing).toEqual(['EN 14749']);
  });

  it('AUTHZ: engineering mutations need bom.manage', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s209a', subject: 'idp|s209-nobody' });
    const denied = await api('POST', '/api/v1/engineering/ops/drawings', stranger, {
      skuCode: 'ORMAR209-STD',
      drawingNumber: 'CRT-X',
      revision: 'A',
    });
    expect([401, 403]).toContain(denied.status);
  });
});
