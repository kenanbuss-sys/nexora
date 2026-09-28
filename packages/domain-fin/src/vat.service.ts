import { createHash } from 'node:crypto';
import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { BIH_VAT_PACK } from './localization/bih-vat';

/**
 * FIN-028 (Sprint 232) — KUF/KIF books and VAT periods, the BiH
 * accounting localization pack (ADR-0001). Country rules are DATA:
 * effective-dated VAT rates per legal entity and system-account roles
 * (vat.output / vat.input / vat.settlement) — nothing tenant- or
 * country-specific is branched in code.
 *
 * - A book entry posts exactly ONE KUF/KIF ledger entry through the FIN
 *   ledger commands (draft → posted). VAT is computed on the server from
 *   the rate effective on the document date.
 * - Recording is idempotent per requestKey and step-resumable: the book
 *   row is created PENDING, its ledger draft id is stored before posting,
 *   so a retry finishes the same entry and never books twice.
 * - Correction = negative mirror row (STORNO) + ledger storno; posted
 *   history is never edited or deleted.
 * - Filing a VAT period posts ONE settlement entry (output VAT against
 *   input VAT, difference to vat.settlement), snapshots the totals and
 *   closes the period for new book entries.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;
const KEY_RE = /^[A-Za-z0-9_.:-]{8,80}$/;

export const VAT_BOOK_TYPES = ['KUF', 'KIF'] as const;
export type VatBookType = (typeof VAT_BOOK_TYPES)[number];

export const VAT_ROLES = {
  output: 'vat.output',
  input: 'vat.input',
  settlement: 'vat.settlement',
} as const;

/** The subset of LedgerService the VAT books use (owning FIN commands). */
export interface VatLedgerGate {
  ensurePartnerAccount(
    input: {
      legalEntityId: string;
      partnerId: string;
      side: 'supplier' | 'customer';
      partnerName: string;
    },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  createDraft(
    input: {
      legalEntityId: string;
      entryType: 'KUF' | 'KIF' | 'ACCRUAL';
      bookingDate: string;
      description: string;
      lines: Array<{ accountId: string; debit: number; credit: number; partnerId?: string }>;
    },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  deleteDraft(entryId: string, ctx: RequestContext): Promise<unknown>;
  post(entryId: string, ctx: RequestContext): Promise<unknown>;
  storno(entryId: string, reason: string, ctx: RequestContext): Promise<unknown>;
}

export interface VatRateView {
  id: string;
  code: string;
  name: string;
  ratePct: string;
  validFrom: string;
}

export interface VatBookEntryInput {
  legalEntityId: string;
  bookType: VatBookType;
  requestKey: string;
  documentNumber: string;
  documentDate: string;
  bookingDate: string;
  partnerId: string;
  vatRateCode: string;
  netAmount: number;
  currency: string;
  counterAccountId: string;
  invoiceId?: string | undefined;
}

export interface VatBookEntryView {
  id: string;
  legalEntityId: string;
  bookType: string;
  year: number;
  bookNo: number;
  status: string;
  documentNumber: string;
  documentDate: string;
  bookingDate: string;
  partnerId: string;
  partnerName: string;
  partnerTaxId: string | null;
  vatRateCode: string;
  ratePct: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  counterAccountId: string;
  invoiceId: string | null;
  glEntryId: string | null;
  stornoOfId: string | null;
  stornoReason: string | null;
}

export interface VatPeriodView {
  legalEntityId: string;
  year: number;
  month: number;
  from: string;
  to: string;
  status: string;
  kif: { count: number; net: string; vat: string; gross: string };
  kuf: { count: number; net: string; vat: string; gross: string };
  outputVat: string;
  inputVat: string;
  payableVat: string;
  pendingEntries: number;
  ledger: { outputVat: string; inputVat: string; reconciled: boolean } | null;
  filedAt: string | null;
  settlementEntryId: string | null;
  paidAt: string | null;
  paidReference: string | null;
}

const cents = (value: number | string | Prisma.Decimal): number => Math.round(Number(value) * 100);
const money = (c: number): string => (c / 100).toFixed(2);
const day = (d: Date): string => d.toISOString().slice(0, 10);

function monthBounds(year: number, month: number): { from: string; to: string } {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new DomainError('VALIDATION_FAILED', 'Year must be 2000-2100');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new DomainError('VALIDATION_FAILED', 'Month must be 1-12');
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

export class VatService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: VatLedgerGate,
  ) {}

  private async legalEntity(legalEntityId: string, ctx: RequestContext) {
    const entity = await this.prisma.legalEntity.findFirst({
      where: { id: legalEntityId, tenantId: ctx.tenantId },
    });
    if (!entity) throw notFound('LegalEntity', legalEntityId);
    return entity;
  }

  private async audit(
    action: string,
    objectType: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
    reason?: string,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType,
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
      ...(reason !== undefined ? { reason } : {}),
    });
  }

  // ------------------------------------------------ rates (configuration)

  async listRates(legalEntityId: string, ctx: RequestContext): Promise<VatRateView[]> {
    await this.legalEntity(legalEntityId, ctx);
    const rows = await this.prisma.vatRate.findMany({
      where: { tenantId: ctx.tenantId, legalEntityId },
      orderBy: [{ code: 'asc' }, { validFrom: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      ratePct: Number(r.ratePct).toFixed(2),
      validFrom: day(r.validFrom),
    }));
  }

  /**
   * Adds a rate VERSION (append-only): the version with the latest
   * validFrom on or before a document date is the effective one, so
   * history recorded under an older rate never changes.
   */
  async addRate(
    input: {
      legalEntityId: string;
      code: string;
      name: string;
      ratePct: number;
      validFrom: string;
    },
    ctx: RequestContext,
  ): Promise<VatRateView> {
    const code = input.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      throw new DomainError('VALIDATION_FAILED', 'Rate code: 1-20 chars A-Z, 0-9, _ or -');
    }
    if (!(input.ratePct >= 0 && input.ratePct <= 100)) {
      throw new DomainError('VALIDATION_FAILED', 'Rate must be between 0 and 100 %');
    }
    if (!DATE_RE.test(input.validFrom)) {
      throw new DomainError('VALIDATION_FAILED', 'validFrom must be YYYY-MM-DD');
    }
    if (!input.name.trim()) throw new DomainError('VALIDATION_FAILED', 'A rate needs a name');
    await this.legalEntity(input.legalEntityId, ctx);
    try {
      const row = await this.prisma.vatRate.create({
        data: {
          tenantId: ctx.tenantId,
          legalEntityId: input.legalEntityId,
          code,
          name: input.name.trim(),
          ratePct: Math.round(input.ratePct * 100) / 100,
          validFrom: new Date(input.validFrom),
          createdBy: ctx.userId ?? null,
        },
      });
      await this.audit(
        'fin.vat.rate.add',
        'VatRate',
        row.id,
        {
          legalEntityId: input.legalEntityId,
          code,
          ratePct: input.ratePct,
          validFrom: input.validFrom,
        },
        ctx,
      );
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        ratePct: Number(row.ratePct).toFixed(2),
        validFrom: day(row.validFrom),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError(
          'CONFLICT',
          `Rate ${code} already has a version valid from ${input.validFrom}`,
        );
      }
      throw error;
    }
  }

  /**
   * Installs the BiH localization pack's default rate set for a legal
   * entity. Idempotent: versions that already exist are left untouched.
   */
  async installBihPack(legalEntityId: string, ctx: RequestContext) {
    await this.legalEntity(legalEntityId, ctx);
    let created = 0;
    for (const rate of BIH_VAT_PACK.rates) {
      const exists = await this.prisma.vatRate.findFirst({
        where: {
          tenantId: ctx.tenantId,
          legalEntityId,
          code: rate.code,
          validFrom: new Date(rate.validFrom),
        },
      });
      if (exists) continue;
      await this.addRate({ legalEntityId, ...rate }, ctx);
      created += 1;
    }
    return {
      pack: BIH_VAT_PACK.key,
      created,
      requiredSystemAccounts: Object.values(VAT_ROLES),
    };
  }

  private async effectiveRate(
    legalEntityId: string,
    code: string,
    onDate: string,
    ctx: RequestContext,
  ) {
    const rate = await this.prisma.vatRate.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId,
        code,
        validFrom: { lte: new Date(onDate) },
      },
      orderBy: { validFrom: 'desc' },
    });
    if (!rate) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `No VAT rate '${code}' is effective on ${onDate} for this legal entity`,
      );
    }
    return rate;
  }

  private async roleAccounts(legalEntityId: string, ctx: RequestContext) {
    const rows = await this.prisma.glSystemAccount.findMany({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId,
        roleKey: { in: Object.values(VAT_ROLES) },
      },
    });
    return new Map(rows.map((r) => [r.roleKey, r.accountId]));
  }

  // ------------------------------------------------ periods (guards)

  private async ensurePeriod(
    legalEntityId: string,
    year: number,
    month: number,
    ctx: RequestContext,
  ) {
    return this.prisma.vatPeriod.upsert({
      where: {
        tenantId_legalEntityId_year_month: { tenantId: ctx.tenantId, legalEntityId, year, month },
      },
      create: { tenantId: ctx.tenantId, legalEntityId, year, month },
      update: {},
    });
  }

  private async assertBookable(legalEntityId: string, bookingDate: string, ctx: RequestContext) {
    const [lock, opening] = await Promise.all([
      this.prisma.glPeriodLock.findFirst({ where: { tenantId: ctx.tenantId, legalEntityId } }),
      this.prisma.glOpeningBalanceDate.findFirst({
        where: { tenantId: ctx.tenantId, legalEntityId },
      }),
    ]);
    const date = new Date(bookingDate);
    if (lock && date <= lock.lockedThrough) {
      throw new DomainError(
        'INVALID_STATE',
        `The accounting period is locked through ${day(lock.lockedThrough)}`,
      );
    }
    if (opening && date < opening.openingDate) {
      throw new DomainError(
        'INVALID_STATE',
        `Booking before the opening-balance date ${day(opening.openingDate)} is not allowed`,
      );
    }
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const period = await this.ensurePeriod(legalEntityId, year, month, ctx);
    if (period.status !== 'OPEN') {
      throw new DomainError(
        'INVALID_STATE',
        `VAT period ${month}/${year} is ${period.status === 'FILED' ? 'filed' : 'being filed'} — book it in an open period`,
      );
    }
    return { year, month };
  }

  // ------------------------------------------------ book entries

  private hashOf(input: VatBookEntryInput): string {
    const canonical = JSON.stringify([
      input.legalEntityId,
      input.bookType,
      input.documentNumber.trim(),
      input.documentDate,
      input.bookingDate,
      input.partnerId,
      input.vatRateCode.trim().toUpperCase(),
      cents(input.netAmount),
      input.currency.toUpperCase(),
      input.counterAccountId,
      input.invoiceId ?? null,
    ]);
    return createHash('sha256').update(canonical).digest('hex');
  }

  async record(input: VatBookEntryInput, ctx: RequestContext): Promise<VatBookEntryView> {
    if (!(VAT_BOOK_TYPES as readonly string[]).includes(input.bookType)) {
      throw new DomainError('VALIDATION_FAILED', 'bookType must be KUF or KIF');
    }
    if (!KEY_RE.test(input.requestKey) || input.requestKey.startsWith('storno:')) {
      throw new DomainError('VALIDATION_FAILED', 'requestKey: 8-80 safe characters');
    }
    if (!DATE_RE.test(input.documentDate) || !DATE_RE.test(input.bookingDate)) {
      throw new DomainError('VALIDATION_FAILED', 'Dates must be YYYY-MM-DD');
    }
    if (!input.documentNumber.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A document number is required');
    }
    if (!/^[A-Z]{3}$/.test(input.currency.toUpperCase())) {
      throw new DomainError('VALIDATION_FAILED', 'Currency must be a 3-letter code');
    }
    const netCents = cents(input.netAmount);
    if (!(netCents > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'The net amount must be positive');
    }
    const requestHash = this.hashOf(input);

    // Idempotent replay / resume BEFORE any new side effect.
    const existing = await this.prisma.vatBookEntry.findFirst({
      where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new DomainError(
          'CONFLICT',
          'This requestKey was already used for a different book entry',
        );
      }
      return existing.status === 'PENDING'
        ? this.finishPosting(existing.id, ctx)
        : this.view(existing.id, ctx);
    }

    await this.legalEntity(input.legalEntityId, ctx);
    const party = await this.prisma.party.findFirst({
      where: { id: input.partnerId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', input.partnerId);
    const counter = await this.prisma.glAccount.findFirst({
      where: {
        id: input.counterAccountId,
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
      },
    });
    if (!counter) {
      throw new DomainError('VALIDATION_FAILED', 'The counter account is not in this legal entity');
    }
    if (!counter.active) {
      throw new DomainError('INVALID_STATE', `Account ${counter.code} is inactive`);
    }
    const code = input.vatRateCode.trim().toUpperCase();
    const rate = await this.effectiveRate(input.legalEntityId, code, input.documentDate, ctx);
    const vatCents = Math.round((netCents * Number(rate.ratePct)) / 100);
    const grossCents = netCents + vatCents;
    const roles = await this.roleAccounts(input.legalEntityId, ctx);
    const vatRole = input.bookType === 'KIF' ? VAT_ROLES.output : VAT_ROLES.input;
    if (vatCents > 0 && !roles.get(vatRole)) {
      throw new DomainError(
        'INVALID_STATE',
        `System account '${vatRole}' is not mapped for this legal entity (FIN-024)`,
      );
    }

    if (input.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: input.invoiceId, tenantId: ctx.tenantId },
      });
      if (!invoice) throw notFound('Invoice', input.invoiceId);
      const expected = input.bookType === 'KIF' ? 'CUSTOMER' : 'SUPPLIER';
      if (invoice.invoiceType !== expected) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `A ${input.bookType} entry needs a ${expected} invoice`,
        );
      }
      if (invoice.partyRefId !== input.partnerId) {
        throw new DomainError('VALIDATION_FAILED', 'The invoice belongs to a different partner');
      }
      if (
        invoice.currency !== input.currency.toUpperCase() ||
        cents(invoice.total) !== grossCents
      ) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `The gross amount ${money(grossCents)} ${input.currency.toUpperCase()} does not match invoice total ${invoice.total.toString()} ${invoice.currency}`,
        );
      }
      const linked = await this.prisma.vatBookEntry.findFirst({
        where: {
          tenantId: ctx.tenantId,
          invoiceId: input.invoiceId,
          stornoOfId: null,
          status: { not: 'STORNOED' },
        },
      });
      if (linked) {
        throw new DomainError(
          'CONFLICT',
          `The invoice is already booked (${linked.bookType} ${linked.bookNo}/${linked.year})`,
        );
      }
    }
    const duplicate = await this.prisma.vatBookEntry.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        bookType: input.bookType,
        partnerId: input.partnerId,
        documentNumber: input.documentNumber.trim(),
        stornoOfId: null,
        status: { not: 'STORNOED' },
      },
    });
    if (duplicate) {
      throw new DomainError(
        'CONFLICT',
        `Document ${input.documentNumber.trim()} of this partner is already in ${input.bookType} (${duplicate.bookNo}/${duplicate.year})`,
      );
    }

    // Guards (GL lock, opening date, VAT period status) BEFORE any write.
    const { year } = await this.assertBookable(input.legalEntityId, input.bookingDate, ctx);

    const row = await this.insertNumbered(
      {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        bookType: input.bookType,
        year,
        documentNumber: input.documentNumber.trim(),
        documentDate: new Date(input.documentDate),
        bookingDate: new Date(input.bookingDate),
        partnerId: party.id,
        partnerName: party.name,
        partnerTaxId: party.taxId ?? null,
        vatRateCode: code,
        ratePct: rate.ratePct,
        netAmount: money(netCents),
        vatAmount: money(vatCents),
        grossAmount: money(grossCents),
        currency: input.currency.toUpperCase(),
        counterAccountId: counter.id,
        invoiceId: input.invoiceId ?? null,
        requestKey: input.requestKey,
        requestHash,
        createdBy: ctx.userId ?? null,
      },
      ctx,
    );
    if ('replay' in row) return this.record(input, ctx);
    await this.guardAfterInsert(row.id, input.legalEntityId, input.bookingDate, ctx);
    await this.audit(
      'fin.vat.entry.record',
      'VatBookEntry',
      row.id,
      {
        bookType: input.bookType,
        bookNo: row.bookNo,
        year,
        net: money(netCents),
        vat: money(vatCents),
        rate: code,
      },
      ctx,
    );
    return this.finishPosting(row.id, ctx);
  }

  /**
   * Closes the race with a concurrent filing: filing flips the period to
   * FILING and THEN counts PENDING rows; a new row is inserted PENDING and
   * THEN re-reads the period. Either the filing sees the row (and refuses
   * with CONFLICT) or the row sees FILING/FILED and is withdrawn here —
   * it has no ledger effect yet, so removing it is safe.
   */
  private async guardAfterInsert(
    rowId: string,
    legalEntityId: string,
    bookingDate: string,
    ctx: RequestContext,
  ) {
    const date = new Date(bookingDate);
    const period = await this.prisma.vatPeriod.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
      },
    });
    if (period && period.status !== 'OPEN') {
      await this.prisma.vatBookEntry.deleteMany({
        where: { id: rowId, tenantId: ctx.tenantId, status: 'PENDING', glEntryId: null },
      });
      throw new DomainError(
        'INVALID_STATE',
        `VAT period ${period.month}/${period.year} was filed meanwhile — book it in an open period`,
      );
    }
  }

  private async periodStatus(legalEntityId: string, date: Date, ctx: RequestContext) {
    const period = await this.prisma.vatPeriod.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
      },
    });
    return period?.status ?? 'OPEN';
  }

  /** Allocates the next book number; retries on a numbering race. */
  private async insertNumbered(
    data: Omit<Prisma.VatBookEntryUncheckedCreateInput, 'bookNo'>,
    ctx: RequestContext,
  ): Promise<{ id: string; bookNo: number } | { replay: true }> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const last = await this.prisma.vatBookEntry.findFirst({
        where: {
          tenantId: ctx.tenantId,
          legalEntityId: data.legalEntityId,
          bookType: data.bookType,
          year: data.year,
        },
        orderBy: { bookNo: 'desc' },
        select: { bookNo: true },
      });
      try {
        return await this.prisma.vatBookEntry.create({
          data: { ...data, bookNo: (last?.bookNo ?? 0) + 1 },
          select: { id: true, bookNo: true },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // A concurrent request with the SAME key won — replay it.
        const same = await this.prisma.vatBookEntry.findFirst({
          where: { tenantId: ctx.tenantId, requestKey: data.requestKey },
        });
        if (same) return { replay: true };
        if (data.stornoOfId) {
          const mirror = await this.prisma.vatBookEntry.findFirst({
            where: { tenantId: ctx.tenantId, stornoOfId: data.stornoOfId },
          });
          if (mirror) return { replay: true };
        }
        // Partial unique indexes (migration 233): the same partner document
        // or invoice was booked concurrently under another key.
        if (!data.stornoOfId) {
          const clash = await this.prisma.vatBookEntry.findFirst({
            where: {
              tenantId: ctx.tenantId,
              stornoOfId: null,
              status: { not: 'STORNOED' },
              OR: [
                {
                  legalEntityId: data.legalEntityId,
                  bookType: data.bookType,
                  partnerId: data.partnerId,
                  documentNumber: data.documentNumber,
                },
                ...(data.invoiceId ? [{ invoiceId: data.invoiceId }] : []),
              ],
            },
          });
          if (clash) {
            throw new DomainError(
              'CONFLICT',
              `This document or invoice is already in ${clash.bookType} (${clash.bookNo}/${clash.year})`,
            );
          }
        }
      }
    }
    throw new DomainError('CONFLICT', 'Book numbering is busy — retry with the same requestKey');
  }

  /**
   * Step-resumable: create (once) the KUF/KIF ledger draft, store its id,
   * post it (idempotent), then flip PENDING → RECORDED.
   */
  private async finishPosting(id: string, ctx: RequestContext): Promise<VatBookEntryView> {
    const row = await this.prisma.vatBookEntry.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!row) throw notFound('VatBookEntry', id);
    if (row.status !== 'PENDING') return this.view(id, ctx);

    let glEntryId = row.glEntryId;
    if (!glEntryId) {
      const roles = await this.roleAccounts(row.legalEntityId, ctx);
      const kif = row.bookType === 'KIF';
      const partnerAcc = await this.ledger.ensurePartnerAccount(
        {
          legalEntityId: row.legalEntityId,
          partnerId: row.partnerId,
          side: kif ? 'customer' : 'supplier',
          partnerName: row.partnerName,
        },
        ctx,
      );
      const net = Number(row.netAmount);
      const vat = Number(row.vatAmount);
      const gross = Number(row.grossAmount);
      const vatAccount = roles.get(kif ? VAT_ROLES.output : VAT_ROLES.input);
      const lines: Array<{ accountId: string; debit: number; credit: number; partnerId?: string }> =
        kif
          ? [
              { accountId: partnerAcc.id, debit: gross, credit: 0, partnerId: row.partnerId },
              { accountId: row.counterAccountId, debit: 0, credit: net },
            ]
          : [
              { accountId: row.counterAccountId, debit: net, credit: 0 },
              { accountId: partnerAcc.id, debit: 0, credit: gross, partnerId: row.partnerId },
            ];
      if (vat > 0) {
        if (!vatAccount) {
          throw new DomainError('INVALID_STATE', 'The VAT system account is not mapped (FIN-024)');
        }
        lines.splice(
          1,
          0,
          kif
            ? { accountId: vatAccount, debit: 0, credit: vat }
            : { accountId: vatAccount, debit: vat, credit: 0 },
        );
      }
      const draft = await this.ledger.createDraft(
        {
          legalEntityId: row.legalEntityId,
          entryType: row.bookType as 'KUF' | 'KIF',
          bookingDate: day(row.bookingDate),
          description: `${row.bookType} ${row.bookNo}/${row.year} — ${row.documentNumber} — ${row.partnerName}`,
          lines,
        },
        ctx,
      );
      // CAS: a concurrent resume that stored its draft first wins; ours is removed.
      const stored = await this.prisma.vatBookEntry.updateMany({
        where: { id: row.id, tenantId: ctx.tenantId, glEntryId: null },
        data: { glEntryId: draft.id },
      });
      if (stored.count === 0) {
        await this.ledger.deleteDraft(draft.id, ctx);
        const fresh = await this.prisma.vatBookEntry.findFirst({
          where: { id: row.id, tenantId: ctx.tenantId },
        });
        glEntryId = fresh?.glEntryId ?? null;
      } else {
        glEntryId = draft.id;
      }
    }
    if (!glEntryId) throw new DomainError('CONFLICT', 'Book entry posting is in progress — retry');
    // A same-key resume may reach this point after a filing started: the
    // row is still PENDING (so the filer refuses), and here it is withdrawn
    // before it can ever post into a filing/filed period.
    const status = await this.periodStatus(row.legalEntityId, row.bookingDate, ctx);
    if (status !== 'OPEN') {
      const gl = await this.prisma.glJournalEntry.findFirst({
        where: { id: glEntryId, tenantId: ctx.tenantId },
      });
      if (gl?.status === 'DRAFT') {
        const released = await this.prisma.vatBookEntry.updateMany({
          where: { id: row.id, tenantId: ctx.tenantId, status: 'PENDING', glEntryId },
          data: { glEntryId: null },
        });
        if (released.count > 0) {
          await this.ledger.deleteDraft(glEntryId, ctx);
          await this.prisma.vatBookEntry.deleteMany({
            where: { id: row.id, tenantId: ctx.tenantId, status: 'PENDING', glEntryId: null },
          });
        }
        throw new DomainError(
          'INVALID_STATE',
          'The VAT period was filed meanwhile — book it in an open period',
        );
      }
    }
    await this.ledger.post(glEntryId, ctx);
    await this.prisma.vatBookEntry.updateMany({
      where: { id: row.id, tenantId: ctx.tenantId, status: 'PENDING' },
      data: { status: 'RECORDED' },
    });
    return this.view(row.id, ctx);
  }

  /**
   * Correction: a negative mirror row dated today (so a filed period is
   * never changed retroactively) plus the ledger storno of the original
   * entry. Idempotent: one mirror per original (unique stornoOfId).
   */
  async storno(id: string, reason: string, ctx: RequestContext): Promise<VatBookEntryView> {
    if (reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'A storno needs a reason (min. 5 characters)');
    }
    const original = await this.prisma.vatBookEntry.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!original) throw notFound('VatBookEntry', id);
    if (original.status === 'STORNO') {
      throw new DomainError('INVALID_STATE', 'A storno row cannot be stornoed again');
    }
    if (original.status === 'PENDING') {
      throw new DomainError(
        'INVALID_STATE',
        'The entry is not posted yet — retry its recording first',
      );
    }
    let mirror = await this.prisma.vatBookEntry.findFirst({
      where: { tenantId: ctx.tenantId, stornoOfId: original.id },
    });
    if (!mirror) {
      if (original.status === 'STORNOED') {
        throw new DomainError('CONFLICT', 'The entry is already stornoed');
      }
      const today = new Date().toISOString().slice(0, 10);
      const { year } = await this.assertBookable(original.legalEntityId, today, ctx);
      const created = await this.insertNumbered(
        {
          tenantId: ctx.tenantId,
          legalEntityId: original.legalEntityId,
          bookType: original.bookType,
          year,
          status: 'PENDING',
          documentNumber: original.documentNumber,
          documentDate: original.documentDate,
          bookingDate: new Date(today),
          partnerId: original.partnerId,
          partnerName: original.partnerName,
          partnerTaxId: original.partnerTaxId,
          vatRateCode: original.vatRateCode,
          ratePct: original.ratePct,
          netAmount: money(-cents(original.netAmount)),
          vatAmount: money(-cents(original.vatAmount)),
          grossAmount: money(-cents(original.grossAmount)),
          currency: original.currency,
          counterAccountId: original.counterAccountId,
          invoiceId: null,
          stornoOfId: original.id,
          stornoReason: reason.trim(),
          requestKey: `storno:${original.id}`,
          requestHash: 'storno',
          createdBy: ctx.userId ?? null,
        },
        ctx,
      );
      if (!('replay' in created)) {
        await this.guardAfterInsert(created.id, original.legalEntityId, today, ctx);
      }
      mirror = await this.prisma.vatBookEntry.findFirst({
        where: { tenantId: ctx.tenantId, stornoOfId: original.id },
      });
      if (mirror && !('replay' in created)) {
        await this.audit(
          'fin.vat.entry.storno',
          'VatBookEntry',
          original.id,
          { mirrorId: mirror.id, bookNo: mirror.bookNo },
          ctx,
          reason.trim(),
        );
      }
    }
    if (!mirror) throw new DomainError('CONFLICT', 'Storno is in progress — retry');

    // Ledger storno of the original entry (exactly once).
    if (!mirror.glEntryId && original.glEntryId) {
      const entry = await this.prisma.glJournalEntry.findFirst({
        where: { id: original.glEntryId, tenantId: ctx.tenantId },
      });
      if (entry && !entry.stornoedById) {
        const status = await this.periodStatus(original.legalEntityId, mirror.bookingDate, ctx);
        if (status !== 'OPEN') {
          await this.prisma.vatBookEntry.deleteMany({
            where: { id: mirror.id, tenantId: ctx.tenantId, status: 'PENDING', glEntryId: null },
          });
          throw new DomainError(
            'INVALID_STATE',
            'The current VAT period was filed meanwhile — the storno cannot be booked',
          );
        }
      }
      if (entry) {
        try {
          // Ledger claims the reversal atomically; a concurrent loser gets
          // CONFLICT and a crashed claim is resumed (posted) here.
          await this.ledger.storno(
            original.glEntryId,
            `Storno ${original.bookType} ${original.bookNo}/${original.year}: ${reason.trim()}`,
            ctx,
          );
        } catch (error) {
          if (!(error instanceof DomainError && error.code === 'CONFLICT')) throw error;
        }
      }
      const after = await this.prisma.glJournalEntry.findFirst({
        where: { id: original.glEntryId, tenantId: ctx.tenantId },
      });
      await this.prisma.vatBookEntry.updateMany({
        where: { id: mirror.id, tenantId: ctx.tenantId, glEntryId: null },
        data: { glEntryId: after?.stornoedById ?? null },
      });
    }
    await this.prisma.$transaction([
      this.prisma.vatBookEntry.updateMany({
        where: { id: mirror.id, tenantId: ctx.tenantId, status: 'PENDING' },
        data: { status: 'STORNO' },
      }),
      this.prisma.vatBookEntry.updateMany({
        where: { id: original.id, tenantId: ctx.tenantId, status: 'RECORDED' },
        data: { status: 'STORNOED' },
      }),
    ]);
    return this.view(mirror.id, ctx);
  }

  async view(id: string, ctx: RequestContext): Promise<VatBookEntryView> {
    const r = await this.prisma.vatBookEntry.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!r) throw notFound('VatBookEntry', id);
    return this.toView(r);
  }

  private toView(r: Prisma.VatBookEntryGetPayload<object>): VatBookEntryView {
    return {
      id: r.id,
      legalEntityId: r.legalEntityId,
      bookType: r.bookType,
      year: r.year,
      bookNo: r.bookNo,
      status: r.status,
      documentNumber: r.documentNumber,
      documentDate: day(r.documentDate),
      bookingDate: day(r.bookingDate),
      partnerId: r.partnerId,
      partnerName: r.partnerName,
      partnerTaxId: r.partnerTaxId,
      vatRateCode: r.vatRateCode,
      ratePct: Number(r.ratePct).toFixed(2),
      netAmount: Number(r.netAmount).toFixed(2),
      vatAmount: Number(r.vatAmount).toFixed(2),
      grossAmount: Number(r.grossAmount).toFixed(2),
      currency: r.currency,
      counterAccountId: r.counterAccountId,
      invoiceId: r.invoiceId,
      glEntryId: r.glEntryId,
      stornoOfId: r.stornoOfId,
      stornoReason: r.stornoReason,
    };
  }

  /** KUF or KIF for one month (by booking date) — read-only. */
  async book(
    params: { legalEntityId: string; bookType: VatBookType; year: number; month: number },
    ctx: RequestContext,
  ) {
    if (!(VAT_BOOK_TYPES as readonly string[]).includes(params.bookType)) {
      throw new DomainError('VALIDATION_FAILED', 'bookType must be KUF or KIF');
    }
    const { from, to } = monthBounds(params.year, params.month);
    await this.legalEntity(params.legalEntityId, ctx);
    const rows = await this.prisma.vatBookEntry.findMany({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId: params.legalEntityId,
        bookType: params.bookType,
        status: { not: 'PENDING' },
        bookingDate: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: [{ year: 'asc' }, { bookNo: 'asc' }],
    });
    const sum = (k: 'netAmount' | 'vatAmount' | 'grossAmount') =>
      money(rows.reduce((s, r) => s + cents(r[k]), 0));
    return {
      legalEntityId: params.legalEntityId,
      bookType: params.bookType,
      year: params.year,
      month: params.month,
      from,
      to,
      rows: rows.map((r) => this.toView(r)),
      totals: { net: sum('netAmount'), vat: sum('vatAmount'), gross: sum('grossAmount') },
    };
  }

  // ------------------------------------------------ VAT period / return

  private async totals(legalEntityId: string, from: string, to: string, ctx: RequestContext) {
    const rows = await this.prisma.vatBookEntry.findMany({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId,
        bookingDate: { gte: new Date(from), lte: new Date(to) },
      },
    });
    const pick = (type: VatBookType) => {
      const r = rows.filter((x) => x.bookType === type && x.status !== 'PENDING');
      return {
        count: r.length,
        netC: r.reduce((s, x) => s + cents(x.netAmount), 0),
        vatC: r.reduce((s, x) => s + cents(x.vatAmount), 0),
        grossC: r.reduce((s, x) => s + cents(x.grossAmount), 0),
      };
    };
    return {
      kif: pick('KIF'),
      kuf: pick('KUF'),
      pending: rows.filter((x) => x.status === 'PENDING').length,
    };
  }

  /** Movement on the VAT role accounts in the period, excluding the settlement. */
  private async ledgerVat(
    legalEntityId: string,
    from: string,
    to: string,
    excludeEntryId: string | null,
    ctx: RequestContext,
  ) {
    const roles = await this.roleAccounts(legalEntityId, ctx);
    const outId = roles.get(VAT_ROLES.output);
    const inId = roles.get(VAT_ROLES.input);
    if (!outId || !inId) return null;
    const excluded: string[] = [];
    if (excludeEntryId) {
      excluded.push(excludeEntryId);
      const settlement = await this.prisma.glJournalEntry.findFirst({
        where: { id: excludeEntryId, tenantId: ctx.tenantId },
      });
      if (settlement?.stornoedById) excluded.push(settlement.stornoedById);
    }
    const lines = await this.prisma.glJournalLine.findMany({
      where: {
        tenantId: ctx.tenantId,
        accountId: { in: [outId, inId] },
        entry: {
          status: 'POSTED',
          legalEntityId,
          bookingDate: { gte: new Date(from), lte: new Date(to) },
          ...(excluded.length ? { id: { notIn: excluded } } : {}),
        },
      },
    });
    let outC = 0;
    let inC = 0;
    for (const l of lines) {
      if (l.accountId === outId) outC += cents(l.credit) - cents(l.debit);
      else inC += cents(l.debit) - cents(l.credit);
    }
    return { outC, inC };
  }

  async period(
    params: { legalEntityId: string; year: number; month: number },
    ctx: RequestContext,
  ): Promise<VatPeriodView> {
    const { from, to } = monthBounds(params.year, params.month);
    await this.legalEntity(params.legalEntityId, ctx);
    const stored = await this.prisma.vatPeriod.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId: params.legalEntityId,
        year: params.year,
        month: params.month,
      },
    });
    const t = await this.totals(params.legalEntityId, from, to, ctx);
    const gl = await this.ledgerVat(
      params.legalEntityId,
      from,
      to,
      stored?.settlementEntryId ?? null,
      ctx,
    );
    const live = { out: t.kif.vatC, in: t.kuf.vatC };
    const filed = stored?.status === 'FILED';
    const outC = filed ? cents(stored.outputVat ?? 0) : live.out;
    const inC = filed ? cents(stored.inputVat ?? 0) : live.in;
    const block = (b: { count: number; netC: number; vatC: number; grossC: number }) => ({
      count: b.count,
      net: money(b.netC),
      vat: money(b.vatC),
      gross: money(b.grossC),
    });
    return {
      legalEntityId: params.legalEntityId,
      year: params.year,
      month: params.month,
      from,
      to,
      status: stored?.status ?? 'OPEN',
      kif: block(t.kif),
      kuf: block(t.kuf),
      outputVat: money(outC),
      inputVat: money(inC),
      payableVat: money(outC - inC),
      pendingEntries: t.pending,
      ledger: gl
        ? {
            outputVat: money(gl.outC),
            inputVat: money(gl.inC),
            reconciled: gl.outC === live.out && gl.inC === live.in,
          }
        : null,
      filedAt: stored?.filedAt?.toISOString() ?? null,
      settlementEntryId: stored?.settlementEntryId ?? null,
      paidAt: stored?.paidAt ? day(stored.paidAt) : null,
      paidReference: stored?.paidReference ?? null,
    };
  }

  /**
   * PDV prijava: OPEN → FILING (CAS) → settlement entry (once) → FILED
   * with snapshot + outbox event in one transaction. Filing a FILED
   * period returns it unchanged; a FILING period is resumed.
   */
  async file(
    params: { legalEntityId: string; year: number; month: number },
    ctx: RequestContext,
  ): Promise<VatPeriodView> {
    const { from, to } = monthBounds(params.year, params.month);
    await this.legalEntity(params.legalEntityId, ctx);
    const period = await this.ensurePeriod(params.legalEntityId, params.year, params.month, ctx);
    if (period.status === 'FILED') return this.period(params, ctx);

    const lock = await this.prisma.glPeriodLock.findFirst({
      where: { tenantId: ctx.tenantId, legalEntityId: params.legalEntityId },
    });
    if (lock && new Date(to) <= lock.lockedThrough && !period.settlementEntryId) {
      throw new DomainError(
        'INVALID_STATE',
        `The accounting period is locked through ${day(lock.lockedThrough)} — the settlement cannot be posted`,
      );
    }
    const roles = await this.roleAccounts(params.legalEntityId, ctx);
    const missing = Object.values(VAT_ROLES).filter((r) => !roles.get(r));
    if (missing.length) {
      throw new DomainError(
        'INVALID_STATE',
        `Map the VAT system accounts first (FIN-024): ${missing.join(', ')}`,
      );
    }

    if (period.status === 'OPEN') {
      await this.prisma.vatPeriod.updateMany({
        where: { id: period.id, tenantId: ctx.tenantId, status: 'OPEN' },
        data: { status: 'FILING' },
      });
    }
    const t = await this.totals(params.legalEntityId, from, to, ctx);
    if (t.pending > 0) {
      await this.prisma.vatPeriod.updateMany({
        where: { id: period.id, tenantId: ctx.tenantId, status: 'FILING', settlementEntryId: null },
        data: { status: 'OPEN' },
      });
      throw new DomainError(
        'CONFLICT',
        `${t.pending} book entr${t.pending === 1 ? 'y is' : 'ies are'} still being posted — retry the filing`,
      );
    }
    const outC = t.kif.vatC;
    const inC = t.kuf.vatC;

    const current = await this.prisma.vatPeriod.findFirst({
      where: { id: period.id, tenantId: ctx.tenantId },
    });
    if (current?.status === 'FILED') return this.period(params, ctx);
    if (current?.status !== 'FILING') {
      throw new DomainError('CONFLICT', 'Another filing attempt reopened the period — retry');
    }
    let settlementId = current.settlementEntryId;
    if (!settlementId && (outC !== 0 || inC !== 0)) {
      const out = roles.get(VAT_ROLES.output)!;
      const inp = roles.get(VAT_ROLES.input)!;
      const settle = roles.get(VAT_ROLES.settlement)!;
      const lines: Array<{ accountId: string; debit: number; credit: number }> = [];
      const push = (accountId: string, signedDebitC: number) => {
        if (signedDebitC > 0) lines.push({ accountId, debit: signedDebitC / 100, credit: 0 });
        else if (signedDebitC < 0) lines.push({ accountId, debit: 0, credit: -signedDebitC / 100 });
      };
      push(out, outC); // close output VAT (credit balance)
      push(inp, -inC); // close input VAT (debit balance)
      push(settle, inC - outC); // payable (credit) or refund claim (debit)
      const draft = await this.ledger.createDraft(
        {
          legalEntityId: params.legalEntityId,
          entryType: 'ACCRUAL',
          bookingDate: to,
          description: `PDV prijava ${String(params.month).padStart(2, '0')}/${params.year}`,
          lines,
        },
        ctx,
      );
      const stored = await this.prisma.vatPeriod.updateMany({
        where: { id: period.id, tenantId: ctx.tenantId, status: 'FILING', settlementEntryId: null },
        data: { settlementEntryId: draft.id },
      });
      if (stored.count === 0) {
        await this.ledger.deleteDraft(draft.id, ctx);
        const again = await this.prisma.vatPeriod.findFirst({
          where: { id: period.id, tenantId: ctx.tenantId },
        });
        if (again?.status === 'FILED') return this.period(params, ctx);
        if (again?.status !== 'FILING' || !again.settlementEntryId) {
          throw new DomainError('CONFLICT', 'Another filing attempt reopened the period — retry');
        }
        settlementId = again.settlementEntryId;
      } else {
        settlementId = draft.id;
      }
    }
    if (settlementId) await this.ledger.post(settlementId, ctx);

    const flippedNow = await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.vatPeriod.updateMany({
        where: { id: period.id, tenantId: ctx.tenantId, status: 'FILING' },
        data: {
          status: 'FILED',
          outputVat: money(outC),
          inputVat: money(inC),
          payableVat: money(outC - inC),
          filedAt: new Date(),
          filedBy: ctx.userId ?? null,
        },
      });
      if (flipped.count === 0) return false;
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'fin.vat.period.file',
        objectType: 'VatPeriod',
        objectId: period.id,
        source: 'api',
        previousValues: { status: 'OPEN' },
        newValues: {
          status: 'FILED',
          outputVat: money(outC),
          inputVat: money(inC),
          payableVat: money(outC - inC),
          settlementEntryId: settlementId,
        },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.VAT_RETURN_FILED,
        aggregateType: 'VatPeriod',
        aggregateId: period.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: {
          legalEntityId: params.legalEntityId,
          year: params.year,
          month: params.month,
          outputVat: money(outC),
          inputVat: money(inC),
          payableVat: money(outC - inC),
        },
      });
      return true;
    });
    if (!flippedNow) {
      const final = await this.prisma.vatPeriod.findFirst({
        where: { id: period.id, tenantId: ctx.tenantId },
      });
      if (final?.status !== 'FILED') {
        throw new DomainError('CONFLICT', 'The filing did not complete — retry');
      }
    }
    return this.period(params, ctx);
  }

  /**
   * Records that the filed VAT liability was paid (status per legal
   * entity + period, FinTrack parity). No ledger posting — the bank
   * payment is booked through bank statements. Idempotent.
   */
  async markPaid(
    params: {
      legalEntityId: string;
      year: number;
      month: number;
      paidAt: string;
      reference: string;
    },
    ctx: RequestContext,
  ): Promise<VatPeriodView> {
    monthBounds(params.year, params.month);
    if (!DATE_RE.test(params.paidAt)) {
      throw new DomainError('VALIDATION_FAILED', 'paidAt must be YYYY-MM-DD');
    }
    await this.legalEntity(params.legalEntityId, ctx);
    const period = await this.prisma.vatPeriod.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId: params.legalEntityId,
        year: params.year,
        month: params.month,
      },
    });
    if (!period || period.status !== 'FILED') {
      throw new DomainError('INVALID_STATE', 'Only a filed VAT period can be marked paid');
    }
    if (period.paidAt) {
      if (
        day(period.paidAt) === params.paidAt &&
        period.paidReference === params.reference.trim()
      ) {
        return this.period(params, ctx);
      }
      throw new DomainError(
        'CONFLICT',
        `The period is already marked paid on ${day(period.paidAt)}`,
      );
    }
    const flipped = await this.prisma.vatPeriod.updateMany({
      where: { id: period.id, tenantId: ctx.tenantId, paidAt: null },
      data: {
        paidAt: new Date(params.paidAt),
        paidReference: params.reference.trim(),
        paidBy: ctx.userId ?? null,
      },
    });
    if (flipped.count > 0) {
      await this.audit(
        'fin.vat.period.paid',
        'VatPeriod',
        period.id,
        { paidAt: params.paidAt, reference: params.reference.trim() },
        ctx,
      );
    }
    return this.period(params, ctx);
  }

  async listPeriods(legalEntityId: string, ctx: RequestContext) {
    await this.legalEntity(legalEntityId, ctx);
    const rows = await this.prisma.vatPeriod.findMany({
      where: { tenantId: ctx.tenantId, legalEntityId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 36,
    });
    return rows.map((p) => ({
      year: p.year,
      month: p.month,
      status: p.status,
      outputVat: p.outputVat?.toString() ?? null,
      inputVat: p.inputVat?.toString() ?? null,
      payableVat: p.payableVat?.toString() ?? null,
      filedAt: p.filedAt?.toISOString() ?? null,
      paidAt: p.paidAt ? day(p.paidAt) : null,
    }));
  }
}
