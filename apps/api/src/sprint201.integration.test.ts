import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 201 acceptance tests: QMS completion (QMS-008/009/010/013/
 * 015) — defect taxonomy, root-cause discipline, CAPA follow-ups,
 * calibration linkage and quality analytics.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 201 — QMS completion', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s201a', subject: 'idp|s201-admin' });

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
      `TRUNCATE TABLE "rfq_quote", "rfq", "work_order_operation", "work_order",
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
      slug: 'test-s201a',
      name: 'Sprint201 Tenant',
      initialAdmin: {
        email: 'admin@s201a.example',
        displayName: 'S201 Admin',
        idpSubject: 'idp|s201-admin',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  let skuId = '';
  let criticalNcrId = '';

  it('QMS-010: NCRs validate defect codes against the taxonomy', async () => {
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'QM201',
      name: 'QM201 product',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'QM201-STD',
      name: 'QM201 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        qms: { defectCodes: ['SURFACE', 'DIMENSION', 'MATERIAL'] },
        ver: {
          tools: [
            {
              code: 'MIKROMETAR-1',
              name: 'Mikrometar',
              calibratedUntil: new Date(Date.now() - 86_400_000).toISOString(),
            },
          ],
        },
      },
    });

    const badCode = await api('POST', '/api/v1/qc/ncrs', tokenA, {
      skuId,
      description: 'Ogrebotina na kućištu',
      defectCode: 'BOJA',
    });
    expect(badCode.status).toBe(400);

    const created = await api('POST', '/api/v1/qc/ncrs', tokenA, {
      skuId,
      description: 'Ogrebotina na kućištu',
      defectCode: 'SURFACE',
      severity: 'CRITICAL',
    });
    expect(created.status).toBe(201);
    criticalNcrId = created.body.id as string;
  });

  it('QMS-009/008: severe NCRs need a root cause; CRITICAL spawns a CAPA task', async () => {
    const noCause = await api('POST', `/api/v1/qc/ncrs/${criticalNcrId}/resolve`, tokenA, {
      resolution: 'Popravljeno poliranjem.',
    });
    expect(noCause.status).toBe(400);

    const resolved = await api('POST', `/api/v1/qc/ncrs/${criticalNcrId}/resolve`, tokenA, {
      resolution: 'Popravljeno poliranjem.',
      rootCause: 'Neispravan stezni alat na liniji 2.',
    });
    expect(resolved.status).toBe(201);

    const capa = await prisma.task.findFirst({ where: { title: { contains: 'CAPA' } } });
    expect(capa).not.toBeNull();
  });

  it('QMS-015/013: analytics aggregate quality and calibration state', async () => {
    const analytics = await api('GET', '/api/v1/qc/ncrs/analytics', tokenA);
    expect(analytics.status).toBe(200);
    expect(analytics.body.ncrsBySeverity).toEqual({ CRITICAL: 1 });
    const codes = analytics.body.topDefectCodes as Array<Record<string, unknown>>;
    expect(codes[0]?.code).toBe('SURFACE');

    const calibration = await api('GET', '/api/v1/qc/ncrs/calibration', tokenA);
    const tools = calibration.body.tools as Array<Record<string, unknown>>;
    expect(tools[0]?.code).toBe('MIKROMETAR-1');
    expect(tools[0]?.expired).toBe(true);
  });
});
