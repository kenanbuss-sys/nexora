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
  assignedTo: string | null;
  confirmedQty: string;
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

/** Cross-domain contract: quality gating is owned by QC (VER-013). */
export interface QcGate {
  getQcState(
    tenantId: string,
    workOrderId: string,
    skuId: string,
  ): Promise<'NOT_REQUIRED' | 'PENDING' | 'PASSED' | 'FAILED'>;
}

/** Cross-domain contract: effective configuration is owned by CORE. */
export interface MesConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }>;
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
    assignedTo: string | null;
    confirmedQty: { toString(): string };
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
        assignedTo: o.assignedTo,
        confirmedQty: o.confirmedQty.toString(),
      })),
  };
}

export class MesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stock: StockGate,
    private readonly qc?: QcGate,
    private readonly config?: MesConfigGate,
  ) {}

  /**
   * Backflush (MES-007): with mes.issueMode = 'backflush' in tenant
   * configuration, components are not issued when the order releases —
   * they are consumed at completion, scaled to what was actually
   * produced (good + scrap). Default stays issue-at-release.
   */
  private async issueMode(tenantId: string): Promise<'at_release' | 'backflush'> {
    if (!this.config) return 'at_release';
    try {
      const { config } = await this.config.getEffectiveConfiguration(tenantId);
      const mode = (config as { mes?: { issueMode?: unknown } })?.mes?.issueMode;
      return mode === 'backflush' ? 'backflush' : 'at_release';
    } catch {
      return 'at_release';
    }
  }

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
  /**
   * Rework (MES-012): a completed work order with scrap spawns a fresh
   * PLANNED work order for exactly the scrapped quantity — same SKU and
   * warehouse, current released BOM/routing. Once per source order.
   */
  async createReworkOrder(workOrderId: string, ctx: RequestContext): Promise<WorkOrderView> {
    const source = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId: ctx.tenantId },
    });
    if (!source) throw notFound('WorkOrder', workOrderId);
    if (source.status !== 'COMPLETED') {
      throw new DomainError('INVALID_STATE', 'Only completed work orders can spawn rework');
    }
    const scrap = Number(source.scrapQuantity);
    if (!(scrap > 0)) {
      throw new DomainError('INVALID_STATE', 'No scrap to rework');
    }
    const marker = `rework-of:${source.id}`;
    const already = await this.prisma.auditEvent.findFirst({
      where: { tenantId: ctx.tenantId, action: 'mes.rework.create', objectId: source.id },
    });
    if (already) {
      throw new DomainError('CONFLICT', 'Rework was already created for this work order');
    }
    const rework = await this.createWorkOrder(
      { skuId: source.skuId, warehouseId: source.warehouseId, quantity: scrap },
      ctx,
    );
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'mes.rework.create',
      objectType: 'WorkOrder',
      objectId: source.id,
      source: 'api',
      newValues: { reworkWorkOrderId: rework.id, quantity: scrap, marker },
    });
    return rework;
  }

  /**
   * Machine assignment (MES-004): move a pending operation to another
   * registered, active work center. Audited; running or finished
   * operations keep their history.
   */
  async assignOperation(
    input: { workOrderId: string; operationId: string; workCenterCode: string },
    ctx: RequestContext,
  ): Promise<WorkOrderView> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: input.workOrderId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!wo) throw notFound('WorkOrder', input.workOrderId);
    const op = wo.operations.find((o) => o.id === input.operationId);
    if (!op) throw notFound('WorkOrderOperation', input.operationId);
    if (op.status !== 'PENDING') {
      throw new DomainError('INVALID_STATE', 'Only pending operations can be reassigned');
    }
    const center = await this.prisma.workCenter.findFirst({
      where: { tenantId: ctx.tenantId, code: input.workCenterCode },
    });
    if (!center) throw notFound('WorkCenter', input.workCenterCode);
    if (!center.active) {
      throw new DomainError('INVALID_STATE', `Work center ${center.code} is not active`);
    }
    await this.prisma.workOrderOperation.update({
      where: { id: op.id },
      data: { workCenter: center.code },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'mes.operation.assign',
      objectType: 'WorkOrderOperation',
      objectId: op.id,
      source: 'api',
      previousValues: { workCenter: op.workCenter },
      newValues: { workCenter: center.code },
    });
    return this.getWorkOrder(wo.id, ctx);
  }

  /**
   * Operator assignment (MES-005): a named operator owns an operation.
   * Assignment is validated against the tenant's active users and
   * audited; the operator queue lists everything assigned to a user.
   */
  async assignOperator(
    input: { workOrderId: string; operationId: string; userId: string },
    ctx: RequestContext,
  ): Promise<WorkOrderView> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: input.workOrderId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!wo) throw notFound('WorkOrder', input.workOrderId);
    const op = wo.operations.find((o) => o.id === input.operationId);
    if (!op) throw notFound('WorkOrderOperation', input.operationId);
    if (op.status === 'DONE') {
      throw new DomainError('INVALID_STATE', 'Completed operations cannot be reassigned');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!user) throw notFound('User', input.userId);
    if (user.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'Only active users can be assigned');
    }
    await this.prisma.workOrderOperation.update({
      where: { id: op.id },
      data: { assignedTo: user.id },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'mes.operation.assign_operator',
      objectType: 'WorkOrderOperation',
      objectId: op.id,
      source: 'api',
      previousValues: { assignedTo: op.assignedTo },
      newValues: { assignedTo: user.id },
    });
    return this.getWorkOrder(wo.id, ctx);
  }

  /** The calling operator's open queue, ordered by WO then sequence. */
  async myOperations(ctx: RequestContext): Promise<
    Array<{
      workOrderId: string;
      woNumber: string;
      operationId: string;
      seq: number;
      name: string;
      workCenter: string;
      status: WoOperationStatus;
    }>
  > {
    if (!ctx.userId) return [];
    const ops = await this.prisma.workOrderOperation.findMany({
      where: { tenantId: ctx.tenantId, assignedTo: ctx.userId, status: { not: 'DONE' } },
      orderBy: [{ workOrderId: 'asc' }, { seq: 'asc' }],
      take: 200,
    });
    if (ops.length === 0) return [];
    const orders = await this.prisma.workOrder.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...new Set(ops.map((o) => o.workOrderId))] } },
      select: { id: true, woNumber: true, status: true },
    });
    const numberOf = new Map(orders.map((o) => [o.id, o.woNumber]));
    return ops.map((o) => ({
      workOrderId: o.workOrderId,
      woNumber: numberOf.get(o.workOrderId) ?? '',
      operationId: o.id,
      seq: o.seq,
      name: o.name,
      workCenter: o.workCenter,
      status: o.status,
    }));
  }

  /**
   * Work-center load (MES-004): open operations per registered center,
   * so planners see where the queue is building up.
   */
  async workCenterLoad(
    ctx: RequestContext,
  ): Promise<
    Array<{ code: string; name: string; active: boolean; pending: number; running: number }>
  > {
    const centers = await this.prisma.workCenter.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ code: 'asc' }],
      take: 100,
    });
    const open = await this.prisma.workOrderOperation.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['PENDING', 'RUNNING'] },
        workOrder: { status: { in: ['RELEASED', 'IN_PROGRESS', 'PAUSED'] } },
      },
      select: { workCenter: true, status: true },
    });
    return centers.map((center) => ({
      code: center.code,
      name: center.name,
      active: center.active,
      pending: open.filter((o) => o.workCenter === center.code && o.status === 'PENDING').length,
      running: open.filter((o) => o.workCenter === center.code && o.status === 'RUNNING').length,
    }));
  }

  /**
   * Digital work instructions (MES-016): step-by-step instructions per
   * SKU and operation from versioned configuration
   * (mes.workInstructions: [{ skuCode, operation, steps }]).
   */
  async workInstructions(
    input: { workOrderId: string; operationId: string },
    ctx: RequestContext,
  ): Promise<{ operation: string; steps: string[] }> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: input.workOrderId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!wo) throw notFound('WorkOrder', input.workOrderId);
    const op = wo.operations.find((o) => o.id === input.operationId);
    if (!op) throw notFound('WorkOrderOperation', input.operationId);
    const sku = await this.prisma.sku.findFirst({
      where: { id: wo.skuId, tenantId: ctx.tenantId },
      select: { code: true },
    });
    let steps: string[] = [];
    if (this.config) {
      try {
        const { config } = await this.config.getEffectiveConfiguration(ctx.tenantId);
        const raw = (config as { mes?: { workInstructions?: unknown } })?.mes?.workInstructions;
        if (Array.isArray(raw)) {
          const match = raw.find(
            (entry) =>
              (entry as { skuCode?: unknown })?.skuCode === sku?.code &&
              (entry as { operation?: unknown })?.operation === op.name,
          );
          const rawSteps = (match as { steps?: unknown })?.steps;
          if (Array.isArray(rawSteps)) {
            steps = rawSteps.filter((x): x is string => typeof x === 'string');
          }
        }
      } catch {
        steps = [];
      }
    }
    return { operation: op.name, steps };
  }

  /**
   * Setup/changeover report (MES-015): SETUP downtime per work center
   * over the window — changeover count and total minutes.
   */
  async setupReport(
    days: number,
    ctx: RequestContext,
  ): Promise<Array<{ workCenter: string; changeovers: number; setupMinutes: number }>> {
    const clamped = Math.max(1, Math.min(90, days));
    const cutoff = new Date(Date.now() - clamped * 86_400_000);
    const events = await this.prisma.downtimeEvent.findMany({
      where: { tenantId: ctx.tenantId, category: 'SETUP', occurredAt: { gte: cutoff } },
      select: { workCenterId: true, minutes: true },
      take: 5_000,
    });
    const centers = await this.prisma.workCenter.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });
    const codeOf = new Map(centers.map((c) => [c.id, c.code]));
    const byCenter = new Map<string, { changeovers: number; setupMinutes: number }>();
    for (const event of events) {
      const code = codeOf.get(event.workCenterId) ?? '?';
      const bucket = byCenter.get(code) ?? { changeovers: 0, setupMinutes: 0 };
      bucket.changeovers += 1;
      bucket.setupMinutes += event.minutes;
      byCenter.set(code, bucket);
    }
    return [...byCenter.entries()]
      .map(([workCenter, counts]) => ({ workCenter, ...counts }))
      .sort((x, y) => y.setupMinutes - x.setupMinutes);
  }

  /**
   * Genealogy (MES-020): what a work order consumed — component
   * movements with their lots — traced straight from the ledger.
   */
  async genealogy(
    workOrderId: string,
    ctx: RequestContext,
  ): Promise<{
    woNumber: string;
    consumed: Array<{ skuId: string; code: string; quantity: string; lotNumber: string | null }>;
  }> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId: ctx.tenantId },
    });
    if (!wo) throw notFound('WorkOrder', workOrderId);
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId: ctx.tenantId,
        movementType: 'ISSUE',
        idempotencyKey: { startsWith: `wo:${wo.id}:` },
      },
      select: { skuId: true, quantity: true, lotNumber: true },
      take: 1_000,
    });
    const skus = await this.prisma.sku.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...new Set(movements.map((m) => m.skuId))] } },
      select: { id: true, code: true },
    });
    const codeOf = new Map(skus.map((k) => [k.id, k.code]));
    return {
      woNumber: wo.woNumber,
      consumed: movements.map((m) => ({
        skuId: m.skuId,
        code: codeOf.get(m.skuId) ?? '',
        quantity: m.quantity.toString(),
        lotNumber: m.lotNumber,
      })),
    };
  }

  /**
   * Where-used (MES-020): every work order that consumed a given lot —
   * the recall question answered from the ledger.
   */
  async whereUsed(
    lotNumber: string,
    ctx: RequestContext,
  ): Promise<Array<{ workOrderId: string; woNumber: string; quantity: string }>> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId: ctx.tenantId,
        movementType: 'ISSUE',
        lotNumber: lotNumber.trim(),
        idempotencyKey: { startsWith: 'wo:' },
      },
      select: { idempotencyKey: true, quantity: true },
      take: 1_000,
    });
    const byWo = new Map<string, number>();
    for (const movement of movements) {
      const woId = movement.idempotencyKey.split(':')[1] ?? '';
      if (!woId) continue;
      byWo.set(woId, (byWo.get(woId) ?? 0) + Number(movement.quantity));
    }
    const orders = await this.prisma.workOrder.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...byWo.keys()] } },
      select: { id: true, woNumber: true },
    });
    return orders.map((wo) => ({
      workOrderId: wo.id,
      woNumber: wo.woNumber,
      quantity: String(byWo.get(wo.id) ?? 0),
    }));
  }

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

    const mode = await this.issueMode(ctx.tenantId);
    const issued: string[] = [];
    try {
      for (const line of mode === 'backflush' ? [] : bom.lines) {
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
   * Production confirmations (MES-024): operators report produced
   * quantity per operation as work progresses. Confirmations
   * accumulate on the operation, never exceed the ordered quantity,
   * and are idempotent per confirmation key (a retry is a no-op that
   * returns current state).
   */
  async confirmOperation(
    input: {
      workOrderId: string;
      operationId: string;
      quantity: number;
      confirmationKey: string;
    },
    ctx: RequestContext,
  ): Promise<WorkOrderView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Confirmed quantity must be positive');
    }
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(input.confirmationKey)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid confirmation key');
    }
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: input.workOrderId, tenantId: ctx.tenantId },
      include: { operations: true },
    });
    if (!wo) throw notFound('WorkOrder', input.workOrderId);
    if (wo.status !== 'IN_PROGRESS') {
      throw new DomainError('INVALID_STATE', 'Confirmations require a running work order');
    }
    const op = wo.operations.find((o) => o.id === input.operationId);
    if (!op) throw notFound('WorkOrderOperation', input.operationId);
    if (op.status === 'DONE') {
      throw new DomainError('INVALID_STATE', 'The operation is already done');
    }
    const marker = `wo:${wo.id}:op:${op.id}:confirm:${input.confirmationKey}`;
    const already = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'mes.operation.confirm',
        objectType: 'WorkOrderOperation',
        objectId: marker,
      },
      select: { id: true },
    });
    if (already) return this.getWorkOrder(wo.id, ctx);
    if (Number(op.confirmedQty) + input.quantity > Number(wo.quantity) + 1e-9) {
      throw new DomainError(
        'INVALID_STATE',
        `Confirmations exceed the ordered quantity (${wo.quantity})`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.workOrderOperation.update({
        where: { id: op.id },
        data: { confirmedQty: { increment: input.quantity } },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'mes.operation.confirm',
        objectType: 'WorkOrderOperation',
        objectId: marker,
        source: 'api',
        newValues: { operationId: op.id, quantity: input.quantity },
      });
    });
    return this.getWorkOrder(wo.id, ctx);
  }

  /**
   * Mobile production (MES-019): operators on handhelds queue
   * confirmations offline as scan events (`mes-conf:<woId>:<opId>:<qty>`);
   * this drains the queue into confirmOperation — the scan event id
   * is the confirmation key, so replays never double-count.
   */
  async applyOfflineConfirmations(
    ctx: RequestContext,
  ): Promise<{
    scanned: number;
    applied: number;
    failed: Array<{ value: string; reason: string }>;
  }> {
    const events = await this.prisma.scanEvent.findMany({
      where: { tenantId: ctx.tenantId, value: { startsWith: 'mes-conf:' } },
      orderBy: [{ capturedAt: 'asc' }],
      take: 500,
    });
    let applied = 0;
    const failed: Array<{ value: string; reason: string }> = [];
    for (const event of events) {
      const parts = event.value.split(':');
      const workOrderId = parts[1];
      const operationId = parts[2];
      const quantity = Number(parts[3]);
      if (!workOrderId || !operationId || !(quantity > 0)) {
        failed.push({ value: event.value, reason: 'MALFORMED' });
        continue;
      }
      try {
        const marker = `wo:${workOrderId}:op:${operationId}:confirm:${event.id}`;
        const before = await this.prisma.auditEvent.findFirst({
          where: {
            tenantId: ctx.tenantId,
            action: 'mes.operation.confirm',
            objectType: 'WorkOrderOperation',
            objectId: marker,
          },
          select: { id: true },
        });
        await this.confirmOperation(
          { workOrderId, operationId, quantity, confirmationKey: event.id },
          ctx,
        );
        if (!before) applied += 1;
      } catch (error) {
        failed.push({
          value: event.value,
          reason: (error as { code?: string }).code ?? 'FAILED',
        });
      }
    }
    return { scanned: events.length, applied, failed };
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
    // QC blocking (VER-013): a SKU with a QC plan needs a PASSED
    // inspection on this work order before completion.
    if (this.qc) {
      const qcState = await this.qc.getQcState(ctx.tenantId, wo.id, wo.skuId);
      if (qcState === 'PENDING') {
        throw new DomainError('INVALID_STATE', 'QC inspection must pass before completion');
      }
      if (qcState === 'FAILED') {
        throw new DomainError('INVALID_STATE', 'QC failed — resolve the NCR and re-inspect');
      }
    }

    // Backflush (MES-007): consume components now, for what was
    // actually produced, when this tenant issues at completion.
    if ((await this.issueMode(ctx.tenantId)) === 'backflush') {
      const bom = await this.prisma.bom.findFirst({
        where: { id: wo.bomId, tenantId: ctx.tenantId },
        include: { lines: true },
      });
      const produced = input.goodQuantity + scrap;
      for (const line of bom?.lines ?? []) {
        const gross = produced * Number(line.quantity) * (1 + Number(line.scrapPct) / 100);
        await this.stock.postMovement(
          {
            warehouseId: wo.warehouseId,
            skuId: line.componentSkuId,
            movementType: 'ISSUE',
            quantity: Math.round(gross * 1e6) / 1e6,
            idempotencyKey: `wo:${wo.id}:backflush:${line.id}`,
            reason: `Backflush for ${wo.woNumber}`,
          },
          ctx,
        );
      }
    }

    // Co/by-products (MES-013): configured secondary outputs receipt
    // alongside the main output, scaled to good quantity, idempotent.
    if (input.goodQuantity > 0 && this.config) {
      try {
        const { config } = await this.config.getEffectiveConfiguration(ctx.tenantId);
        const raw = (config as { mes?: { byProducts?: unknown } })?.mes?.byProducts;
        if (Array.isArray(raw)) {
          const mainSku = await this.prisma.sku.findFirst({
            where: { id: wo.skuId, tenantId: ctx.tenantId },
            select: { code: true },
          });
          const rule = raw.find(
            (entry) => (entry as { skuCode?: unknown })?.skuCode === mainSku?.code,
          );
          const byProducts = (rule as { byProducts?: unknown })?.byProducts;
          if (Array.isArray(byProducts)) {
            for (const bp of byProducts) {
              const code = (bp as { code?: unknown })?.code;
              const ratio = (bp as { ratio?: unknown })?.ratio;
              if (typeof code !== 'string' || typeof ratio !== 'number' || ratio <= 0) continue;
              const bySku = await this.prisma.sku.findFirst({
                where: { tenantId: ctx.tenantId, code, status: 'ACTIVE' },
                select: { id: true },
              });
              if (!bySku) continue;
              const quantity = Math.round(input.goodQuantity * ratio * 1e6) / 1e6;
              await this.stock.postMovement(
                {
                  warehouseId: wo.warehouseId,
                  skuId: bySku.id,
                  movementType: 'RECEIPT',
                  quantity,
                  idempotencyKey: `wo:${wo.id}:byproduct:${code}`,
                  reason: `By-product of ${wo.woNumber}`,
                },
                ctx,
              );
            }
          }
        }
      } catch {
        // By-products must never block the main completion.
      }
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
  /**
   * Shift production report (MES-023): good and scrap output per day
   * over the last `days` days, derived from completed work orders.
   */
  async productionByDay(
    days: number,
    ctx: RequestContext,
  ): Promise<Array<{ day: string; good: number; scrap: number; workOrders: number }>> {
    const clamped = Math.max(1, Math.min(31, days));
    const cutoff = new Date(Date.now() - clamped * 86_400_000);
    const rows = await this.prisma.workOrder.findMany({
      where: { tenantId: ctx.tenantId, status: 'COMPLETED', completedAt: { gte: cutoff } },
      select: { completedAt: true, goodQuantity: true, scrapQuantity: true },
      take: 1000,
    });
    const byDay = new Map<string, { good: number; scrap: number; workOrders: number }>();
    for (const row of rows) {
      const day = (row.completedAt as Date).toISOString().slice(0, 10);
      const agg = byDay.get(day) ?? { good: 0, scrap: 0, workOrders: 0 };
      agg.good += Number(row.goodQuantity ?? 0);
      agg.scrap += Number(row.scrapQuantity ?? 0);
      agg.workOrders += 1;
      byDay.set(day, agg);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([day, agg]) => ({ day, ...agg }));
  }

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
        // Backflushed orders issued nothing at release — only return
        // material whose issue movement actually exists in the ledger.
        const wasIssued = await this.prisma.stockMovement.findFirst({
          where: { tenantId: ctx.tenantId, idempotencyKey: `wo:${wo.id}:issue:${line.id}` },
          select: { id: true },
        });
        if (!wasIssued) continue;
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
