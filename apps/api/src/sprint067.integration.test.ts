import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 067 acceptance tests: contract repository (DOC-007/009)
 * — numbered contracts against MDM parties, enforced lifecycle, and
 * a live renewal report from end dates and notice windows.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 067 — contracts', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s67a', subject: 'idp|s67-admin' });

  let warehouseId = '';
  let skuId = '';
  let scarceSkuId = '';
  let partyId = '';
  let contractId = '';

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
      `TRUNCATE TABLE "serial_number", "bundle_component",
       "promotion_redemption", "promotion",
       "consent_record", "exchange_rate", "sales_team_member", "sales_team",
       "territory", "packaging_level", "sku_substitution", "discount_rule",
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

    await api('POST', '/api/v1/tenants', platformToken, {
      slug: 'test-s67a',
      name: 'Sprint67 Tenant',
      initialAdmin: {
        email: 'admin@s67a.example',
        displayName: 'S67 Admin',
        idpSubject: 'idp|s67-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH67',
      name: 'Sprint67 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO67', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO67-STD',
      name: 'P53 Std',
      baseUom: 'pcs',
    });
    skuId = sku.body.id as string;
    await api('POST', `/api/v1/skus/${skuId}/activate`, tokenA);
    await api('POST', '/api/v1/stock/movements', tokenA, {
      warehouseId,
      skuId,
      movementType: 'RECEIPT',
      quantity: 10,
      idempotencyKey: 'receipt-PRO67',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE67',
      name: 'S67',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE67-STD',
      name: 'S67 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('DOC-007: contracts are numbered, validated against MDM parties and audited', async () => {
    const party = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Ugovorna Strana d.o.o.',
    });
    partyId = party.body.id as string;

    const bad = await api('POST', '/api/v1/contracts', tokenA, {
      title: 'Nepostojeca strana',
      partyId: '00000000-0000-4000-8000-000000000000',
      startsAt: new Date().toISOString(),
    });
    expect(bad.status).toBe(404);

    const created = await api('POST', '/api/v1/contracts', tokenA, {
      title: 'Okvirni ugovor o nabavci',
      partyId,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
      renewalNoticeDays: 30,
      value: 50000,
      currency: 'EUR',
    });
    expect(created.status).toBe(201);
    expect(created.body.contractNumber).toMatch(/^CT-/);
    contractId = created.body.id as string;

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'doc.contract.create' } });
    expect(audit).not.toBeNull();
  });

  it('DOC-007: the lifecycle is enforced', async () => {
    const terminateDraft = await api('POST', `/api/v1/contracts/${contractId}/transition`, tokenA, {
      status: 'TERMINATED',
    });
    expect(terminateDraft.status).toBe(409);

    const activated = await api('POST', `/api/v1/contracts/${contractId}/transition`, tokenA, {
      status: 'ACTIVE',
    });
    expect(activated.status).toBe(201);
    expect(activated.body.status).toBe('ACTIVE');
  });

  it('DOC-009: an active contract inside its notice window shows in renewals', async () => {
    // Ends in 20 days with 30-day notice -> due now.
    const renewals = await api('GET', '/api/v1/contracts/renewals', tokenA);
    expect(renewals.status).toBe(200);
    const due = (renewals.body.renewals as Array<{ id: string }>).find((r) => r.id === contractId);
    expect(due).toBeDefined();

    // A far-future contract is not due.
    const far = await api('POST', '/api/v1/contracts', tokenA, {
      title: 'Dugorocni ugovor',
      partyId,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 300 * 86_400_000).toISOString(),
      renewalNoticeDays: 30,
    });
    await api('POST', `/api/v1/contracts/${far.body.id}/transition`, tokenA, {
      status: 'ACTIVE',
    });
    const after = await api('GET', '/api/v1/contracts/renewals', tokenA);
    const farDue = (after.body.renewals as Array<{ id: string }>).find((r) => r.id === far.body.id);
    expect(farDue).toBeUndefined();
  });

  it('AUTHZ: issuing contracts needs document.issue', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s67a', subject: 'idp|s67-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko67@primjer.example',
      displayName: 'Niko67',
      idpSubject: 'idp|s67-nobody',
    });
    const denied = await api('POST', '/api/v1/contracts', stranger, {
      title: 'hak',
      partyId,
      startsAt: new Date().toISOString(),
    });
    expect(denied.status).toBe(403);
  });
});
