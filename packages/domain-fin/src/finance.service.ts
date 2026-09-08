import { writeAudit } from '@nexora/audit';
import type { InvoiceStatus, InvoiceType, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { BankFeedPort } from './bankfeed';

/**
 * Operational finance — AR invoices billed from fulfilled sales orders
 * (FIN-011), AP invoices recorded from received purchase orders
 * (FIN-012), payment matching that moves paidAmount only through
 * guarded, append-only payments (FIN-014), COGS from received purchase
 * prices (FIN-003), margin per invoiced order (FIN-007) and an
 * operational P&L read model (FIN-019).
 *
 * Invoicing is exactly-once per (type, order): enforced by a unique
 * constraint, so a concurrent double-invoice loses with CONFLICT.
 */

export interface InvoiceView {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  partyRefId: string;
  orderRefId: string;
  currency: string;
  total: string;
  paidAmount: string;
  status: InvoiceStatus;
  issuedAt: string;
}

export interface PaymentView {
  id: string;
  paymentNumber: string;
  invoiceId: string;
  amount: string;
  currency: string;
  reference: string | null;
  receivedAt: string;
}

export interface MarginRow {
  orderId: string;
  orderNumber: string;
  revenue: string;
  cogs: string;
  margin: string;
  marginPct: string;
  currency: string;
}

export interface PnlView {
  revenue: string;
  expenses: string;
  grossResult: string;
  cashIn: string;
  cashOut: string;
  openReceivables: string;
  openPayables: string;
}

/**
 * Three-way match (PROC-014): purchase order vs goods receipt vs
 * supplier invoice, compared by value with a small tolerance.
 */
export interface ThreeWayMatchView {
  invoiceId: string;
  poId: string;
  poNumber: string;
  orderedValue: string;
  receivedValue: string;
  invoicedValue: string;
  matched: boolean;
  reasons: string[];
  lines: Array<{
    description: string;
    ordered: string;
    received: string;
    unitPrice: string;
  }>;
}

export class FinanceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly bankFeed?: BankFeedPort,
  ) {}

  // --------------------------------------------------------------- invoices

  async listInvoices(
    filter: { invoiceType?: InvoiceType | undefined },
    ctx: RequestContext,
  ): Promise<InvoiceView[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.invoiceType ? { invoiceType: filter.invoiceType } : {}),
      },
      orderBy: [{ issuedAt: 'desc' }],
      take: 100,
    });
    return invoices.map((i) => this.invoiceView(i));
  }

  /** Bills a FULFILLED sales order exactly once (FIN-011). */
  async createCustomerInvoice(
    input: { orderId: string; dueInDays?: number | undefined },
    ctx: RequestContext,
  ): Promise<InvoiceView> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId },
    });
    if (!order) throw notFound('SalesOrder', input.orderId);
    if (order.status !== 'FULFILLED') {
      throw new DomainError('INVALID_STATE', 'Only fulfilled orders can be invoiced');
    }
    return this.issue(
      {
        invoiceType: 'CUSTOMER',
        partyRefId: order.accountId,
        orderRefId: order.id,
        currency: order.currency,
        total: Number(order.total),
        dueInDays: input.dueInDays,
      },
      ctx,
    );
  }

  /** Records the supplier invoice for a RECEIVED purchase order (FIN-012). */
  async createSupplierInvoice(
    input: { poId: string; dueInDays?: number | undefined },
    ctx: RequestContext,
  ): Promise<InvoiceView> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: input.poId, tenantId: ctx.tenantId },
    });
    if (!po) throw notFound('PurchaseOrder', input.poId);
    if (po.status !== 'RECEIVED' && po.status !== 'PARTIALLY_RECEIVED') {
      throw new DomainError('INVALID_STATE', 'Only received purchase orders can be invoiced');
    }
    return this.issue(
      {
        invoiceType: 'SUPPLIER',
        partyRefId: po.supplierId,
        orderRefId: po.id,
        currency: po.currency,
        total: Number(po.total),
        dueInDays: input.dueInDays,
      },
      ctx,
    );
  }

  /**
   * Three-way match (PROC-014): the supplier invoice may only be paid
   * for value that was actually received against the purchase order.
   * Tolerance: 1% of received value (rounding, freight noise).
   */
  async threeWayMatch(invoiceId: string, ctx: RequestContext): Promise<ThreeWayMatchView> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: ctx.tenantId },
    });
    if (!invoice) throw notFound('Invoice', invoiceId);
    if (invoice.invoiceType !== 'SUPPLIER') {
      throw new DomainError('INVALID_STATE', 'Three-way match applies to supplier invoices');
    }
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: invoice.orderRefId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!po) throw notFound('PurchaseOrder', invoice.orderRefId);
    let orderedValue = 0;
    let receivedValue = 0;
    const lines = po.lines.map((line) => {
      const ordered = Number(line.quantity);
      const received = Number(line.receivedQty);
      const price = Number(line.unitPrice);
      orderedValue += ordered * price;
      receivedValue += received * price;
      return {
        description: line.description,
        ordered: String(ordered),
        received: String(received),
        unitPrice: price.toFixed(2),
      };
    });
    const invoicedValue = Number(invoice.total);
    const tolerance = Math.max(0.01, receivedValue * 0.01);
    const reasons: string[] = [];
    if (invoicedValue > receivedValue + tolerance) {
      reasons.push('INVOICE_EXCEEDS_RECEIVED');
    }
    if (receivedValue + 1e-9 < orderedValue) {
      reasons.push('NOT_FULLY_RECEIVED');
    }
    return {
      invoiceId: invoice.id,
      poId: po.id,
      poNumber: po.poNumber,
      orderedValue: orderedValue.toFixed(2),
      receivedValue: receivedValue.toFixed(2),
      invoicedValue: invoicedValue.toFixed(2),
      matched: !reasons.includes('INVOICE_EXCEEDS_RECEIVED'),
      reasons,
      lines,
    };
  }

  /**
   * Matches a payment to an invoice (FIN-014): the payment row is
   * append-only, paidAmount moves atomically, over-payment is refused,
   * and the status derives from the new balance.
   */
  async recordPayment(
    input: { invoiceId: string; amount: number; reference?: string | undefined },
    ctx: RequestContext,
  ): Promise<InvoiceView> {
    if (!(input.amount > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Payment amount must be positive');
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, tenantId: ctx.tenantId },
    });
    if (!invoice) throw notFound('Invoice', input.invoiceId);
    if (invoice.status === 'VOID' || invoice.status === 'PAID') {
      throw new DomainError('INVALID_STATE', `A ${invoice.status} invoice takes no payments`);
    }
    const open = Number(invoice.total) - Number(invoice.paidAmount);
    if (input.amount > open + 1e-9) {
      throw new DomainError('VALIDATION_FAILED', `Payment exceeds the open amount (${open})`);
    }
    // Three-way-match hook (PROC-014): block paying a supplier invoice
    // whose value was not received; the refusal is audited.
    if (invoice.invoiceType === 'SUPPLIER') {
      const match = await this.threeWayMatch(invoice.id, ctx);
      if (!match.matched) {
        await writeAudit(this.prisma, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'fin.three_way.block',
          objectType: 'Invoice',
          objectId: invoice.id,
          source: 'api',
          newValues: { reasons: match.reasons, invoicedValue: match.invoicedValue },
        });
        throw new DomainError(
          'INVALID_STATE',
          'Three-way match failed — the invoice exceeds the received value',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const count = await tx.payment.count({ where: { tenantId: ctx.tenantId } });
      const payment = await tx.payment.create({
        data: {
          tenantId: ctx.tenantId,
          paymentNumber: `PAY-${String(count + 1).padStart(6, '0')}`,
          invoiceId: invoice.id,
          amount: input.amount,
          currency: invoice.currency,
          reference: input.reference ?? null,
          createdBy: ctx.userId ?? null,
        },
      });
      const newPaid = Math.round((Number(invoice.paidAmount) + input.amount) * 100) / 100;
      const fullyPaid = newPaid >= Number(invoice.total) - 1e-9;
      const flipped = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          tenantId: ctx.tenantId,
          paidAmount: invoice.paidAmount,
          status: invoice.status,
        },
        data: { paidAmount: newPaid, status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID' },
      });
      if (flipped.count === 0) {
        throw new DomainError('CONFLICT', 'Invoice changed concurrently — retry the payment');
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'fin.payment.record',
        objectType: 'Payment',
        objectId: payment.id,
        source: 'api',
        newValues: { invoiceId: invoice.id, amount: input.amount },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PAYMENT_RECEIVED,
        aggregateType: 'Payment',
        aggregateId: payment.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { paymentId: payment.id, invoiceId: invoice.id, amount: input.amount },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PAYMENT_MATCHED,
        aggregateType: 'Invoice',
        aggregateId: invoice.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { invoiceId: invoice.id, paidAmount: newPaid },
      });
    });
    const fresh = await this.prisma.invoice.findFirst({
      where: { id: invoice.id, tenantId: ctx.tenantId },
    });
    return this.invoiceView(fresh!);
  }

  async listPayments(invoiceId: string, ctx: RequestContext): Promise<PaymentView[]> {
    const payments = await this.prisma.payment.findMany({
      where: { tenantId: ctx.tenantId, invoiceId },
      orderBy: [{ receivedAt: 'desc' }],
      take: 100,
    });
    return payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      invoiceId: p.invoiceId,
      amount: p.amount.toString(),
      currency: p.currency,
      reference: p.reference,
      receivedAt: p.receivedAt.toISOString(),
    }));
  }

  // ------------------------------------------------------------ read models

  /**
   * Margin per invoiced sales order (FIN-003/007): revenue is the
   * order total; COGS approximates each line's quantity at the average
   * received purchase price of the SKU.
   */
  /**
   * Bank feed import (FIN-013): pull normalized transactions from the
   * provider-neutral port and reconcile them — exactly once per
   * external reference. A transaction matches by remittance invoice
   * number first, then by exact open amount; matched transactions
   * record payments through the ordinary payment path (three-way
   * match and over-payment guards included), the rest are reported.
   */
  async importBankFeed(ctx: RequestContext): Promise<{
    fetched: number;
    imported: number;
    matched: number;
    unmatched: Array<{ externalRef: string; amount: number; reason: string }>;
  }> {
    if (!this.bankFeed) {
      throw new DomainError('INVALID_STATE', 'No bank feed is configured');
    }
    const transactions = await this.bankFeed.fetchTransactions(ctx.tenantId);
    let imported = 0;
    let matched = 0;
    const unmatched: Array<{ externalRef: string; amount: number; reason: string }> = [];
    for (const txn of transactions) {
      const marker = await this.prisma.auditEvent.findFirst({
        where: {
          tenantId: ctx.tenantId,
          action: 'fin.bankfeed.import',
          objectType: 'BankTransaction',
          objectId: txn.externalRef,
        },
        select: { id: true },
      });
      if (marker) continue;
      imported += 1;
      let invoice = null;
      if (txn.invoiceNumber) {
        invoice = await this.prisma.invoice.findFirst({
          where: {
            tenantId: ctx.tenantId,
            invoiceNumber: txn.invoiceNumber,
            status: { in: ['OPEN', 'PARTIALLY_PAID'] },
          },
        });
      }
      if (!invoice && txn.amount > 0) {
        const candidates = await this.prisma.invoice.findMany({
          where: { tenantId: ctx.tenantId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
          take: 500,
        });
        const exact = candidates.filter(
          (c) => Math.abs(Number(c.total) - Number(c.paidAmount) - txn.amount) < 1e-9,
        );
        if (exact.length === 1) invoice = exact[0] ?? null;
      }
      let outcome: string;
      if (!invoice) {
        outcome = 'NO_MATCH';
        unmatched.push({ externalRef: txn.externalRef, amount: txn.amount, reason: 'NO_MATCH' });
      } else {
        try {
          await this.recordPayment(
            { invoiceId: invoice.id, amount: txn.amount, reference: `bank:${txn.externalRef}` },
            ctx,
          );
          matched += 1;
          outcome = 'MATCHED';
        } catch {
          outcome = 'PAYMENT_REFUSED';
          unmatched.push({
            externalRef: txn.externalRef,
            amount: txn.amount,
            reason: 'PAYMENT_REFUSED',
          });
        }
      }
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'fin.bankfeed.import',
        objectType: 'BankTransaction',
        objectId: txn.externalRef,
        source: 'api',
        newValues: { amount: txn.amount, outcome, invoiceId: invoice?.id ?? null },
      });
    }
    return { fetched: transactions.length, imported, matched, unmatched };
  }

  async marginAnalysis(ctx: RequestContext): Promise<MarginRow[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId, invoiceType: 'CUSTOMER', status: { not: 'VOID' } },
      take: 100,
      orderBy: [{ issuedAt: 'desc' }],
    });
    if (invoices.length === 0) return [];
    const orders = await this.prisma.salesOrder.findMany({
      where: { tenantId: ctx.tenantId, id: { in: invoices.map((i) => i.orderRefId) } },
      include: { lines: true },
    });
    const skuIds = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.skuId)))];
    const avgCost = await this.averageReceivedCost(skuIds, ctx);

    return orders.map((order) => {
      const revenue = Number(order.total);
      const cogs = order.lines.reduce(
        (sum, line) => sum + Number(line.quantity) * (avgCost.get(line.skuId) ?? 0),
        0,
      );
      const margin = Math.round((revenue - cogs) * 100) / 100;
      const marginPct = revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0;
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        revenue: revenue.toFixed(2),
        cogs: (Math.round(cogs * 100) / 100).toFixed(2),
        margin: margin.toFixed(2),
        marginPct: marginPct.toFixed(2),
        currency: order.currency,
      };
    });
  }

  /** Operational P&L snapshot (FIN-019): derived, never stored. */
  /**
   * Treasury snapshot (FIN-015): cash flows to date plus what falls
   * due in the next 7 days on both sides — one point-in-time picture.
   */
  async treasurySnapshot(ctx: RequestContext): Promise<{
    cashIn: string;
    cashOut: string;
    netCash: string;
    openReceivables: string;
    openPayables: string;
    receivablesDue7d: string;
    payablesDue7d: string;
  }> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'VOID' } },
      select: {
        invoiceType: true,
        total: true,
        paidAmount: true,
        status: true,
        dueAt: true,
      },
      take: 10_000,
    });
    const soon = Date.now() + 7 * 86_400_000;
    let cashIn = 0;
    let cashOut = 0;
    let openReceivables = 0;
    let openPayables = 0;
    let receivablesDue7d = 0;
    let payablesDue7d = 0;
    for (const invoice of invoices) {
      const paid = Number(invoice.paidAmount);
      const open = Number(invoice.total) - paid;
      if (invoice.invoiceType === 'CUSTOMER') {
        cashIn += paid;
        if (open > 0) {
          openReceivables += open;
          if (invoice.dueAt && invoice.dueAt.getTime() <= soon) receivablesDue7d += open;
        }
      } else {
        cashOut += paid;
        if (open > 0) {
          openPayables += open;
          if (invoice.dueAt && invoice.dueAt.getTime() <= soon) payablesDue7d += open;
        }
      }
    }
    return {
      cashIn: cashIn.toFixed(2),
      cashOut: cashOut.toFixed(2),
      netCash: (cashIn - cashOut).toFixed(2),
      openReceivables: openReceivables.toFixed(2),
      openPayables: openPayables.toFixed(2),
      receivablesDue7d: receivablesDue7d.toFixed(2),
      payablesDue7d: payablesDue7d.toFixed(2),
    };
  }

  /**
   * Revenue/cost capture (FIN-002): invoiced revenue and cost per
   * calendar month over the window, with the running margin — the
   * P&L trend at a glance.
   */
  async revenueCostByMonth(
    months: number,
    ctx: RequestContext,
  ): Promise<Array<{ month: string; revenue: string; cost: string; margin: string }>> {
    const clamped = Math.max(1, Math.min(24, months));
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - clamped + 1, 1);
    cutoff.setUTCHours(0, 0, 0, 0);
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'VOID' }, issuedAt: { gte: cutoff } },
      select: { invoiceType: true, total: true, issuedAt: true },
      take: 10_000,
    });
    const byMonth = new Map<string, { revenue: number; cost: number }>();
    for (const invoice of invoices) {
      const month = invoice.issuedAt.toISOString().slice(0, 7);
      const bucket = byMonth.get(month) ?? { revenue: 0, cost: 0 };
      if (invoice.invoiceType === 'CUSTOMER') bucket.revenue += Number(invoice.total);
      else bucket.cost += Number(invoice.total);
      byMonth.set(month, bucket);
    }
    return [...byMonth.entries()]
      .sort(([a2], [b2]) => a2.localeCompare(b2))
      .map(([month, bucket]) => ({
        month,
        revenue: bucket.revenue.toFixed(2),
        cost: bucket.cost.toFixed(2),
        margin: (bucket.revenue - bucket.cost).toFixed(2),
      }));
  }

  /**
   * Cash-flow forecast (FIN-009): open invoice amounts bucketed by due
   * date on both sides, plus confirmed-but-uninvoiced order value as
   * the revenue pipeline.
   */
  async forecast(ctx: RequestContext): Promise<{
    buckets: Array<{ bucket: string; inflow: string; outflow: string; net: string }>;
    pipeline: string;
  }> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
      select: { invoiceType: true, total: true, paidAmount: true, dueAt: true },
      take: 10_000,
    });
    const now = Date.now();
    const edges: Array<{ bucket: string; until: number }> = [
      { bucket: 'overdue', until: now },
      { bucket: '0-7d', until: now + 7 * 86_400_000 },
      { bucket: '8-30d', until: now + 30 * 86_400_000 },
      { bucket: '31d+', until: Number.POSITIVE_INFINITY },
    ];
    const sums = new Map<string, { inflow: number; outflow: number }>(
      edges.map((e) => [e.bucket, { inflow: 0, outflow: 0 }]),
    );
    for (const invoice of invoices) {
      const open = Number(invoice.total) - Number(invoice.paidAmount);
      if (open <= 0) continue;
      const due = invoice.dueAt ? invoice.dueAt.getTime() : now + 31 * 86_400_000;
      const edge = edges.find((e) => due <= e.until) ?? edges[edges.length - 1];
      const bucket = sums.get(edge?.bucket ?? '31d+');
      if (!bucket) continue;
      if (invoice.invoiceType === 'CUSTOMER') bucket.inflow += open;
      else bucket.outflow += open;
    }
    const orders = await this.prisma.salesOrder.findMany({
      where: { tenantId: ctx.tenantId, status: 'CONFIRMED' },
      select: { id: true, total: true },
      take: 5_000,
    });
    const invoiced = await this.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        invoiceType: 'CUSTOMER',
        orderRefId: { in: orders.map((o) => o.id) },
      },
      select: { orderRefId: true },
    });
    const invoicedSet = new Set(invoiced.map((i) => i.orderRefId));
    const pipeline = orders
      .filter((o) => !invoicedSet.has(o.id))
      .reduce((sum, o) => sum + Number(o.total), 0);
    return {
      buckets: edges.map((e) => {
        const bucket = sums.get(e.bucket) ?? { inflow: 0, outflow: 0 };
        return {
          bucket: e.bucket,
          inflow: bucket.inflow.toFixed(2),
          outflow: bucket.outflow.toFixed(2),
          net: (bucket.inflow - bucket.outflow).toFixed(2),
        };
      }),
      pipeline: pipeline.toFixed(2),
    };
  }

  /**
   * Profit centers (FIN-017): revenue, cost and margin per cost
   * center, from invoices attributed to it (FIN-016).
   */
  async profitCenters(ctx: RequestContext): Promise<
    Array<{
      costCenterId: string | null;
      code: string;
      revenue: string;
      cost: string;
      margin: string;
    }>
  > {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'VOID' } },
      select: { invoiceType: true, total: true, costCenterId: true },
      take: 10_000,
    });
    const centers = await this.prisma.costCenter.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });
    const codeOf = new Map(centers.map((c) => [c.id, c.code]));
    const buckets = new Map<string, { revenue: number; cost: number }>();
    for (const invoice of invoices) {
      const key = invoice.costCenterId ?? 'none';
      const bucket = buckets.get(key) ?? { revenue: 0, cost: 0 };
      if (invoice.invoiceType === 'CUSTOMER') bucket.revenue += Number(invoice.total);
      else bucket.cost += Number(invoice.total);
      buckets.set(key, bucket);
    }
    return [...buckets.entries()]
      .map(([key, bucket]) => ({
        costCenterId: key === 'none' ? null : key,
        code: key === 'none' ? '(neraspoređeno)' : (codeOf.get(key) ?? '?'),
        revenue: bucket.revenue.toFixed(2),
        cost: bucket.cost.toFixed(2),
        margin: (bucket.revenue - bucket.cost).toFixed(2),
      }))
      .sort((x, y) => Number(y.margin) - Number(x.margin));
  }

  async pnl(ctx: RequestContext): Promise<PnlView> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'VOID' } },
    });
    let revenue = 0;
    let expenses = 0;
    let cashIn = 0;
    let cashOut = 0;
    let openReceivables = 0;
    let openPayables = 0;
    for (const invoice of invoices) {
      const total = Number(invoice.total);
      const paid = Number(invoice.paidAmount);
      if (invoice.invoiceType === 'CUSTOMER') {
        revenue += total;
        cashIn += paid;
        openReceivables += total - paid;
      } else {
        expenses += total;
        cashOut += paid;
        openPayables += total - paid;
      }
    }
    const round = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
    return {
      revenue: round(revenue),
      expenses: round(expenses),
      grossResult: round(revenue - expenses),
      cashIn: round(cashIn),
      cashOut: round(cashOut),
      openReceivables: round(openReceivables),
      openPayables: round(openPayables),
    };
  }

  // ---------------------------------------------------------------- private

  private async issue(
    input: {
      invoiceType: InvoiceType;
      partyRefId: string;
      orderRefId: string;
      currency: string;
      total: number;
      dueInDays?: number | undefined;
    },
    ctx: RequestContext,
  ): Promise<InvoiceView> {
    if (!(input.total > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'An invoice needs a positive total');
    }
    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        const count = await tx.invoice.count({
          where: { tenantId: ctx.tenantId, invoiceType: input.invoiceType },
        });
        const prefix = input.invoiceType === 'CUSTOMER' ? 'INV' : 'SUPINV';
        const created = await tx.invoice.create({
          data: {
            tenantId: ctx.tenantId,
            invoiceNumber: `${prefix}-${String(count + 1).padStart(6, '0')}`,
            invoiceType: input.invoiceType,
            partyRefId: input.partyRefId,
            orderRefId: input.orderRefId,
            currency: input.currency,
            total: input.total,
            dueAt: input.dueInDays ? new Date(Date.now() + input.dueInDays * 86_400_000) : null,
            createdBy: ctx.userId ?? null,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'fin.invoice.issue',
          objectType: 'Invoice',
          objectId: created.id,
          source: 'api',
          newValues: { invoiceNumber: created.invoiceNumber, total: input.total },
        });
        await publishToOutbox(tx, {
          tenantId: ctx.tenantId,
          eventType: EVENT_TYPES.INVOICE_ISSUED,
          aggregateType: 'Invoice',
          aggregateId: created.id,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          payload: { invoiceId: created.id, invoiceNumber: created.invoiceNumber },
        });
        return created;
      });
      return this.invoiceView(invoice);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new DomainError('CONFLICT', 'The order is already invoiced');
      }
      throw error;
    }
  }

  /** Average received purchase price per SKU (FIN-003). */
  private async averageReceivedCost(
    skuIds: string[],
    ctx: RequestContext,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (skuIds.length === 0) return result;
    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: { tenantId: ctx.tenantId, skuId: { in: skuIds }, receivedQty: { gt: 0 } },
    });
    const totals = new Map<string, { cost: number; qty: number }>();
    for (const line of lines) {
      const entry = totals.get(line.skuId) ?? { cost: 0, qty: 0 };
      entry.cost += Number(line.receivedQty) * Number(line.unitPrice);
      entry.qty += Number(line.receivedQty);
      totals.set(line.skuId, entry);
    }
    for (const [skuId, { cost, qty }] of totals) {
      if (qty > 0) result.set(skuId, cost / qty);
    }
    return result;
  }

  private invoiceView(invoice: {
    id: string;
    invoiceNumber: string;
    invoiceType: InvoiceType;
    partyRefId: string;
    orderRefId: string;
    currency: string;
    total: { toString(): string };
    paidAmount: { toString(): string };
    status: InvoiceStatus;
    issuedAt: Date;
  }): InvoiceView {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      partyRefId: invoice.partyRefId,
      orderRefId: invoice.orderRefId,
      currency: invoice.currency,
      total: invoice.total.toString(),
      paidAmount: invoice.paidAmount.toString(),
      status: invoice.status,
      issuedAt: invoice.issuedAt.toISOString(),
    };
  }
}
