import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Rule-based automatic discounts (CPQ). A rule optionally scopes to a
 * CRM account and/or SKU, applies from a quantity floor within a
 * validity window, and the best match — most specific first, then the
 * highest percentage — becomes the default discount on a quote line.
 * Explicit discounts override rules; the margin-floor approval applies
 * to the resulting discount either way.
 */

export interface DiscountRuleView {
  id: string;
  name: string;
  active: boolean;
  accountId: string | null;
  skuId: string | null;
  minQty: string;
  percentage: string;
  validFrom: string | null;
  validTo: string | null;
}

export interface AppliedDiscount {
  ruleId: string;
  ruleName: string;
  percentage: number;
}

export class DiscountRuleService {
  constructor(private readonly prisma: PrismaClient) {}

  private toView(r: {
    id: string;
    name: string;
    active: boolean;
    accountId: string | null;
    skuId: string | null;
    minQty: { toString(): string };
    percentage: { toString(): string };
    validFrom: Date | null;
    validTo: Date | null;
  }): DiscountRuleView {
    return {
      id: r.id,
      name: r.name,
      active: r.active,
      accountId: r.accountId,
      skuId: r.skuId,
      minQty: r.minQty.toString(),
      percentage: r.percentage.toString(),
      validFrom: r.validFrom ? r.validFrom.toISOString() : null,
      validTo: r.validTo ? r.validTo.toISOString() : null,
    };
  }

  async listRules(ctx: RequestContext): Promise<DiscountRuleView[]> {
    const rules = await this.prisma.discountRule.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ active: 'desc' }, { percentage: 'desc' }],
      take: 200,
    });
    return rules.map((r) => this.toView(r));
  }

  async createRule(
    input: {
      name: string;
      percentage: number;
      accountId?: string | undefined;
      skuId?: string | undefined;
      minQty?: number | undefined;
      validFrom?: Date | undefined;
      validTo?: Date | undefined;
    },
    ctx: RequestContext,
  ): Promise<DiscountRuleView> {
    if (!(input.percentage > 0) || input.percentage > 100) {
      throw new DomainError('VALIDATION_FAILED', 'Percentage must be between 0 and 100');
    }
    if (input.minQty !== undefined && !(input.minQty > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'minQty must be positive');
    }
    if (input.validFrom && input.validTo && input.validFrom >= input.validTo) {
      throw new DomainError('VALIDATION_FAILED', 'validFrom must be before validTo');
    }
    if (input.accountId) {
      const account = await this.prisma.crmAccount.findFirst({
        where: { id: input.accountId, tenantId: ctx.tenantId },
      });
      if (!account) throw notFound('CrmAccount', input.accountId);
    }
    if (input.skuId) {
      const sku = await this.prisma.sku.findFirst({
        where: { id: input.skuId, tenantId: ctx.tenantId },
      });
      if (!sku) throw notFound('Sku', input.skuId);
    }
    const rule = await this.prisma.$transaction(async (tx) => {
      const created = await tx.discountRule.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.name.trim(),
          percentage: input.percentage,
          accountId: input.accountId ?? null,
          skuId: input.skuId ?? null,
          minQty: input.minQty ?? 1,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'cpq.discount_rule.create',
        objectType: 'DiscountRule',
        objectId: created.id,
        source: 'api',
        newValues: { name: created.name, percentage: input.percentage },
      });
      return created;
    });
    return this.toView(rule);
  }

  async setRuleActive(
    ruleId: string,
    active: boolean,
    ctx: RequestContext,
  ): Promise<DiscountRuleView> {
    const rule = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.discountRule.findFirst({
        where: { id: ruleId, tenantId: ctx.tenantId },
      });
      if (!existing) throw notFound('DiscountRule', ruleId);
      const updated = await tx.discountRule.update({
        where: { id: existing.id },
        data: { active },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'cpq.discount_rule.set_active',
        objectType: 'DiscountRule',
        objectId: existing.id,
        source: 'api',
        previousValues: { active: existing.active },
        newValues: { active },
      });
      return updated;
    });
    return this.toView(rule);
  }

  /**
   * The best applicable rule for (account, sku, quantity) right now:
   * most specific first (account+sku > account > sku > generic), then
   * the highest percentage. Null when nothing applies.
   */
  async bestDiscount(
    tenantId: string,
    accountId: string,
    skuId: string,
    quantity: number,
  ): Promise<AppliedDiscount | null> {
    const now = new Date();
    const rules = await this.prisma.discountRule.findMany({
      where: {
        tenantId,
        active: true,
        minQty: { lte: quantity },
        AND: [
          { OR: [{ accountId: null }, { accountId }] },
          { OR: [{ skuId: null }, { skuId }] },
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
    });
    if (rules.length === 0) return null;
    const specificity = (r: { accountId: string | null; skuId: string | null }) =>
      (r.accountId ? 2 : 0) + (r.skuId ? 1 : 0);
    rules.sort(
      (a, b) => specificity(b) - specificity(a) || Number(b.percentage) - Number(a.percentage),
    );
    const best = rules[0]!;
    return { ruleId: best.id, ruleName: best.name, percentage: Number(best.percentage) };
  }
}
