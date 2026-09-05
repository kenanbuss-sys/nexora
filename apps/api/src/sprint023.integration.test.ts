import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 023 acceptance tests: PDF document rendering (DOC-002) for
 * quotes, customer invoices and delivery notes, tenant-scoped and
 * carrying the record's governed number (DOC-004).
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 023 — business documents', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s23a', subject: 'idp|s23-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s23b', subject: 'idp|s23b-admin' });

  let orderId = '';
  let invoiceId = '';
  let invoiceNumber = '';

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
      `TRUNCATE TABLE "security_event", "api_key",
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
      ['test-s23a', 'idp|s23-admin'],
      ['test-s23b', 'idp|s23b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint23 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: 'S23 Admin',
          idpSubject: subject,
        },
      });
    }

    const product = await api('POST', '/api/v1/products', tokenA, { code: 'DOC23', name: 'D23' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'DOC23-STD',
      name: 'D23 Standard',
      baseUom: 'pcs',
    });
    await api('POST', `/api/v1/skus/${sku.body.id}/activate`, tokenA);
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH23',
      name: 'Sprint23 warehouse',
    });
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId: warehouse.body.id,
      skuId: sku.body.id,
      movementType: 'RECEIPT',
      quantity: 50,
      idempotencyKey: 'receipt-s23',
    });
    const lead = await api('POST', '/api/v1/crm/leads', tokenA, {
      name: 'Kupac Dvadesettri',
      company: 'Dvadesettri d.o.o.',
    });
    const converted = await api('POST', `/api/v1/crm/leads/${lead.body.id}/convert`, tokenA, {});
    const order = await api('POST', '/api/v1/orders', tokenA, {
      accountId: converted.body.accountId,
      warehouseId: warehouse.body.id,
      currency: 'EUR',
    });
    orderId = order.body.id as string;
    await api('POST', `/api/v1/orders/${orderId}/lines`, tokenA, {
      skuId: sku.body.id,
      quantity: 4,
      unitPrice: 25,
    });
    await api('POST', `/api/v1/orders/${orderId}/confirm`, tokenA);
    await api('POST', `/api/v1/orders/${orderId}/fulfill`, tokenA);
    const invoice = await api('POST', '/api/v1/finance/invoices/customer', tokenA, {
      orderId,
      dueInDays: 14,
    });
    invoiceId = invoice.body.id as string;
    invoiceNumber = invoice.body.invoiceNumber as string;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  function pdfBytes(dataBase64: string): Buffer {
    return Buffer.from(dataBase64, 'base64');
  }

  it('DOC-002: a customer invoice renders as a real PDF with its number', async () => {
    const rendered = await api('GET', `/api/v1/documents/invoice/${invoiceId}/pdf`, tokenA);
    expect(rendered.status).toBe(200);
    expect(rendered.body.contentType).toBe('application/pdf');
    expect(rendered.body.fileName).toBe(`${invoiceNumber}.pdf`);
    const bytes = pdfBytes(rendered.body.dataBase64 as string);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1500);
  });

  it('DOC-002: a delivery note renders for the fulfilled order', async () => {
    const rendered = await api('GET', `/api/v1/documents/delivery-note/${orderId}/pdf`, tokenA);
    expect(rendered.status).toBe(200);
    const bytes = pdfBytes(rendered.body.dataBase64 as string);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('DOC: rendering is tenant-scoped and permissioned', async () => {
    const foreign = await api('GET', `/api/v1/documents/invoice/${invoiceId}/pdf`, tokenB);
    expect(foreign.status).toBe(404);

    const stranger = identity.signToken({ tenantSlug: 'test-s23a', subject: 'idp|s23-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko23@primjer.example',
      displayName: 'Niko23',
      idpSubject: 'idp|s23-nobody',
    });
    const denied = await api('GET', `/api/v1/documents/invoice/${invoiceId}/pdf`, stranger);
    expect(denied.status).toBe(403);
  });

  it('DOC: supplier invoices are not customer documents', async () => {
    // A supplier invoice cannot be rendered as an outgoing document.
    const supplierInvoice = await prisma.invoice.create({
      data: {
        tenantId: (await prisma.tenant.findFirstOrThrow({ where: { slug: 'test-s23a' } })).id,
        invoiceNumber: 'AP-TEST-1',
        invoiceType: 'SUPPLIER',
        partyRefId: invoiceId,
        orderRefId: orderId,
        currency: 'EUR',
        total: 10,
      },
    });
    const rejected = await api(
      'GET',
      `/api/v1/documents/invoice/${supplierInvoice.id}/pdf`,
      tokenA,
    );
    expect(rejected.status).toBe(400);
  });
});
