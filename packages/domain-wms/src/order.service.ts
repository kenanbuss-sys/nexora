import { writeAudit } from '@nexora/audit';
import type { PrismaClient, WmsOrderStatus, WmsOrderType } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox, type EventType } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { InventoryService } from './inventory.service';

/**
 * WMS execution documents (WMS-004 receiving, WMS-013 transfers, WMS-014
 * cycle counts, WMS-010 picking).
 *
 * A document orchestrates work; it never stores stock truth. Every stock
 * effect goes through the inventory ledger via InventoryService, keyed by
 * a per-line idempotency key so scanner retries and offline replays are
 * exactly-once.
 */

export interface WmsOrderLineView {
  id: string;
  skuId: string;
  expectedQty: string;
  processedQty: string;
}

export interface WmsOrderView {
  id: string;
  orderType: WmsOrderType;
  status: WmsOrderStatus;
  warehouseId: string;
  toWarehouseId: string | null;
  reference: string | null;
  lines: WmsOrderLineView[];
}

const CREATED_EVENT: Record<WmsOrderType, EventType> = {
  RECEIVING: EVENT_TYPES.GOODS_RECEIPT_CREATED,
  TRANSFER: EVENT_TYPES.TRANSFER_CREATED,
  COUNT: EVENT_TYPES.INVENTORY_COUNT_STARTED,
  PICK: EVENT_TYPES.PICK_TASK_CREATED,
};

function toView(order: {
  id: string;
  orderType: WmsOrderType;
  status: WmsOrderStatus;
  warehouseId: string;
  toWarehouseId: string | null;
  reference: string | null;
  lines: Array<{
    id: string;
    skuId: string;
    expectedQty: { toString(): string };
    processedQty: { toString(): string };
  }>;
}): WmsOrderView {
  return {
    id: order.id,
    orderType: order.orderType,
    status: order.status,
    warehouseId: order.warehouseId,
    toWarehouseId: order.toWarehouseId,
    reference: order.reference,
    lines: order.lines.map((l) => ({
      id: l.id,
      skuId: l.skuId,
      expectedQty: l.expectedQty.toString(),
      processedQty: l.processedQty.toString(),
    })),
  };
}

export class WmsOrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly inventory: InventoryService,
  ) {}

  async listOrders(
    filter: { status?: WmsOrderStatus | undefined },
    ctx: RequestContext,
  ): Promise<WmsOrderView[]> {
    const orders = await this.prisma.wmsOrder.findMany({
      where: { tenantId: ctx.tenantId, ...(filter.status ? { status: filter.status } : {}) },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return orders.map(toView);
  }

  async getOrder(orderId: string, ctx: RequestContext): Promise<WmsOrderView> {
    const order = await this.prisma.wmsOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('WmsOrder', orderId);
    return toView(order);
  }

  async createOrder(
    input: {
      orderType: WmsOrderType;
      warehouseId: string;
      toWarehouseId?: string | undefined;
      reference?: string | undefined;
      lines: Array<{ skuId: string; expectedQty: number }>;
    },
    ctx: RequestContext,
  ): Promise<WmsOrderView> {
    if (input.lines.length === 0 || input.lines.length > 200) {
      throw new DomainError('VALIDATION_FAILED', 'An order needs 1..200 lines');
    }
    for (const line of input.lines) {
      if (!(line.expectedQty > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Line quantities must be positive');
      }
    }
    if (input.orderType === 'TRANSFER' && !input.toWarehouseId) {
      throw new DomainError('VALIDATION_FAILED', 'A transfer needs a destination warehouse');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', input.warehouseId);
    if (input.toWarehouseId) {
      const destination = await this.prisma.warehouse.findFirst({
        where: { id: input.toWarehouseId, tenantId: ctx.tenantId },
      });
      if (!destination) throw notFound('Warehouse', input.toWarehouseId);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.wmsOrder.create({
        data: {
          tenantId: ctx.tenantId,
          orderType: input.orderType,
          warehouseId: input.warehouseId,
          toWarehouseId: input.toWarehouseId ?? null,
          reference: input.reference ?? null,
          createdBy: ctx.userId ?? null,
          lines: {
            create: input.lines.map((l) => ({
              tenantId: ctx.tenantId,
              skuId: l.skuId,
              expectedQty: l.expectedQty,
            })),
          },
        },
        include: { lines: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'wms.order.create',
        objectType: 'WmsOrder',
        objectId: order.id,
        source: 'api',
        newValues: { orderType: order.orderType, lines: order.lines.length },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: CREATED_EVENT[input.orderType],
        aggregateType: 'WmsOrder',
        aggregateId: order.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { orderId: order.id, orderType: order.orderType },
      });
      return toView(order);
    });
  }

  /** Guarded DRAFT -> IN_PROGRESS. */
  async startOrder(orderId: string, ctx: RequestContext): Promise<WmsOrderView> {
    const flipped = await this.prisma.wmsOrder.updateMany({
      where: { id: orderId, tenantId: ctx.tenantId, status: 'DRAFT' },
      data: { status: 'IN_PROGRESS' },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Order is not in DRAFT state');
    }
    return this.getOrder(orderId, ctx);
  }

  /**
   * Processes a quantity against a line, posting the ledger movements that
   * the order type implies. Retriable: the caller's idempotency key derives
   * the movement keys, so a retry after a partial failure completes the
   * remaining movement without doubling the first (duplicate posts are
   * acknowledged by the ledger and skipped).
   */
  async processLine(
    input: { orderId: string; lineId: string; quantity: number; idempotencyKey: string },
    ctx: RequestContext,
  ): Promise<WmsOrderView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const order = await this.prisma.wmsOrder.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('WmsOrder', input.orderId);
    if (order.status !== 'IN_PROGRESS') {
      throw new DomainError('INVALID_STATE', 'Order must be IN_PROGRESS to process lines');
    }
    const line = order.lines.find((l) => l.id === input.lineId);
    if (!line) throw notFound('WmsOrderLine', input.lineId);

    const base = {
      skuId: line.skuId,
      quantity: input.quantity,
      reason: `wms-order:${order.id}`,
    };

    let anyNewEffect = false;
    switch (order.orderType) {
      case 'RECEIVING': {
        const posted = await this.inventory.postMovement(
          {
            ...base,
            warehouseId: order.warehouseId,
            movementType: 'RECEIPT',
            idempotencyKey: input.idempotencyKey,
          },
          ctx,
        );
        anyNewEffect = !posted.duplicate;
        break;
      }
      case 'PICK': {
        const posted = await this.inventory.postMovement(
          {
            ...base,
            warehouseId: order.warehouseId,
            movementType: 'ISSUE',
            idempotencyKey: input.idempotencyKey,
          },
          ctx,
        );
        anyNewEffect = !posted.duplicate;
        break;
      }
      case 'TRANSFER': {
        const out = await this.inventory.postMovement(
          {
            ...base,
            warehouseId: order.warehouseId,
            movementType: 'TRANSFER_OUT',
            idempotencyKey: `${input.idempotencyKey}:out`,
          },
          ctx,
        );
        const inbound = await this.inventory.postMovement(
          {
            ...base,
            warehouseId: order.toWarehouseId as string,
            movementType: 'TRANSFER_IN',
            idempotencyKey: `${input.idempotencyKey}:in`,
          },
          ctx,
        );
        anyNewEffect = !out.duplicate || !inbound.duplicate;
        break;
      }
      case 'COUNT': {
        // The processed quantity is the counted quantity; the ledger absorbs
        // the difference as an adjustment (corrections are movements, never
        // edits — database rule).
        const position = await this.inventory.getStockPosition(order.warehouseId, line.skuId, ctx);
        const delta = input.quantity - Number(position.onHand);
        if (delta !== 0) {
          const posted = await this.inventory.postMovement(
            {
              skuId: line.skuId,
              warehouseId: order.warehouseId,
              movementType: delta > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
              quantity: Math.abs(delta),
              idempotencyKey: input.idempotencyKey,
              reason: `cycle-count:${order.id}`,
            },
            ctx,
          );
          anyNewEffect = !posted.duplicate;
        }
        break;
      }
    }

    if (anyNewEffect) {
      await this.prisma.wmsOrderLine.update({
        where: { id: line.id },
        data: { processedQty: { increment: input.quantity } },
      });
    }
    return this.getOrder(order.id, ctx);
  }

  /** Guarded IN_PROGRESS -> COMPLETED. Emits the type's completion event. */
  async completeOrder(orderId: string, ctx: RequestContext): Promise<WmsOrderView> {
    const order = await this.prisma.wmsOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
    });
    if (!order) throw notFound('WmsOrder', orderId);
    const flipped = await this.prisma.wmsOrder.updateMany({
      where: { id: orderId, tenantId: ctx.tenantId, status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Order is not IN_PROGRESS');
    }
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'wms.order.complete',
        objectType: 'WmsOrder',
        objectId: orderId,
        source: 'api',
        newValues: { orderType: order.orderType },
      });
      if (order.orderType === 'PICK' || order.orderType === 'TRANSFER') {
        await publishToOutbox(tx, {
          tenantId: ctx.tenantId,
          eventType:
            order.orderType === 'PICK' ? EVENT_TYPES.PICK_COMPLETED : EVENT_TYPES.TRANSFER_RECEIVED,
          aggregateType: 'WmsOrder',
          aggregateId: orderId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          payload: { orderId },
        });
      }
    });
    return this.getOrder(orderId, ctx);
  }
}
