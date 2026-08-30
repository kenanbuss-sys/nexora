import { writeAudit } from '@nexora/audit';
import type { PrismaClient, QuoteStatus } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { PricingService } from './pricing.service';

/**
 * CPQ quotes — lifecycle (CPQ-011), versioning (CPQ-012), margin floor and
 * discount approvals (CPQ-004/005).
 *
 * DRAFT -> (submit) -> APPROVED, or PENDING_APPROVAL when any line discount
 * exceeds the margin floor; approval runs through the WF approval service
 * (separation of duties enforced there). APPROVED -> SENT -> ACCEPTED /
 * REJECTED. A new version supersedes a SENT/REJECTED/EXPIRED quote.
 */

/** Margin floor (CPQ-004): discounts above this percentage need approval. */
export const DISCOUNT_APPROVAL_THRESHOLD_PCT = 20;

export interface QuoteLineView {
  id: string;
  skuId: string;
  description: string;
  quantity: string;
  listUnitPrice: string;
  discountPct: string;
  netUnitPrice: string;
  lineTotal: string;
}

export interface QuoteView {
  id: string;
  quoteNumber: string;
  version: number;
  supersedesId: string | null;
  accountId: string;
  opportunityId: string | null;
  priceListId: string;
  status: QuoteStatus;
  currency: string;
  subtotal: string;
  discountTotal: string;
  total: string;
  approvalId: string | null;
  lines: QuoteLineView[];
}

/** Cross-domain contract: account state is owned by CRM. */
export interface AccountGate {
  getAccountState(
    tenantId: string,
    accountId: string,
  ): Promise<{ exists: boolean; active: boolean }>;
}

/** Cross-domain contract: approvals are owned by WF. */
export interface ApprovalGate {
  requestApproval(
    input: { title: string; subjectObjectType: string; subjectObjectId: string },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  getApprovalStatus(
    tenantId: string,
    approvalId: string,
  ): Promise<'REQUESTED' | 'GRANTED' | 'REJECTED' | null>;
}

/** Cross-domain contract: SKU identity is owned by PIM. */
export interface SkuInfoGate {
  getSkuInfo(
    tenantId: string,
    skuId: string,
  ): Promise<{ exists: boolean; active: boolean; code: string; name: string } | null>;
}

function toView(quote: {
  id: string;
  quoteNumber: string;
  version: number;
  supersedesId: string | null;
  accountId: string;
  opportunityId: string | null;
  priceListId: string;
  status: QuoteStatus;
  currency: string;
  subtotal: { toString(): string };
  discountTotal: { toString(): string };
  total: { toString(): string };
  approvalId: string | null;
  lines: Array<{
    id: string;
    skuId: string;
    description: string;
    quantity: { toString(): string };
    listUnitPrice: { toString(): string };
    discountPct: { toString(): string };
    netUnitPrice: { toString(): string };
    lineTotal: { toString(): string };
  }>;
}): QuoteView {
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    version: quote.version,
    supersedesId: quote.supersedesId,
    accountId: quote.accountId,
    opportunityId: quote.opportunityId,
    priceListId: quote.priceListId,
    status: quote.status,
    currency: quote.currency,
    subtotal: quote.subtotal.toString(),
    discountTotal: quote.discountTotal.toString(),
    total: quote.total.toString(),
    approvalId: quote.approvalId,
    lines: quote.lines.map((l) => ({
      id: l.id,
      skuId: l.skuId,
      description: l.description,
      quantity: l.quantity.toString(),
      listUnitPrice: l.listUnitPrice.toString(),
      discountPct: l.discountPct.toString(),
      netUnitPrice: l.netUnitPrice.toString(),
      lineTotal: l.lineTotal.toString(),
    })),
  };
}

export class QuoteService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pricing: PricingService,
    private readonly accounts: AccountGate,
    private readonly approvals: ApprovalGate,
    private readonly skus: SkuInfoGate,
  ) {}

  async listQuotes(
    filter: { accountId?: string | undefined; status?: QuoteStatus | undefined },
    ctx: RequestContext,
  ): Promise<QuoteView[]> {
    const quotes = await this.prisma.quote.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: { lines: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return quotes.map(toView);
  }

  async getQuote(quoteId: string, ctx: RequestContext): Promise<QuoteView> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!quote) throw notFound('Quote', quoteId);
    return toView(quote);
  }

  async createQuote(
    input: {
      accountId: string;
      priceListId: string;
      opportunityId?: string | undefined;
      validUntil?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<QuoteView> {
    const account = await this.accounts.getAccountState(ctx.tenantId, input.accountId);
    if (!account.exists) throw notFound('CrmAccount', input.accountId);
    if (!account.active) throw new DomainError('INVALID_STATE', 'Account is blocked');
    const list = await this.prisma.priceList.findFirst({
      where: { id: input.priceListId, tenantId: ctx.tenantId, status: 'ACTIVE' },
    });
    if (!list) throw notFound('Active price list', input.priceListId);

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.quote.count({ where: { tenantId: ctx.tenantId } });
      const quote = await tx.quote.create({
        data: {
          tenantId: ctx.tenantId,
          quoteNumber: `Q-${String(count + 1).padStart(6, '0')}`,
          accountId: input.accountId,
          opportunityId: input.opportunityId ?? null,
          priceListId: input.priceListId,
          currency: list.currency,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          createdBy: ctx.userId ?? null,
        },
        include: { lines: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'cpq.quote.create',
        objectType: 'Quote',
        objectId: quote.id,
        source: 'api',
        newValues: { quoteNumber: quote.quoteNumber, accountId: quote.accountId },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.QUOTE_CREATED,
        aggregateType: 'Quote',
        aggregateId: quote.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { quoteId: quote.id, quoteNumber: quote.quoteNumber },
      });
      return toView(quote);
    });
  }

  /** Adds a line priced from the pinned list; only in DRAFT. */
  async addLine(
    input: {
      quoteId: string;
      skuId: string;
      quantity: number;
      discountPct?: number | undefined;
    },
    ctx: RequestContext,
  ): Promise<QuoteView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const discountPct = input.discountPct ?? 0;
    if (discountPct < 0 || discountPct > 100) {
      throw new DomainError('VALIDATION_FAILED', 'Discount must be between 0 and 100');
    }
    const quote = await this.prisma.quote.findFirst({
      where: { id: input.quoteId, tenantId: ctx.tenantId },
    });
    if (!quote) throw notFound('Quote', input.quoteId);
    if (quote.status !== 'DRAFT') {
      throw new DomainError('INVALID_STATE', 'Lines can only change while the quote is a draft');
    }
    const sku = await this.skus.getSkuInfo(ctx.tenantId, input.skuId);
    if (!sku || !sku.exists) throw notFound('Sku', input.skuId);
    if (!sku.active) throw new DomainError('INVALID_STATE', 'SKU is not active');

    const { unitPrice } = await this.pricing.resolvePrice(
      quote.priceListId,
      input.skuId,
      input.quantity,
      ctx,
    );
    const list = Number(unitPrice);
    const net = Math.round(list * (1 - discountPct / 100) * 10000) / 10000;
    const lineTotal = Math.round(net * input.quantity * 100) / 100;

    await this.prisma.quoteLine.create({
      data: {
        tenantId: ctx.tenantId,
        quoteId: quote.id,
        skuId: input.skuId,
        description: `${sku.code} — ${sku.name}`,
        quantity: input.quantity,
        listUnitPrice: list,
        discountPct,
        netUnitPrice: net,
        lineTotal,
      },
    });
    await this.recomputeTotals(quote.id, ctx);
    return this.getQuote(quote.id, ctx);
  }

  /**
   * Submits a draft. If any line discount exceeds the margin floor, the
   * quote goes to PENDING_APPROVAL and a WF approval is requested;
   * otherwise it is APPROVED directly.
   */
  async submitQuote(quoteId: string, ctx: RequestContext): Promise<QuoteView> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!quote) throw notFound('Quote', quoteId);
    if (quote.status !== 'DRAFT') throw new DomainError('INVALID_STATE', 'Quote is not a draft');
    if (quote.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A quote needs at least one line');
    }
    const maxDiscount = Math.max(...quote.lines.map((l) => Number(l.discountPct)));
    const needsApproval = maxDiscount > DISCOUNT_APPROVAL_THRESHOLD_PCT;

    if (needsApproval) {
      const approval = await this.approvals.requestApproval(
        {
          title: `Discount ${maxDiscount}% on quote ${quote.quoteNumber} (floor ${DISCOUNT_APPROVAL_THRESHOLD_PCT}%)`,
          subjectObjectType: 'Quote',
          subjectObjectId: quote.id,
        },
        ctx,
      );
      const flipped = await this.prisma.quote.updateMany({
        where: { id: quote.id, tenantId: ctx.tenantId, status: 'DRAFT' },
        data: { status: 'PENDING_APPROVAL', approvalId: approval.id },
      });
      if (flipped.count === 0) throw new DomainError('CONFLICT', 'Quote changed concurrently');
    } else {
      const flipped = await this.prisma.quote.updateMany({
        where: { id: quote.id, tenantId: ctx.tenantId, status: 'DRAFT' },
        data: { status: 'APPROVED' },
      });
      if (flipped.count === 0) throw new DomainError('CONFLICT', 'Quote changed concurrently');
      await this.emitQuoteApproved(quote.id, ctx);
    }
    return this.getQuote(quote.id, ctx);
  }

  /** Applies the WF approval outcome to a PENDING_APPROVAL quote. */
  async syncApproval(quoteId: string, ctx: RequestContext): Promise<QuoteView> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
    });
    if (!quote) throw notFound('Quote', quoteId);
    if (quote.status !== 'PENDING_APPROVAL' || !quote.approvalId) {
      throw new DomainError('INVALID_STATE', 'Quote is not waiting for approval');
    }
    const status = await this.approvals.getApprovalStatus(ctx.tenantId, quote.approvalId);
    if (status === 'GRANTED') {
      await this.prisma.quote.updateMany({
        where: { id: quote.id, tenantId: ctx.tenantId, status: 'PENDING_APPROVAL' },
        data: { status: 'APPROVED' },
      });
      await this.emitQuoteApproved(quote.id, ctx);
    } else if (status === 'REJECTED') {
      await this.prisma.quote.updateMany({
        where: { id: quote.id, tenantId: ctx.tenantId, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED' },
      });
    }
    return this.getQuote(quote.id, ctx);
  }

  /** APPROVED -> SENT. From here the quote content is customer-visible. */
  async sendQuote(quoteId: string, ctx: RequestContext): Promise<QuoteView> {
    const flipped = await this.prisma.quote.updateMany({
      where: { id: quoteId, tenantId: ctx.tenantId, status: 'APPROVED' },
      data: { status: 'SENT' },
    });
    if (flipped.count === 0) throw new DomainError('INVALID_STATE', 'Quote is not approved');
    return this.getQuote(quoteId, ctx);
  }

  /** SENT -> ACCEPTED (emits quote.accepted) or REJECTED. */
  async decideQuote(quoteId: string, accepted: boolean, ctx: RequestContext): Promise<QuoteView> {
    const flipped = await this.prisma.quote.updateMany({
      where: { id: quoteId, tenantId: ctx.tenantId, status: 'SENT' },
      data: { status: accepted ? 'ACCEPTED' : 'REJECTED' },
    });
    if (flipped.count === 0) throw new DomainError('INVALID_STATE', 'Quote is not sent');
    if (accepted) {
      await this.prisma.$transaction(async (tx) => {
        await publishToOutbox(tx, {
          tenantId: ctx.tenantId,
          eventType: EVENT_TYPES.QUOTE_ACCEPTED,
          aggregateType: 'Quote',
          aggregateId: quoteId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          payload: { quoteId },
        });
      });
    }
    return this.getQuote(quoteId, ctx);
  }

  /** Creates the next version (DRAFT) of a SENT/REJECTED/EXPIRED quote (CPQ-012). */
  async newVersion(quoteId: string, ctx: RequestContext): Promise<QuoteView> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!quote) throw notFound('Quote', quoteId);
    if (!['SENT', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
      throw new DomainError('INVALID_STATE', 'Only sent/rejected/expired quotes can be revised');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const next = await tx.quote.create({
        data: {
          tenantId: ctx.tenantId,
          quoteNumber: quote.quoteNumber,
          version: quote.version + 1,
          supersedesId: quote.id,
          accountId: quote.accountId,
          opportunityId: quote.opportunityId,
          priceListId: quote.priceListId,
          currency: quote.currency,
          subtotal: quote.subtotal,
          discountTotal: quote.discountTotal,
          total: quote.total,
          validUntil: quote.validUntil,
          createdBy: ctx.userId ?? null,
          lines: {
            create: quote.lines.map((l) => ({
              tenantId: ctx.tenantId,
              skuId: l.skuId,
              description: l.description,
              quantity: l.quantity,
              listUnitPrice: l.listUnitPrice,
              discountPct: l.discountPct,
              netUnitPrice: l.netUnitPrice,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'cpq.quote.revise',
        objectType: 'Quote',
        objectId: next.id,
        source: 'api',
        newValues: { quoteNumber: next.quoteNumber, version: next.version },
      });
      return next;
    });
    return toView(created);
  }

  private async recomputeTotals(quoteId: string, ctx: RequestContext): Promise<void> {
    const lines = await this.prisma.quoteLine.findMany({
      where: { tenantId: ctx.tenantId, quoteId },
    });
    let subtotal = 0;
    let total = 0;
    for (const line of lines) {
      subtotal += Number(line.listUnitPrice) * Number(line.quantity);
      total += Number(line.lineTotal);
    }
    subtotal = Math.round(subtotal * 100) / 100;
    total = Math.round(total * 100) / 100;
    const discountTotal = Math.round((subtotal - total) * 100) / 100;
    await this.prisma.quote.update({
      where: { id: quoteId },
      data: { subtotal, discountTotal, total },
    });
  }

  private async emitQuoteApproved(quoteId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.QUOTE_APPROVED,
        aggregateType: 'Quote',
        aggregateId: quoteId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { quoteId },
      });
    });
  }
}
