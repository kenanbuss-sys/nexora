import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 247 acceptance tests: CPQ made-to-measure pricing. m² with a
 * minimum per piece, running metre, % and per-piece surcharges, installation
 * per unit (not discounted), customer price-tier discount (governed → no
 * approval), explicit discount above the floor → approval, rule vs tier,
 * dimension limits, breakdown snapshot carried to the sales order, tenant
 * isolation of configuration.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

type Line = {
  id: string;
  quantity: string;
  lineTotal: string;
  discountPct: string;
  spec: Record<string, unknown> | null;
};

integration('Sprint 247 — made-to-measure CPQ pricing', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s247a', subject: 'idp|s247-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s247b', subject: 'idp|s247b-admin' });

  let wh = '';
  let retail = '';
  let wholesale = '';
  let priceListId = '';
  let rolo = '';
  let lajsna = '';

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

  async function makeSku(code: string) {
    const product = await api('POST', '/api/v1/products', tokenA, { code, name: code });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: `${code}-STD`,
      name: `${code} Std`,
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    return sku.body.id as string;
  }

  async function account(company: string, token = tokenA) {
    const lead = await api('POST', '/api/v1/crm/leads', token, { name: company, company });
    return (await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, token, {})).body
      .accountId as string;
  }

  const quote = async (accountId: string) =>
    (await api('POST', '/api/v1/quotes', tokenA, { accountId, priceListId })).body.id as string;
  const measured = (quoteId: string, body: Record<string, unknown>, token = tokenA) =>
    api('POST', `/api/v1/quotes/${quoteId}/measured-lines`, token, body);

  const CONFIG = {
    cpq: {
      madeToMeasure: {
        products: [
          {
            skuCode: 'ROLO-STD',
            basis: 'AREA',
            minBillable: 1.5,
            maxWidthMm: 3000,
            maxHeightMm: 3000,
          },
          { skuCode: 'LAJSNA-STD', basis: 'LENGTH', minBillable: 1 },
        ],
        surcharges: [
          { code: 'RAL', label: 'RAL boja', type: 'PERCENT', value: 10 },
          { code: 'MOTOR', label: 'Motor', type: 'PER_PIECE', value: 120, skuCodes: ['ROLO-STD'] },
          { code: 'MONTAZA', label: 'Montaža', type: 'PER_UNIT', value: 8, installation: true },
        ],
        tierDiscounts: { A: 5, VELEPRODAJA: 25 },
      },
    },
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "quote_line", "quote", "price_list_entry", "price_list", "discount_rule",
       "sales_order_line", "sales_order", "order_event", "stock_reservation", "stock_movement",
       "processed_event", "outbox_event", "audit_event",
       "rule_version", "rule_definition", "workflow_instance", "workflow_version", "workflow_definition",
       "approval", "task", "notification", "terminology_entry", "module_activation",
       "custom_field_definition", "document_template_version", "document_template",
       "user_role_assignment", "role_permission", "role", "user", "branch", "factory",
       "business_unit", "legal_entity", "tenant_configuration_version", "tenant" CASCADE`,
    );
    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    for (const [slug, subj] of [
      ['test-s247a', 'idp|s247-admin'],
      ['test-s247b', 'idp|s247b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint247 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    wh = (await api('POST', '/api/v1/warehouses', tokenA, { code: 'WH1', name: 'Pogon' })).body
      .id as string;
    rolo = await makeSku('ROLO');
    lajsna = await makeSku('LAJSNA');
    retail = await account('Kupac Maloprodaja DEMO');
    wholesale = await account('Kupac Veleprodaja DEMO');
    await api('POST', `/api/v1/crm/accounts/${wholesale}/price-tier`, tokenA, {
      priceTier: 'VELEPRODAJA',
    });
    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'MJ',
      name: 'Po mjeri',
      currency: 'BAM',
    });
    priceListId = list.body.id as string;
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId: rolo,
      unitPrice: 40,
    });
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId: lajsna,
      unitPrice: 10,
    });
    await api('POST', `/api/v1/price-lists/${priceListId}/publish`, tokenA);
    await api('POST', '/api/v1/tenant/configuration', tokenA, { config: CONFIG });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('AREA: minimum per piece, % and per-piece surcharges, installation per m²', async () => {
    const q = await quote(retail);
    // 800 x 1200 = 0.96 m² -> min 1.5; 2 pcs = 3 m² x 40 = 120; RAL 12; motor 240; install 3 x 8 = 24
    const r = await measured(q, {
      skuId: rolo,
      widthMm: 800,
      heightMm: 1200,
      pieces: 2,
      surchargeCodes: ['RAL', 'MOTOR', 'MONTAZA'],
      note: 'Spavaća soba',
    });
    expect(r.status).toBe(201);
    const line = (r.body.lines as Line[])[0]!;
    expect(line.quantity).toBe('3');
    expect(line.lineTotal).toBe('396');
    expect(line.spec).toMatchObject({
      basis: 'AREA',
      billablePerPiece: 1.5,
      goodsGross: 372,
      installationGross: 24,
      discountSource: 'NONE',
      note: 'Spavaća soba',
    });
    expect(r.body.total).toBe('396');
  });

  it('TIER: wholesale tier discount applies to goods only and needs no approval', async () => {
    const q = await quote(wholesale);
    // 2000 x 1500 = 3 m² x 40 = 120; RAL 12 -> goods 132 x 0.75 = 99; install 3 x 8 = 24 -> 123
    const r = await measured(q, {
      skuId: rolo,
      widthMm: 2000,
      heightMm: 1500,
      pieces: 1,
      surchargeCodes: ['RAL', 'MONTAZA'],
    });
    const line = (r.body.lines as Line[])[0]!;
    expect(line.discountPct).toBe('25');
    expect(line.spec).toMatchObject({ discountSource: 'TIER', goodsNet: 99, installationNet: 24 });
    expect(line.lineTotal).toBe('123');
    expect(r.body).toMatchObject({ subtotal: '156', discountTotal: '33', total: '123' });
    const submitted = await api('POST', `/api/v1/quotes/${q}/submit`, tokenA);
    expect(submitted.body.status).toBe('APPROVED');

    // A salesperson's explicit 25% is not policy: it needs approval.
    const q2 = await quote(retail);
    await measured(q2, { skuId: rolo, widthMm: 2000, heightMm: 1500, pieces: 1, discountPct: 25 });
    expect((await api('POST', `/api/v1/quotes/${q2}/submit`, tokenA)).body.status).toBe(
      'PENDING_APPROVAL',
    );
  });

  it('RULE vs TIER: the better governed discount wins', async () => {
    await api('POST', '/api/v1/discount-rules', tokenA, {
      name: 'Akcija lajsne',
      percentage: 30,
      skuId: lajsna,
    });
    const q = await quote(wholesale);
    const r = await measured(q, { skuId: lajsna, widthMm: 2500, pieces: 4 });
    const line = (r.body.lines as Line[])[0]!;
    // 4 x 2.5 m1 = 10 m1 x 10 = 100 -> rule 30% beats tier 25%
    expect(line.spec).toMatchObject({ basis: 'LENGTH', billableQuantity: 10 });
    expect(line.spec).toMatchObject({ discountSource: 'RULE', discountPct: 30 });
    expect(line.lineTotal).toBe('70');
  });

  it('VALIDATION: limits, unknown surcharges, unconfigured products', async () => {
    const q = await quote(retail);
    expect(
      (await measured(q, { skuId: rolo, widthMm: 3500, heightMm: 1000, pieces: 1 })).status,
    ).toBe(400);
    expect((await measured(q, { skuId: rolo, widthMm: 1000, pieces: 1 })).status).toBe(400);
    expect(
      (
        await measured(q, {
          skuId: rolo,
          widthMm: 1000,
          heightMm: 1000,
          pieces: 1,
          surchargeCodes: ['ZLATO'],
        })
      ).status,
    ).toBe(400);
    expect(
      (await measured(q, { skuId: lajsna, widthMm: 1000, pieces: 1, surchargeCodes: ['MOTOR'] }))
        .status,
    ).toBe(400);
    const other = await makeSku('OBICAN');
    expect(
      (await measured(q, { skuId: other, widthMm: 1000, heightMm: 1000, pieces: 1 })).status,
    ).toBe(400);
  });

  it('ORDER: the breakdown snapshot travels to the sales order line', async () => {
    const q = await quote(retail);
    await measured(q, {
      skuId: rolo,
      widthMm: 1800,
      heightMm: 2000,
      pieces: 3,
      surchargeCodes: ['MONTAZA'],
    });
    await api('POST', `/api/v1/quotes/${q}/submit`, tokenA);
    await api('POST', `/api/v1/quotes/${q}/send`, tokenA);
    await api('POST', `/api/v1/quotes/${q}/accept`, tokenA);
    const order = await api('POST', '/api/v1/orders/from-quote', tokenA, {
      quoteId: q,
      warehouseId: wh,
    });
    expect(order.status).toBe(201);
    const line = await prisma.salesOrderLine.findFirst({
      where: { orderId: order.body.id as string },
    });
    expect(line?.spec).toMatchObject({
      widthMm: 1800,
      heightMm: 2000,
      pieces: 3,
      billableQuantity: 10.8,
    });
    // Changing the price list later never alters the issued quote.
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId: rolo,
      unitPrice: 99,
    });
    const again = await api('GET', `/api/v1/quotes/${q}`, tokenA);
    expect((again.body.lines as Line[])[0]!.spec).toMatchObject({ unitPrice: 40 });
  });

  it('TENANT: configuration and tiers are per tenant', async () => {
    const otherAccount = await account('Strani kupac DEMO', tokenB);
    const list = await api('POST', '/api/v1/price-lists', tokenB, {
      code: 'B',
      name: 'B',
      currency: 'BAM',
    });
    await api('POST', `/api/v1/price-lists/${list.body.id}/publish`, tokenB);
    expect(list.body.id).toBeTruthy();
    const q = await api('POST', '/api/v1/quotes', tokenB, {
      accountId: otherAccount,
      priceListId: list.body.id,
    });
    expect(
      (
        await measured(
          q.body.id as string,
          { skuId: rolo, widthMm: 1000, heightMm: 1000, pieces: 1 },
          tokenB,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await api('POST', `/api/v1/crm/accounts/${wholesale}/price-tier`, tokenB, {
          priceTier: 'A',
        })
      ).status,
    ).toBe(404);
  });
});
