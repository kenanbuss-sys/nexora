import { writeAudit } from '@nexora/audit';
import type { InvoiceStatus, InvoiceType, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

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

export class FinanceService {
  constructor(private readonly prisma: PrismaClient) {}

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
