import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Case-to-order linkage (CSM-011). A support case can point at one sales
 * order and name the affected order lines (quantity + issue type). The
 * agent sees the order in context (lines, fulfilment, promise, timeline,
 * returns) and can open a return (RMA) for the affected lines — through
 * OMS's public interface, idempotent per request key. The order and the
 * return stay OMS-owned; CRM only keeps its references.
 */

export const DEFAULT_ORDER_ISSUE_TYPES = [
  'DAMAGED',
  'WRONG_ITEM',
  'MISSING',
  'LATE',
  'QUALITY',
  'OTHER',
] as const;
/** Issue types for which the goods come back (a return makes sense). */
export const DEFAULT_RETURNABLE_ISSUE_TYPES = ['DAMAGED', 'WRONG_ITEM', 'QUALITY'] as const;

export interface CaseOrderContextGate {
  orderContext(
    tenantId: string,
    orderId: string,
  ): Promise<{
    id: string;
    orderNumber: string;
    accountId: string;
    status: string;
    currency: string;
    total: string;
    fulfillmentType: string;
    createdAt: string;
    promisedAt: string | null;
    lines: Array<{
      id: string;
      skuId: string;
      description: string;
      quantity: string;
      fulfilledQty: string;
      backordered: boolean;
      promisedAt: string | null;
    }>;
    timeline: Array<{ eventType: string; note: string | null; createdAt: string }>;
  } | null>;
}

export interface CaseReturnGate {
  requestReturn(
    input: {
      orderId: string;
      reason: string;
      lines: Array<{ orderLineId: string; quantity: number }>;
      requestRef?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ id: string; rmaNumber: string; status: string; duplicate?: boolean }>;
  returnsForOrder(
    tenantId: string,
    orderId: string,
  ): Promise<
    Array<{
      id: string;
      rmaNumber: string;
      status: string;
      reason: string;
      createdAt: string;
      lines: Array<{ orderLineId: string; quantity: string }>;
    }>
  >;
}

export interface CaseConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

export interface CaseOrderItemInput {
  orderLineId: string;
  quantity: number;
  issueType: string;
  note?: string | undefined;
}

export class CaseOrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orders: CaseOrderContextGate,
    private readonly returns: CaseReturnGate,
    private readonly configuration?: CaseConfigGate,
  ) {}

  private async issueTypes(tenantId: string): Promise<{ all: string[]; returnable: string[] }> {
    let csm: Record<string, unknown> = {};
    if (this.configuration) {
      const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
      csm = ((config as Record<string, unknown> | null)?.csm ?? {}) as Record<string, unknown>;
    }
    const list = (v: unknown, d: readonly string[]) =>
      Array.isArray(v) && v.every((x) => typeof x === 'string' && /^[A-Z_]{2,40}$/.test(x))
        ? (v as string[])
        : [...d];
    const all = list(csm.orderIssueTypes, DEFAULT_ORDER_ISSUE_TYPES);
    const returnable = list(csm.returnableIssueTypes, DEFAULT_RETURNABLE_ISSUE_TYPES).filter((t) =>
      all.includes(t),
    );
    return { all, returnable };
  }

  private async lockedCase(tx: Prisma.TransactionClient, caseId: string, ctx: RequestContext) {
    await tx.$queryRaw`SELECT id FROM support_case
      WHERE id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid FOR UPDATE`;
    const row = await tx.supportCase.findFirst({ where: { id: caseId, tenantId: ctx.tenantId } });
    if (!row) throw notFound('SupportCase', caseId);
    return row;
  }

  /**
   * Permission: case.manage. Point the case at an order (or confirm the
   * same one). Changing to another order is refused while affected lines
   * are recorded. An unassigned case inherits the order's account; an
   * account mismatch is refused.
   */
  async linkOrder(caseId: string, orderId: string, ctx: RequestContext) {
    const order = await this.orders.orderContext(ctx.tenantId, orderId);
    if (!order) throw notFound('SalesOrder', orderId);
    return this.prisma.$transaction(async (tx) => {
      const row = await this.lockedCase(tx, caseId, ctx);
      if (row.status === 'CLOSED') {
        throw new DomainError('INVALID_STATE', 'A closed case cannot be changed');
      }
      if (row.orderId === order.id) return { caseId: row.id, orderId: order.id, changed: false };
      if (row.accountId && row.accountId !== order.accountId) {
        throw new DomainError('VALIDATION_FAILED', 'The order belongs to another customer');
      }
      if (row.orderId) {
        const items = await tx.supportCaseOrderItem.count({ where: { caseId: row.id } });
        if (items > 0) {
          throw new DomainError(
            'INVALID_STATE',
            'Remove the affected lines of the current order before switching orders',
          );
        }
      }
      await tx.supportCase.update({
        where: { id: row.id },
        data: { orderId: order.id, ...(row.accountId ? {} : { accountId: order.accountId }) },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'csm.case.order.link',
        objectType: 'SupportCase',
        objectId: row.id,
        source: 'api',
        previousValues: { orderId: row.orderId },
        newValues: { orderId: order.id, orderNumber: order.orderNumber },
      });
      return { caseId: row.id, orderId: order.id, changed: true };
    });
  }

  /**
   * Permission: case.manage. Replace the affected order lines of a case.
   * Lines must belong to the case's order; quantity up to the ordered
   * quantity; issue type from csm.orderIssueTypes. An empty list clears.
   */
  async setItems(caseId: string, items: CaseOrderItemInput[], ctx: RequestContext) {
    if (items.length > 100) {
      throw new DomainError('VALIDATION_FAILED', 'At most 100 affected lines');
    }
    const { all } = await this.issueTypes(ctx.tenantId);
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.orderLineId)) {
        throw new DomainError('VALIDATION_FAILED', 'Each order line may appear only once');
      }
      seen.add(item.orderLineId);
      if (!(item.quantity > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Quantity must be positive');
      }
      if (!all.includes(item.issueType)) {
        throw new DomainError('VALIDATION_FAILED', `Unknown issue type ${item.issueType}`, {
          allowed: all,
        });
      }
    }
    const current = await this.prisma.supportCase.findFirst({
      where: { id: caseId, tenantId: ctx.tenantId },
    });
    if (!current) throw notFound('SupportCase', caseId);
    if (!current.orderId) {
      throw new DomainError('INVALID_STATE', 'Link the case to an order first');
    }
    const order = await this.orders.orderContext(ctx.tenantId, current.orderId);
    if (!order) throw notFound('SalesOrder', current.orderId);
    for (const item of items) {
      const line = order.lines.find((l) => l.id === item.orderLineId);
      if (!line) {
        throw new DomainError('VALIDATION_FAILED', 'The line does not belong to the case order', {
          orderLineId: item.orderLineId,
        });
      }
      if (item.quantity > Number(line.quantity) + 1e-9) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Line '${line.description}' was ordered ${line.quantity} times only`,
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const row = await this.lockedCase(tx, caseId, ctx);
      if (row.status === 'CLOSED') {
        throw new DomainError('INVALID_STATE', 'A closed case cannot be changed');
      }
      if (row.orderId !== order.id) {
        throw new DomainError('CONFLICT', 'The case order changed meanwhile — reload');
      }
      const before = await tx.supportCaseOrderItem.findMany({ where: { caseId: row.id } });
      await tx.supportCaseOrderItem.deleteMany({ where: { caseId: row.id } });
      if (items.length > 0) {
        await tx.supportCaseOrderItem.createMany({
          data: items.map((i) => ({
            tenantId: ctx.tenantId,
            caseId: row.id,
            orderId: order.id,
            orderLineId: i.orderLineId,
            quantity: i.quantity,
            issueType: i.issueType,
            note: i.note?.trim() || null,
            createdBy: ctx.userId ?? null,
          })),
        });
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'csm.case.order.items',
        objectType: 'SupportCase',
        objectId: row.id,
        source: 'api',
        previousValues: {
          items: before.map((b) => ({
            orderLineId: b.orderLineId,
            quantity: b.quantity.toString(),
            issueType: b.issueType,
          })),
        } as Prisma.InputJsonValue,
        newValues: {
          items: items.map((i) => ({
            orderLineId: i.orderLineId,
            quantity: i.quantity,
            issueType: i.issueType,
          })),
        } as Prisma.InputJsonValue,
      });
    });
    return this.items(caseId, ctx.tenantId);
  }

  private async items(caseId: string, tenantId: string) {
    const rows = await this.prisma.supportCaseOrderItem.findMany({
      where: { tenantId, caseId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      orderLineId: r.orderLineId,
      quantity: r.quantity.toString(),
      issueType: r.issueType,
      note: r.note,
    }));
  }

  /** Permission: case.read. The case's order in context (CSM-011). */
  async context(caseId: string, ctx: RequestContext) {
    const row = await this.prisma.supportCase.findFirst({
      where: { id: caseId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('SupportCase', caseId);
    const { all, returnable } = await this.issueTypes(ctx.tenantId);
    if (!row.orderId) {
      return {
        caseId: row.id,
        order: null,
        items: [],
        returns: [],
        caseReturns: [],
        issueTypes: all,
        returnableIssueTypes: returnable,
        otherCases: [],
      };
    }
    const [order, items, returns, caseReturns, otherCases] = await Promise.all([
      this.orders.orderContext(ctx.tenantId, row.orderId),
      this.items(row.id, ctx.tenantId),
      this.returns.returnsForOrder(ctx.tenantId, row.orderId),
      this.prisma.supportCaseReturn.findMany({
        where: { tenantId: ctx.tenantId, caseId: row.id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.supportCase.findMany({
        where: { tenantId: ctx.tenantId, orderId: row.orderId, id: { not: row.id } },
        select: { id: true, caseNumber: true, subject: true, status: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
    ]);
    return {
      caseId: row.id,
      order,
      items,
      returns,
      caseReturns: caseReturns.map((r) => ({
        returnId: r.returnId,
        rmaNumber: r.rmaNumber,
        createdAt: r.createdAt.toISOString(),
      })),
      issueTypes: all,
      returnableIssueTypes: returnable,
      otherCases,
    };
  }

  /** Permission: case.read. Cases about one order, with their affected lines. */
  async casesForOrder(orderId: string, ctx: RequestContext) {
    const order = await this.orders.orderContext(ctx.tenantId, orderId);
    if (!order) throw notFound('SalesOrder', orderId);
    const cases = await this.prisma.supportCase.findMany({
      where: { tenantId: ctx.tenantId, orderId: order.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const items = await this.prisma.supportCaseOrderItem.findMany({
      where: { tenantId: ctx.tenantId, orderId: order.id },
    });
    return cases.map((c) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      subject: c.subject,
      status: c.status,
      priority: c.priority,
      createdAt: c.createdAt.toISOString(),
      items: items
        .filter((i) => i.caseId === c.id)
        .map((i) => ({
          orderLineId: i.orderLineId,
          quantity: i.quantity.toString(),
          issueType: i.issueType,
        })),
    }));
  }

  /**
   * Permission: case.manage + return creation (route). Opens an RMA in OMS
   * for the case's returnable affected lines. Idempotent: the same
   * requestKey returns the same RMA (OMS enforces it by reference).
   */
  async openReturn(
    caseId: string,
    input: { requestKey: string; reason?: string | undefined },
    ctx: RequestContext,
  ) {
    const requestKey = input.requestKey.trim();
    if (requestKey.length < 8 || requestKey.length > 128) {
      throw new DomainError('VALIDATION_FAILED', 'requestKey must be 8-128 chars');
    }
    const row = await this.prisma.supportCase.findFirst({
      where: { id: caseId, tenantId: ctx.tenantId },
    });
    if (!row) throw notFound('SupportCase', caseId);
    if (!row.orderId) throw new DomainError('INVALID_STATE', 'The case has no order');
    if (row.status === 'CLOSED') {
      throw new DomainError('INVALID_STATE', 'A closed case cannot open a return');
    }
    const { returnable } = await this.issueTypes(ctx.tenantId);
    const items = await this.prisma.supportCaseOrderItem.findMany({
      where: { tenantId: ctx.tenantId, caseId: row.id },
    });
    const lines = items
      .filter((i) => returnable.includes(i.issueType))
      .map((i) => ({ orderLineId: i.orderLineId, quantity: Number(i.quantity) }));
    if (lines.length === 0) {
      throw new DomainError('INVALID_STATE', 'No affected line has a returnable issue type', {
        returnable,
      });
    }
    const requestRef = `case:${row.id}:${requestKey}`;
    const rma = await this.returns.requestReturn(
      {
        orderId: row.orderId,
        reason: (input.reason?.trim() || `Case ${row.caseNumber}: ${row.subject}`).slice(0, 500),
        lines,
        requestRef,
      },
      ctx,
    );
    // The link is idempotent too: a retry after a crash finds the same RMA.
    await this.prisma.supportCaseReturn.upsert({
      where: { tenantId_requestKey: { tenantId: ctx.tenantId, requestKey: requestRef } },
      create: {
        tenantId: ctx.tenantId,
        caseId: row.id,
        returnId: rma.id,
        rmaNumber: rma.rmaNumber,
        requestKey: requestRef,
        createdBy: ctx.userId ?? null,
      },
      update: {},
    });
    if (!rma.duplicate) {
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'csm.case.return.open',
        objectType: 'SupportCase',
        objectId: row.id,
        source: 'api',
        newValues: { returnId: rma.id, rmaNumber: rma.rmaNumber, lines: lines.length },
      });
    }
    return {
      returnId: rma.id,
      rmaNumber: rma.rmaNumber,
      status: rma.status,
      duplicate: !!rma.duplicate,
    };
  }
}
