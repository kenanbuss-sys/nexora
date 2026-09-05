import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Effective-dated exchange rates (FIN reference data). Rows are
 * immutable: a correction is a new row with a newer validFrom, so the
 * rate used on any past date stays reproducible. Lookup falls back to
 * the inverse pair when only the opposite direction is maintained.
 */

const ISO = /^[A-Z]{3}$/;

export interface ExchangeRateView {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  validFrom: string;
}

export class ExchangeRateService {
  constructor(private readonly prisma: PrismaClient) {}

  async listRates(ctx: RequestContext): Promise<ExchangeRateView[]> {
    const rates = await this.prisma.exchangeRate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ baseCurrency: 'asc' }, { quoteCurrency: 'asc' }, { validFrom: 'desc' }],
      take: 200,
    });
    return rates.map((r) => ({
      id: r.id,
      baseCurrency: r.baseCurrency,
      quoteCurrency: r.quoteCurrency,
      rate: r.rate.toString(),
      validFrom: r.validFrom.toISOString(),
    }));
  }

  async setRate(
    input: {
      baseCurrency: string;
      quoteCurrency: string;
      rate: number;
      validFrom?: Date | undefined;
    },
    ctx: RequestContext,
  ): Promise<ExchangeRateView> {
    const base = input.baseCurrency.toUpperCase();
    const quote = input.quoteCurrency.toUpperCase();
    if (!ISO.test(base) || !ISO.test(quote)) {
      throw new DomainError('VALIDATION_FAILED', 'Currencies must be 3-letter ISO codes');
    }
    if (base === quote) {
      throw new DomainError('VALIDATION_FAILED', 'Base and quote must differ');
    }
    if (!(input.rate > 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Rate must be positive');
    }
    const validFrom = input.validFrom ?? new Date();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.exchangeRate.create({
          data: {
            tenantId: ctx.tenantId,
            baseCurrency: base,
            quoteCurrency: quote,
            rate: input.rate,
            validFrom,
          },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'fin.rate.set',
          objectType: 'ExchangeRate',
          objectId: created.id,
          source: 'api',
          newValues: { base, quote, rate: input.rate, validFrom: validFrom.toISOString() },
        });
        return created;
      });
      return {
        id: row.id,
        baseCurrency: row.baseCurrency,
        quoteCurrency: row.quoteCurrency,
        rate: row.rate.toString(),
        validFrom: row.validFrom.toISOString(),
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', 'A rate for this pair and validFrom already exists');
      }
      throw error;
    }
  }

  /**
   * The rate in force for base→quote on the given date: the newest
   * direct row, else the inverse pair's reciprocal; null when neither
   * direction is maintained.
   */
  async effectiveRate(
    tenantId: string,
    base: string,
    quote: string,
    on: Date,
  ): Promise<number | null> {
    const direct = await this.prisma.exchangeRate.findFirst({
      where: {
        tenantId,
        baseCurrency: base,
        quoteCurrency: quote,
        validFrom: { lte: on },
      },
      orderBy: { validFrom: 'desc' },
    });
    if (direct) return Number(direct.rate);
    const inverse = await this.prisma.exchangeRate.findFirst({
      where: {
        tenantId,
        baseCurrency: quote,
        quoteCurrency: base,
        validFrom: { lte: on },
      },
      orderBy: { validFrom: 'desc' },
    });
    if (inverse && Number(inverse.rate) > 0) return 1 / Number(inverse.rate);
    return null;
  }

  async convert(
    input: { from: string; to: string; amount: number; on?: Date | undefined },
    ctx: RequestContext,
  ): Promise<{ from: string; to: string; amount: number; rate: number; converted: string }> {
    const from = input.from.toUpperCase();
    const to = input.to.toUpperCase();
    if (!ISO.test(from) || !ISO.test(to)) {
      throw new DomainError('VALIDATION_FAILED', 'Currencies must be 3-letter ISO codes');
    }
    if (!Number.isFinite(input.amount)) {
      throw new DomainError('VALIDATION_FAILED', 'Amount must be a number');
    }
    if (from === to) {
      return { from, to, amount: input.amount, rate: 1, converted: input.amount.toFixed(2) };
    }
    const on = input.on ?? new Date();
    const rate = await this.effectiveRate(ctx.tenantId, from, to, on);
    if (rate === null) {
      throw new DomainError('VALIDATION_FAILED', `No exchange rate maintained for ${from}→${to}`);
    }
    return {
      from,
      to,
      amount: input.amount,
      rate,
      converted: (input.amount * rate).toFixed(2),
    };
  }
}
