import { writeAudit } from '@nexora/audit';
import type { PrismaClient, ReturnStatus } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { StockGate } from './order.service';

/**
 * Returns orchestration (OMS-012 / COM-011): the RMA lifecycle
 * REQUESTED → APPROVED → RECEIVED → CLOSED (or REJECTED).
 *
 * Quantities are validated against what the order actually shipped
 * minus what earlier returns already claimed, so a customer can never
 * return more than they received. Receipt posts idempotent inbound
 * movements (`rma:{id}:line:{lineId}`), so a crashed receipt retries
 * safely to exactly-once stock effects.
 */

export interface ReturnLineView {
  id: string;
  orderLineId: string;
  skuId: string;
  description: string;
  quantity: string;
}

export interface ReturnView {
  id: string;
  rmaNumber: string;
  orderId: string;
  accountId: string;
  status: ReturnStatus;
  reason: string;
  decisionNote: string | null;
  createdAt: string;
  lines: ReturnLineView[];
}

export class ReturnsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stock: StockGate,
  ) {}

  async listReturns(ctx: RequestContext): Promise<ReturnView[]> {
    const returns = await this.prisma.returnOrder.findMany({
      where: { tenantId: ctx.tenantId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return returns.map((r) => this.toView(r));
  }

  /**
   * RMA request (OMS-0xx). `requestRef` makes the call idempotent for a
   * calling domain (e.g. a support case): the same reference returns the
   * same RMA. The order row is locked so concurrent returns cannot claim
   * more than was ordered.
   */
  async requestReturn(
    input: {
      orderId: string;
      reason: string;
      lines: Array<{ orderLineId: string; quantity: number }>;
      requestRef?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<ReturnView & { duplicate?: boolean }> {
    if (!input.reason.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A return needs a reason');
    }
    if (input.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A return needs at least one line');
    }
    const requestRef = input.requestRef?.trim() || null;
    if (requestRef && requestRef.length > 200) {
      throw new DomainError('VALIDATION_FAILED', 'requestRef is too long');
    }
    const replay = async () => {
      if (!requestRef) return null;
      const existing = await this.prisma.returnOrder.findFirst({
        where: { tenantId: ctx.tenantId, requestRef },
        include: { lines: true },
      });
      return existing ? { ...this.toView(existing), duplicate: true } : null;
    };
    const earlier = await replay();
    if (earlier) return earlier;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM sales_order
          WHERE id = ${input.orderId}::uuid AND tenant_id = ${ctx.tenantId}::uuid FOR UPDATE`;
        const order = await tx.salesOrder.findFirst({
          where: { id: input.orderId, tenantId: ctx.tenantId },
          include: { lines: true },
        });
        if (!order) throw notFound('SalesOrder', input.orderId);
        if (order.status !== 'FULFILLED') {
          throw new DomainError('INVALID_STATE', 'Only fulfilled orders can be returned');
        }

        // What earlier, non-rejected returns already claim per order line.
        const priorLines = await tx.returnOrderLine.findMany({
          where: {
            tenantId: ctx.tenantId,
            returnOrder: { orderId: order.id, status: { not: 'REJECTED' } },
          },
        });
        const claimed = new Map<string, number>();
        for (const line of priorLines) {
          claimed.set(
            line.orderLineId,
            (claimed.get(line.orderLineId) ?? 0) + Number(line.quantity),
          );
        }
        const resolved = input.lines.map((line) => {
          const orderLine = order.lines.find((l) => l.id === line.orderLineId);
          if (!orderLine) throw notFound('SalesOrderLine', line.orderLineId);
          if (!(line.quantity > 0)) {
            throw new DomainError('VALIDATION_FAILED', 'Return quantity must be positive');
          }
          const available = Number(orderLine.quantity) - (claimed.get(orderLine.id) ?? 0);
          if (line.quantity > available + 1e-9) {
            throw new DomainError(
              'VALIDATION_FAILED',
              `Line '${orderLine.description}' has only ${available} returnable`,
            );
          }
          return { orderLine, quantity: line.quantity };
        });

        // RMA numbering is count-based: serialise per tenant.
        const numberKey = `oms.rma.number:${ctx.tenantId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${numberKey}, 0))`;
        const count = await tx.returnOrder.count({ where: { tenantId: ctx.tenantId } });
        const created = await tx.returnOrder.create({
          data: {
            tenantId: ctx.tenantId,
            rmaNumber: `RMA-${String(count + 1).padStart(5, '0')}`,
            requestRef,
            orderId: order.id,
            accountId: order.accountId,
            warehouseId: order.warehouseId,
            reason: input.reason.trim(),
            createdBy: ctx.userId ?? null,
            lines: {
              create: resolved.map(({ orderLine, quantity }) => ({
                tenantId: ctx.tenantId,
                orderLineId: orderLine.id,
                skuId: orderLine.skuId,
                description: orderLine.description,
                quantity,
              })),
            },
          },
          include: { lines: true },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'oms.return.request',
          objectType: 'ReturnOrder',
          objectId: created.id,
          source: 'api',
          newValues: {
            orderId: order.id,
            lines: resolved.length,
            ...(requestRef ? { requestRef } : {}),
          },
        });
        await publishToOutbox(tx, {
          tenantId: ctx.tenantId,
          eventType: EVENT_TYPES.RETURN_REQUESTED,
          aggregateType: 'ReturnOrder',
          aggregateId: created.id,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          payload: { returnId: created.id, orderId: order.id },
        });
        return this.toView(created);
      });
    } catch (error) {
      // A concurrent call with the same requestRef won the unique index.
      if ((error as { code?: string }).code === 'P2002') {
        const winner = await replay();
        if (winner) return winner;
      }
      throw error;
    }
  }

  /** Public cross-domain gate (CSM-011): returns of one order. */
  async returnsForOrder(tenantId: string, orderId: string): Promise<ReturnView[]> {
    const rows = await this.prisma.returnOrder.findMany({
      where: { tenantId, orderId },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return rows.map((r) => this.toView(r));
  }

  async decideReturn(
    returnId: string,
    input: { approve: boolean; note?: string | undefined },
    ctx: RequestContext,
  ): Promise<ReturnView> {
    const flipped = await this.prisma.returnOrder.updateMany({
      where: { id: returnId, tenantId: ctx.tenantId, status: 'REQUESTED' },
      data: {
        status: input.approve ? 'APPROVED' : 'REJECTED',
        decisionNote: input.note ?? null,
      },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Only requested returns can be decided');
    }
    await this.emit(
      returnId,
      input.approve ? EVENT_TYPES.RETURN_APPROVED : EVENT_TYPES.RETURN_REJECTED,
      ctx,
    );
    return this.getReturn(returnId, ctx);
  }

  /** APPROVED → RECEIVED: goods re-enter stock idempotently, then CLOSED. */
  async receiveReturn(returnId: string, ctx: RequestContext): Promise<ReturnView> {
    const rma = await this.prisma.returnOrder.findFirst({
      where: { id: returnId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!rma) throw notFound('ReturnOrder', returnId);
    if (rma.status !== 'APPROVED') {
      throw new DomainError('INVALID_STATE', 'Only approved returns can be received');
    }
    for (const line of rma.lines) {
      await this.stock.postMovement(
        {
          warehouseId: rma.warehouseId,
          skuId: line.skuId,
          movementType: 'RECEIPT',
          quantity: Number(line.quantity),
          idempotencyKey: `rma:${rma.id}:line:${line.id}`,
          reason: `Return ${rma.rmaNumber}`,
        },
        ctx,
      );
    }
    const flipped = await this.prisma.returnOrder.updateMany({
      where: { id: rma.id, tenantId: ctx.tenantId, status: 'APPROVED' },
      data: { status: 'CLOSED' },
    });
    if (flipped.count === 0) throw new DomainError('CONFLICT', 'Return changed concurrently');
    await this.emit(rma.id, EVENT_TYPES.RETURN_RECEIVED, ctx);
    return this.getReturn(rma.id, ctx);
  }

  private async getReturn(returnId: string, ctx: RequestContext): Promise<ReturnView> {
    const rma = await this.prisma.returnOrder.findFirst({
      where: { id: returnId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!rma) throw notFound('ReturnOrder', returnId);
    return this.toView(rma);
  }

  private async emit(
    returnId: string,
    eventType: (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES],
    ctx: RequestContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: `oms.${eventType}`,
        objectType: 'ReturnOrder',
        objectId: returnId,
        source: 'api',
        newValues: { eventType },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType,
        aggregateType: 'ReturnOrder',
        aggregateId: returnId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { returnId },
      });
    });
  }

  private toView(rma: {
    id: string;
    rmaNumber: string;
    orderId: string;
    accountId: string;
    status: ReturnStatus;
    reason: string;
    decisionNote: string | null;
    createdAt: Date;
    lines: Array<{
      id: string;
      orderLineId: string;
      skuId: string;
      description: string;
      quantity: { toString(): string };
    }>;
  }): ReturnView {
    return {
      id: rma.id,
      rmaNumber: rma.rmaNumber,
      orderId: rma.orderId,
      accountId: rma.accountId,
      status: rma.status,
      reason: rma.reason,
      decisionNote: rma.decisionNote,
      createdAt: rma.createdAt.toISOString(),
      lines: rma.lines.map((l) => ({
        id: l.id,
        orderLineId: l.orderLineId,
        skuId: l.skuId,
        description: l.description,
        quantity: l.quantity.toString(),
      })),
    };
  }
}
