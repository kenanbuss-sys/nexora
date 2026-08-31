import { writeAudit } from '@nexora/audit';
import type { PrismaClient, WoOperationStatus, WorkOrderStatus } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * MES core — work orders against the released BOM/routing snapshot
 * (MES-001/002), material issue through the WMS public interface at
 * release (MES-006), WIP via start/pause/resume (MES-008/009), and
 * completion with good quantity receipt and scrap recording
 * (MES-010/011).
 *
 * PLANNED -> RELEASED -> IN_PROGRESS <-> PAUSED -> COMPLETED
 * PLANNED/RELEASED -> CANCELLED (released cancellation returns the
 * issued material with compensating RECEIPT movements).
 *
 * All stock effects are idempotent ledger movements owned by WMS:
 *   issue      wo:{id}:issue:{bomLineId}
 *   return     wo:{id}:return:{bomLineId}
 *   output     wo:{id}:output
 */

export interface WoOperationView {
  id: string;
  seq: number;
  name: string;
  workCenter: string;
  status: WoOperationStatus;
}

export interface WorkOrderView {
  id: string;
  woNumber: string;
  skuId: string;
  warehouseId: string;
  quantity: string;
  goodQuantity: string;
  scrapQuantity: string;
  status: WorkOrderStatus;
  startedAt: string | null;
  completedAt: string | null;
  operations: WoOperationView[];
}

/** Cross-domain contract: stock truth is owned by WMS. */
export interface StockGate {
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'ISSUE' | 'RECEIPT';
      quantity: number;
      idempotencyKey: string;
      reason?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }>;
}

function toView(wo: {
  id: string;
  woNumber: string;
  skuId: string;
  warehouseId: string;
  quantity: { toString(): string };
  goodQuantity: { toString(): string };
  scrapQuantity: { toString(): string };
  status: WorkOrderStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  operations: Array<{
    id: string;
    seq: number;
    name: string;
    workCenter: string;
    status: WoOperationStatus;
  }>;
}): WorkOrderView {
  return {
    id: wo.id,
    woNumber: wo.woNumber,
    skuId: wo.skuId,
    warehouseId: wo.warehouseId,
    quantity: wo.quantity.toString(),
    goodQuantity: wo.goodQuantity.toString(),
    scrapQuantity: wo.scrapQuantity.toString(),
    status: wo.status,
    startedAt: wo.startedAt ? wo.startedAt.toISOString() : null,
    completedAt: wo.completedAt ? wo.completedAt.toISOString() : null,
    operations: wo.operations
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((o) => ({
        id: o.id,
        seq: o.seq,
        name: o.name,
        workCenter: o.workCenter,
        status: o.status,
      })),
  };
}

export class MesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stock: StockGate,
  ) {}

  async listWorkOrders(
    filter: { status?: WorkOrderStatus | undefined },
    ctx: RequestContext,
  ): Promise<WorkOrderView[]> {
    const orders = await this.prisma.workOrder.findMany({
      where: { tenantId: ctx.tenantId, ...(filter.status ? { status: filter.status } : {}) },
      include: { operations: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return orders.map(toView);
  }

  async getWorkOrder(workOrderId: string, ctx: RequestContext): Promise<WorkOrderView> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!wo) throw notFound('WorkOrder', workOrderId);
    return toView(wo);
  }

  /**
   * Creates a PLANNED work order pinned to the released BOM; the
   * released routing's operations are copied as a snapshot (MES-002).
   */
  async createWorkOrder(
    input: { skuId: string; warehouseId: string; quantity: number },
    ctx: RequestContext,
  ): Promise<WorkOrderView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const bom = await this.prisma.bom.findFirst({
      where: { tenantId: ctx.tenantId, skuId: input.skuId, status: 'RELEASED' },
    });
    if (!bom) {
      throw new DomainError('INVALID_STATE', 'The SKU needs a released BOM before production');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', input.warehouseId);
    const routing = await this.prisma.routing.findFirst({
      where: { tenantId: ctx.tenantId, skuId: input.skuId, status: 'RELEASED' },
      include: { operations: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.workOrder.count({ where: { tenantId: ctx.tenantId } });
      const wo = await tx.workOrder.create({
        data: {
          tenantId: ctx.tenantId,
          woNumber: `WO-${String(count + 1).padStart(6, '0')}`,
          skuId: input.skuId,
          warehouseId: input.warehouseId,
          bomId: bom.id,
          routingId: routing?.id ?? null,
          quantity: input.quantity,
          createdBy: ctx.userId ?? null,
          ...(routing
            ? {
                operations: {
                  create: routing.operations.map((op) => ({
                    tenantId: ctx.tenantId,
                    seq: op.seq,
                    name: op.name,
                    workCenter: op.workCenter,
                  })),
                },
              }
            : {}),
        },
        include: { operations: true },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'mes.wo.create',
        objectType: 'WorkOrder',
        objectId: wo.id,
        source: 'api',
        newValues: { woNumber: wo.woNumber, skuId: wo.skuId, quantity: input.quantity },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.WORK_ORDER_CREATED,
        aggregateType: 'WorkOrder',
        aggregateId: wo.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { workOrderId: wo.id, woNumber: wo.woNumber },
      });
      return toView(wo);
    });
  }

  /**
   * PLANNED -> RELEASED (MES-006): issues BOM material from the ledger.
   * Ledger idempotency keys make a retried release safe; a failed line
   * (e.g. insufficient stock) rolls back already-issued lines with
   * compensating receipts and the order stays PLANNED.
   */
  async releaseWorkOrder(workOrderId: string, ctx: RequestContext): Promise<WorkOrderView> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId: ctx.tenantId },
    });
    if (!wo) throw notFound('WorkOrder', workOrderId);
    if (wo.status !== 'PLANNED') {
      throw new DomainError('INVALID_STATE', 'Only planned work orders can be released');
    }
    const bom = await this.prisma.bom.findFirst({
      where: { id: wo.bomId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!bom) throw notFound('Bom', wo.bomId);

    const issued: string[] = [];
    try {
      for (const line of bom.lines) {
        const gross =
          Number(wo.quantity) * Number(line.quantity) * (1 + Number(line.scrapPct) / 100);
        const quantity = Math.round(gross * 1e6) / 1e6;
        await this.stock.postMovement(
          {
            warehouseId: wo.warehouseId,
            skuId: line.componentSkuId,
            movementType: 'ISSUE',
            quantity,
            idempotencyKey: `wo:${wo.id}:issue:${line.id}`,
            reason: `Material for ${wo.woNumber}`,
          },
          ctx,
        );
        issued.push(line.id);
      }
    } catch (error) {
      // Compensate the already-issued lines and re-raise.
      for (const lineId of issued.reverse()) {
        const line = bom.lines.find((l) => l.id === lineId);
        if (!line) continue;
        const gross =
          Number(wo.quantity) * Number(line.quantity) * (1 + Number(line.scrapPct) / 100);
        try {
          await this.stock.postMovement(
            {
              warehouseId: wo.warehouseId,
              skuId: line.componentSkuId,
              movementType: 'RECEIPT',
              quantity: Math.round(gross * 1e6) / 1e6,
              idempotencyKey: `wo:${wo.id}:rollback:${line.id}`,
              reason: `Release rollback for ${wo.woNumber}`,
            },
            ctx,
          );
        } catch {
          // Best effort — the original failure carries the signal.
        }
      }
      throw error;
    }

    const flipped = await this.prisma.workOrder.updateMany({
      where: { id: wo.id, tenantId: ctx.tenantId, status: 'PLANNED' },
      data: { status: 'RELEASED' },
    });
    if (flipped.count === 0) throw new DomainError('CONFLICT', 'Work order changed concurrently');
    await this.emit(EVENT_TYPES.WORK_ORDER_RELEASED, wo.id, ctx, {
      woNumber: wo.woNumber,
      materialLines: bom.lines.length,
    });
    await this.emit(EVENT_TYPES.MATERIAL_ISSUED_TO_PRODUCTION, wo.id, ctx, {
      woNumber: wo.woNumber,
    });
    return this.getWorkOrder(wo.id, ctx);
  }

  /** RELEASED/PAUSED -> IN_PROGRESS (MES-009). */
  async startWorkOrder(workOrderId: string, ctx: RequestContext): Promise<WorkOrderView> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId: ctx.tenantId },
    });
    if (!wo) throw notFound('WorkOrder', workOrderId);
    const flipped = await this.prisma.workOrder.updateMany({
      where: { id: wo.id, tenantId: ctx.tenantId, status: { in: ['RELEASED', 'PAUSED'] } },
      data: { status: 'IN_PROGRESS', ...(wo.startedAt ? {} : { startedAt: new Date() }) },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Only released or paused work can start');
    }
    if (!wo.startedAt) {
      await this.emit(EVENT_TYPES.WORK_ORDER_STARTED, wo.id, ctx, { woNumber: wo.woNumber });
    }
    return this.getWorkOrder(wo.id, ctx);
  }

  /** IN_PROGRESS -> PAUSED (MES-009). */
  async pauseWorkOrder(workOrderId: string, ctx: RequestContext): Promise<WorkOrderView> {
    const flipped = await this.prisma.workOrder.updateMany({
      where: { id: workOrderId, tenantId: ctx.tenantId, status: 'IN_PROGRESS' },
      data: { status: 'PAUSED' },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Only running work can pause');
    }
    return this.getWorkOrder(workOrderId, ctx);
  }

  /** Marks one operation done; operations run in seq order (MES-002). */
  async completeOperation(
    workOrderId: string,
    operationId: string,
    ctx: RequestContext,
  ): Promise<WorkOrderView> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!wo) throw notFound('WorkOrder', workOrderId);
    if (wo.status !== 'IN_PROGRESS') {
      throw new DomainError('INVALID_STATE', 'Operations complete only while work is running');
    }
    const op = wo.operations.find((o) => o.id === operationId);
    if (!op) throw notFound('WorkOrderOperation', operationId);
    const earlierPending = wo.operations.some((o) => o.seq < op.seq && o.status !== 'DONE');
    if (earlierPending) {
      throw new DomainError('INVALID_STATE', 'Earlier operations must complete first');
    }
    const flipped = await this.prisma.workOrderOperation.updateMany({
      where: { id: op.id, tenantId: ctx.tenantId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'DONE', completedAt: new Date() },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Operation is already done');
    }
    return this.getWorkOrder(wo.id, ctx);
  }

  /**
   * IN_PROGRESS -> COMPLETED (MES-010/011): receipts the good quantity
   * into the ledger idempotently and records scrap. good + scrap must
   * not exceed the ordered quantity, and all operations must be done.
   */
  async completeWorkOrder(
    input: { workOrderId: string; goodQuantity: number; scrapQuantity?: number | undefined },
    ctx: RequestContext,
  ): Promise<WorkOrderView> {
    const scrap = input.scrapQuantity ?? 0;
    if (!(input.goodQuantity >= 0) || scrap < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Quantities cannot be negative');
    }
    if (input.goodQuantity + scrap <= 0) {
      throw new DomainError('VALIDATION_FAILED', 'Nothing was produced');
    }
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: input.workOrderId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!wo) throw notFound('WorkOrder', input.workOrderId);
    if (wo.status !== 'IN_PROGRESS') {
      throw new DomainError('INVALID_STATE', 'Only running work orders can complete');
    }
    if (input.goodQuantity + scrap > Number(wo.quantity)) {
      throw new DomainError('VALIDATION_FAILED', 'Good + scrap exceeds the ordered quantity');
    }
    if (wo.operations.some((o) => o.status !== 'DONE')) {
      throw new DomainError('INVALID_STATE', 'All operations must be done before completion');
    }

    if (input.goodQuantity > 0) {
      await this.stock.postMovement(
        {
          warehouseId: wo.warehouseId,
          skuId: wo.skuId,
          movementType: 'RECEIPT',
          quantity: input.goodQuantity,
          idempotencyKey: `wo:${wo.id}:output`,
          reason: `Production output of ${wo.woNumber}`,
        },
        ctx,
      );
    }

    const flipped = await this.prisma.workOrder.updateMany({
      where: { id: wo.id, tenantId: ctx.tenantId, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        goodQuantity: input.goodQuantity,
        scrapQuantity: scrap,
        completedAt: new Date(),
      },
    });
    if (flipped.count === 0) throw new DomainError('CONFLICT', 'Work order changed concurrently');

    await this.emit(EVENT_TYPES.WORK_ORDER_COMPLETED, wo.id, ctx, {
      woNumber: wo.woNumber,
      goodQuantity: input.goodQuantity,
      scrapQuantity: scrap,
    });
    if (scrap > 0) {
      await this.emit(EVENT_TYPES.SCRAP_RECORDED, wo.id, ctx, {
        woNumber: wo.woNumber,
        scrapQuantity: scrap,
      });
    }
    return this.getWorkOrder(wo.id, ctx);
  }

  /**
   * PLANNED/RELEASED -> CANCELLED; a released order returns its issued
   * material with compensating receipts (ledger corrections, never
   * edits).
   */
  async cancelWorkOrder(workOrderId: string, ctx: RequestContext): Promise<WorkOrderView> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId: ctx.tenantId },
    });
    if (!wo) throw notFound('WorkOrder', workOrderId);
    const wasReleased = wo.status === 'RELEASED';
    const flipped = await this.prisma.workOrder.updateMany({
      where: { id: wo.id, tenantId: ctx.tenantId, status: { in: ['PLANNED', 'RELEASED'] } },
      data: { status: 'CANCELLED' },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', `A ${wo.status} work order cannot be cancelled`);
    }
    if (wasReleased) {
      const bom = await this.prisma.bom.findFirst({
        where: { id: wo.bomId, tenantId: ctx.tenantId },
        include: { lines: true },
      });
      for (const line of bom?.lines ?? []) {
        const gross =
          Number(wo.quantity) * Number(line.quantity) * (1 + Number(line.scrapPct) / 100);
        try {
          await this.stock.postMovement(
            {
              warehouseId: wo.warehouseId,
              skuId: line.componentSkuId,
              movementType: 'RECEIPT',
              quantity: Math.round(gross * 1e6) / 1e6,
              idempotencyKey: `wo:${wo.id}:return:${line.id}`,
              reason: `Material return from cancelled ${wo.woNumber}`,
            },
            ctx,
          );
        } catch {
          // Duplicate return on retry is fine (idempotent key).
        }
      }
    }
    await this.emit(EVENT_TYPES.WORK_ORDER_CANCELLED, wo.id, ctx, { woNumber: wo.woNumber });
    return this.getWorkOrder(wo.id, ctx);
  }

  private async emit(
    eventType: (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES],
    workOrderId: string,
    ctx: RequestContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: `mes.${eventType.replace(/\./g, '_')}`,
        objectType: 'WorkOrder',
        objectId: workOrderId,
        source: 'api',
        newValues: payload as never,
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType,
        aggregateType: 'WorkOrder',
        aggregateId: workOrderId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: payload as never,
      });
    });
  }
}
