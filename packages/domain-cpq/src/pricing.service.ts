import { writeAudit } from '@nexora/audit';
import type { PriceListStatus, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * CPQ pricing — price lists (CPQ-001) with quantity breaks (CPQ-002).
 * Prices live on ACTIVE lists; quotes pin the list they priced against.
 */

export interface PriceListView {
  id: string;
  code: string;
  name: string;
  currency: string;
  status: PriceListStatus;
  accountId: string | null;
}

export interface PriceEntryView {
  id: string;
  skuId: string;
  minQty: string;
  unitPrice: string;
}

/**
 * Formula pricing (CPQ-009): per-SKU price formulas from versioned
 * configuration (sales.pricingFormulas: [{ skuCode, formula }]), over
 * the variables `cost` (standard cost) and `qty`. Formulas are parsed
 * with a strict arithmetic grammar — never evaluated as code.
 */
export interface PricingConfigGate {
  getPricingFormulas(tenantId: string): Promise<Array<{ skuCode: string; formula: string }>>;
}

const FORMULA_TOKEN_RE = /^(?:\d+(?:\.\d+)?|cost|qty|[+\-*/()]|\s+)+$/;

/** Strict recursive-descent evaluator for + - * / ( ) cost qty. */
export function evaluateFormula(
  formula: string,
  vars: { cost: number; qty: number },
): number | null {
  if (formula.length > 200 || !FORMULA_TOKEN_RE.test(formula)) return null;
  const tokens = formula.match(/\d+(?:\.\d+)?|cost|qty|[+\-*/()]/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor(): number {
    const token = next();
    if (token === undefined) throw new Error('unexpected end');
    if (token === '(') {
      const value = parseExpr();
      if (next() !== ')') throw new Error('unbalanced');
      return value;
    }
    if (token === '-') return -parseFactor();
    if (token === 'cost') return vars.cost;
    if (token === 'qty') return vars.qty;
    const parsed = Number(token);
    if (!Number.isFinite(parsed)) throw new Error('bad token');
    return parsed;
  }
  try {
    const result = parseExpr();
    if (pos !== tokens.length) return null;
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export class PricingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config?: PricingConfigGate,
  ) {}

  /**
   * Formula price for one SKU (CPQ-009), or null when no formula (or
   * no evaluable formula) applies.
   */
  async formulaPrice(
    skuId: string,
    quantity: number,
    ctx: RequestContext,
  ): Promise<{ unitPrice: string; formula: string } | null> {
    if (!this.config) return null;
    const sku = await this.prisma.sku.findFirst({
      where: { id: skuId, tenantId: ctx.tenantId },
      select: { code: true, standardCost: true },
    });
    if (!sku) return null;
    const formulas = await this.config.getPricingFormulas(ctx.tenantId);
    const match = formulas.find((f) => f.skuCode === sku.code);
    if (!match) return null;
    const cost = sku.standardCost === null ? 0 : Number(sku.standardCost);
    const value = evaluateFormula(match.formula, { cost, qty: quantity });
    if (value === null || value < 0) return null;
    return { unitPrice: (Math.round(value * 10000) / 10000).toFixed(4), formula: match.formula };
  }

  async listPriceLists(ctx: RequestContext): Promise<PriceListView[]> {
    const lists = await this.prisma.priceList.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
      take: 100,
    });
    return lists.map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      currency: l.currency,
      status: l.status,
      accountId: l.accountId,
    }));
  }

  async createPriceList(
    input: { code: string; name: string; currency: string; accountId?: string | undefined },
    ctx: RequestContext,
  ): Promise<PriceListView> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.priceList.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } },
      });
      if (existing) throw new DomainError('CONFLICT', 'A price list with this code already exists');
      const list = await tx.priceList.create({
        data: {
          tenantId: ctx.tenantId,
          code: input.code,
          name: input.name,
          currency: input.currency.toUpperCase(),
          accountId: input.accountId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'cpq.pricelist.create',
        objectType: 'PriceList',
        objectId: list.id,
        source: 'api',
        newValues: { code: list.code, currency: list.currency, accountId: list.accountId },
      });
      return {
        id: list.id,
        code: list.code,
        name: list.name,
        currency: list.currency,
        status: list.status,
        accountId: list.accountId,
      };
    });
  }

  /**
   * Contract pricing (B2B-004/CPQ-014): the newest ACTIVE price list
   * bound to this account and valid right now, or null.
   */
  async contractListFor(accountId: string, ctx: RequestContext): Promise<PriceListView | null> {
    const now = new Date();
    const list = await this.prisma.priceList.findFirst({
      where: {
        tenantId: ctx.tenantId,
        accountId,
        status: 'ACTIVE',
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (!list) return null;
    return {
      id: list.id,
      code: list.code,
      name: list.name,
      currency: list.currency,
      status: list.status,
      accountId: list.accountId,
    };
  }

  async setPrice(
    input: { priceListId: string; skuId: string; minQty?: number | undefined; unitPrice: number },
    ctx: RequestContext,
  ): Promise<PriceEntryView> {
    if (!(input.unitPrice >= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Unit price must be non-negative');
    }
    const list = await this.prisma.priceList.findFirst({
      where: { id: input.priceListId, tenantId: ctx.tenantId },
    });
    if (!list) throw notFound('PriceList', input.priceListId);
    if (list.status === 'ARCHIVED') {
      throw new DomainError('INVALID_STATE', 'Archived price lists cannot change');
    }
    const minQty = input.minQty ?? 1;
    const entry = await this.prisma.priceListEntry.upsert({
      where: {
        tenantId_priceListId_skuId_minQty: {
          tenantId: ctx.tenantId,
          priceListId: input.priceListId,
          skuId: input.skuId,
          minQty,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        priceListId: input.priceListId,
        skuId: input.skuId,
        minQty,
        unitPrice: input.unitPrice,
      },
      update: { unitPrice: input.unitPrice },
    });
    return {
      id: entry.id,
      skuId: entry.skuId,
      minQty: entry.minQty.toString(),
      unitPrice: entry.unitPrice.toString(),
    };
  }

  async getEntries(priceListId: string, ctx: RequestContext): Promise<PriceEntryView[]> {
    const list = await this.prisma.priceList.findFirst({
      where: { id: priceListId, tenantId: ctx.tenantId },
    });
    if (!list) throw notFound('PriceList', priceListId);
    const entries = await this.prisma.priceListEntry.findMany({
      where: { tenantId: ctx.tenantId, priceListId },
      orderBy: [{ skuId: 'asc' }, { minQty: 'asc' }],
      take: 500,
    });
    return entries.map((e) => ({
      id: e.id,
      skuId: e.skuId,
      minQty: e.minQty.toString(),
      unitPrice: e.unitPrice.toString(),
    }));
  }

  /** Guarded DRAFT -> ACTIVE; emits price_list.published. */
  async publishPriceList(priceListId: string, ctx: RequestContext): Promise<PriceListView> {
    const flipped = await this.prisma.priceList.updateMany({
      where: { id: priceListId, tenantId: ctx.tenantId, status: 'DRAFT' },
      data: { status: 'ACTIVE' },
    });
    if (flipped.count === 0) throw new DomainError('INVALID_STATE', 'Price list is not a draft');
    return this.prisma.$transaction(async (tx) => {
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PRICE_LIST_PUBLISHED,
        aggregateType: 'PriceList',
        aggregateId: priceListId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        payload: { priceListId },
      });
      const list = await tx.priceList.findFirst({
        where: { id: priceListId, tenantId: ctx.tenantId },
      });
      const l = list as NonNullable<typeof list>;
      return {
        id: l.id,
        code: l.code,
        name: l.name,
        currency: l.currency,
        status: l.status,
        accountId: l.accountId,
      };
    });
  }

  /**
   * Cost-aware price suggestions (CPQ-010): for every active SKU with a
   * standard cost, propose cost x (1 + targetMarginPct / 100).
   */
  async costBasedSuggestions(
    targetMarginPct: number,
    ctx: RequestContext,
  ): Promise<
    Array<{ skuId: string; code: string; name: string; standardCost: string; suggested: string }>
  > {
    const skus = await this.prisma.sku.findMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE', standardCost: { not: null } },
      orderBy: [{ code: 'asc' }],
      take: 200,
    });
    return skus.map((sku) => {
      const cost = Number(sku.standardCost);
      return {
        skuId: sku.id,
        code: sku.code,
        name: sku.name,
        standardCost: cost.toFixed(2),
        suggested: (Math.round(cost * (1 + targetMarginPct / 100) * 100) / 100).toFixed(2),
      };
    });
  }

  /**
   * Resolves the effective unit price for a SKU/quantity on an ACTIVE list:
   * the entry with the highest minQty that is <= quantity (quantity break).
   */
  async resolvePrice(
    priceListId: string,
    skuId: string,
    quantity: number,
    ctx: RequestContext,
  ): Promise<{ unitPrice: string; currency: string }> {
    const list = await this.prisma.priceList.findFirst({
      where: { id: priceListId, tenantId: ctx.tenantId },
    });
    if (!list) throw notFound('PriceList', priceListId);
    if (list.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'Prices can only be resolved from an active list');
    }
    const entry = await this.prisma.priceListEntry.findFirst({
      where: {
        tenantId: ctx.tenantId,
        priceListId,
        skuId,
        minQty: { lte: quantity },
      },
      orderBy: { minQty: 'desc' },
    });
    if (!entry) {
      // Formula fallback (CPQ-009): a configured formula prices SKUs
      // that carry no explicit entry on the list.
      const formula = await this.formulaPrice(skuId, quantity, ctx);
      if (formula) return { unitPrice: formula.unitPrice, currency: list.currency };
      throw notFound('Price for SKU', skuId);
    }
    return { unitPrice: entry.unitPrice.toString(), currency: list.currency };
  }
}
