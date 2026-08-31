import type { PrismaClient } from '@nexora/db';
import type { RequestContext } from '@nexora/tenancy';

/**
 * BI & Control Center — governed KPI catalog (BI-003) and read-model
 * analytics computed live from the transactional source of truth:
 * executive summary (BI-001), inventory (BI-009), manufacturing
 * (BI-010) and customer (BI-011) analytics.
 *
 * Read-only by design: this domain never mutates business data and
 * every query is tenant-scoped. Definitions live in code so the KPI
 * meaning is versioned with the platform (semantic layer foundation,
 * BI-004).
 */

export interface KpiDefinition {
  key: string;
  name: string;
  description: string;
  unit: string;
  domain: string;
}

/** Governed KPI catalog (BI-003): the single source of KPI meaning. */
export const KPI_CATALOG: KpiDefinition[] = [
  {
    key: 'revenue.invoiced',
    name: 'Invoiced revenue',
    description: 'Sum of non-void customer invoices',
    unit: 'currency',
    domain: 'FIN',
  },
  {
    key: 'ar.open',
    name: 'Open receivables',
    description: 'Customer invoice totals minus matched payments',
    unit: 'currency',
    domain: 'FIN',
  },
  {
    key: 'ap.open',
    name: 'Open payables',
    description: 'Supplier invoice totals minus matched payments',
    unit: 'currency',
    domain: 'FIN',
  },
  {
    key: 'orders.open',
    name: 'Open sales orders',
    description: 'Confirmed or held orders not yet fulfilled',
    unit: 'count',
    domain: 'OMS',
  },
  {
    key: 'quotes.pipeline',
    name: 'Quote pipeline',
    description: 'Total value of sent quotes awaiting a decision',
    unit: 'currency',
    domain: 'CPQ',
  },
  {
    key: 'wip.orders',
    name: 'Work in progress',
    description: 'Released, running or paused work orders',
    unit: 'count',
    domain: 'MES',
  },
  {
    key: 'scrap.rate',
    name: 'Scrap rate',
    description: 'Scrap over good+scrap across completed work orders',
    unit: 'percent',
    domain: 'MES',
  },
  {
    key: 'ncr.open',
    name: 'Open NCRs',
    description: 'Unresolved nonconformance reports',
    unit: 'count',
    domain: 'QC',
  },
];

export interface ExecutiveSummary {
  revenue: string;
  openReceivables: string;
  openPayables: string;
  openOrders: number;
  quotePipeline: string;
  wipOrders: number;
  scrapRatePct: string;
  openNcrs: number;
}

export interface InventoryAnalyticsRow {
  warehouseId: string;
  warehouseCode: string;
  movements: number;
  activeReservations: number;
}

export interface ManufacturingAnalytics {
  byStatus: Record<string, number>;
  completed: number;
  goodTotal: string;
  scrapTotal: string;
  scrapRatePct: string;
  avgCycleMinutes: string;
}

export interface CustomerAnalyticsRow {
  accountId: string;
  orders: number;
  revenue: string;
  currency: string;
}

export class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  kpiCatalog(): KpiDefinition[] {
    return KPI_CATALOG;
  }

  /** Executive dashboard numbers (BI-001), computed live. */
  async executiveSummary(ctx: RequestContext): Promise<ExecutiveSummary> {
    const [invoices, openOrders, sentQuotes, wipOrders, completedWos, openNcrs] = await Promise.all(
      [
        this.prisma.invoice.findMany({
          where: { tenantId: ctx.tenantId, status: { not: 'VOID' } },
        }),
        this.prisma.salesOrder.count({
          where: { tenantId: ctx.tenantId, status: { in: ['CONFIRMED', 'ON_HOLD'] } },
        }),
        this.prisma.quote.findMany({ where: { tenantId: ctx.tenantId, status: 'SENT' } }),
        this.prisma.workOrder.count({
          where: {
            tenantId: ctx.tenantId,
            status: { in: ['RELEASED', 'IN_PROGRESS', 'PAUSED'] },
          },
        }),
        this.prisma.workOrder.findMany({
          where: { tenantId: ctx.tenantId, status: 'COMPLETED' },
        }),
        this.prisma.ncr.count({ where: { tenantId: ctx.tenantId, status: 'OPEN' } }),
      ],
    );

    let revenue = 0;
    let openReceivables = 0;
    let openPayables = 0;
    for (const invoice of invoices) {
      const total = Number(invoice.total);
      const open = total - Number(invoice.paidAmount);
      if (invoice.invoiceType === 'CUSTOMER') {
        revenue += total;
        openReceivables += open;
      } else {
        openPayables += open;
      }
    }
    const pipeline = sentQuotes.reduce((sum, q) => sum + Number(q.total), 0);
    let good = 0;
    let scrap = 0;
    for (const wo of completedWos) {
      good += Number(wo.goodQuantity);
      scrap += Number(wo.scrapQuantity);
    }
    const scrapRate = good + scrap > 0 ? (scrap / (good + scrap)) * 100 : 0;
    const money = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

    return {
      revenue: money(revenue),
      openReceivables: money(openReceivables),
      openPayables: money(openPayables),
      openOrders,
      quotePipeline: money(pipeline),
      wipOrders,
      scrapRatePct: (Math.round(scrapRate * 100) / 100).toFixed(2),
      openNcrs,
    };
  }

  /** Inventory activity per warehouse (BI-009). */
  async inventoryAnalytics(ctx: RequestContext): Promise<InventoryAnalyticsRow[]> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId: ctx.tenantId },
      take: 50,
    });
    const rows: InventoryAnalyticsRow[] = [];
    for (const warehouse of warehouses) {
      const [movements, activeReservations] = await Promise.all([
        this.prisma.stockMovement.count({
          where: { tenantId: ctx.tenantId, warehouseId: warehouse.id },
        }),
        this.prisma.stockReservation.count({
          where: { tenantId: ctx.tenantId, warehouseId: warehouse.id, status: 'ACTIVE' },
        }),
      ]);
      rows.push({
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        movements,
        activeReservations,
      });
    }
    return rows;
  }

  /** Manufacturing performance (BI-010). */
  async manufacturingAnalytics(ctx: RequestContext): Promise<ManufacturingAnalytics> {
    const workOrders = await this.prisma.workOrder.findMany({
      where: { tenantId: ctx.tenantId },
      take: 500,
    });
    const byStatus: Record<string, number> = {};
    let good = 0;
    let scrap = 0;
    let cycleSum = 0;
    let cycleCount = 0;
    for (const wo of workOrders) {
      byStatus[wo.status] = (byStatus[wo.status] ?? 0) + 1;
      if (wo.status === 'COMPLETED') {
        good += Number(wo.goodQuantity);
        scrap += Number(wo.scrapQuantity);
        if (wo.startedAt && wo.completedAt) {
          cycleSum += (wo.completedAt.getTime() - wo.startedAt.getTime()) / 60000;
          cycleCount += 1;
        }
      }
    }
    const scrapRate = good + scrap > 0 ? (scrap / (good + scrap)) * 100 : 0;
    return {
      byStatus,
      completed: byStatus['COMPLETED'] ?? 0,
      goodTotal: good.toString(),
      scrapTotal: scrap.toString(),
      scrapRatePct: (Math.round(scrapRate * 100) / 100).toFixed(2),
      avgCycleMinutes:
        cycleCount > 0 ? (Math.round((cycleSum / cycleCount) * 100) / 100).toFixed(2) : '0',
    };
  }

  /** Top customers by ordered revenue (BI-011). */
  async customerAnalytics(ctx: RequestContext): Promise<CustomerAnalyticsRow[]> {
    const orders = await this.prisma.salesOrder.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'CANCELLED' } },
      take: 500,
    });
    const byAccount = new Map<string, { orders: number; revenue: number; currency: string }>();
    for (const order of orders) {
      const entry = byAccount.get(order.accountId) ?? {
        orders: 0,
        revenue: 0,
        currency: order.currency,
      };
      entry.orders += 1;
      entry.revenue += Number(order.total);
      byAccount.set(order.accountId, entry);
    }
    return [...byAccount.entries()]
      .map(([accountId, entry]) => ({
        accountId,
        orders: entry.orders,
        revenue: (Math.round(entry.revenue * 100) / 100).toFixed(2),
        currency: entry.currency,
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, 20);
  }
}
