import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDb, type PrismaClient } from '@nexora/db';
import { DevIdentityAdapter } from '@nexora/tenancy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Sprint 213 acceptance tests: FIN-030 bank-statement import/review/
 * confirm (control sums, duplicates, explicit confirmation, period
 * lock) and FIN-031 closure (partial allocation, over-allocation
 * control, idempotency, NO ledger posting). AI-016: vision extraction
 * returns a dev-marked proposal only.
 */
const integration = process.env.INTEGRATION === '1' ? describe : describe.skip;

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/enterprise_os';
const SECRET = process.env.DEV_AUTH_SECRET ?? 'dev-secret-change-me';

integration('Sprint 213 — bank statements & closure', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const identity = new DevIdentityAdapter(SECRET);

  const platformToken = identity.signToken({
    tenantSlug: 'platform',
    subject: 'ops|provisioner',
    platformAdmin: true,
  });
  const tokenA = identity.signToken({ tenantSlug: 'test-s213a', subject: 'idp|s213-admin' });
  const tokenB = identity.signToken({ tenantSlug: 'test-s213b', subject: 'idp|s213b-admin' });

  let tenantAId = '';
  let le = '';
  let customerInvoiceId = '';
  let supplierInvoiceId = '';
  let statementId = '';
  let inflowLineId = '';

  async function api(
    method: 'GET' | 'POST' | 'DELETE',
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
    process.env.AI_VISION_DEV = '1';
    prisma = createDb({ connectionString: DB_URL, max: 10 });
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "payment_allocation", "bank_statement_line", "bank_statement",
       "payment", "invoice",
       "gl_journal_line", "gl_journal_entry", "gl_account",
       "gl_system_account", "gl_opening_balance_date", "gl_period_lock",
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

    for (const [slug, subj] of [
      ['test-s213a', 'idp|s213-admin'],
      ['test-s213b', 'idp|s213b-admin'],
    ]) {
      await api('POST', '/api/v1/tenants', platformToken, {
        slug,
        name: `Sprint213 ${slug}`,
        initialAdmin: {
          email: `admin@${slug}.example`,
          displayName: `Admin ${slug}`,
          idpSubject: subj,
        },
      });
    }
    const tenantA = await prisma.tenant.findFirst({ where: { slug: 'test-s213a' } });
    tenantAId = tenantA!.id;
    const entity = await api('POST', '/api/v1/organization/legal-entities', tokenA, {
      name: 'Izvodi d.o.o.',
    });
    le = entity.body.id as string;

    // Invoices are seeded directly — invoicing flows (FIN-011/012) have
    // their own tests; here they are just closure targets.
    const customer = await prisma.invoice.create({
      data: {
        tenantId: tenantAId,
        invoiceNumber: 'INV-C-0001',
        invoiceType: 'CUSTOMER',
        partyRefId: randomUUID(),
        orderRefId: randomUUID(),
        currency: 'EUR',
        total: 150,
      },
    });
    customerInvoiceId = customer.id;
    const supplier = await prisma.invoice.create({
      data: {
        tenantId: tenantAId,
        invoiceNumber: 'INV-S-0001',
        invoiceType: 'SUPPLIER',
        partyRefId: randomUUID(),
        orderRefId: randomUUID(),
        currency: 'EUR',
        total: 80,
      },
    });
    supplierInvoiceId = supplier.id;
  }, 120_000);

  afterAll(async () => {
    delete process.env.AI_VISION_DEV;
    await app?.close();
    await prisma?.$disconnect();
  });

  const statementPayload = () => ({
    legalEntityId: le,
    statementNumber: 'IZV-2026-001',
    bankAccount: 'BA391290079401028494',
    statementDate: '2026-09-15',
    currency: 'EUR',
    openingBalance: 1000,
    closingBalance: 1100,
    lineCount: 2,
    lines: [
      {
        bookingDate: '2026-09-15',
        description: 'Uplata kupca',
        amount: 130,
        reference: 'INV-C-0001',
        counterpartyName: 'Kupac Alfa',
      },
      { bookingDate: '2026-09-15', description: 'Naknada banke', amount: -30 },
    ],
  });

  it('FIN-030: control sums are validated on import', async () => {
    const bad = await api('POST', '/api/v1/bank/statements', tokenA, {
      ...statementPayload(),
      closingBalance: 999,
    });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('Control sum');

    const badCount = await api('POST', '/api/v1/bank/statements', tokenA, {
      ...statementPayload(),
      lineCount: 3,
    });
    expect(badCount.status).toBe(400);
  });

  it('FIN-030: a valid statement imports for review; duplicates are refused', async () => {
    const imported = await api('POST', '/api/v1/bank/statements', tokenA, statementPayload());
    expect(imported.status).toBe(201);
    expect(imported.body.status).toBe('IMPORTED');
    expect((imported.body.lines as unknown[]).length).toBe(2);
    statementId = imported.body.id as string;

    const duplicate = await api('POST', '/api/v1/bank/statements', tokenA, statementPayload());
    expect(duplicate.status).toBe(409);
  });

  it('FIN-031: closure needs an explicitly confirmed statement', async () => {
    const view = await api('GET', `/api/v1/bank/statements/${statementId}`, tokenA);
    const line = (view.body.lines as Array<{ id: string; amount: string }>).find(
      (l) => l.amount === '130',
    );
    inflowLineId = line!.id;
    const early = await api('POST', '/api/v1/bank/allocations', tokenA, {
      statementLineId: inflowLineId,
      invoiceId: customerInvoiceId,
      amount: 100,
      allocationKey: 'alloc-early-1',
    });
    expect(early.status).toBe(409);
  });

  it('FIN-030: confirmation is explicit, audited and idempotent', async () => {
    const confirmed = await api('POST', `/api/v1/bank/statements/${statementId}/confirm`, tokenA);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.status).toBe('CONFIRMED');
    const again = await api('POST', `/api/v1/bank/statements/${statementId}/confirm`, tokenA);
    expect(again.body.status).toBe('CONFIRMED');
  });

  it('FIN-030: a locked accounting period refuses confirmation', async () => {
    await api('POST', '/api/v1/ledger/control/period-lock', tokenA, {
      legalEntityId: le,
      lockedThrough: '2026-08-31',
    });
    const locked = await api('POST', '/api/v1/bank/statements', tokenA, {
      ...statementPayload(),
      statementNumber: 'IZV-2026-000',
      statementDate: '2026-08-20',
      lineCount: 1,
      openingBalance: 0,
      closingBalance: 10,
      lines: [{ bookingDate: '2026-08-20', description: 'Stara uplata', amount: 10 }],
    });
    expect(locked.status).toBe(201); // import (review) is allowed…
    const refuse = await api(
      'POST',
      `/api/v1/bank/statements/${locked.body.id as string}/confirm`,
      tokenA,
    );
    expect(refuse.status).toBe(409); // …confirmation is not
    const discard = await api(
      'DELETE',
      `/api/v1/bank/statements/${locked.body.id as string}`,
      tokenA,
    );
    expect(discard.status).toBe(200);
  });

  it('FIN-031: partial allocation moves paidAmount and NEVER posts to the ledger', async () => {
    const glBefore = await prisma.glJournalEntry.count();
    const allocation = await api('POST', '/api/v1/bank/allocations', tokenA, {
      statementLineId: inflowLineId,
      invoiceId: customerInvoiceId,
      amount: 100,
      allocationKey: 'alloc-cust-100',
    });
    expect(allocation.status).toBe(201);
    expect(allocation.body.amount).toBe('100');

    const invoice = await prisma.invoice.findFirst({ where: { id: customerInvoiceId } });
    expect(invoice?.paidAmount.toString()).toBe('100');
    expect(invoice?.status).toBe('PARTIALLY_PAID');

    const view = await api('GET', `/api/v1/bank/statements/${statementId}`, tokenA);
    const line = (
      view.body.lines as Array<{ id: string; allocatedAmount: string; status: string }>
    ).find((l) => l.id === inflowLineId)!;
    expect(line.allocatedAmount).toBe('100');
    expect(line.status).toBe('PARTIALLY_ALLOCATED');

    // Closure links the payment; it must not create a journal entry.
    const glAfter = await prisma.glJournalEntry.count();
    expect(glAfter).toBe(glBefore);
  });

  it('FIN-031: the same allocationKey is idempotent — no double payment', async () => {
    const retry = await api('POST', '/api/v1/bank/allocations', tokenA, {
      statementLineId: inflowLineId,
      invoiceId: customerInvoiceId,
      amount: 100,
      allocationKey: 'alloc-cust-100',
    });
    expect(retry.status).toBe(201);
    const invoice = await prisma.invoice.findFirst({ where: { id: customerInvoiceId } });
    expect(invoice?.paidAmount.toString()).toBe('100');
    const conflict = await api('POST', '/api/v1/bank/allocations', tokenA, {
      statementLineId: inflowLineId,
      invoiceId: customerInvoiceId,
      amount: 25,
      allocationKey: 'alloc-cust-100',
    });
    expect(conflict.status).toBe(409);
  });

  it('FIN-031: over-allocation of the line and wrong direction are refused', async () => {
    // Line open remainder is 30 (130 − 100): 31 must fail.
    const over = await api('POST', '/api/v1/bank/allocations', tokenA, {
      statementLineId: inflowLineId,
      invoiceId: customerInvoiceId,
      amount: 31,
      allocationKey: 'alloc-over-31x',
    });
    expect(over.status).toBe(400);
    // A supplier invoice cannot close against an inflow.
    const wrongWay = await api('POST', '/api/v1/bank/allocations', tokenA, {
      statementLineId: inflowLineId,
      invoiceId: supplierInvoiceId,
      amount: 10,
      allocationKey: 'alloc-wrongway',
    });
    expect(wrongWay.status).toBe(400);
  });

  it('AI-016: vision extraction returns a dev-marked PROPOSAL, nothing is imported', async () => {
    const before = await prisma.bankStatement.count();
    const extract = await api('POST', '/api/v1/bank/statements/extract', tokenA, {
      mimeType: 'application/json',
      content: JSON.stringify({
        statementNumber: 'IZV-2026-777',
        bankAccount: 'BA391290079401028494',
        statementDate: '2026-09-16',
        currency: 'EUR',
        openingBalance: 0,
        closingBalance: 50,
        lines: [{ bookingDate: '2026-09-16', description: 'Uplata', amount: 50 }],
      }),
    });
    expect(extract.status).toBe(201);
    expect(extract.body.providerKind).toBe('dev');
    expect((extract.body.warnings as string[]).join(' ')).toContain('dev');
    const proposal = extract.body.proposal as Record<string, unknown>;
    expect(proposal.statementNumber).toBe('IZV-2026-777');
    const after = await prisma.bankStatement.count();
    expect(after).toBe(before); // proposal only — no import happened
  });

  it('AUTHZ + TENANT: permissions required; cross-tenant not found', async () => {
    const stranger = identity.signToken({ tenantSlug: 'test-s213a', subject: 'idp|s213-nobody' });
    const denied = await api('GET', `/api/v1/bank/statements?legalEntityId=${le}`, stranger);
    expect([401, 403]).toContain(denied.status);
    const cross = await api('GET', `/api/v1/bank/statements/${statementId}`, tokenB);
    expect([403, 404]).toContain(cross.status);
    const crossImport = await api('POST', '/api/v1/bank/statements', tokenB, statementPayload());
    expect([403, 404]).toContain(crossImport.status);
  });
});
