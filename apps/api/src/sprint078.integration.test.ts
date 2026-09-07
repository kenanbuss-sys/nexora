import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 078 acceptance tests: privacy requests (GRC-012)
 * — GDPR data-subject export and irreversible PERSON anonymization,
 * organizations refused, everything audited.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 078 — privacy requests', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s78a', subject: 'idp|s78-admin' });

  let warehouseId = '';
  let skuId = '';
  let scarceSkuId = '';
  let personId = '';

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
      slug: 'test-s78a',
      name: 'Sprint78 Tenant',
      initialAdmin: {
        email: 'admin@s78a.example',
        displayName: 'S78 Admin',
        idpSubject: 'idp|s78-admin',
      },
    });
    const warehouse = await api('POST', '/api/v1/warehouses', tokenA, {
      code: 'WH78',
      name: 'Sprint78 warehouse',
    });
    warehouseId = warehouse.body.id as string;
    const product = await api('POST', '/api/v1/products', tokenA, { code: 'PRO78', name: 'P53' });
    const sku = await api('POST', '/api/v1/skus', tokenA, {
      productId: product.body.id,
      code: 'PRO78-STD',
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
      idempotencyKey: 'receipt-PRO78',
    });
    const scarceProduct = await api('POST', '/api/v1/products', tokenA, {
      code: 'SCARCE78',
      name: 'S78',
    });
    const scarceSku = await api('POST', '/api/v1/skus', tokenA, {
      productId: scarceProduct.body.id,
      code: 'SCARCE78-STD',
      name: 'S78 Std',
      baseUom: 'pcs',
    });
    scarceSkuId = scarceSku.body.id as string;
    await api('POST', `/api/v1/skus/${scarceSkuId}/activate`, tokenA);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('GRC-012: the privacy export gathers everything MDM holds and is audited', async () => {
    const person = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'PERSON',
      name: 'Osoba Podatak',
      email: 'osoba78@primjer.example',
    });
    personId = person.body.id as string;
    await api('POST', `/api/v1/parties/${personId}/consents`, tokenA, {
      channel: 'EMAIL',
      granted: true,
    });

    const exported = await api('GET', `/api/v1/parties/${personId}/privacy-export`, tokenA);
    expect(exported.status).toBe(200);
    expect((exported.body.party as { email: string }).email).toBe('osoba78@primjer.example');
    expect((exported.body.consents as unknown[]).length).toBe(1);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'mdm.party.privacy_export' },
    });
    expect(audit).not.toBeNull();
  });

  it('GRC-012: erasure anonymizes a PERSON irreversibly and refuses repeats', async () => {
    const erased = await api('POST', `/api/v1/parties/${personId}/anonymize`, tokenA);
    expect(erased.status).toBe(201);
    expect(String(erased.body.name)).toMatch(/^ANONYMIZED-/);
    expect(erased.body.email).toBeNull();

    const again = await api('POST', `/api/v1/parties/${personId}/anonymize`, tokenA);
    expect(again.status).toBe(409);

    const audit = await prisma.auditEvent.findFirst({ where: { action: 'mdm.party.anonymize' } });
    expect(audit).not.toBeNull();
  });

  it('GRC-012: organizations are not data subjects — erasure refused', async () => {
    const org = await api('POST', '/api/v1/parties', tokenA, {
      partyType: 'ORGANIZATION',
      name: 'Firma78 d.o.o.',
    });
    const refused = await api('POST', `/api/v1/parties/${org.body.id}/anonymize`, tokenA);
    expect(refused.status).toBe(409);
  });

  it('AUTHZ: privacy operations need mdm.steward', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s78a', subject: 'idp|s78-nobody' });
    await api('POST', '/api/v1/users/invite', tokenA, {
      email: 'niko78@primjer.example',
      displayName: 'Niko78',
      idpSubject: 'idp|s78-nobody',
    });
    const denied = await api('GET', `/api/v1/parties/${personId}/privacy-export`, stranger);
    expect(denied.status).toBe(403);
  });
});
