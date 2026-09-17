import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * FIN-030/031 (Sprint 213) — bank statements and payment allocation
 * (closure).
 *
 * A statement is imported with control sums (opening + Σ lines =
 * closing, declared line count), protected against duplicates per
 * legal entity, reviewed and EXPLICITLY confirmed. Allocation links a
 * confirmed statement line to an invoice through the existing
 * append-only payment flow (FIN-014) — paidAmount moves there; NO
 * general-ledger entry is created by closure. Partial allocation is
 * allowed; over-allocation of a line or an invoice is refused;
 * allocation is idempotent via allocationKey.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EPS = 0.004;

export interface BankStatementLineInput {
  bookingDate: string;
  description: string;
  amount: number;
  reference?: string | undefined;
  counterpartyName?: string | undefined;
  counterpartyAccount?: string | undefined;
}

export interface BankStatementImportInput {
  legalEntityId: string;
  statementNumber: string;
  bankAccount: string;
  statementDate: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  /** Control sum: the declared number of lines must match. */
  lineCount: number;
  lines: BankStatementLineInput[];
  /** MANUAL (default) or AI_PROPOSAL when a person confirmed an AI-016 draft. */
  source?: string | undefined;
}

export interface BankStatementLineView {
  id: string;
  seq: number;
  bookingDate: string;
  description: string;
  reference: string | null;
  counterpartyName: string | null;
  amount: string;
  allocatedAmount: string;
  status: string;
}

export interface BankStatementView {
  id: string;
  legalEntityId: string;
  statementNumber: string;
  bankAccount: string;
  statementDate: string;
  currency: string;
  openingBalance: string;
  closingBalance: string;
  lineCount: number;
  status: string;
  source: string;
  confirmedAt: string | null;
  lines: BankStatementLineView[];
}

export interface AllocationView {
  id: string;
  allocationKey: string;
  statementLineId: string;
  invoiceId: string;
  paymentId: string | null;
  amount: string;
}

/** The slice of FinanceService (FIN-014) that closure relies on. */
export interface PaymentGate {
  recordPayment(
    input: { invoiceId: string; amount: number; reference?: string | undefined },
    ctx: RequestContext,
  ): Promise<unknown>;
}

export class BankStatementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly payments: PaymentGate,
  ) {}

  private async audit(
    action: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType: 'BankStatement',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  /** FIN-030: import a statement after validating its control sums. */
  async importStatement(
    input: BankStatementImportInput,
    ctx: RequestContext,
  ): Promise<BankStatementView> {
    if (!DATE_RE.test(input.statementDate)) {
      throw new DomainError('VALIDATION_FAILED', 'statementDate must be YYYY-MM-DD');
    }
    if (input.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A statement needs at least one line');
    }
    if (input.lines.length !== input.lineCount) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Control count mismatch: declared ${input.lineCount} lines, received ${input.lines.length}`,
      );
    }
    for (const line of input.lines) {
      if (!DATE_RE.test(line.bookingDate)) {
        throw new DomainError('VALIDATION_FAILED', 'Line bookingDate must be YYYY-MM-DD');
      }
      if (!Number.isFinite(line.amount) || Math.abs(line.amount) < EPS) {
        throw new DomainError('VALIDATION_FAILED', 'Every line needs a non-zero amount');
      }
    }
    const turnover = input.lines.reduce((sum, l) => sum + l.amount, 0);
    const expected = input.openingBalance + turnover;
    if (Math.abs(expected - input.closingBalance) > EPS) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Control sum mismatch: opening + turnover = ${expected.toFixed(2)}, declared closing = ${input.closingBalance.toFixed(2)}`,
      );
    }
    const entity = await this.prisma.legalEntity.findFirst({
      where: { id: input.legalEntityId, tenantId: ctx.tenantId },
    });
    if (!entity) throw notFound('LegalEntity', input.legalEntityId);
    const duplicate = await this.prisma.bankStatement.findFirst({
      where: {
        tenantId: ctx.tenantId,
        legalEntityId: input.legalEntityId,
        statementNumber: input.statementNumber,
      },
    });
    if (duplicate) {
      throw new DomainError('CONFLICT', 'The statement is already imported', {
        statementId: duplicate.id,
      });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: {
          tenantId: ctx.tenantId,
          legalEntityId: input.legalEntityId,
          statementNumber: input.statementNumber,
          bankAccount: input.bankAccount,
          statementDate: new Date(input.statementDate),
          currency: input.currency,
          openingBalance: input.openingBalance,
          closingBalance: input.closingBalance,
          lineCount: input.lineCount,
          source: input.source === 'AI_PROPOSAL' ? 'AI_PROPOSAL' : 'MANUAL',
          createdBy: ctx.userId ?? null,
        },
      });
      let seq = 0;
      for (const line of input.lines) {
        seq += 1;
        await tx.bankStatementLine.create({
          data: {
            tenantId: ctx.tenantId,
            statementId: statement.id,
            seq,
            bookingDate: new Date(line.bookingDate),
            description: line.description,
            reference: line.reference ?? null,
            counterpartyName: line.counterpartyName ?? null,
            counterpartyAccount: line.counterpartyAccount ?? null,
            amount: line.amount,
          },
        });
      }
      return statement;
    });
    await this.audit(
      'fin.bank.statement.import',
      created.id,
      { statementNumber: input.statementNumber, lineCount: input.lineCount },
      ctx,
    );
    return this.statementView(created.id, ctx);
  }

  async listStatements(legalEntityId: string, ctx: RequestContext) {
    const statements = await this.prisma.bankStatement.findMany({
      where: { tenantId: ctx.tenantId, legalEntityId },
      orderBy: [{ statementDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return statements.map((s) => ({
      id: s.id,
      statementNumber: s.statementNumber,
      bankAccount: s.bankAccount,
      statementDate: s.statementDate.toISOString().slice(0, 10),
      currency: s.currency,
      openingBalance: s.openingBalance.toString(),
      closingBalance: s.closingBalance.toString(),
      lineCount: s.lineCount,
      status: s.status,
      source: s.source,
    }));
  }

  async statementView(id: string, ctx: RequestContext): Promise<BankStatementView> {
    const statement = await this.prisma.bankStatement.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lines: { orderBy: { seq: 'asc' } } },
    });
    if (!statement) throw notFound('BankStatement', id);
    return {
      id: statement.id,
      legalEntityId: statement.legalEntityId,
      statementNumber: statement.statementNumber,
      bankAccount: statement.bankAccount,
      statementDate: statement.statementDate.toISOString().slice(0, 10),
      currency: statement.currency,
      openingBalance: statement.openingBalance.toString(),
      closingBalance: statement.closingBalance.toString(),
      lineCount: statement.lineCount,
      status: statement.status,
      source: statement.source,
      confirmedAt: statement.confirmedAt?.toISOString() ?? null,
      lines: statement.lines.map((l) => ({
        id: l.id,
        seq: l.seq,
        bookingDate: l.bookingDate.toISOString().slice(0, 10),
        description: l.description,
        reference: l.reference,
        counterpartyName: l.counterpartyName,
        amount: l.amount.toString(),
        allocatedAmount: l.allocatedAmount.toString(),
        status: l.status,
      })),
    };
  }

  /**
   * FIN-030: explicit confirmation after review. Idempotent — a
   * confirmed statement stays confirmed. Refused inside a locked
   * accounting period (FIN-025).
   */
  async confirm(id: string, ctx: RequestContext): Promise<BankStatementView> {
    const statement = await this.prisma.bankStatement.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!statement) throw notFound('BankStatement', id);
    if (statement.status === 'CONFIRMED') return this.statementView(id, ctx);
    const lock = await this.prisma.glPeriodLock.findFirst({
      where: { tenantId: ctx.tenantId, legalEntityId: statement.legalEntityId },
    });
    if (lock && statement.statementDate <= lock.lockedThrough) {
      throw new DomainError(
        'INVALID_STATE',
        `The accounting period is locked through ${lock.lockedThrough.toISOString().slice(0, 10)}`,
      );
    }
    const flipped = await this.prisma.bankStatement.updateMany({
      where: { id, tenantId: ctx.tenantId, status: 'IMPORTED' },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: ctx.userId ?? null },
    });
    if (flipped.count > 0) {
      await this.audit('fin.bank.statement.confirm', id, { status: 'CONFIRMED' }, ctx);
    }
    return this.statementView(id, ctx);
  }

  /** Discard an unconfirmed import (wrong file, re-import). */
  async discard(id: string, ctx: RequestContext): Promise<{ discarded: true }> {
    const statement = await this.prisma.bankStatement.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!statement) throw notFound('BankStatement', id);
    if (statement.status !== 'IMPORTED') {
      throw new DomainError('INVALID_STATE', 'Only an unconfirmed statement can be discarded');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.bankStatementLine.deleteMany({ where: { tenantId: ctx.tenantId, statementId: id } });
      await tx.bankStatement.delete({ where: { id } });
    });
    await this.audit(
      'fin.bank.statement.discard',
      id,
      { statementNumber: statement.statementNumber },
      ctx,
    );
    return { discarded: true };
  }

  /**
   * FIN-031: allocate (close) part of a statement line against an
   * invoice. The money movement is the FIN-014 payment; closure only
   * links it — no GL entry. Partial amounts are fine; a line can never
   * be allocated beyond |amount|; the invoice side is guarded by the
   * payment flow (over-payment refused). Idempotent per allocationKey.
   */
  async allocate(
    input: { statementLineId: string; invoiceId: string; amount: number; allocationKey: string },
    ctx: RequestContext,
  ): Promise<AllocationView> {
    if (!(input.amount > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Allocation amount must be positive');
    }
    if (input.allocationKey.trim().length < 8) {
      throw new DomainError('VALIDATION_FAILED', 'allocationKey needs at least 8 characters');
    }
    const key = input.allocationKey.trim();
    const existing = await this.prisma.paymentAllocation.findFirst({
      where: { tenantId: ctx.tenantId, allocationKey: key },
    });
    if (existing) {
      if (
        existing.statementLineId === input.statementLineId &&
        existing.invoiceId === input.invoiceId &&
        Math.abs(Number(existing.amount) - input.amount) < EPS
      ) {
        return this.allocationView(existing);
      }
      throw new DomainError('CONFLICT', 'allocationKey is already used for another allocation');
    }
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: input.statementLineId, tenantId: ctx.tenantId },
      include: { statement: true },
    });
    if (!line) throw notFound('BankStatementLine', input.statementLineId);
    if (line.statement.status !== 'CONFIRMED') {
      throw new DomainError('INVALID_STATE', 'Only lines of a confirmed statement can be closed');
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, tenantId: ctx.tenantId },
    });
    if (!invoice) throw notFound('Invoice', input.invoiceId);
    if (invoice.currency !== line.statement.currency) {
      throw new DomainError('VALIDATION_FAILED', 'Invoice and statement currencies differ');
    }
    const lineAmount = Number(line.amount);
    if (invoice.invoiceType === 'CUSTOMER' && lineAmount <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'A customer invoice closes against an inflow');
    }
    if (invoice.invoiceType === 'SUPPLIER' && lineAmount >= 0) {
      throw new DomainError('VALIDATION_FAILED', 'A supplier invoice closes against an outflow');
    }
    const remaining = Math.round((Math.abs(lineAmount) - Number(line.allocatedAmount)) * 100) / 100;
    if (input.amount > remaining + 1e-9) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Allocation exceeds the open line amount (${remaining.toFixed(2)})`,
      );
    }

    // The payment first (crash-safe: the key doubles as the payment
    // reference, so a retry finds it instead of paying twice).
    let paymentId: string | null = null;
    const priorPayment = await this.prisma.payment.findFirst({
      where: { tenantId: ctx.tenantId, invoiceId: invoice.id, reference: key },
    });
    if (priorPayment) {
      paymentId = priorPayment.id;
    } else {
      await this.payments.recordPayment(
        { invoiceId: invoice.id, amount: input.amount, reference: key },
        ctx,
      );
      const fresh = await this.prisma.payment.findFirst({
        where: { tenantId: ctx.tenantId, invoiceId: invoice.id, reference: key },
      });
      paymentId = fresh?.id ?? null;
    }

    const allocation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentAllocation.create({
        data: {
          tenantId: ctx.tenantId,
          allocationKey: key,
          statementLineId: line.id,
          invoiceId: invoice.id,
          paymentId,
          amount: input.amount,
          createdBy: ctx.userId ?? null,
        },
      });
      const newAllocated = Math.round((Number(line.allocatedAmount) + input.amount) * 100) / 100;
      const fullyAllocated = newAllocated >= Math.abs(lineAmount) - 1e-9;
      const flipped = await tx.bankStatementLine.updateMany({
        where: { id: line.id, tenantId: ctx.tenantId, allocatedAmount: line.allocatedAmount },
        data: {
          allocatedAmount: newAllocated,
          status: fullyAllocated ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED',
        },
      });
      if (flipped.count === 0) {
        throw new DomainError('CONFLICT', 'The line changed concurrently — retry the allocation');
      }
      return created;
    });
    await this.audit(
      'fin.bank.allocate',
      line.statementId,
      { allocationId: allocation.id, invoiceId: invoice.id, amount: input.amount },
      ctx,
    );
    return this.allocationView(allocation);
  }

  async lineAllocations(statementLineId: string, ctx: RequestContext): Promise<AllocationView[]> {
    const allocations = await this.prisma.paymentAllocation.findMany({
      where: { tenantId: ctx.tenantId, statementLineId },
      orderBy: { createdAt: 'asc' },
    });
    return allocations.map((a) => this.allocationView(a));
  }

  private allocationView(a: {
    id: string;
    allocationKey: string;
    statementLineId: string;
    invoiceId: string;
    paymentId: string | null;
    amount: { toString(): string };
  }): AllocationView {
    return {
      id: a.id,
      allocationKey: a.allocationKey,
      statementLineId: a.statementLineId,
      invoiceId: a.invoiceId,
      paymentId: a.paymentId,
      amount: a.amount.toString(),
    };
  }
}
