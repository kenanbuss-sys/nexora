import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * RFQ management (PROC-004). One SKU/quantity is put out to suppliers;
 * each supplier's offer is recorded exactly once (unique per RFQ +
 * supplier, retriable), and awarding picks a single offer — the
 * decision is audited so the sourcing trail explains every award.
 */

export interface RfqQuoteView {
  id: string;
  supplierId: string;
  supplierName: string;
  unitPrice: string;
  leadTimeDays: number | null;
  note: string | null;
  awarded: boolean;
}

export interface RfqView {
  id: string;
  rfqNumber: string;
  skuId: string;
  skuCode: string;
  quantity: string;
  status: string;
  dueAt: Date | null;
  quotes: RfqQuoteView[];
}

export class RfqService {
  constructor(private readonly prisma: PrismaClient) {}

  private async toView(rfq: {
    id: string;
    rfqNumber: string;
    skuId: string;
    quantity: unknown;
    status: string;
    dueAt: Date | null;
    awardedQuoteId: string | null;
    tenantId: string;
  }): Promise<RfqView> {
    const [sku, quotes] = await Promise.all([
      this.prisma.sku.findFirst({ where: { id: rfq.skuId, tenantId: rfq.tenantId } }),
      this.prisma.rfqQuote.findMany({
        where: { tenantId: rfq.tenantId, rfqId: rfq.id },
        orderBy: [{ unitPrice: 'asc' }],
      }),
    ]);
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId: rfq.tenantId, id: { in: quotes.map((q) => q.supplierId) } },
      select: { id: true, partyId: true, supplierNumber: true },
    });
    const parties = await this.prisma.party.findMany({
      where: { tenantId: rfq.tenantId, id: { in: suppliers.map((s) => s.partyId) } },
      select: { id: true, name: true },
    });
    const partyName = new Map(parties.map((p) => [p.id, p.name]));
    const nameOf = new Map(
      suppliers.map((s) => [s.id, partyName.get(s.partyId) ?? s.supplierNumber]),
    );
    return {
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      skuId: rfq.skuId,
      skuCode: sku?.code ?? '',
      quantity: String(rfq.quantity),
      status: rfq.status,
      dueAt: rfq.dueAt,
      quotes: quotes.map((q) => ({
        id: q.id,
        supplierId: q.supplierId,
        supplierName: nameOf.get(q.supplierId) ?? '',
        unitPrice: q.unitPrice.toString(),
        leadTimeDays: q.leadTimeDays,
        note: q.note,
        awarded: q.id === rfq.awardedQuoteId,
      })),
    };
  }

  async createRfq(
    input: { skuId: string; quantity: number; dueAt?: string | undefined },
    ctx: RequestContext,
  ): Promise<RfqView> {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const sku = await this.prisma.sku.findFirst({
      where: { id: input.skuId, tenantId: ctx.tenantId },
    });
    if (!sku) throw notFound('Sku', input.skuId);
    const count = await this.prisma.rfq.count({ where: { tenantId: ctx.tenantId } });
    const rfq = await this.prisma.rfq.create({
      data: {
        tenantId: ctx.tenantId,
        rfqNumber: `RFQ-${String(count + 1).padStart(6, '0')}`,
        skuId: input.skuId,
        quantity: input.quantity,
        ...(input.dueAt !== undefined ? { dueAt: new Date(input.dueAt) } : {}),
        ...(ctx.userId !== undefined ? { createdBy: ctx.userId } : {}),
      },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'proc.rfq.create',
      objectType: 'Rfq',
      objectId: rfq.id,
      source: 'api',
      newValues: { rfqNumber: rfq.rfqNumber, skuId: input.skuId, quantity: input.quantity },
    });
    return this.toView(rfq);
  }

  async listRfqs(ctx: RequestContext): Promise<RfqView[]> {
    const rows = await this.prisma.rfq.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  async getRfq(id: string, ctx: RequestContext): Promise<RfqView> {
    const rfq = await this.prisma.rfq.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!rfq) throw notFound('Rfq', id);
    return this.toView(rfq);
  }

  /** DRAFT → SENT: the RFQ is out with suppliers; offers may be recorded. */
  async sendRfq(id: string, ctx: RequestContext): Promise<RfqView> {
    const rfq = await this.prisma.rfq.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!rfq) throw notFound('Rfq', id);
    if (rfq.status !== 'DRAFT') {
      throw new DomainError('INVALID_STATE', `Cannot send an RFQ in status ${rfq.status}`);
    }
    const updated = await this.prisma.rfq.update({
      where: { id: rfq.id },
      data: { status: 'SENT' },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'proc.rfq.send',
      objectType: 'Rfq',
      objectId: rfq.id,
      source: 'api',
      previousValues: { status: 'DRAFT' },
      newValues: { status: 'SENT' },
    });
    return this.toView(updated);
  }

  /** Record (or refuse to duplicate) one supplier's offer on a SENT RFQ. */
  async recordQuote(
    input: {
      rfqId: string;
      supplierId: string;
      unitPrice: number;
      leadTimeDays?: number | undefined;
      note?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<RfqView> {
    if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Unit price must be positive');
    }
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: input.rfqId, tenantId: ctx.tenantId },
    });
    if (!rfq) throw notFound('Rfq', input.rfqId);
    if (rfq.status !== 'SENT') {
      throw new DomainError('INVALID_STATE', 'Quotes can only be recorded on a SENT RFQ');
    }
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, tenantId: ctx.tenantId },
    });
    if (!supplier) throw notFound('Supplier', input.supplierId);
    try {
      const quote = await this.prisma.rfqQuote.create({
        data: {
          tenantId: ctx.tenantId,
          rfqId: rfq.id,
          supplierId: input.supplierId,
          unitPrice: input.unitPrice,
          ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
      });
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'proc.rfq.quote',
        objectType: 'Rfq',
        objectId: rfq.id,
        source: 'api',
        newValues: { quoteId: quote.id, supplierId: input.supplierId, unitPrice: input.unitPrice },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', 'This supplier has already quoted on this RFQ');
      }
      throw error;
    }
    return this.toView(rfq);
  }

  /** SENT → AWARDED: pick exactly one recorded offer; audited. */
  async awardRfq(input: { rfqId: string; quoteId: string }, ctx: RequestContext): Promise<RfqView> {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id: input.rfqId, tenantId: ctx.tenantId },
    });
    if (!rfq) throw notFound('Rfq', input.rfqId);
    if (rfq.status !== 'SENT') {
      throw new DomainError('INVALID_STATE', `Cannot award an RFQ in status ${rfq.status}`);
    }
    const quote = await this.prisma.rfqQuote.findFirst({
      where: { id: input.quoteId, tenantId: ctx.tenantId, rfqId: rfq.id },
    });
    if (!quote) throw notFound('RfqQuote', input.quoteId);
    const updated = await this.prisma.rfq.update({
      where: { id: rfq.id },
      data: { status: 'AWARDED', awardedQuoteId: quote.id },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'proc.rfq.award',
      objectType: 'Rfq',
      objectId: rfq.id,
      source: 'api',
      previousValues: { status: 'SENT' },
      newValues: {
        status: 'AWARDED',
        quoteId: quote.id,
        supplierId: quote.supplierId,
        unitPrice: quote.unitPrice.toString(),
      },
    });
    return this.toView(updated);
  }
}
