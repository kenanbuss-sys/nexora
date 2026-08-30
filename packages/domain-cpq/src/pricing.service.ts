import { writeAudit } from '@nexora/audit';
import type { PriceListStatus, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * CPQ pricing — price lists (CPQ-001) with quantity breaks (CPQ-002).
 * Prices live on ACTIVE lists; quotes pin the list they priced against.
 */

export interface PriceListView {
  id: string;
  code: string;
  name: string;
  currency: string;
  status: PriceListStatus;
}

export interface PriceEntryView {
  id: string;
  skuId: string;
  minQty: string;
  unitPrice: string;
}

export class PricingService {
  constructor(private readonly prisma: PrismaClient) {}

  async listPriceLists(ctx: RequestContext): Promise<PriceListView[]> {
    const lists = await this.prisma.priceList.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
      take: 100,
    });
    return lists.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      currency: l.currency,
      status: l.status,
    }));
  }

  async createPriceList(
    input: { code: string; name: string; currency: string },
    ctx: RequestContext,
  ): Promise<PriceListView> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.priceList.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
      });
      if (existing) throw new DomainError('CONFLICT', 'A price list with this code already exists');
      const list = await tx.priceList.create({
        data: {
          tenantId: ctx.tenantId,
          code: input.code,
          name: input.name,
          currency: input.currency.toUpperCase(),
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'cpq.pricelist.create',
        objectType: 'PriceList',
        objectId: list.id,
        source: 'api',
        newValues: { code: list.code, currency: list.currency },
      });
      return {
        id: list.id,
        code: list.code,
        name: list.name,
        currency: list.currency,
        status: list.status,
      };
    });
  }

  async setPrice(
    input: { priceListId: string; skuId: string; minQty?: number | undefined; unitPrice: number },
    ctx: RequestContext,
  ): Promise<PriceEntryView> {
    if (!(input.unitPrice >= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Unit price must be non-negative');
    }
    const list = await this.prisma.priceList.findFirst({
      where: { id: input.priceListId, tenantId: ctx.tenantId },
    });
    if (!list) throw notFound('PriceList', input.priceListId);
    if (list.status === 'ARCHIVED') {
      throw new DomainError('INVALID_STATE', 'Archived price lists cannot change');
    }
    const minQty = input.minQty ?? 1;
    const entry = await this.prisma.priceListEntry.upsert({
      where: {
        tenantId_priceListId_skuId_minQty: {
          tenantId: ctx.tenantId,
          priceListId: input.priceListId,
          skuId: input.skuId,
          minQty,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        priceListId: input.priceListId,
        skuId: input.skuId,
        minQty,
        unitPrice: input.unitPrice,
      },
      update: { unitPrice: input.unitPrice },
    });
    return {
      id: entry.id,
      skuId: entry.skuId,
      minQty: entry.minQty.toString(),
      unitPrice: entry.unitPrice.toString(),
    };
  }

  async getEntries(priceListId: string, ctx: RequestContext): Promise<PriceEntryView[]> {
    const list = await this.prisma.priceList.findFirst({
      where: { id: priceListId, tenantId: ctx.tenantId },
    });
    if (!list) throw notFound('PriceList', priceListId);
    const entries = await this.prisma.priceListEntry.findMany({
      where: { tenantId: ctx.tenantId, priceListId },
      orderBy: [{ skuId: 'asc' }, { minQty: 'asc' }],
      take: 500,
    });
    return entries.map((e) => ({
      id: e.id,
      skuId: e.skuId,
      minQty: e.minQty.toString(),
      unitPrice: e.unitPrice.toString(),
    }));
  }

  /** Guarded DRAFT -> ACTIVE; emits price_list.published. */
  async publishPriceList(priceListId: string, ctx: RequestContext): Promise<PriceListView> {
    const flipped = await this.prisma.priceList.updateMany({
      where: { id: priceListId, tenantId: ctx.tenantId, status: 'DRAFT' },
      data: { status: 'ACTIVE' },
    });
    if (flipped.count === 0) throw new DomainError('INVALID_STATE', 'Price list is not a draft');
    return this.prisma.$transaction(async (tx) => {
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PRICE_LIST_PUBLISHED,
        aggregateType: 'PriceList',
        aggregateId: priceListId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { priceListId },
      });
      const list = await tx.priceList.findFirst({
        where: { id: priceListId, tenantId: ctx.tenantId },
      });
      const l = list as NonNullable<typeof list>;
      return { id: l.id, code: l.code, name: l.name, currency: l.currency, status: l.status };
    });
  }

  /**
   * Resolves the effective unit price for a SKU/quantity on an ACTIVE list:
   * the entry with the highest minQty that is <= quantity (quantity break).
   */
  async resolvePrice(
    priceListId: string,
    skuId: string,
    quantity: number,
    ctx: RequestContext,
  ): Promise<{ unitPrice: string; currency: string }> {
    const list = await this.prisma.priceList.findFirst({
      where: { id: priceListId, tenantId: ctx.tenantId },
    });
    if (!list) throw notFound('PriceList', priceListId);
    if (list.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'Prices can only be resolved from an active list');
    }
    const entry = await this.prisma.priceListEntry.findFirst({
      where: {
        tenantId: ctx.tenantId,
        priceListId,
        skuId,
        minQty: { lte: quantity },
      },
      orderBy: { minQty: 'desc' },
    });
    if (!entry) throw notFound('Price for SKU', skuId);
    return { unitPrice: entry.unitPrice.toString(), currency: list.currency };
  }
}
