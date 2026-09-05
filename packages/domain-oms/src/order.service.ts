import { writeAudit } from '@nexora/audit';
import type { PrismaClient, SalesOrderStatus } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * OMS — canonical sales orders (OMS-001), validation (OMS-002), quote
 * conversion (CPQ handoff), confirmation with stock reservation
 * orchestration (OMS-004/008), holds (OMS-010), cancellation with
 * compensating reservation release, and fulfillment that consumes
 * reservations through ledger ISSUE movements (OMS-011).
 *
 * DRAFT -> CONFIRMED -> FULFILLED
 *            |  ^
 *            v  |            DRAFT/CONFIRMED/ON_HOLD -> CANCELLED
 *          ON_HOLD
 *
 * Stock truth stays in WMS: this domain only calls the WMS public
 * interface and records the reservation ids it was given.
 */

export interface OrderLineView {
  id: string;
  skuId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  reservationId: string | null;
  backordered: boolean;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  accountId: string;
  quoteId: string | null;
  warehouseId: string;
  status: SalesOrderStatus;
  currency: string;
  total: string;
  holdReason: string | null;
  createdAt: string;
  lines: OrderLineView[];
}

export interface OrderEventView {
  id: string;
  eventType: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Cross-domain contract: account state is owned by CRM. */
export interface AccountGate {
  getAccountState(
    tenantId: string,
    accountId: string,
  ): Promise<{ exists: boolean; active: boolean }>;
}

/** Cross-domain contract: SKU identity is owned by PIM. */
export interface SkuInfoGate {
  getSkuInfo(
    tenantId: string,
    skuId: string,
  ): Promise<{ exists: boolean; active: boolean; code: string; name: string } | null>;
}

/** Cross-domain contract: credit policy is owned by CRM (CRM-008). */
export interface CreditGate {
  checkCredit(
    tenantId: string,
    accountId: string,
    additionalAmount: number,
  ): Promise<{ allowed: boolean; reason: string | null }>;
}

/** Cross-domain contract: stock truth is owned by WMS. */
export interface StockGate {
  reserveStock(
    input: { warehouseId: string; skuId: string; quantity: number; reference?: string | undefined },
    ctx: RequestContext,
  ): Promise<{ reservationId: string }>;
  releaseReservation(reservationId: string, ctx: RequestContext): Promise<void>;
  postMovement(
    input: {
      warehouseId: string;
      skuId: string;
      movementType: 'ISSUE';
      quantity: number;
      idempotencyKey: string;
      reason?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ movementId: string; duplicate: boolean }>;
}

function toView(order: {
  id: string;
  orderNumber: string;
  accountId: string;
  quoteId: string | null;
  warehouseId: string;
  status: SalesOrderStatus;
  currency: string;
  total: { toString(): string };
  holdReason: string | null;
  createdAt: Date;
  lines: Array<{
    id: string;
    skuId: string;
    description: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    lineTotal: { toString(): string };
    reservationId: string | null;
    backordered: boolean;
  }>;
}): OrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    accountId: order.accountId,
    quoteId: order.quoteId,
    warehouseId: order.warehouseId,
    status: order.status,
    currency: order.currency,
    total: order.total.toString(),
    holdReason: order.holdReason,
    createdAt: order.createdAt.toISOString(),
    lines: order.lines.map((l) => ({
      id: l.id,
      skuId: l.skuId,
      description: l.description,
      backordered: l.backordered,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      lineTotal: l.lineTotal.toString(),
      reservationId: l.reservationId,
    })),
  };
}

export class OrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly accounts: AccountGate,
    private readonly skus: SkuInfoGate,
    private readonly stock: StockGate,
    private readonly credit?: CreditGate,
  ) {}

  async listOrders(
    filter: { accountId?: string | undefined; status?: SalesOrderStatus | undefined },
    ctx: RequestContext,
  ): Promise<OrderView[]> {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(filter.accountId ? { accountId: filter.accountId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: { lines: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
    return orders.map(toView);
  }

  async getOrder(orderId: string, ctx: RequestContext): Promise<OrderView> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('SalesOrder', orderId);
    return toView(order);
  }

  /** Status timeline (OMS-013). */
  async getTimeline(orderId: string, ctx: RequestContext): Promise<OrderEventView[]> {
    await this.getOrder(orderId, ctx);
    const events = await this.prisma.orderEvent.findMany({
      where: { tenantId: ctx.tenantId, orderId },
      orderBy: [{ createdAt: 'asc' }],
      take: 200,
    });
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      note: e.note,
      createdBy: e.createdBy,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /** Creates a DRAFT order (OMS-001) after account validation (OMS-002). */
  async createOrder(
    input: { accountId: string; warehouseId: string; currency: string },
    ctx: RequestContext,
  ): Promise<OrderView> {
    const account = await this.accounts.getAccountState(ctx.tenantId, input.accountId);
    if (!account.exists) throw notFound('CrmAccount', input.accountId);
    if (!account.active) throw new DomainError('INVALID_STATE', 'Account is blocked');
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new DomainError('VALIDATION_FAILED', 'Currency must be a 3-letter ISO code');
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', input.warehouseId);

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.salesOrder.count({ where: { tenantId: ctx.tenantId } });
      const order = await tx.salesOrder.create({
        data: {
          tenantId: ctx.tenantId,
          orderNumber: `SO-${String(count + 1).padStart(6, '0')}`,
          accountId: input.accountId,
          warehouseId: input.warehouseId,
          currency: input.currency,
          createdBy: ctx.userId ?? null,
        },
        include: { lines: true },
      });
      await tx.orderEvent.create({
        data: {
          tenantId: ctx.tenantId,
          orderId: order.id,
          eventType: EVENT_TYPES.ORDER_CREATED,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'oms.order.create',
        objectType: 'SalesOrder',
        objectId: order.id,
        source: 'api',
        newValues: { orderNumber: order.orderNumber, accountId: order.accountId },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.ORDER_CREATED,
        aggregateType: 'SalesOrder',
        aggregateId: order.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { orderId: order.id, orderNumber: order.orderNumber },
      });
      return toView(order);
    });
  }

  /** Converts an ACCEPTED quote into a DRAFT order, copying priced lines. */
  async createFromQuote(
    input: { quoteId: string; warehouseId: string },
    ctx: RequestContext,
  ): Promise<OrderView> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: input.quoteId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!quote) throw notFound('Quote', input.quoteId);
    if (quote.status !== 'ACCEPTED') {
      throw new DomainError('INVALID_STATE', 'Only accepted quotes convert to orders');
    }
    const existing = await this.prisma.salesOrder.findFirst({
      where: { tenantId: ctx.tenantId, quoteId: quote.id },
    });
    if (existing) {
      throw new DomainError('CONFLICT', `Quote already converted to order ${existing.orderNumber}`);
    }
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: input.warehouseId, tenantId: ctx.tenantId },
    });
    if (!warehouse) throw notFound('Warehouse', input.warehouseId);

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.salesOrder.count({ where: { tenantId: ctx.tenantId } });
      const order = await tx.salesOrder.create({
        data: {
          tenantId: ctx.tenantId,
          orderNumber: `SO-${String(count + 1).padStart(6, '0')}`,
          accountId: quote.accountId,
          quoteId: quote.id,
          warehouseId: input.warehouseId,
          currency: quote.currency,
          total: quote.total,
          createdBy: ctx.userId ?? null,
          lines: {
            create: quote.lines.map((l) => ({
              tenantId: ctx.tenantId,
              skuId: l.skuId,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.netUnitPrice,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });
      await tx.orderEvent.create({
        data: {
          tenantId: ctx.tenantId,
          orderId: order.id,
          eventType: EVENT_TYPES.ORDER_CREATED,
          note: `From quote ${quote.quoteNumber} v${quote.version}`,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'oms.order.create_from_quote',
        objectType: 'SalesOrder',
        objectId: order.id,
        source: 'api',
        newValues: { orderNumber: order.orderNumber, quoteId: quote.id },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.ORDER_CREATED,
        aggregateType: 'SalesOrder',
        aggregateId: order.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { orderId: order.id, orderNumber: order.orderNumber, quoteId: quote.id },
      });
      return toView(order);
    });
  }

  /** Adds a line to a DRAFT order; price is entered (or quote-derived). */
  async addLine(
    input: { orderId: string; skuId: string; quantity: number; unitPrice: number },
    ctx: RequestContext,
  ): Promise<OrderView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    if (!(input.unitPrice >= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Unit price must be zero or positive');
    }
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId },
    });
    if (!order) throw notFound('SalesOrder', input.orderId);
    if (order.status !== 'DRAFT') {
      throw new DomainError('INVALID_STATE', 'Lines can only change while the order is a draft');
    }
    const sku = await this.skus.getSkuInfo(ctx.tenantId, input.skuId);
    if (!sku || !sku.exists) throw notFound('Sku', input.skuId);
    if (!sku.active) throw new DomainError('INVALID_STATE', 'SKU is not active');

    const lineTotal = Math.round(input.unitPrice * input.quantity * 100) / 100;
    await this.prisma.salesOrderLine.create({
      data: {
        tenantId: ctx.tenantId,
        orderId: order.id,
        skuId: input.skuId,
        description: `${sku.code} — ${sku.name}`,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal,
      },
    });
    await this.recomputeTotal(order.id, ctx);
    return this.getOrder(order.id, ctx);
  }

  /**
   * DRAFT -> CONFIRMED (OMS-004/008): validates account and SKUs, then
   * reserves stock per line through WMS. On any reservation failure the
   * already-created reservations are released (compensation) and the
   * order stays DRAFT.
   */
  async confirmOrder(
    orderId: string,
    ctx: RequestContext,
    options?: { allowBackorder?: boolean | undefined },
  ): Promise<OrderView> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('SalesOrder', orderId);
    if (order.status !== 'DRAFT') {
      throw new DomainError('INVALID_STATE', 'Only draft orders can be confirmed');
    }
    if (order.lines.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'An order needs at least one line');
    }
    const account = await this.accounts.getAccountState(ctx.tenantId, order.accountId);
    if (!account.exists || !account.active) {
      throw new DomainError('INVALID_STATE', 'Account is blocked or missing');
    }
    if (this.credit) {
      const verdict = await this.credit.checkCredit(
        ctx.tenantId,
        order.accountId,
        Number(order.total),
      );
      if (!verdict.allowed) {
        throw new DomainError('INVALID_STATE', verdict.reason ?? 'Credit check failed');
      }
    }
    for (const line of order.lines) {
      const sku = await this.skus.getSkuInfo(ctx.tenantId, line.skuId);
      if (!sku || !sku.exists || !sku.active) {
        throw new DomainError('INVALID_STATE', `SKU on line ${line.description} is not active`);
      }
    }

    // Reserve stock line by line; compensate on partial failure
    // (OMS-010). With allowBackorder, a line that cannot reserve is
    // confirmed as backordered instead of failing the order (OMS-006).
    const reserved: Array<{ lineId: string; reservationId: string }> = [];
    const backordered: string[] = [];
    try {
      for (const line of order.lines) {
        try {
          const { reservationId } = await this.stock.reserveStock(
            {
              warehouseId: order.warehouseId,
              skuId: line.skuId,
              quantity: Number(line.quantity),
              reference: `order:${order.orderNumber}`,
            },
            ctx,
          );
          reserved.push({ lineId: line.id, reservationId });
        } catch (lineError) {
          if (options?.allowBackorder) {
            backordered.push(line.id);
          } else {
            throw lineError;
          }
        }
      }
    } catch (error) {
      for (const r of reserved.reverse()) {
        try {
          await this.stock.releaseReservation(r.reservationId, ctx);
        } catch {
          // Compensation must not mask the original failure.
        }
      }
      throw error;
    }

    const flipped = await this.prisma.salesOrder.updateMany({
      where: { id: order.id, tenantId: ctx.tenantId, status: 'DRAFT' },
      data: { status: 'CONFIRMED' },
    });
    if (flipped.count === 0) {
      for (const r of reserved.reverse()) {
        try {
          await this.stock.releaseReservation(r.reservationId, ctx);
        } catch {
          // Best-effort compensation; reservation release is idempotent-safe.
        }
      }
      throw new DomainError('CONFLICT', 'Order changed concurrently');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const r of reserved) {
        await tx.salesOrderLine.updateMany({
          where: { id: r.lineId, tenantId: ctx.tenantId },
          data: { reservationId: r.reservationId },
        });
      }
      for (const lineId of backordered) {
        await tx.salesOrderLine.updateMany({
          where: { id: lineId, tenantId: ctx.tenantId },
          data: { backordered: true },
        });
      }
      await tx.orderEvent.create({
        data: {
          tenantId: ctx.tenantId,
          orderId: order.id,
          eventType: EVENT_TYPES.ORDER_CONFIRMED,
          note:
            backordered.length > 0
              ? `${reserved.length} line(s) reserved, ${backordered.length} backordered`
              : `${reserved.length} line(s) reserved`,
          createdBy: ctx.userId ?? null,
        },
      });
      if (backordered.length > 0) {
        await publishToOutbox(tx, {
          tenantId: ctx.tenantId,
          eventType: EVENT_TYPES.BACKORDER_CREATED,
          aggregateType: 'SalesOrder',
          aggregateId: order.id,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          payload: { orderId: order.id, lineIds: backordered },
        });
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'oms.order.confirm',
        objectType: 'SalesOrder',
        objectId: order.id,
        source: 'api',
        newValues: { status: 'CONFIRMED' },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.ORDER_CONFIRMED,
        aggregateType: 'SalesOrder',
        aggregateId: order.id,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { orderId: order.id, orderNumber: order.orderNumber },
      });
    });
    return this.getOrder(order.id, ctx);
  }

  /** CONFIRMED -> ON_HOLD with a required reason (OMS-010). */
  async holdOrder(orderId: string, reason: string, ctx: RequestContext): Promise<OrderView> {
    if (!reason.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A hold needs a reason');
    }
    const flipped = await this.prisma.salesOrder.updateMany({
      where: { id: orderId, tenantId: ctx.tenantId, status: 'CONFIRMED' },
      data: { status: 'ON_HOLD', holdReason: reason.trim() },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Only confirmed orders can be held');
    }
    await this.recordTransition(orderId, EVENT_TYPES.ORDER_HELD, reason.trim(), ctx);
    return this.getOrder(orderId, ctx);
  }

  /** ON_HOLD -> CONFIRMED. */
  async releaseOrder(orderId: string, ctx: RequestContext): Promise<OrderView> {
    const flipped = await this.prisma.salesOrder.updateMany({
      where: { id: orderId, tenantId: ctx.tenantId, status: 'ON_HOLD' },
      data: { status: 'CONFIRMED', holdReason: null },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', 'Only held orders can be released');
    }
    await this.recordTransition(orderId, EVENT_TYPES.ORDER_RELEASED, null, ctx);
    return this.getOrder(orderId, ctx);
  }

  /**
   * DRAFT/CONFIRMED/ON_HOLD -> CANCELLED. Compensates by releasing any
   * stock reservations the order holds (OMS-010).
   */
  async cancelOrder(orderId: string, ctx: RequestContext): Promise<OrderView> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('SalesOrder', orderId);
    const flipped = await this.prisma.salesOrder.updateMany({
      where: {
        id: order.id,
        tenantId: ctx.tenantId,
        status: { in: ['DRAFT', 'CONFIRMED', 'ON_HOLD'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (flipped.count === 0) {
      throw new DomainError('INVALID_STATE', `A ${order.status} order cannot be cancelled`);
    }
    for (const line of order.lines) {
      if (line.reservationId) {
        try {
          await this.stock.releaseReservation(line.reservationId, ctx);
        } catch {
          // Already released/consumed — cancellation still stands.
        }
      }
    }
    await this.prisma.salesOrderLine.updateMany({
      where: { orderId: order.id, tenantId: ctx.tenantId },
      data: { reservationId: null },
    });
    await this.recordTransition(order.id, EVENT_TYPES.ORDER_CANCELLED, null, ctx);
    return this.getOrder(order.id, ctx);
  }

  /**
   * CONFIRMED -> FULFILLED (OMS-011): per line, release the reservation
   * and post an idempotent ISSUE ledger movement. Retrying after a crash
   * is safe: movements carry `order:{orderId}:line:{lineId}` keys.
   */
  async fulfillOrder(orderId: string, ctx: RequestContext): Promise<OrderView> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('SalesOrder', orderId);
    if (order.status !== 'CONFIRMED') {
      throw new DomainError('INVALID_STATE', 'Only confirmed orders can be fulfilled');
    }
    if (order.lines.some((l) => l.backordered)) {
      throw new DomainError(
        'INVALID_STATE',
        'Backordered lines must be released before fulfillment',
      );
    }

    for (const line of order.lines) {
      if (line.reservationId) {
        try {
          await this.stock.releaseReservation(line.reservationId, ctx);
        } catch {
          // Retried fulfillment: the reservation was already released.
        }
      }
      await this.stock.postMovement(
        {
          warehouseId: order.warehouseId,
          skuId: line.skuId,
          movementType: 'ISSUE',
          quantity: Number(line.quantity),
          idempotencyKey: `order:${order.id}:line:${line.id}`,
          reason: `Fulfillment of ${order.orderNumber}`,
        },
        ctx,
      );
    }

    const flipped = await this.prisma.salesOrder.updateMany({
      where: { id: order.id, tenantId: ctx.tenantId, status: 'CONFIRMED' },
      data: { status: 'FULFILLED' },
    });
    if (flipped.count === 0) throw new DomainError('CONFLICT', 'Order changed concurrently');
    await this.recordTransition(
      order.id,
      EVENT_TYPES.ORDER_FULFILLMENT_PLANNED,
      `${order.lines.length} line(s) issued`,
      ctx,
    );
    return this.getOrder(order.id, ctx);
  }

  /**
   * Retries reservation for backordered lines once stock arrives
   * (OMS-006). Idempotent per call: lines that reserve flip to normal;
   * the rest stay backordered.
   */
  async releaseBackorders(
    orderId: string,
    ctx: RequestContext,
  ): Promise<{ released: number; remaining: number }> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('SalesOrder', orderId);
    if (order.status !== 'CONFIRMED') {
      throw new DomainError('INVALID_STATE', 'Only confirmed orders carry backorders');
    }
    let released = 0;
    let remaining = 0;
    for (const line of order.lines.filter((l) => l.backordered)) {
      try {
        const { reservationId } = await this.stock.reserveStock(
          {
            warehouseId: order.warehouseId,
            skuId: line.skuId,
            quantity: Number(line.quantity),
            reference: `order:${order.orderNumber}`,
          },
          ctx,
        );
        await this.prisma.salesOrderLine.updateMany({
          where: { id: line.id, tenantId: ctx.tenantId, backordered: true },
          data: { reservationId, backordered: false },
        });
        released += 1;
      } catch {
        remaining += 1;
      }
    }
    if (released > 0) {
      await this.recordTransition(
        order.id,
        EVENT_TYPES.BACKORDER_RELEASED,
        `${released} backordered line(s) reserved`,
        ctx,
      );
    }
    return { released, remaining };
  }

  /**
   * Amends a line quantity on a draft or confirmed order (OMS-009).
   * On confirmed orders the new quantity is reserved before the old
   * reservation is released, and increases pass the credit gate.
   */
  async amendLine(
    orderId: string,
    lineId: string,
    input: { quantity: number },
    ctx: RequestContext,
  ): Promise<OrderView> {
    if (!(input.quantity > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
    }
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { lines: true },
    });
    if (!order) throw notFound('SalesOrder', orderId);
    if (order.status !== 'DRAFT' && order.status !== 'CONFIRMED') {
      throw new DomainError('INVALID_STATE', `A ${order.status} order cannot be amended`);
    }
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw notFound('SalesOrderLine', lineId);
    const oldQuantity = Number(line.quantity);
    if (Math.abs(oldQuantity - input.quantity) < 1e-9) {
      return this.getOrder(order.id, ctx);
    }
    const unitPrice = Number(line.unitPrice);
    const delta = Math.round((input.quantity - oldQuantity) * unitPrice * 100) / 100;
    if (order.status === 'CONFIRMED' && delta > 0 && this.credit) {
      const verdict = await this.credit.checkCredit(ctx.tenantId, order.accountId, delta);
      if (!verdict.allowed) {
        throw new DomainError('INVALID_STATE', verdict.reason ?? 'Credit check failed');
      }
    }

    let newReservationId: string | null = line.reservationId;
    if (order.status === 'CONFIRMED' && !line.backordered) {
      const { reservationId } = await this.stock.reserveStock(
        {
          warehouseId: order.warehouseId,
          skuId: line.skuId,
          quantity: input.quantity,
          reference: `order:${order.orderNumber}:amend`,
        },
        ctx,
      );
      if (line.reservationId) {
        try {
          await this.stock.releaseReservation(line.reservationId, ctx);
        } catch {
          // The old reservation may already be gone; the new one stands.
        }
      }
      newReservationId = reservationId;
    }

    const lineTotal = Math.round(input.quantity * unitPrice * 100) / 100;
    await this.prisma.salesOrderLine.updateMany({
      where: { id: line.id, tenantId: ctx.tenantId },
      data: { quantity: input.quantity, lineTotal, reservationId: newReservationId },
    });
    await this.recomputeTotal(order.id, ctx);
    await this.recordTransition(
      order.id,
      EVENT_TYPES.ORDER_AMENDED,
      `${line.description}: ${oldQuantity} -> ${input.quantity}`,
      ctx,
    );
    return this.getOrder(order.id, ctx);
  }

  private async recomputeTotal(orderId: string, ctx: RequestContext): Promise<void> {
    const lines = await this.prisma.salesOrderLine.findMany({
      where: { tenantId: ctx.tenantId, orderId },
    });
    const total = Math.round(lines.reduce((sum, l) => sum + Number(l.lineTotal), 0) * 100) / 100;
    await this.prisma.salesOrder.update({ where: { id: orderId }, data: { total } });
  }

  private async recordTransition(
    orderId: string,
    eventType: (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES],
    note: string | null,
    ctx: RequestContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.orderEvent.create({
        data: {
          tenantId: ctx.tenantId,
          orderId,
          eventType,
          note,
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: `oms.order.${eventType.split('.').slice(1).join('.')}`,
        objectType: 'SalesOrder',
        objectId: orderId,
        source: 'api',
        newValues: { eventType, note },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType,
        aggregateType: 'SalesOrder',
        aggregateId: orderId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { orderId, note },
      });
    });
  }
}
