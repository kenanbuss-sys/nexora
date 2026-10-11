import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 248 acceptance test: the made-to-order flow end to end through
 * the owning domains — site measurement (crew + vehicle slot) → quote with
 * dimensions → order (confirmed, backordered) → advance invoice (+ KIF)
 * → work order per line (pieces, spec) → production → installation slot
 * (overlap refused) → completion → fulfilment in pieces → final invoice
 * minus the advance (+ KIF) → payment. Plus idempotency of every bridge
 * and tenant isolation.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';
const DAY = 86_400_000;

integration('Sprint 248 — made-to-order flow (measure → install → invoice → KIF)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s248a', subject: 'idp|s248-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s248b', subject: 'idp|s248b-admin' });

  let tenantAId = '';
  let wh = '';
  let customer = '';
  let priceListId = '';
  let rolo = '';
  let platno = '';
  let le = '';
  const crew: string[] = [];
  let van = '';
  let orderId = '';
  let advanceId = '';
  let woId = '';
  let installId = '';

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

  const receive = (skuId: string, quantity: number) =>
    api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: wh,
      skuId,
      movementType: 'RECEIPT',
      quantity,
      idempotencyKey: `mv-${randomUUID()}`,
    });

  const slot = (dayOffset: number, from: number, to: number) => {
    const d = new Date(Date.now() + dayOffset * DAY);
    const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return {
      slotStart: new Date(base + from * 3600_000).toISOString(),
      slotEnd: new Date(base + to * 3600_000).toISOString(),
    };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "vat_book_entry", "vat_period", "vat_rate", "gl_journal_line", "gl_journal_entry",
       "gl_system_account", "gl_account", "payment", "invoice", "service_order", "vehicle", "employee",
       "work_order_operation", "work_order", "bom_line", "bom", "routing_operation", "routing",
       "quote_line", "quote", "price_list_entry", "price_list", "sales_order_line", "sales_order",
       "order_event", "stock_reservation", "stock_movement",
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
      ['test-s248a', 'idp|s248-admin'],
      ['test-s248b', 'idp|s248b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint248 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'Admin', idpSubject: subj },
      });
    }
    tenantAId = (await prisma.tenant.findFirst({ where: { slug: 'test-s248a' } }))!.id;
    wh = (await api('POST', '/api/v1/warehouses', tokenA, { code: 'POGON', name: 'Pogon' })).body
      .id as string;
    rolo = await makeSku('ROLO');
    platno = await makeSku('PLATNO');
    const bom = await api('POST', '/api/v1/boms', tokenA, { skuId: rolo });
    await api('POST', `/api/v1/boms/${bom.body.id}/lines`, tokenA, {
      componentSkuId: platno,
      quantity: 1,
    });
    await api('POST', `/api/v1/boms/${bom.body.id}/release`, tokenA);
    await receive(platno, 50);

    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Montaža DEMO',
      company: 'Kupac Montaža DEMO',
    });
    customer = (await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {})).body
      .accountId as string;
    const list = await api('POST', '/api/v1/price-lists', tokenA, {
      code: 'MJ',
      name: 'Po mjeri',
      currency: 'BAM',
    });
    priceListId = list.body.id as string;
    await api('PUT', `/api/v1/price-lists/${priceListId}/entries`, tokenA, {
      skuId: rolo,
      unitPrice: 50,
    });
    await api('POST', `/api/v1/price-lists/${priceListId}/publish`, tokenA);

    // Accounting: legal entity, accounts, VAT pack, system accounts.
    le = (
      await api('POST', '/api/v1/organization/legal-entities', tokenA, {
        name: 'Sjenila DEMO d.o.o.',
      })
    ).body.id as string;
    const acc: Record<string, string> = {};
    for (const [key, code, name] of [
      ['revenue', '61000000', 'Prihodi od prodaje'],
      ['vatOut', '47000000', 'Izlazni PDV'],
      ['vatIn', '27000000', 'Ulazni PDV'],
      ['settle', '47900000', 'Obračunati PDV'],
    ] as const) {
      acc[key] = (
        await api('POST', '/api/v1/ledger/accounts', tokenA, { legalEntityId: le, code, name })
      ).body.id as string;
    }
    for (const [roleKey, key] of [
      ['vat.output', 'vatOut'],
      ['vat.input', 'vatIn'],
      ['vat.settlement', 'settle'],
    ] as const) {
      await api('POST', '/api/v1/ledger/system-accounts', tokenA, {
        legalEntityId: le,
        roleKey,
        accountId: acc[key],
      });
    }
    await api('POST', '/api/v1/vat/pack/bih', tokenA, { legalEntityId: le });
    await api('POST', '/api/v1/tenant/configuration', tokenA, {
      config: {
        cpq: {
          madeToMeasure: {
            products: [{ skuCode: 'ROLO-STD', basis: 'AREA', minBillable: 1 }],
            surcharges: [
              {
                code: 'MONTAZA',
                label: 'Montaža',
                type: 'PER_PIECE',
                value: 20,
                installation: true,
              },
            ],
          },
        },
        fin: { autoKif: { legalEntityId: le, vatRateCode: 'S17', counterAccountId: acc.revenue } },
      },
    });

    for (const name of ['Monter Prvi', 'Monter Drugi', 'Monter Treći']) {
      crew.push((await api('POST', '/api/v1/employees', tokenA, { name })).body.id as string);
    }
    van = (
      await api('POST', '/api/v1/logistics/vehicles', tokenA, {
        plate: 'DEMO-001',
        name: 'Kombi 1',
      })
    ).body.id as string;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('MEASURE: a site measurement visit is booked with crew and vehicle', async () => {
    const visit = await api('POST', '/api/v1/service/visits/measurements', tokenA, {
      accountId: customer,
      siteAddress: 'Ulica DEMO 1, Grad',
    });
    expect(visit.status).toBe(201);
    expect(visit.body).toMatchObject({ kind: 'MEASUREMENT', status: 'PLANNED' });
    const booked = await api('POST', `/api/v1/service/visits/${visit.body.id}/schedule`, tokenA, {
      ...slot(1, 8, 9),
      crewEmployeeIds: [crew[0]],
      vehicleId: van,
    });
    expect(booked.body).toMatchObject({ status: 'SCHEDULED', vehicleId: van });
  });

  it('QUOTE → ORDER → ADVANCE (+KIF): dimensions priced, advance invoiced once with its KIF entry', async () => {
    const q = (await api('POST', '/api/v1/quotes', tokenA, { accountId: customer, priceListId }))
      .body.id as string;
    // 2 pcs 1500 x 2000 = 3 m² each -> 6 m² x 50 = 300 + montaža 2 x 20 = 340
    const line = await api('POST', `/api/v1/quotes/${q}/measured-lines`, tokenA, {
      skuId: rolo,
      widthMm: 1500,
      heightMm: 2000,
      pieces: 2,
      surchargeCodes: ['MONTAZA'],
    });
    expect(line.body.total).toBe('340');
    for (const step of ['submit', 'send', 'accept']) {
      await api('POST', `/api/v1/quotes/${q}/${step}`, tokenA);
    }
    const order = await api('POST', '/api/v1/orders/from-quote', tokenA, {
      quoteId: q,
      warehouseId: wh,
    });
    orderId = order.body.id as string;
    const confirmed = await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA, {
      allowBackorder: true,
    });
    expect(confirmed.status).toBe(201);

    const advance = await api('POST', '/api/v1/finance/invoices/advance', tokenA, {
      orderId,
      percent: 30,
    });
    expect(advance.status).toBe(201);
    expect(advance.body).toMatchObject({ invoiceKind: 'ADVANCE', total: '102' });
    advanceId = advance.body.id as string;
    expect(
      (await api('POST', '/api/v1/finance/invoices/advance', tokenA, { orderId, percent: 10 }))
        .status,
    ).toBe(409);
    const kif = await prisma.vatBookEntry.findFirst({
      where: { tenantId: tenantAId, invoiceId: advanceId },
    });
    expect(kif).toMatchObject({ bookType: 'KIF' });
    // gross 102 = net + 17% VAT, to the cent
    expect(Number(kif!.netAmount) + Number(kif!.vatAmount)).toBeCloseTo(102, 2);
    // KIF retry is idempotent
    expect(
      (await api('POST', `/api/v1/finance/invoices/${advanceId}/kif`, tokenA)).body,
    ).toMatchObject({ recorded: true });
    expect(await prisma.vatBookEntry.count({ where: { invoiceId: advanceId } })).toBe(1);
  });

  it('PRODUCTION: one work order per line in pieces with the dimensions; idempotent', async () => {
    const made = await api('POST', '/api/v1/work-orders/from-order', tokenA, { orderId });
    expect(made.status).toBe(201);
    const created = made.body.created as Array<{ id: string; quantity: string }>;
    expect(created).toHaveLength(1);
    expect(created[0]!.quantity).toBe('2');
    woId = created[0]!.id;
    const again = await api('POST', '/api/v1/work-orders/from-order', tokenA, { orderId });
    expect(again.body.created).toEqual([]);
    expect((again.body.existing as string[]).length).toBe(1);
    const byOrder = await api('GET', `/api/v1/work-orders/by-order/${orderId}`, tokenA);
    expect((byOrder.body.workOrders as Array<{ spec: { widthMm: number } }>)[0]!.spec.widthMm).toBe(
      1500,
    );

    await api('POST', `/api/v1/work-orders/${woId}/release`, tokenA);
    await api('POST', `/api/v1/work-orders/${woId}/start`, tokenA);
    const done = await api('POST', `/api/v1/work-orders/${woId}/complete`, tokenA, {
      goodQuantity: 2,
    });
    expect(done.status).toBe(201);
  });

  it('INSTALL: one installation per order; crew/vehicle overlaps are refused; week board shows it', async () => {
    const inst = await api('POST', '/api/v1/service/visits/installations', tokenA, {
      salesOrderId: orderId,
    });
    expect(inst.body).toMatchObject({ kind: 'INSTALLATION', duplicate: false });
    installId = inst.body.id as string;
    const dup = await api('POST', '/api/v1/service/visits/installations', tokenA, {
      salesOrderId: orderId,
    });
    expect(dup.body).toMatchObject({ id: installId, duplicate: true });

    const ok = await api('POST', `/api/v1/service/visits/${installId}/schedule`, tokenA, {
      ...slot(2, 9, 13),
      crewEmployeeIds: [crew[1], crew[2]],
      vehicleId: van,
    });
    expect(ok.status).toBe(201);
    // Another visit at an overlapping time with the same vehicle -> conflict.
    const other = await api('POST', '/api/v1/service/visits/measurements', tokenA, {
      accountId: customer,
    });
    const clash = await api('POST', `/api/v1/service/visits/${other.body.id}/schedule`, tokenA, {
      ...slot(2, 12, 14),
      crewEmployeeIds: [crew[0]],
      vehicleId: van,
    });
    expect(clash.status).toBe(409);
    const crewClash = await api(
      'POST',
      `/api/v1/service/visits/${other.body.id}/schedule`,
      tokenA,
      {
        ...slot(2, 10, 11),
        crewEmployeeIds: [crew[1]],
      },
    );
    expect(crewClash.status).toBe(409);

    const d = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
    const d2 = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
    const board = await api(
      'GET',
      `/api/v1/service/visits/schedule?from=${d}&to=${d2}&kind=INSTALLATION`,
      tokenA,
    );
    const visits = board.body.visits as Array<{
      id: string;
      crew: Array<{ name: string }>;
      vehicle: { plate: string } | null;
      customer: string;
    }>;
    expect(visits.map((v) => v.id)).toEqual([installId]);
    expect(visits[0]!.crew.map((c) => c.name)).toEqual(['Monter Drugi', 'Monter Treći']);
    expect(visits[0]!.vehicle?.plate).toBe('DEMO-001');
  });

  it('DONE → FINAL INVOICE − ADVANCE (+KIF) → PAYMENT', async () => {
    await api('POST', `/api/v1/service/orders/${installId}/start`, tokenA);
    const completed = await api('POST', `/api/v1/service/orders/${installId}/complete`, tokenA, {
      report: 'Montirano, kupac zadovoljan',
    });
    expect(completed.status).toBe(201);
    // Produced goods are now in stock: the backordered line gets its reservation (2 pieces).
    const released = await api('POST', `/api/v1/orders/${orderId}/release-backorders`, tokenA);
    expect(released.body.released).toBe(1);
    const reservation = await prisma.stockReservation.findFirst({
      where: { tenantId: tenantAId, skuId: rolo, status: 'ACTIVE' },
    });
    expect(reservation?.quantity.toString()).toBe('2');
    // Fulfilment issues PIECES from stock (2 produced), not billed m².
    const fulfilled = await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    expect(fulfilled.status).toBe(201);
    const issued = await prisma.stockMovement.findFirst({
      where: { tenantId: tenantAId, skuId: rolo, movementType: 'ISSUE' },
    });
    expect(issued?.quantity.toString()).toBe('2');

    const final = await api('POST', '/api/v1/finance/invoices/customer', tokenA, { orderId });
    expect(final.status).toBe(201);
    expect(final.body).toMatchObject({
      invoiceKind: 'STANDARD',
      total: '238',
      advanceDeducted: '102',
    });
    expect(await prisma.vatBookEntry.count({ where: { invoiceId: final.body.id as string } })).toBe(
      1,
    );
    const paid = await api('POST', `/api/v1/finance/invoices/${final.body.id}/payments`, tokenA, {
      amount: 238,
      reference: 'DEMO-UPLATA-1',
    });
    expect([200, 201]).toContain(paid.status);
  });

  it('TENANT: another tenant can touch none of it', async () => {
    expect(
      (await api('POST', '/api/v1/finance/invoices/advance', tokenB, { orderId, percent: 10 }))
        .status,
    ).toBe(404);
    expect((await api('POST', '/api/v1/work-orders/from-order', tokenB, { orderId })).status).toBe(
      404,
    );
    expect(
      (await api('POST', '/api/v1/service/visits/installations', tokenB, { salesOrderId: orderId }))
        .status,
    ).toBe(404);
    expect((await api('GET', `/api/v1/service/visits/by-order/${orderId}`, tokenB)).body).toEqual({
      visits: [],
    });
  });
});
