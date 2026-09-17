import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * FIN-023/024/025/026 (Sprint 211) — general-ledger core (BiH
 * accounting localization, ADR-020): chart of accounts per legal
 * entity, journal entries with a DRAFT → POSTED lifecycle, per-legal-
 * entity numbering, opening-balance guard, period lock and mirrored
 * storno. Posting happens ONLY through these commands; posted entries
 * are immutable.
 */

const CODE_RE = /^\d{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GL_ENTRY_TYPES = [
  'OPENING_BALANCE',
  'MANUAL',
  'KUF',
  'KIF',
  'BANK_STATEMENT',
  'COMPENSATION',
  'ACCRUAL',
  'STORNO',
  'HISTORY',
] as const;
export type GlEntryType = (typeof GL_ENTRY_TYPES)[number];

/** Types allowed to book before the opening-balance cut date. */
const PRE_OPENING_TYPES = new Set<GlEntryType>(['OPENING_BALANCE', 'HISTORY']);

export interface GlLineInput {
  accountId: string;
  debit: number;
  credit: number;
  partnerId?: string | undefined;
}

export interface GlEntryView {
  id: string;
  legalEntityId: string;
  entryNo: number | null;
  entryType: string;
  status: string;
  bookingDate: string;
  description: string;
  stornoOfId: string | null;
  stornoedById: string | null;
  totalDebit: string;
  totalCredit: string;
  lines: Array<{
    seq: number;
    accountId: string;
    accountCode: string;
    accountName: string;
    partnerId: string | null;
    debit: string;
    credit: string;
  }>;
}

export class LedgerService {
  constructor(private readonly prisma: PrismaClient) {}

  private async legalEntity(legalEntityId: string, ctx: RequestContext) {
    const entity = await this.prisma.legalEntity.findFirst({
      where: { id: legalEntityId, tenantId: ctx.tenantId },
    });
    if (!entity) throw notFound('LegalEntity', legalEntityId);
    return entity;
  }

  // ------------------------------------------ chart of accounts (FIN-024)

  async createAccount(
    input: { legalEntityId: string; code: string; name: string; partnerId?: string | undefined },
    ctx: RequestContext,
  ) {
    if (!CODE_RE.test(input.code)) {
      throw new DomainError('VALIDATION_FAILED', 'Account codes are 8 digits (FIN-024)');
    }
    if (!input.name.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'An account needs a name');
    }
    await this.legalEntity(input.legalEntityId, ctx);
    const existing = await this.prisma.glAccount.findFirst({
      where: { tenantId: ctx.tenantId, legalEntityId: input.legalEntityId, code: input.code },
    });
    if (existing) {
      throw new DomainError('CONFLICT', `Account ${input.code} already exists`, {
        accountId: existing.id,
      });
    }
    const account = await this.prisma.glAccount.create({
      data: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        code: input.code,
        name: input.name.trim(),
        partnerId: input.partnerId ?? null,
      },
    });
    await this.audit('gl.account.create', account.id, { code: account.code }, ctx);
    return this.accountView(account);
  }

  private accountView(a: {
    id: string;
    legalEntityId: string;
    code: string;
    name: string;
    active: boolean;
    partnerId: string | null;
  }) {
    return {
      id: a.id,
      legalEntityId: a.legalEntityId,
      code: a.code,
      name: a.name,
      class: a.code.charAt(0),
      active: a.active,
      partnerId: a.partnerId,
    };
  }

  async listAccounts(legalEntityId: string, ctx: RequestContext) {
    await this.legalEntity(legalEntityId, ctx);
    const accounts = await this.prisma.glAccount.findMany({
      where: { tenantId: ctx.tenantId, legalEntityId },
      orderBy: { code: 'asc' },
      take: 5000,
    });
    return accounts.map((a) => this.accountView(a));
  }

  /** An account in use can never be deleted — only deactivated. */
  async setAccountActive(accountId: string, active: boolean, ctx: RequestContext) {
    const account = await this.prisma.glAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('GlAccount', accountId);
    if (!active) {
      const used = await this.prisma.glJournalLine.findFirst({
        where: { tenantId: ctx.tenantId, accountId, entry: { status: 'POSTED' } },
      });
      // Deactivation is allowed even when used (blocks NEW postings);
      // deletion is not offered at all.
      void used;
    }
    const updated = await this.prisma.glAccount.update({
      where: { id: account.id },
      data: { active },
    });
    await this.audit('gl.account.set_active', account.id, { active }, ctx);
    return this.accountView(updated);
  }

  /** Copy an account into another legal entity of the same tenant. */
  async copyAccount(
    input: { accountId: string; targetLegalEntityId: string },
    ctx: RequestContext,
  ) {
    const account = await this.prisma.glAccount.findFirst({
      where: { id: input.accountId, tenantId: ctx.tenantId },
    });
    if (!account) throw notFound('GlAccount', input.accountId);
    return this.createAccount(
      {
        legalEntityId: input.targetLegalEntityId,
        code: account.code,
        name: account.name,
        partnerId: account.partnerId ?? undefined,
      },
      ctx,
    );
  }

  /**
   * FIN-024: lazy partner analytics — ensure the partner sub-account
   * exists for a MDM party in one legal entity. Prefixes come from
   * tenant config; defaults 4320 (supplier) / 2110 (customer).
   */
  async ensurePartnerAccount(
    input: {
      legalEntityId: string;
      partnerId: string;
      side: 'supplier' | 'customer';
      partnerName: string;
      prefix?: string | undefined;
    },
    ctx: RequestContext,
  ) {
    await this.legalEntity(input.legalEntityId, ctx);
    const party = await this.prisma.party.findFirst({
      where: { id: input.partnerId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', input.partnerId);
    const existing = await this.prisma.glAccount.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        partnerId: input.partnerId,
        code: { startsWith: input.prefix ?? (input.side === 'supplier' ? '4320' : '2110') },
      },
    });
    if (existing) return this.accountView(existing);
    const prefix = input.prefix ?? (input.side === 'supplier' ? '4320' : '2110');
    if (!/^\d{4}$/.test(prefix)) {
      throw new DomainError('VALIDATION_FAILED', 'Partner prefixes are 4 digits');
    }
    const last = await this.prisma.glAccount.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        code: { startsWith: prefix },
      },
      orderBy: { code: 'desc' },
    });
    const nextSuffix = last ? Number(last.code.slice(4)) + 1 : 1;
    const code = `${prefix}${String(nextSuffix).padStart(4, '0')}`;
    return this.createAccount(
      {
        legalEntityId: input.legalEntityId,
        code,
        name: input.partnerName.trim() || code,
        partnerId: input.partnerId,
      },
      ctx,
    );
  }

  // -------------------------------------- system accounts (FIN-024)

  async setSystemAccount(
    input: { legalEntityId: string; roleKey: string; accountId: string },
    ctx: RequestContext,
  ) {
    if (!/^[a-z][a-z0-9_.-]{1,60}$/.test(input.roleKey)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid system-account role key');
    }
    const account = await this.prisma.glAccount.findFirst({
      where: {
        id: input.accountId,
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
      },
    });
    if (!account) throw notFound('GlAccount', input.accountId);
    await this.prisma.glSystemAccount.upsert({
      where: {
        tenantId_legalEntityId_roleKey: {
          tenantId: ctx.tenantId,
          legalEntityId: input.legalEntityId,
          roleKey: input.roleKey,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        roleKey: input.roleKey,
        accountId: input.accountId,
      },
      update: { accountId: input.accountId },
    });
    await this.audit(
      'gl.system_account.set',
      `${input.legalEntityId}:${input.roleKey}`,
      { accountId: input.accountId },
      ctx,
    );
    return { roleKey: input.roleKey, accountId: input.accountId };
  }

  async systemAccounts(legalEntityId: string, ctx: RequestContext) {
    await this.legalEntity(legalEntityId, ctx);
    const rows = await this.prisma.glSystemAccount.findMany({
      where: { tenantId: ctx.tenantId, legalEntityId },
      orderBy: { roleKey: 'asc' },
    });
    return rows.map((r) => ({ roleKey: r.roleKey, accountId: r.accountId }));
  }

  // -------------------- opening balance date + period lock (FIN-025)

  async setOpeningDate(input: { legalEntityId: string; openingDate: string }, ctx: RequestContext) {
    if (!DATE_RE.test(input.openingDate)) {
      throw new DomainError('VALIDATION_FAILED', 'Opening date must be YYYY-MM-DD');
    }
    await this.legalEntity(input.legalEntityId, ctx);
    await this.prisma.glOpeningBalanceDate.upsert({
      where: {
        tenantId_legalEntityId: {
          tenantId: ctx.tenantId,
          legalEntityId: input.legalEntityId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        openingDate: new Date(input.openingDate),
      },
      update: { openingDate: new Date(input.openingDate) },
    });
    await this.audit(
      'gl.opening_date.set',
      input.legalEntityId,
      { openingDate: input.openingDate },
      ctx,
    );
    return { legalEntityId: input.legalEntityId, openingDate: input.openingDate };
  }

  async setPeriodLock(
    input: { legalEntityId: string; lockedThrough: string },
    ctx: RequestContext,
  ) {
    if (!DATE_RE.test(input.lockedThrough)) {
      throw new DomainError('VALIDATION_FAILED', 'Lock date must be YYYY-MM-DD');
    }
    await this.legalEntity(input.legalEntityId, ctx);
    await this.prisma.glPeriodLock.upsert({
      where: {
        tenantId_legalEntityId: {
          tenantId: ctx.tenantId,
          legalEntityId: input.legalEntityId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        lockedThrough: new Date(input.lockedThrough),
      },
      update: { lockedThrough: new Date(input.lockedThrough) },
    });
    await this.audit(
      'gl.period_lock.set',
      input.legalEntityId,
      { lockedThrough: input.lockedThrough },
      ctx,
    );
    return { legalEntityId: input.legalEntityId, lockedThrough: input.lockedThrough };
  }

  async ledgerControl(legalEntityId: string, ctx: RequestContext) {
    await this.legalEntity(legalEntityId, ctx);
    const [opening, lock] = await Promise.all([
      this.prisma.glOpeningBalanceDate.findFirst({
        where: { tenantId: ctx.tenantId, legalEntityId },
      }),
      this.prisma.glPeriodLock.findFirst({ where: { tenantId: ctx.tenantId, legalEntityId } }),
    ]);
    return {
      legalEntityId,
      openingDate: opening?.openingDate.toISOString().slice(0, 10) ?? null,
      lockedThrough: lock?.lockedThrough.toISOString().slice(0, 10) ?? null,
    };
  }

  // ------------------------- journal entries: draft → posted (FIN-023)

  async createDraft(
    input: {
      legalEntityId: string;
      entryType: string;
      bookingDate: string;
      description: string;
      lines: GlLineInput[];
    },
    ctx: RequestContext,
  ): Promise<GlEntryView> {
    if (!(GL_ENTRY_TYPES as readonly string[]).includes(input.entryType)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown entry type '${input.entryType}'`);
    }
    if (!DATE_RE.test(input.bookingDate)) {
      throw new DomainError('VALIDATION_FAILED', 'Booking date must be YYYY-MM-DD');
    }
    if (!input.description.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A journal entry needs a description');
    }
    if (input.lines.length < 2 || input.lines.length > 200) {
      throw new DomainError('VALIDATION_FAILED', 'A journal entry needs 2-200 lines');
    }
    await this.legalEntity(input.legalEntityId, ctx);
    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.glAccount.findMany({
      where: {
        id: { in: accountIds },
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
      },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const line of input.lines) {
      const account = byId.get(line.accountId);
      if (!account) {
        throw new DomainError('VALIDATION_FAILED', 'A line references an unknown account', {
          accountId: line.accountId,
        });
      }
      if (!account.active) {
        throw new DomainError('INVALID_STATE', `Account ${account.code} is inactive`);
      }
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      if (debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Each line carries a positive amount on exactly one side',
        );
      }
    }
    const entry = await this.prisma.glJournalEntry.create({
      data: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        entryType: input.entryType,
        bookingDate: new Date(input.bookingDate),
        description: input.description.trim(),
        createdBy: ctx.userId ?? null,
        lines: {
          create: input.lines.map((line, i) => ({
            tenantId: ctx.tenantId,
            accountId: line.accountId,
            partnerId: line.partnerId ?? null,
            debit: line.debit,
            credit: line.credit,
            seq: i + 1,
          })),
        },
      },
    });
    await this.audit('gl.entry.draft', entry.id, { entryType: input.entryType }, ctx);
    return this.entryView(entry.id, ctx);
  }

  async deleteDraft(entryId: string, ctx: RequestContext): Promise<{ ok: true }> {
    const entry = await this.entry(entryId, ctx);
    if (entry.status !== 'DRAFT') {
      throw new DomainError(
        'INVALID_STATE',
        'Only a draft can be deleted; posted entries are corrected by storno',
      );
    }
    await this.prisma.glJournalEntry.delete({ where: { id: entry.id } });
    await this.audit('gl.entry.draft_delete', entry.id, {}, ctx);
    return { ok: true };
  }

  private async entry(entryId: string, ctx: RequestContext) {
    const entry = await this.prisma.glJournalEntry.findFirst({
      where: { id: entryId, tenantId: ctx.tenantId },
    });
    if (!entry) throw notFound('GlJournalEntry', entryId);
    return entry;
  }

  /**
   * Post a reviewed draft: balance must hold, the booking date must
   * respect the opening cut and the period lock, and the entry gets
   * the next number of its legal entity. Idempotent: posting an
   * already POSTED entry returns it unchanged.
   */
  async post(entryId: string, ctx: RequestContext): Promise<GlEntryView> {
    const entry = await this.entry(entryId, ctx);
    if (entry.status === 'POSTED') return this.entryView(entry.id, ctx);
    if (entry.status !== 'DRAFT') {
      throw new DomainError('INVALID_STATE', `Cannot post a ${entry.status} entry`);
    }
    const lines = await this.prisma.glJournalLine.findMany({
      where: { tenantId: ctx.tenantId, entryId: entry.id },
    });
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.004) {
      throw new DomainError('INVALID_STATE', 'Debit and credit must balance before posting', {
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
      });
    }
    // FIN-025 guards.
    const [opening, lock] = await Promise.all([
      this.prisma.glOpeningBalanceDate.findFirst({
        where: { tenantId: ctx.tenantId, legalEntityId: entry.legalEntityId },
      }),
      this.prisma.glPeriodLock.findFirst({
        where: { tenantId: ctx.tenantId, legalEntityId: entry.legalEntityId },
      }),
    ]);
    if (
      opening &&
      entry.bookingDate < opening.openingDate &&
      !PRE_OPENING_TYPES.has(entry.entryType as GlEntryType)
    ) {
      throw new DomainError(
        'INVALID_STATE',
        'Booking before the opening-balance date is not allowed (FIN-025)',
        {
          openingDate: opening.openingDate.toISOString().slice(0, 10),
        },
      );
    }
    if (lock && entry.bookingDate <= lock.lockedThrough) {
      throw new DomainError('INVALID_STATE', 'The period is locked (FIN-025)', {
        lockedThrough: lock.lockedThrough.toISOString().slice(0, 10),
      });
    }
    const posted = await this.prisma.$transaction(async (tx) => {
      const last = await tx.glJournalEntry.findFirst({
        where: {
          tenantId: ctx.tenantId,
          legalEntityId: entry.legalEntityId,
          entryNo: { not: null },
        },
        orderBy: { entryNo: 'desc' },
        select: { entryNo: true },
      });
      const row = await tx.glJournalEntry.update({
        where: { id: entry.id },
        data: {
          status: 'POSTED',
          entryNo: (last?.entryNo ?? 0) + 1,
          postedAt: new Date(),
          postedBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'gl.entry.post',
        objectType: 'GlJournalEntry',
        objectId: entry.id,
        source: 'api',
        previousValues: { status: 'DRAFT' },
        newValues: { status: 'POSTED', entryNo: row.entryNo },
      });
      return row;
    });
    return this.entryView(posted.id, ctx);
  }

  /** FIN-026: the ONLY correction path for a posted entry. */
  async storno(entryId: string, reason: string, ctx: RequestContext): Promise<GlEntryView> {
    if (reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'A storno needs a reason');
    }
    const entry = await this.entry(entryId, ctx);
    if (entry.status !== 'POSTED') {
      throw new DomainError('INVALID_STATE', 'Only a posted entry can be stornoed');
    }
    if (entry.stornoedById) {
      throw new DomainError('CONFLICT', 'The entry is already stornoed', {
        stornoEntryId: entry.stornoedById,
      });
    }
    if (entry.entryType === 'STORNO') {
      throw new DomainError('INVALID_STATE', 'A storno entry cannot be stornoed again');
    }
    const lines = await this.prisma.glJournalLine.findMany({
      where: { tenantId: ctx.tenantId, entryId: entry.id },
      orderBy: { seq: 'asc' },
    });
    const mirror = await this.createDraft(
      {
        legalEntityId: entry.legalEntityId,
        entryType: 'STORNO',
        bookingDate: new Date().toISOString().slice(0, 10),
        description: `STORNO naloga ${entry.entryNo ?? entry.id}: ${reason.trim()}`,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          partnerId: l.partnerId ?? undefined,
          debit: Number(l.credit),
          credit: Number(l.debit),
        })),
      },
      ctx,
    );
    await this.prisma.glJournalEntry.update({
      where: { id: mirror.id },
      data: { stornoOfId: entry.id },
    });
    const posted = await this.post(mirror.id, ctx);
    await this.prisma.glJournalEntry.update({
      where: { id: entry.id },
      data: { stornoedById: mirror.id },
    });
    await this.audit('gl.entry.storno', entry.id, { stornoEntryId: mirror.id }, ctx, reason.trim());
    return posted;
  }

  async listEntries(
    params: { legalEntityId: string; status?: string | undefined },
    ctx: RequestContext,
  ) {
    await this.legalEntity(params.legalEntityId, ctx);
    const entries = await this.prisma.glJournalEntry.findMany({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId: params.legalEntityId,
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: [{ entryNo: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return Promise.all(entries.map((e) => this.entryView(e.id, ctx)));
  }

  async entryView(entryId: string, ctx: RequestContext): Promise<GlEntryView> {
    const entry = await this.entry(entryId, ctx);
    const lines = await this.prisma.glJournalLine.findMany({
      where: { tenantId: ctx.tenantId, entryId: entry.id },
      orderBy: { seq: 'asc' },
      include: { account: { select: { code: true, name: true } } },
    });
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
    return {
      id: entry.id,
      legalEntityId: entry.legalEntityId,
      entryNo: entry.entryNo,
      entryType: entry.entryType,
      status: entry.status,
      bookingDate: entry.bookingDate.toISOString().slice(0, 10),
      description: entry.description,
      stornoOfId: entry.stornoOfId,
      stornoedById: entry.stornoedById,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      lines: lines.map((l) => ({
        seq: l.seq,
        accountId: l.accountId,
        accountCode: l.account.code,
        accountName: l.account.name,
        partnerId: l.partnerId,
        debit: Number(l.debit).toFixed(2),
        credit: Number(l.credit).toFixed(2),
      })),
    };
  }

  private async audit(
    action: string,
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
      objectType: 'GlJournalEntry',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
      ...(reason !== undefined ? { reason } : {}),
    });
  }
}
