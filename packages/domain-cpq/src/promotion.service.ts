import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Promotions and voucher codes (CPQ-006/COM-012). A promotion is a
 * named percentage discount redeemed against a sales order by code.
 * Guardrails: active flag, validity window, minimum order total and a
 * redemption budget. Redemption is idempotent per order — the unique
 * (tenant, promotion, order) row makes a retry a CONFLICT, and the
 * counter increment is guarded so the budget can never be exceeded by
 * concurrent redemptions.
 */

export interface PromotionView {
  id: string;
  code: string;
  name: string;
  discountPct: string;
  minOrderTotal: string | null;
  maxRedemptions: number | null;
  redemptions: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
}

export interface RedemptionResult {
  promotionId: string;
  promotionCode: string;
  amountOff: number;
}

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export class PromotionService {
  constructor(private readonly prisma: PrismaClient) {}

  private toView(p: {
    id: string;
    code: string;
    name: string;
    discountPct: { toString(): string };
    minOrderTotal: { toString(): string } | null;
    maxRedemptions: number | null;
    redemptions: number;
    validFrom: Date | null;
    validTo: Date | null;
    active: boolean;
  }): PromotionView {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      discountPct: p.discountPct.toString(),
      minOrderTotal: p.minOrderTotal ? p.minOrderTotal.toString() : null,
      maxRedemptions: p.maxRedemptions,
      redemptions: p.redemptions,
      validFrom: p.validFrom ? p.validFrom.toISOString() : null,
      validTo: p.validTo ? p.validTo.toISOString() : null,
      active: p.active,
    };
  }

  async listPromotions(ctx: RequestContext): Promise<PromotionView[]> {
    const rows = await this.prisma.promotion.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  async createPromotion(
    input: {
      code: string;
      name: string;
      discountPct: number;
      minOrderTotal?: number | undefined;
      maxRedemptions?: number | undefined;
      validFrom?: string | undefined;
      validTo?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<PromotionView> {
    const code = input.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Code must be 3-32 characters: letters, digits, - or _',
      );
    }
    if (!input.name?.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'Name is required');
    }
    if (!Number.isFinite(input.discountPct) || input.discountPct <= 0 || input.discountPct > 100) {
      throw new DomainError('VALIDATION_FAILED', 'Discount must be between 0 and 100 percent');
    }
    if (input.minOrderTotal !== undefined && input.minOrderTotal < 0) {
      throw new DomainError('VALIDATION_FAILED', 'Minimum order total cannot be negative');
    }
    if (
      input.maxRedemptions !== undefined &&
      (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1)
    ) {
      throw new DomainError('VALIDATION_FAILED', 'Redemption budget must be a positive integer');
    }
    const validFrom = input.validFrom ? new Date(input.validFrom) : null;
    const validTo = input.validTo ? new Date(input.validTo) : null;
    if (
      (validFrom && Number.isNaN(validFrom.getTime())) ||
      (validTo && Number.isNaN(validTo.getTime()))
    ) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid validity date');
    }
    if (validFrom && validTo && validFrom >= validTo) {
      throw new DomainError('VALIDATION_FAILED', 'Validity window is inverted');
    }
    try {
      const created = await this.prisma.promotion.create({
        data: {
          tenantId: ctx.tenantId,
          code,
          name: input.name.trim(),
          discountPct: input.discountPct,
          minOrderTotal: input.minOrderTotal ?? null,
          maxRedemptions: input.maxRedemptions ?? null,
          validFrom,
          validTo,
        },
      });
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'cpq.promotion.create',
        objectType: 'Promotion',
        objectId: created.id,
        source: 'api',
        newValues: { code, discountPct: input.discountPct },
      });
      return this.toView(created);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Promotion code ${code} already exists`);
      }
      throw error;
    }
  }

  async setActive(
    promotionId: string,
    active: boolean,
    ctx: RequestContext,
  ): Promise<PromotionView> {
    const promo = await this.prisma.promotion.findFirst({
      where: { id: promotionId, tenantId: ctx.tenantId },
    });
    if (!promo) throw notFound('Promotion', promotionId);
    const updated = await this.prisma.promotion.update({
      where: { id: promo.id },
      data: { active },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'cpq.promotion.set_active',
      objectType: 'Promotion',
      objectId: promo.id,
      source: 'api',
      newValues: { active },
    });
    return this.toView(updated);
  }

  /**
   * Redeem a promotion code against one order. Fail-closed on every
   * guardrail; idempotent per order via the unique redemption row; the
   * budget check and increment happen in one guarded UPDATE so
   * concurrent redemptions cannot overshoot.
   */
  async redeem(
    code: string,
    orderId: string,
    orderTotal: number,
    ctx: RequestContext,
  ): Promise<RedemptionResult> {
    const normalized = code.trim().toUpperCase();
    const promo = await this.prisma.promotion.findFirst({
      where: { tenantId: ctx.tenantId, code: normalized },
    });
    if (!promo || !promo.active) {
      throw new DomainError('VALIDATION_FAILED', 'Unknown or inactive promotion code');
    }
    const now = new Date();
    if ((promo.validFrom && now < promo.validFrom) || (promo.validTo && now > promo.validTo)) {
      throw new DomainError('VALIDATION_FAILED', 'Promotion code is not valid right now');
    }
    if (promo.minOrderTotal !== null && orderTotal < Number(promo.minOrderTotal)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Order total is below the promotion minimum of ${promo.minOrderTotal.toString()}`,
      );
    }
    const amountOff = Math.round(orderTotal * Number(promo.discountPct)) / 100;

    return this.prisma.$transaction(async (tx) => {
      // Budget: guarded increment — 0 rows updated means the budget is spent.
      const bumped = await tx.promotion.updateMany({
        where: {
          id: promo.id,
          tenantId: ctx.tenantId,
          ...(promo.maxRedemptions !== null ? { redemptions: { lt: promo.maxRedemptions } } : {}),
        },
        data: { redemptions: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new DomainError('INVALID_STATE', 'Promotion redemption budget is exhausted');
      }
      try {
        await tx.promotionRedemption.create({
          data: {
            tenantId: ctx.tenantId,
            promotionId: promo.id,
            orderId,
            amountOff,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new DomainError('CONFLICT', 'A promotion was already applied to this order');
        }
        throw error;
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'cpq.promotion.redeem',
        objectType: 'Promotion',
        objectId: promo.id,
        source: 'api',
        newValues: { orderId, amountOff },
      });
      return { promotionId: promo.id, promotionCode: promo.code, amountOff };
    });
  }

  /** Total amount off already granted to an order (0 when none). */
  async discountFor(tenantId: string, orderId: string): Promise<number> {
    const agg = await this.prisma.promotionRedemption.aggregate({
      where: { tenantId, orderId },
      _sum: { amountOff: true },
    });
    return agg._sum.amountOff ? Number(agg._sum.amountOff) : 0;
  }
}
