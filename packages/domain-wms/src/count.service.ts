import { writeAudit } from '@nexora/audit';
import type { PrismaClient, StockCountStatus } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { InventoryService } from './inventory.service';

/**
 * Stock counting (WMS-015) with adjustment governance (WMS-016).
 *
 * A count captures an on-hand snapshot per line at entry time and the
 * physically counted quantity. Posting is a governed step: it demands
 * inventory.adjust.approve, refuses the person who created the count
 * (segregation of duties) and turns each variance into an idempotent
 * ledger adjustment (`count:{id}:line:{lineId}`) — so a retried post
 * can never double-book a correction.
 */

export interface CountLineView {
  id: string;
  skuId: string;
  expectedQty: string;
  countedQty: string;
  variance: string;
}

export interface CountView {
  id: string;
  countNumber: string;
  warehouseId: string;
  status: StockCountStatus;
  note: string | null;
  createdBy: string | null;
  postedBy: string | null;
  postedAt: string | null;
  createdAt: string;
  lines: CountLineView[];
}

export class CountService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly inventory: InventoryService,
  ) {}

  async listCounts(ctx: RequestContext): Promise<CountView[]> {
    const counts = await this.prisma.stockCount.findMany({
      where: { tenantId: ctx.tenantId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return counts.map((c) => this.toView(c));
  }

  async createCount(
    input: { warehouseId: string; note?: string | undefined },
    ctx: RequestContext,
  ): Promise<CountView> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', input.warehouseId);
    const count = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.stockCount.count({ where: { tenantId: ctx.tenantId } });
      const created = await tx.stockCount.create({
        data: {
          tenantId: ctx.tenantId,
          countNumber: `CNT-${String(existing + 1).padStart(5, '0')}`,
          warehouseId: input.warehouseId,
          note: input.note ?? null,
          createdBy: ctx.userId ?? null,
        },
        include: { lines: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'wms.count.create',
        objectType: 'StockCount',
        objectId: created.id,
        source: 'api',
        newValues: { warehouseId: input.warehouseId },
      });
      return created;
    });
    return this.toView(count);
  }

  /** Records a counted quantity; the expected on-hand snapshots now. */
  async recordLine(
    countId: string,
    input: { skuId: string; countedQty: number },
    ctx: RequestContext,
  ): Promise<CountView> {
    if (!(input.countedQty >= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Counted quantity cannot be negative');
    }
    const count = await this.prisma.stockCount.findFirst({
      where: { id: countId, tenantId: ctx.tenantId },
    });
    if (!count) throw notFound('StockCount', countId);
    if (count.status !== 'OPEN') {
      throw new DomainError('INVALID_STATE', 'Lines can only change while the count is open');
    }
    const position = await this.inventory.getStockPosition(count.warehouseId, input.skuId, ctx);
    await this.prisma.stockCountLine.upsert({
      where: { countId_skuId: { countId: count.id, skuId: input.skuId } },
      create: {
        tenantId: ctx.tenantId,
        countId: count.id,
        skuId: input.skuId,
        expectedQty: Number(position.onHand),
        countedQty: input.countedQty,
      },
      update: { countedQty: input.countedQty, expectedQty: Number(position.onHand) },
    });
    return this.getCount(count.id, ctx);
  }

  /**
   * Posts the count: every variance becomes a governed adjustment.
   * Segregation of duties — the creator cannot post their own count.
   */
  async postCount(countId: string, ctx: RequestContext): Promise<CountView> {
    const count = await this.prisma.stockCount.findFirst({
      where: { id: countId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!count) throw notFound('StockCount', countId);
    if (count.status !== 'OPEN') {
      throw new DomainError('INVALID_STATE', 'Only open counts can be posted');
    }
    if (count.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A count needs at least one line');
    }
    if (count.createdBy && ctx.userId && count.createdBy === ctx.userId) {
      throw new DomainError(
        'INVALID_STATE',
        'Segregation of duties: the creator of a count cannot post it',
      );
    }

    for (const line of count.lines) {
      const variance = Number(line.countedQty) - Number(line.expectedQty);
      if (Math.abs(variance) < 1e-9) continue;
      await this.inventory.postMovement(
        {
          warehouseId: count.warehouseId,
          skuId: line.skuId,
          movementType: variance > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          quantity: Math.abs(variance),
          idempotencyKey: `count:${count.id}:line:${line.id}`,
          reason: `Stock count ${count.countNumber}`,
        },
        ctx,
      );
    }

    const flipped = await this.prisma.stockCount.updateMany({
      where: { id: count.id, tenantId: ctx.tenantId, status: 'OPEN' },
      data: { status: 'POSTED', postedBy: ctx.userId ?? null, postedAt: new Date() },
    });
    if (flipped.count === 0) throw new DomainError('CONFLICT', 'Count changed concurrently');
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'wms.count.post',
        objectType: 'StockCount',
        objectId: count.id,
        source: 'api',
        newValues: { lines: count.lines.length },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.STOCK_COUNT_POSTED,
        aggregateType: 'StockCount',
        aggregateId: count.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { countId: count.id, countNumber: count.countNumber },
      });
    });
    return this.getCount(count.id, ctx);
  }

  async cancelCount(countId: string, ctx: RequestContext): Promise<CountView> {
    const flipped = await this.prisma.stockCount.updateMany({
      where: { id: countId, tenantId: ctx.tenantId, status: 'OPEN' },
      data: { status: 'CANCELLED' },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Only open counts can be cancelled');
    }
    return this.getCount(countId, ctx);
  }

  private async getCount(countId: string, ctx: RequestContext): Promise<CountView> {
    const count = await this.prisma.stockCount.findFirst({
      where: { id: countId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!count) throw notFound('StockCount', countId);
    return this.toView(count);
  }

  private toView(count: {
    id: string;
    countNumber: string;
    warehouseId: string;
    status: StockCountStatus;
    note: string | null;
    createdBy: string | null;
    postedBy: string | null;
    postedAt: Date | null;
    createdAt: Date;
    lines: Array<{
      id: string;
      skuId: string;
      expectedQty: { toString(): string };
      countedQty: { toString(): string };
    }>;
  }): CountView {
    return {
      id: count.id,
      countNumber: count.countNumber,
      warehouseId: count.warehouseId,
      status: count.status,
      note: count.note,
      createdBy: count.createdBy,
      postedBy: count.postedBy,
      postedAt: count.postedAt ? count.postedAt.toISOString() : null,
      createdAt: count.createdAt.toISOString(),
      lines: count.lines.map((l) => ({
        id: l.id,
        skuId: l.skuId,
        expectedQty: l.expectedQty.toString(),
        countedQty: l.countedQty.toString(),
        variance: (Number(l.countedQty) - Number(l.expectedQty)).toString(),
      })),
    };
  }
}
