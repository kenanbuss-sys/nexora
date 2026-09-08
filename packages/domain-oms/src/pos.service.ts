import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { OrderService } from './order.service';

/**
 * Point of sale (COM-003). A register opens one session at a time;
 * sales are ordinary OMS orders on the pos channel (ledger-driven
 * stock, same invariants), cash accumulates on the session and is
 * reconciled at close against the counted drawer.
 */

export interface PosSessionView {
  id: string;
  registerCode: string;
  status: string;
  openingFloat: string;
  cashSales: string;
  closingCount: string | null;
  expectedCash: string;
  variance: string | null;
  openedAt: string;
  closedAt: string | null;
}

const REGISTER_RE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export class PosService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly orders: OrderService,
  ) {}

  private toView(row: {
    id: string;
    registerCode: string;
    status: string;
    openingFloat: unknown;
    cashSales: unknown;
    closingCount: unknown;
    openedAt: Date;
    closedAt: Date | null;
  }): PosSessionView {
    const expected = Number(row.openingFloat) + Number(row.cashSales);
    return {
      id: row.id,
      registerCode: row.registerCode,
      status: row.status,
      openingFloat: String(row.openingFloat),
      cashSales: String(row.cashSales),
      closingCount: row.closingCount === null ? null : String(row.closingCount),
      expectedCash: expected.toFixed(2),
      variance: row.closingCount === null ? null : (Number(row.closingCount) - expected).toFixed(2),
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    };
  }

  async listSessions(ctx: RequestContext): Promise<PosSessionView[]> {
    const rows = await this.prisma.posSession.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ openedAt: 'desc' }],
      take: 100,
    });
    return rows.map((row) => this.toView(row));
  }

  async openSession(
    input: { registerCode: string; openingFloat?: number | undefined },
    ctx: RequestContext,
  ): Promise<PosSessionView> {
    const registerCode = input.registerCode.trim().toUpperCase();
    if (!REGISTER_RE.test(registerCode)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid register code');
    }
    if (input.openingFloat !== undefined && input.openingFloat < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Opening float cannot be negative');
    }
    const open = await this.prisma.posSession.findFirst({
      where: { tenantId: ctx.tenantId, registerCode, status: 'OPEN' },
      select: { id: true },
    });
    if (open) {
      throw new DomainError('CONFLICT', `Register ${registerCode} already has an open session`);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.posSession.create({
        data: {
          tenantId: ctx.tenantId,
          registerCode,
          openingFloat: input.openingFloat ?? 0,
          openedBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'com.pos.open',
        objectType: 'PosSession',
        objectId: created.id,
        source: 'api',
        newValues: { registerCode, openingFloat: input.openingFloat ?? 0 },
      });
      return created;
    });
    return this.toView(row);
  }

  /** A sale: one order on the pos channel, cash onto the drawer. */
  async recordSale(
    input: {
      sessionId: string;
      accountId: string;
      warehouseId: string;
      currency: string;
      lines: Array<{ code: string; quantity: number }>;
      cashAmount: number;
    },
    ctx: RequestContext,
  ): Promise<{ session: PosSessionView; orderId: string; unknownCodes: string[] }> {
    if (!(input.cashAmount >= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Cash amount cannot be negative');
    }
    const session = await this.prisma.posSession.findFirst({
      where: { id: input.sessionId, tenantId: ctx.tenantId },
    });
    if (!session) throw notFound('PosSession', input.sessionId);
    if (session.status !== 'OPEN') {
      throw new DomainError('INVALID_STATE', 'The session is closed');
    }
    const { order, unknownCodes } = await this.orders.quickOrder(
      {
        accountId: input.accountId,
        warehouseId: input.warehouseId,
        currency: input.currency,
        lines: input.lines,
        fulfillmentType: 'PICKUP',
        channel: 'pos',
      },
      ctx,
    );
    await this.orders.confirmOrder(order.id, ctx, { allowBackorder: false });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.posSession.update({
        where: { id: session.id },
        data: { cashSales: { increment: input.cashAmount } },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'com.pos.sale',
        objectType: 'PosSession',
        objectId: session.id,
        source: 'api',
        newValues: { orderId: order.id, cashAmount: input.cashAmount },
      });
      return row;
    });
    return { session: this.toView(updated), orderId: order.id, unknownCodes };
  }

  async closeSession(
    input: { sessionId: string; closingCount: number },
    ctx: RequestContext,
  ): Promise<PosSessionView> {
    if (!(input.closingCount >= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Closing count cannot be negative');
    }
    const session = await this.prisma.posSession.findFirst({
      where: { id: input.sessionId, tenantId: ctx.tenantId },
    });
    if (!session) throw notFound('PosSession', input.sessionId);
    if (session.status !== 'OPEN') {
      throw new DomainError('INVALID_STATE', 'The session is already closed');
    }
    const expected = Number(session.openingFloat) + Number(session.cashSales);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.posSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED', closingCount: input.closingCount, closedAt: new Date() },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'com.pos.close',
        objectType: 'PosSession',
        objectId: session.id,
        source: 'api',
        newValues: {
          closingCount: input.closingCount,
          expected: expected.toFixed(2),
          variance: (input.closingCount - expected).toFixed(2),
        },
      });
      return row;
    });
    return this.toView(updated);
  }
}
