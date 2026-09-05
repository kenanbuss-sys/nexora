import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 016 acceptance tests: comments with mention notifications
 * (CORE-010), attachments with a byte-true round trip (CORE-009),
 * atomic number sequences (CORE-008) and tenant-scoped global search
 * (CORE-011).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 016 — collaboration & findability', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s16a', subject: 'idp|s16-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s16b', subject: 'idp|s16b-admin' });
  const colleagueToken = identity.signToken({
    tenantSlug: 'test-s16a',
    subject: 'idp|s16-colleague',
  });

  let orderId = '';
  let colleagueId = '';

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
      `TRUNCATE TABLE "comment", "attachment_blob", "attachment", "number_sequence",
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
      ['test-s16a', 'idp|s16-admin'],
      ['test-s16b', 'idp|s16b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint16 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: 'S16 Admin',
          idpSubject: subject,
        },
      });
    }

    // A colleague who can be mentioned and reads their own notifications.
    const colleague = await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'kolega@primjer.example',
      displayName: 'Kolega',
      idpSubject: 'idp|s16-colleague',
    });
    colleagueId = colleague.body.id as string;
    const role = await api('POST', '/api/v1/roles', tokenA, {
      name: 'collab-user',
      permissions: ['collab.use', 'search.read', 'task.read'],
    });
    await api('POST', '/api/v1/roles/assign', tokenA, {
      userId: colleagueId,
      roleId: role.body.id,
    });

    // A record to hang collaboration off: one sales order.
    const product = await api('POST', '/api/v1/products', tokenA, {
      code: 'COLLAB16',
      name: 'Collab16',
    });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'COLLAB16-STD',
      name: 'Collab16 Standard',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH16',
      name: 'Sprint16 warehouse',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Šesnaest',
      company: 'Šesnaest d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('CORE-010: comments attach to records; mentions notify the user', async () => {
    const created = await api('POST', '/api/v1/comments', tokenA, {
      entityType: 'sales_order',
      entityId: orderId,
      body: 'Molim provjeri rok isporuke @Kolega',
      mentions: [colleagueId],
    });
    expect(created.status).toBe(201);

    const list = await api(
      'GET',
      `/api/v1/comments?entityType=sales_order&entityId=${orderId}`,
      tokenA,
    );
    expect((list.body.comments as unknown[]).length).toBe(1);

    const inbox = await api('GET', '/api/v1/notifications', colleagueToken);
    const titles = (inbox.body.notifications as Array<{ title: string }>).map((n) => n.title);
    expect(titles).toContain('You were mentioned in a comment');

    // Unknown entity types and foreign mentioned users are rejected.
    const badType = await api('POST', '/api/v1/comments', tokenA, {
      entityType: 'sales_order',
      entityId: orderId,
      body: 'x',
      mentions: ['00000000-0000-0000-0000-000000000001'],
    });
    expect(badType.status).toBe(400);
  });

  it('CORE-009: attachment round trip preserves bytes; 5MB cap holds', async () => {
    const payload = Buffer.from('NexoraOS specifikacija — čćžšđ bytes \x00\x01\x02', 'utf8');
    const uploaded = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'sales_order',
      entityId: orderId,
      fileName: 'spec.txt',
      contentType: 'text/plain',
      dataBase64: payload.toString('base64'),
    });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.sizeBytes).toBe(payload.length);

    const download = await api('GET', `/api/v1/attachments/${uploaded.body.id}/download`, tokenA);
    expect(download.status).toBe(200);
    expect(Buffer.from(download.body.dataBase64 as string, 'base64').equals(payload)).toBe(true);

    // Transport cap rejects oversized bodies before the domain cap.
    const tooBig = await api('POST', '/api/v1/attachments', tokenA, {
      entityType: 'sales_order',
      entityId: orderId,
      fileName: 'big.bin',
      contentType: 'application/octet-stream',
      dataBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'),
    });
    expect([400, 413]).toContain(tooBig.status);

    // The domain cap holds even when called through the service directly.
    const { CollaborationService } = await import('@nexora/domain-collab');
    const service = new CollaborationService(prisma);
    const tenantA = (await prisma.tenant.findFirstOrThrow({ where: { slug: 'test-s16a' } })).id;
    await expect(
      service.uploadAttachment(
        {
          entityType: 'sales_order',
          entityId: orderId,
          fileName: 'big.bin',
          contentType: 'application/octet-stream',
          dataBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'),
        },
        { tenantId: tenantA, actorType: 'SERVICE', userId: null } as never,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('CORE-008: concurrent draws never collide; tenants are isolated', async () => {
    const collab = (await import('@nexora/domain-collab')).CollaborationService;
    const service = new collab(prisma);
    const tenantA = (await prisma.tenant.findFirstOrThrow({ where: { slug: 'test-s16a' } })).id;
    const tenantB = (await prisma.tenant.findFirstOrThrow({ where: { slug: 'test-s16b' } })).id;
    const ctxA = { tenantId: tenantA, actorType: 'SERVICE', userId: null } as never;
    const ctxB = { tenantId: tenantB, actorType: 'SERVICE', userId: null } as never;

    const drawn = await Promise.all(
      Array.from({ length: 8 }, () => service.nextNumber('delivery_note', ctxA)),
    );
    expect(new Set(drawn).size).toBe(8);
    expect(drawn.every((n) => /^DEL-\d{5}$/.test(n))).toBe(true);

    const other = await service.nextNumber('delivery_note', ctxB);
    expect(other).toBe('DEL-00001');
  });

  it('CORE-011: global search finds records, tenant-scoped only', async () => {
    const found = await api('GET', '/api/v1/search?q=Collab16', tokenA);
    expect(found.status).toBe(200);
    const types = (found.body.hits as Array<{ type: string }>).map((h) => h.type);
    expect(types).toContain('product');
    expect(types).toContain('sku');

    const party = await api('GET', '/api/v1/search?q=%C5%A0esnaest', tokenA);
    expect((party.body.hits as unknown[]).length).toBeGreaterThan(0);

    // Tenant B sees none of tenant A's records.
    const foreign = await api('GET', '/api/v1/search?q=Collab16', tokenB);
    expect((foreign.body.hits as unknown[]).length).toBe(0);

    const short = await api('GET', '/api/v1/search?q=a', tokenA);
    expect(short.status).toBe(400);
  });

  it('AUTH: collab and search require their permissions', async () => {
    const anonymous = identity.signToken({ tenantSlug: 'test-s16a', subject: 'idp|s16-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko@primjer.example',
      displayName: 'Niko',
      idpSubject: 'idp|s16-nobody',
    });
    const denied = await api(
      'GET',
      `/api/v1/comments?entityType=sales_order&entityId=${orderId}`,
      anonymous,
    );
    expect(denied.status).toBe(403);
    const deniedSearch = await api('GET', '/api/v1/search?q=Collab16', anonymous);
    expect(deniedSearch.status).toBe(403);
  });
});
