import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * FIN-032 (Sprint 214) — compensation: offsetting a partner's open
 * receivables (CUSTOMER invoices) against payables (SUPPLIER
 * invoices) in the same currency and legal entity.
 *
 * Flow: draft (selected open items, partial amounts, both sides equal)
 * → review → EXPLICIT confirm — closes every line through the FIN-014
 * payment flow (no duplication: idempotent per-line references) and
 * posts exactly ONE linked COMPENSATION ledger entry (debit partner
 * payable account, credit partner receivable account; period lock and
 * opening-date guards apply through the ledger) → printable document →
 * controlled cancel: payment releases (negative mirrors) + ledger
 * storno + audit. Confirm and cancel are step-idempotent: a retry
 * completes missing steps and never doubles a payment or an entry.
 */

const EPS = 0.004;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CompensationLineInput {
  invoiceId: string;
  amount: number;
}

export interface CompensationDraftInput {
  legalEntityId: string;
  partnerId: string;
  bookingDate: string;
  receivables: CompensationLineInput[];
  payables: CompensationLineInput[];
}

export interface CompensationLineView {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  side: 'RECEIVABLE' | 'PAYABLE';
  amount: string;
  paymentId: string | null;
}

export interface CompensationView {
  id: string;
  compensationNumber: string;
  legalEntityId: string;
  partnerId: string;
  partnerName: string;
  currency: string;
  totalAmount: string;
  bookingDate: string;
  status: string;
  glEntryId: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lines: CompensationLineView[];
}

/** The FIN-014 payment slice compensation relies on. */
export interface CompensationPaymentGate {
  recordPayment(
    input: { invoiceId: string; amount: number; reference?: string | undefined },
    ctx: RequestContext,
  ): Promise<unknown>;
  releasePayment(
    input: { paymentId: string; reason: string },
    ctx: RequestContext,
  ): Promise<unknown>;
}

/** The GL slice (FIN-023..026) compensation relies on. */
export interface CompensationLedgerGate {
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
      entryType: 'COMPENSATION';
      bookingDate: string;
      description: string;
      lines: Array<{ accountId: string; debit: number; credit: number; partnerId?: string }>;
    },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  post(entryId: string, ctx: RequestContext): Promise<unknown>;
  storno(entryId: string, reason: string, ctx: RequestContext): Promise<unknown>;
}

export class CompensationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly payments: CompensationPaymentGate,
    private readonly ledger: CompensationLedgerGate,
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
      objectType: 'Compensation',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  /** Open (compensable) invoices of one partner, both sides. */
  async openItems(input: { legalEntityId: string; partnerId: string }, ctx: RequestContext) {
    const party = await this.prisma.party.findFirst({
      where: { id: input.partnerId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', input.partnerId);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        partyRefId: input.partnerId,
        status: { in: ['OPEN', 'PARTIALLY_PAID'] },
      },
      orderBy: { issuedAt: 'asc' },
      take: 500,
    });
    return invoices.map((i) => ({
      invoiceId: i.id,
      invoiceNumber: i.invoiceNumber,
      side: i.invoiceType === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE',
      currency: i.currency,
      total: i.total.toString(),
      open: (Math.round((Number(i.total) - Number(i.paidAmount)) * 100) / 100).toFixed(2),
    }));
  }

  async createDraft(input: CompensationDraftInput, ctx: RequestContext): Promise<CompensationView> {
    if (!DATE_RE.test(input.bookingDate)) {
      throw new DomainError('VALIDATION_FAILED', 'bookingDate must be YYYY-MM-DD');
    }
    if (input.receivables.length === 0 || input.payables.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A compensation needs both sides');
    }
    const entity = await this.prisma.legalEntity.findFirst({
      where: { id: input.legalEntityId, tenantId: ctx.tenantId },
    });
    if (!entity) throw notFound('LegalEntity', input.legalEntityId);
    const party = await this.prisma.party.findFirst({
      where: { id: input.partnerId, tenantId: ctx.tenantId },
    });
    if (!party) throw notFound('Party', input.partnerId);

    const all = [
      ...input.receivables.map((l) => ({ ...l, side: 'RECEIVABLE' as const })),
      ...input.payables.map((l) => ({ ...l, side: 'PAYABLE' as const })),
    ];
    const ids = all.map((l) => l.invoiceId);
    if (new Set(ids).size !== ids.length) {
      throw new DomainError('VALIDATION_FAILED', 'An invoice can appear only once');
    }
    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: ids }, tenantId: ctx.tenantId },
    });
    const byId = new Map(invoices.map((i) => [i.id, i]));
    let currency: string | null = null;
    for (const line of all) {
      const invoice = byId.get(line.invoiceId);
      if (!invoice) throw notFound('Invoice', line.invoiceId);
      if (invoice.partyRefId !== input.partnerId) {
        throw new DomainError('VALIDATION_FAILED', 'All invoices must belong to the partner');
      }
      const expectedType = line.side === 'RECEIVABLE' ? 'CUSTOMER' : 'SUPPLIER';
      if (invoice.invoiceType !== expectedType) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Invoice ${invoice.invoiceNumber} is on the wrong side`,
        );
      }
      if (invoice.status !== 'OPEN' && invoice.status !== 'PARTIALLY_PAID') {
        throw new DomainError('INVALID_STATE', `Invoice ${invoice.invoiceNumber} is not open`);
      }
      currency ??= invoice.currency;
      if (invoice.currency !== currency) {
        throw new DomainError('VALIDATION_FAILED', 'All invoices must share one currency');
      }
      if (!(line.amount > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Line amounts must be positive');
      }
      const open = Number(invoice.total) - Number(invoice.paidAmount);
      if (line.amount > open + 1e-9) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Amount exceeds the open balance of ${invoice.invoiceNumber} (${open.toFixed(2)})`,
        );
      }
    }
    const sumR = input.receivables.reduce((s, l) => s + l.amount, 0);
    const sumP = input.payables.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(sumR - sumP) > EPS) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Sides are not equal: receivables ${sumR.toFixed(2)} vs payables ${sumP.toFixed(2)}`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const count = await tx.compensation.count({
        where: { tenantId: ctx.tenantId, legalEntityId: input.legalEntityId },
      });
      const compensation = await tx.compensation.create({
        data: {
          tenantId: ctx.tenantId,
          legalEntityId: input.legalEntityId,
          compensationNumber: `KOM-${String(count + 1).padStart(6, '0')}`,
          partnerId: input.partnerId,
          currency: currency!,
          totalAmount: Math.round(sumR * 100) / 100,
          bookingDate: new Date(input.bookingDate),
          createdBy: ctx.userId ?? null,
        },
      });
      for (const line of all) {
        await tx.compensationLine.create({
          data: {
            tenantId: ctx.tenantId,
            compensationId: compensation.id,
            invoiceId: line.invoiceId,
            side: line.side,
            amount: line.amount,
          },
        });
      }
      return compensation;
    });
    await this.audit(
      'fin.compensation.create',
      created.id,
      { compensationNumber: created.compensationNumber, totalAmount: sumR },
      ctx,
    );
    return this.view(created.id, ctx);
  }

  async list(legalEntityId: string, ctx: RequestContext) {
    const rows = await this.prisma.compensation.findMany({
      where: { tenantId: ctx.tenantId, legalEntityId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((c) => ({
      id: c.id,
      compensationNumber: c.compensationNumber,
      partnerId: c.partnerId,
      currency: c.currency,
      totalAmount: c.totalAmount.toString(),
      bookingDate: c.bookingDate.toISOString().slice(0, 10),
      status: c.status,
    }));
  }

  async view(id: string, ctx: RequestContext): Promise<CompensationView> {
    const compensation = await this.prisma.compensation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lines: { include: { invoice: { select: { invoiceNumber: true } } } } },
    });
    if (!compensation) throw notFound('Compensation', id);
    const party = await this.prisma.party.findFirst({
      where: { id: compensation.partnerId, tenantId: ctx.tenantId },
    });
    return {
      id: compensation.id,
      compensationNumber: compensation.compensationNumber,
      legalEntityId: compensation.legalEntityId,
      partnerId: compensation.partnerId,
      partnerName: party?.name ?? '',
      currency: compensation.currency,
      totalAmount: compensation.totalAmount.toString(),
      bookingDate: compensation.bookingDate.toISOString().slice(0, 10),
      status: compensation.status,
      glEntryId: compensation.glEntryId,
      confirmedAt: compensation.confirmedAt?.toISOString() ?? null,
      cancelledAt: compensation.cancelledAt?.toISOString() ?? null,
      cancelReason: compensation.cancelReason,
      lines: compensation.lines.map((l) => ({
        id: l.id,
        invoiceId: l.invoiceId,
        invoiceNumber: l.invoice.invoiceNumber,
        side: l.side,
        amount: l.amount.toString(),
        paymentId: l.paymentId,
      })),
    };
  }

  /**
   * Explicit confirmation. Step-idempotent: each line's payment is
   * keyed `comp:<lineId>` (a retry finds it instead of paying twice),
   * the GL entry is created once and remembered on the record, and the
   * final DRAFT→CONFIRMED flip is guarded. Repeated confirmation of a
   * CONFIRMED compensation returns the view unchanged.
   */
  async confirm(id: string, ctx: RequestContext): Promise<CompensationView> {
    const compensation = await this.prisma.compensation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!compensation) throw notFound('Compensation', id);
    if (compensation.status === 'CONFIRMED') return this.view(id, ctx);
    if (compensation.status === 'CANCELLED') {
      throw new DomainError('INVALID_STATE', 'A cancelled compensation cannot be confirmed');
    }
    const party = await this.prisma.party.findFirst({
      where: { id: compensation.partnerId, tenantId: ctx.tenantId },
    });

    // 0) Period-lock pre-check BEFORE any side effect, so a refused
    //    confirmation leaves no half-applied payments behind.
    const lock = await this.prisma.glPeriodLock.findFirst({
      where: { tenantId: ctx.tenantId, legalEntityId: compensation.legalEntityId },
    });
    if (lock && compensation.bookingDate <= lock.lockedThrough) {
      throw new DomainError(
        'INVALID_STATE',
        `The accounting period is locked through ${lock.lockedThrough.toISOString().slice(0, 10)}`,
      );
    }

    // 1) Close every line through the payment flow (idempotent per line).
    for (const line of compensation.lines) {
      if (line.paymentId) continue;
      const reference = `comp:${line.id}`;
      let payment = await this.prisma.payment.findFirst({
        where: { tenantId: ctx.tenantId, invoiceId: line.invoiceId, reference },
      });
      if (!payment) {
        await this.payments.recordPayment(
          { invoiceId: line.invoiceId, amount: Number(line.amount), reference },
          ctx,
        );
        payment = await this.prisma.payment.findFirst({
          where: { tenantId: ctx.tenantId, invoiceId: line.invoiceId, reference },
        });
      }
      await this.prisma.compensationLine.update({
        where: { id: line.id },
        data: { paymentId: payment?.id ?? null },
      });
    }

    // 2) Exactly one linked COMPENSATION ledger entry (period lock and
    //    opening-date guards apply inside the ledger commands).
    let glEntryId = compensation.glEntryId;
    if (!glEntryId) {
      const receivableAcc = await this.ledger.ensurePartnerAccount(
        {
          legalEntityId: compensation.legalEntityId,
          partnerId: compensation.partnerId,
          side: 'customer',
          partnerName: party?.name ?? 'Partner',
        },
        ctx,
      );
      const payableAcc = await this.ledger.ensurePartnerAccount(
        {
          legalEntityId: compensation.legalEntityId,
          partnerId: compensation.partnerId,
          side: 'supplier',
          partnerName: party?.name ?? 'Partner',
        },
        ctx,
      );
      const total = Number(compensation.totalAmount);
      const draft = await this.ledger.createDraft(
        {
          legalEntityId: compensation.legalEntityId,
          entryType: 'COMPENSATION',
          bookingDate: compensation.bookingDate.toISOString().slice(0, 10),
          description: `Kompenzacija ${compensation.compensationNumber} — ${party?.name ?? ''}`,
          lines: [
            {
              accountId: payableAcc.id,
              debit: total,
              credit: 0,
              partnerId: compensation.partnerId,
            },
            {
              accountId: receivableAcc.id,
              debit: 0,
              credit: total,
              partnerId: compensation.partnerId,
            },
          ],
        },
        ctx,
      );
      await this.ledger.post(draft.id, ctx);
      glEntryId = draft.id;
      await this.prisma.compensation.update({
        where: { id: compensation.id },
        data: { glEntryId },
      });
    }

    // 3) Guarded flip DRAFT → CONFIRMED.
    const flipped = await this.prisma.compensation.updateMany({
      where: { id: compensation.id, tenantId: ctx.tenantId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: ctx.userId ?? null },
    });
    if (flipped.count > 0) {
      await this.audit('fin.compensation.confirm', compensation.id, { glEntryId }, ctx);
    }
    return this.view(id, ctx);
  }

  /**
   * Controlled cancel of a CONFIRMED compensation: every line's payment
   * is released (append-only negative mirror; unique constraint stops a
   * double release), the ledger entry is stornoed (mirror STORNO entry —
   * posted history is never deleted), and the record flips to CANCELLED
   * with the reason. Audited.
   */
  async cancel(id: string, reason: string, ctx: RequestContext): Promise<CompensationView> {
    if (reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'A cancellation needs a reason');
    }
    const compensation = await this.prisma.compensation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!compensation) throw notFound('Compensation', id);
    if (compensation.status === 'CANCELLED') return this.view(id, ctx);
    if (compensation.status !== 'CONFIRMED') {
      throw new DomainError('INVALID_STATE', 'Only a confirmed compensation can be cancelled');
    }

    for (const line of compensation.lines) {
      if (!line.paymentId) continue;
      const released = await this.prisma.payment.findFirst({
        where: { tenantId: ctx.tenantId, reversesPaymentId: line.paymentId },
      });
      if (!released) {
        await this.payments.releasePayment(
          {
            paymentId: line.paymentId,
            reason: `Kompenzacija ${compensation.compensationNumber}: ${reason.trim()}`,
          },
          ctx,
        );
      }
    }

    if (compensation.glEntryId) {
      const entry = await this.prisma.glJournalEntry.findFirst({
        where: { id: compensation.glEntryId, tenantId: ctx.tenantId },
      });
      if (entry && !entry.stornoedById) {
        await this.ledger.storno(
          compensation.glEntryId,
          `Poništenje kompenzacije ${compensation.compensationNumber}: ${reason.trim()}`,
          ctx,
        );
      }
    }

    const flipped = await this.prisma.compensation.updateMany({
      where: { id: compensation.id, tenantId: ctx.tenantId, status: 'CONFIRMED' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: ctx.userId ?? null,
        cancelReason: reason.trim(),
      },
    });
    if (flipped.count > 0) {
      await this.audit('fin.compensation.cancel', compensation.id, { reason: reason.trim() }, ctx);
    }
    return this.view(id, ctx);
  }

  /** Data for the printable compensation document. */
  async document(id: string, ctx: RequestContext) {
    const view = await this.view(id, ctx);
    const entity = await this.prisma.legalEntity.findFirst({
      where: { id: view.legalEntityId, tenantId: ctx.tenantId },
    });
    return {
      title: `IZJAVA O KOMPENZACIJI ${view.compensationNumber}`,
      legalEntityName: entity?.name ?? '',
      partnerName: view.partnerName,
      bookingDate: view.bookingDate,
      currency: view.currency,
      totalAmount: view.totalAmount,
      status: view.status,
      receivables: view.lines.filter((l) => l.side === 'RECEIVABLE'),
      payables: view.lines.filter((l) => l.side === 'PAYABLE'),
    };
  }
}
