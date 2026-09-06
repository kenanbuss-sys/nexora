import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Loyalty (COM-013). One loyalty account per CRM customer; the balance
 * is the sum of an append-only transaction ledger. Order accrual is
 * idempotent per order (unique tenant+order+reason), so a retried
 * fulfillment can never double-award points.
 */

export interface LoyaltyView {
  accountId: string;
  points: number;
  transactions: Array<{
    id: string;
    delta: number;
    reason: string;
    orderId: string | null;
    createdAt: string;
  }>;
}

/** Points per unit of currency spent (1 point / 10 spent). */
export const LOYALTY_EARN_DIVISOR = 10;

export class LoyaltyService {
  constructor(private readonly prisma: PrismaClient) {}

  private async ensureAccount(tenantId: string, accountId: string) {
    return this.prisma.loyaltyAccount.upsert({
      where: { tenantId_accountId: { tenantId, accountId } },
      create: { tenantId, accountId },
      update: {},
    });
  }

  async getLoyalty(accountId: string, ctx: RequestContext): Promise<LoyaltyView> {
    const crm = await this.prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
    });
    if (!crm) throw notFound('CrmAccount', accountId);
    const account = await this.prisma.loyaltyAccount.findFirst({
      where: { tenantId: ctx.tenantId, accountId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    return {
      accountId,
      points: account?.points ?? 0,
      transactions: (account?.transactions ?? []).map((t) => ({
        id: t.id,
        delta: t.delta,
        reason: t.reason,
        orderId: t.orderId,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Accrue points for a fulfilled order — floor(total / divisor),
   * idempotent per order. Zero-point orders record nothing.
   */
  async accrueForOrder(
    input: { accountId: string; orderId: string; orderTotal: number },
    ctx: RequestContext,
  ): Promise<{ awarded: number; duplicate: boolean }> {
    const points = Math.floor(input.orderTotal / LOYALTY_EARN_DIVISOR);
    if (points <= 0) return { awarded: 0, duplicate: false };
    const account = await this.ensureAccount(ctx.tenantId, input.accountId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.loyaltyTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            loyaltyAccountId: account.id,
            delta: points,
            reason: 'order',
            orderId: input.orderId,
            createdBy: ctx.userId ?? null,
          },
        });
        await tx.loyaltyAccount.update({
          where: { id: account.id },
          data: { points: { increment: points } },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return { awarded: 0, duplicate: true };
      }
      throw error;
    }
    return { awarded: points, duplicate: false };
  }

  /** Manual adjustment (positive or negative), audited; balance never goes below zero. */
  async adjust(
    input: { accountId: string; delta: number; reason: string },
    ctx: RequestContext,
  ): Promise<LoyaltyView> {
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Delta must be a non-zero integer');
    }
    if (!input.reason?.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'A reason is required');
    }
    const crm = await this.prisma.crmAccount.findFirst({
      where: { id: input.accountId, tenantId: ctx.tenantId },
    });
    if (!crm) throw notFound('CrmAccount', input.accountId);
    const account = await this.ensureAccount(ctx.tenantId, input.accountId);
    if (input.delta < 0 && account.points + input.delta < 0) {
      throw new DomainError('INVALID_STATE', 'Balance cannot go below zero');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.loyaltyTransaction.create({
        data: {
          tenantId: ctx.tenantId,
          loyaltyAccountId: account.id,
          delta: input.delta,
          reason: input.reason.trim(),
          createdBy: ctx.userId ?? null,
        },
      });
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: { points: { increment: input.delta } },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'crm.loyalty.adjust',
        objectType: 'CrmAccount',
        objectId: input.accountId,
        source: 'api',
        newValues: { delta: input.delta, reason: input.reason.trim() },
      });
    });
    return this.getLoyalty(input.accountId, ctx);
  }
}
