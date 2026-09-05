import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Financial depth — cost centers (FIN-016), budgets with actuals
 * (FIN-008), receivable/payable aging (FIN-011/012 read models) and an
 * operational cash-flow view (FIN-010).
 *
 * Aging and cash flow never store state: they are tenant-scoped
 * aggregations over the invoice and payment ledgers, so they cannot
 * drift from the transactional truth.
 */

export interface CostCenterView {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface BudgetRow {
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  periodKey: string;
  budget: string;
  actual: string;
  remaining: string;
  currency: string;
}

export interface AgingBucketRow {
  bucket: 'NOT_DUE' | 'D0_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';
  count: number;
  amount: string;
}

export interface CashflowRow {
  month: string;
  cashIn: string;
  cashOut: string;
  net: string;
}

const PERIOD_PATTERN = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

export class TreasuryService {
  constructor(private readonly prisma: PrismaClient) {}

  // ------------------------------------------------------------ cost centers

  async listCostCenters(ctx: RequestContext): Promise<CostCenterView[]> {
    const centers = await this.prisma.costCenter.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
    });
    return centers.map((c) => ({ id: c.id, code: c.code, name: c.name, active: c.active }));
  }

  async createCostCenter(
    input: { code: string; name: string },
    ctx: RequestContext,
  ): Promise<CostCenterView> {
    try {
      const center = await this.prisma.$transaction(async (tx) => {
        const created = await tx.costCenter.create({
          data: { tenantId: ctx.tenantId, code: input.code, name: input.name },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'fin.cost_center.create',
          objectType: 'CostCenter',
          objectId: created.id,
          source: 'api',
          newValues: { code: input.code, name: input.name },
        });
        return created;
      });
      return { id: center.id, code: center.code, name: center.name, active: center.active };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Cost center '${input.code}' already exists`);
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------- budgets

  async setBudget(
    input: { costCenterId: string; periodKey: string; amount: number; currency: string },
    ctx: RequestContext,
  ): Promise<void> {
    if (!PERIOD_PATTERN.test(input.periodKey)) {
      throw new DomainError('VALIDATION_FAILED', "Period must be 'YYYY' or 'YYYY-MM'");
    }
    if (!(input.amount >= 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Budget amount cannot be negative');
    }
    const center = await this.prisma.costCenter.findFirst({
      where: { id: input.costCenterId, tenantId: ctx.tenantId },
    });
    if (!center) throw notFound('CostCenter', input.costCenterId);
    await this.prisma.$transaction(async (tx) => {
      await tx.budget.upsert({
        where: {
          tenantId_costCenterId_periodKey: {
            tenantId: ctx.tenantId,
            costCenterId: input.costCenterId,
            periodKey: input.periodKey,
          },
        },
        create: {
          tenantId: ctx.tenantId,
          costCenterId: input.costCenterId,
          periodKey: input.periodKey,
          amount: input.amount,
          currency: input.currency,
        },
        update: { amount: input.amount, currency: input.currency },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'fin.budget.set',
        objectType: 'CostCenter',
        objectId: input.costCenterId,
        source: 'api',
        newValues: { periodKey: input.periodKey, amount: input.amount },
      });
    });
  }

  private periodRange(periodKey: string): { from: Date; to: Date } {
    if (periodKey.length === 4) {
      const year = Number(periodKey);
      return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
    }
    const [y, m] = periodKey.split('-').map(Number);
    return {
      from: new Date(Date.UTC(y!, m! - 1, 1)),
      to: new Date(Date.UTC(y!, m!, 1)),
    };
  }

  /** Budget vs actual per cost center; actual = linked supplier invoices. */
  async budgetReport(periodKey: string, ctx: RequestContext): Promise<BudgetRow[]> {
    if (!PERIOD_PATTERN.test(periodKey)) {
      throw new DomainError('VALIDATION_FAILED', "Period must be 'YYYY' or 'YYYY-MM'");
    }
    const { from, to } = this.periodRange(periodKey);
    const budgets = await this.prisma.budget.findMany({
      where: { tenantId: ctx.tenantId, periodKey },
      include: { costCenter: true },
    });
    const rows: BudgetRow[] = [];
    for (const b of budgets) {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          invoiceType: 'SUPPLIER',
          costCenterId: b.costCenterId,
          status: { not: 'VOID' },
          issuedAt: { gte: from, lt: to },
        },
        select: { total: true },
      });
      const actual = invoices.reduce((s, i) => s + Number(i.total), 0);
      const budget = Number(b.amount);
      rows.push({
        costCenterId: b.costCenterId,
        costCenterCode: b.costCenter.code,
        costCenterName: b.costCenter.name,
        periodKey,
        budget: budget.toFixed(2),
        actual: actual.toFixed(2),
        remaining: (budget - actual).toFixed(2),
        currency: b.currency,
      });
    }
    return rows.sort((a, z) => a.costCenterCode.localeCompare(z.costCenterCode));
  }

  /** Attributes an invoice to a cost center (FIN-016). */
  async assignInvoiceCostCenter(
    invoiceId: string,
    costCenterId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const center = await this.prisma.costCenter.findFirst({
      where: { id: costCenterId, tenantId: ctx.tenantId, active: true },
    });
    if (!center) throw notFound('CostCenter', costCenterId);
    const updated = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, tenantId: ctx.tenantId },
      data: { costCenterId },
    });
    if (updated.count === 0) throw notFound('Invoice', invoiceId);
  }

  // ------------------------------------------------------------------ aging

  /** Receivable/payable aging by due date (FIN-011/012). */
  async aging(
    invoiceType: 'CUSTOMER' | 'SUPPLIER',
    ctx: RequestContext,
  ): Promise<{ buckets: AgingBucketRow[]; totalOpen: string }> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        invoiceType,
        status: { in: ['OPEN', 'PARTIALLY_PAID'] },
      },
    });
    const now = Date.now();
    const buckets: Record<AgingBucketRow['bucket'], { count: number; amount: number }> = {
      NOT_DUE: { count: 0, amount: 0 },
      D0_30: { count: 0, amount: 0 },
      D31_60: { count: 0, amount: 0 },
      D61_90: { count: 0, amount: 0 },
      D90_PLUS: { count: 0, amount: 0 },
    };
    let totalOpen = 0;
    for (const invoice of invoices) {
      const open = Number(invoice.total) - Number(invoice.paidAmount);
      if (open <= 0) continue;
      totalOpen += open;
      const due = invoice.dueAt ? invoice.dueAt.getTime() : null;
      let bucket: AgingBucketRow['bucket'];
      if (due === null || due >= now) bucket = 'NOT_DUE';
      else {
        const daysLate = Math.floor((now - due) / 86_400_000);
        bucket =
          daysLate <= 30
            ? 'D0_30'
            : daysLate <= 60
              ? 'D31_60'
              : daysLate <= 90
                ? 'D61_90'
                : 'D90_PLUS';
      }
      buckets[bucket].count += 1;
      buckets[bucket].amount += open;
    }
    return {
      buckets: (Object.keys(buckets) as AgingBucketRow['bucket'][]).map((k) => ({
        bucket: k,
        count: buckets[k].count,
        amount: buckets[k].amount.toFixed(2),
      })),
      totalOpen: totalOpen.toFixed(2),
    };
  }

  // -------------------------------------------------------------- cash flow

  /** Monthly cash in/out from matched payments (FIN-010). */
  async cashflow(months: number, ctx: RequestContext): Promise<CashflowRow[]> {
    const span = Math.min(Math.max(months, 1), 24);
    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - (span - 1), 1);
    from.setUTCHours(0, 0, 0, 0);
    const payments = await this.prisma.payment.findMany({
      where: { tenantId: ctx.tenantId, receivedAt: { gte: from } },
      include: { invoice: { select: { invoiceType: true } } },
    });
    const rows = new Map<string, { cashIn: number; cashOut: number }>();
    for (let i = 0; i < span; i += 1) {
      const d = new Date(from);
      d.setUTCMonth(from.getUTCMonth() + i);
      rows.set(d.toISOString().slice(0, 7), { cashIn: 0, cashOut: 0 });
    }
    for (const p of payments) {
      const key = p.receivedAt.toISOString().slice(0, 7);
      const row = rows.get(key);
      if (!row) continue;
      if (p.invoice.invoiceType === 'CUSTOMER') row.cashIn += Number(p.amount);
      else row.cashOut += Number(p.amount);
    }
    return [...rows.entries()].map(([month, r]) => ({
      month,
      cashIn: r.cashIn.toFixed(2),
      cashOut: r.cashOut.toFixed(2),
      net: (r.cashIn - r.cashOut).toFixed(2),
    }));
  }
}
