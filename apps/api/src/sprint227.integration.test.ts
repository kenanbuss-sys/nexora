import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 227: projektni klijent (partner šifrarnik), odgovorna osoba
 * (zaposleni), stvarno povezani NBN-ovi i privatni projektni dokumenti
 * kroz postojeći attachment/storage sloj — dozvole, tenant izolacija i
 * ograničenja tipa/veličine.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os_test';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 227 — project client/owner, linked POs, documents', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const adminA = identity.signToken({ tenantSlug: 'test-s227a', subject: 'idp|s227-admin' });
  const adminB = identity.signToken({ tenantSlug: 'test-s227b', subject: 'idp|s227b-admin' });
  const viewer = identity.signToken({ tenantSlug: 'test-s227a', subject: 'idp|s227-viewer' });

  let partyA = '';
  let partyB = '';
  let employeeA = '';
  let poA = '';
  let projectRecordId = '';

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
      `TRUNCATE TABLE "attachment_blob", "attachment",
       "custom_object_record", "custom_object_definition",
       "purchase_order_line", "purchase_order",
       "purchase_requisition_line", "purchase_requisition", "supplier",
       "order_event", "sales_order_line", "sales_order",
       "stock_reservation", "stock_movement", "warehouse_location", "warehouse",
       "barcode", "sku", "product", "employee",
       "party_external_identity", "party", "crm_account", "lead", "opportunity",
       "outbox_event", "audit_event", "user_role_assignment", "role_permission",
       "role", "user", "branch", "factory", "business_unit", "legal_entity",
       "tenant_configuration_version", "tenant" CASCADE`,
    );
    const { createApiApp } = await import('./app.factory.js');
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    for (const [slug, subj] of [
      ['test-s227a', 'idp|s227-admin'],
      ['test-s227b', 'idp|s227b-admin'],
    ] as const) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `S227 ${slug}`,
        initialAdmin: { email: `admin@${slug}.example`, displayName: 'A', idpSubject: subj },
      });
    }
    // viewer bez project.manage/purchase.read
    const role = await api('POST', '/api/v1/roles', adminA, {
      name: 's227-viewer',
      permissions: ['project.read'],
    });
    const invited = await api('POST', '/api/v1/users/invite', adminA, {
      email: 'viewer@s227.example',
      displayName: 'Viewer',
      idpSubject: 'idp|s227-viewer',
    });
    await api('POST', '/api/v1/roles/assign', adminA, {
      userId: invited.body.id,
      roleId: role.body.id,
    });

    const pa = await api('POST', '/api/v1/parties', adminA, {
      partyType: 'ORGANIZATION',
      name: 'Klijent 227 d.o.o.',
    });
    partyA = pa.body.id as string;
    const pb = await api('POST', '/api/v1/parties', adminB, {
      partyType: 'ORGANIZATION',
      name: 'Tudji Klijent 227',
    });
    partyB = pb.body.id as string;
    const emp = await api('POST', '/api/v1/employees', adminA, {
      name: 'Vodja 227',
      title: 'PM',
    });
    employeeA = emp.body.id as string;

    // NBN u tenantu A
    await api('POST', '/api/v1/warehouses', adminA, { code: 'WH227', name: 'W' });
    const wh = (await api('GET', '/api/v1/warehouses', adminA)).body
      .warehouses as Array<Record<string, string>>;
    const prod = await api('POST', '/api/v1/products', adminA, { code: 'P227', name: 'P' });
    const sku = await api('POST', '/api/v1/skus', adminA, {
      productId: prod.body.id,
      code: 'P227-STD',
      name: 'S',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id as string}/activate`, adminA);
    const sup = await api('POST', '/api/v1/suppliers', adminA, { name: 'Dob 227' });
    const req = await api('POST', '/api/v1/requisitions', adminA, { currency: 'EUR' });
    await api('POST', `/api/v1/requisitions/${req.body.id as string}/lines`, adminA, {
      skuId: sku.body.id,
      quantity: 5,
      estUnitPrice: 10,
    });
    await api('POST', `/api/v1/requisitions/${req.body.id as string}/submit`, adminA);
    const po = await api('POST', '/api/v1/purchase-orders', adminA, {
      requisitionId: req.body.id,
      supplierId: sup.body.id,
      warehouseId: wh[0]!.id,
    });
    poA = po.body.id as string;

    await api('POST', '/api/v1/projects/setup', adminA);
    await api('POST', '/api/v1/projects/setup', adminB);
    await api('POST', '/api/v1/custom-objects/prj_project/records', adminA, {
      data: { code: 'PRJ-227', naziv: 'Test projekat 227', status: 'aktivan', budzet: 1000 },
    });
    await api('POST', '/api/v1/custom-objects/prj_project/records', adminB, {
      data: { code: 'PRJ-227B', naziv: 'Tudji projekat', status: 'aktivan', budzet: 500 },
    });
    const recs = await api('GET', '/api/v1/custom-objects/prj_project/records', adminA);
    projectRecordId = (recs.body.records as Array<{ id: string }>)[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('client comes from the party register and owner from employees, audited', async () => {
    const c = await api('POST', '/api/v1/projects/PRJ-227/client', adminA, { partyId: partyA });
    expect(c.status).toBe(201);
    const o = await api('POST', '/api/v1/projects/PRJ-227/owner', adminA, {
      employeeId: employeeA,
    });
    expect(o.status).toBe(201);
    const h = await api('GET', '/api/v1/projects/PRJ-227/header', adminA);
    expect((h.body.client as { name: string }).name).toBe('Klijent 227 d.o.o.');
    expect((h.body.owner as { name: string }).name).toBe('Vodja 227');
    const audits = await prisma.auditEvent.count({
      where: { action: { in: ['prj.client.set', 'prj.owner.set'] } },
    });
    expect(audits).toBe(2);
  });

  it('cross-tenant party is refused; viewer cannot assign', async () => {
    const cross = await api('POST', '/api/v1/projects/PRJ-227/client', adminA, {
      partyId: partyB,
    });
    expect(cross.status).toBe(404);
    const forbidden = await api('POST', '/api/v1/projects/PRJ-227/client', viewer, {
      partyId: partyA,
    });
    expect(forbidden.status).toBe(403);
  });

  it('linked POs list contains exactly the audited links; needs purchase.read', async () => {
    const before = await api('GET', '/api/v1/projects/PRJ-227/purchase-orders', adminA);
    expect(before.body.purchaseOrders).toHaveLength(0);
    await api('POST', '/api/v1/projects/PRJ-227/purchase-orders', adminA, {
      purchaseOrderId: poA,
    });
    const after = await api('GET', '/api/v1/projects/PRJ-227/purchase-orders', adminA);
    expect(after.body.purchaseOrders).toHaveLength(1);
    expect((after.body.purchaseOrders as Array<{ id: string }>)[0]!.id).toBe(poA);
    const denied = await api('GET', '/api/v1/projects/PRJ-227/purchase-orders', viewer);
    expect(denied.status).toBe(403);
  });

  it('project documents upload/download through the storage layer, with limits', async () => {
    const up = await api('POST', '/api/v1/attachments', adminA, {
      entityType: 'prj_project',
      entityId: projectRecordId,
      fileName: 'nacrt.txt',
      contentType: 'text/plain',
      dataBase64: Buffer.from('Idejno rješenje 227').toString('base64'),
    });
    expect(up.status).toBe(201);
    const list = await api(
      'GET',
      `/api/v1/attachments?entityType=prj_project&entityId=${projectRecordId}`,
      adminA,
    );
    expect(list.body.attachments).toHaveLength(1);
    const dl = await api(
      'GET',
      `/api/v1/attachments/${up.body.id as string}/download`,
      adminA,
    );
    expect(Buffer.from(dl.body.dataBase64 as string, 'base64').toString()).toBe(
      'Idejno rješenje 227',
    );
    // PRJ documents endpoint vidi isti dokument (stvarna veza)
    const docs = await api('GET', '/api/v1/projects/PRJ-227/documents', adminA);
    expect(docs.body.documents).toHaveLength(1);

    // tip odbijen s razumljivom porukom
    const badType = await api('POST', '/api/v1/attachments', adminA, {
      entityType: 'prj_project',
      entityId: projectRecordId,
      fileName: 'skripta.html',
      contentType: 'text/html',
      dataBase64: Buffer.from('<script>1</script>').toString('base64'),
    });
    expect(badType.status).toBe(400);
    expect(String(badType.body.message)).toContain('nije dozvoljen');

    // veličina preko 5MB odbijena
    const big = await api('POST', '/api/v1/attachments', adminA, {
      entityType: 'prj_project',
      entityId: projectRecordId,
      fileName: 'veliki.bin',
      contentType: 'application/octet-stream',
      dataBase64: Buffer.alloc(5 * 1024 * 1024 + 10, 1).toString('base64'),
    });
    expect(big.status).toBe(400);

    // cross-tenant download → 404 (privatni pristup)
    const cross = await api(
      'GET',
      `/api/v1/attachments/${up.body.id as string}/download`,
      adminB,
    );
    expect(cross.status).toBe(404);
  });

  it('foreign tenant project stays invisible', async () => {
    const h = await api('GET', '/api/v1/projects/PRJ-227B/header', adminA);
    expect(h.status).toBe(404);
  });
});
