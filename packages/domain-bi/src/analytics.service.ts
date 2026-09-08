import { writeAudit } from '@nexora/audit';
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

  /**
   * Governed data export (BI-015): named datasets export as CSV under
   * a dedicated permission, capped, and every export is audited with
   * who took what and how many rows — sensitive exports are never
   * silent.
   */
  async exportDataset(
    dataset: 'orders' | 'invoices' | 'stock_movements',
    ctx: RequestContext,
  ): Promise<{ csv: string; rows: number }> {
    const escape = (value: unknown): string => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    let header: string[] = [];
    let lines: unknown[][] = [];
    if (dataset === 'orders') {
      const rows = await this.prisma.salesOrder.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      header = ['orderNumber', 'status', 'channel', 'currency', 'total', 'createdAt'];
      lines = rows.map((r) => [
        r.orderNumber,
        r.status,
        r.channel,
        r.currency,
        r.total.toString(),
        r.createdAt.toISOString(),
      ]);
    } else if (dataset === 'invoices') {
      const rows = await this.prisma.invoice.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { issuedAt: 'desc' },
        take: 5000,
      });
      header = ['invoiceNumber', 'invoiceType', 'status', 'currency', 'total', 'paidAmount'];
      lines = rows.map((r) => [
        r.invoiceNumber,
        r.invoiceType,
        r.status,
        r.currency,
        r.total.toString(),
        r.paidAmount.toString(),
      ]);
    } else {
      const rows = await this.prisma.stockMovement.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { occurredAt: 'desc' },
        take: 5000,
      });
      header = ['movementType', 'skuId', 'warehouseId', 'quantity', 'occurredAt'];
      lines = rows.map((r) => [
        r.movementType,
        r.skuId,
        r.warehouseId,
        r.quantity.toString(),
        r.occurredAt.toISOString(),
      ]);
    }
    const csv = [header.join(','), ...lines.map((l) => l.map(escape).join(','))].join('\n');
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'bi.export',
      objectType: 'Dataset',
      objectId: dataset,
      source: 'api',
      newValues: { rows: lines.length },
    });
    return { csv, rows: lines.length };
  }

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
  /**
   * Supplier analytics (BI-012): per-supplier spend, open orders,
   * received share and on-time signal — the sourcing scorecard.
   */
  async supplierAnalytics(ctx: RequestContext): Promise<
    Array<{
      supplierId: string;
      name: string;
      purchaseOrders: number;
      openOrders: number;
      spend: string;
      receivedSharePct: string;
      overduePos: number;
    }>
  > {
    const [suppliers, orders, parties] = await Promise.all([
      this.prisma.supplier.findMany({ where: { tenantId: ctx.tenantId }, take: 200 }),
      this.prisma.purchaseOrder.findMany({
        where: { tenantId: ctx.tenantId },
        include: { lines: true },
        take: 2000,
      }),
      this.prisma.party.findMany({
        where: { tenantId: ctx.tenantId },
        select: { id: true, name: true },
        take: 2000,
      }),
    ]);
    const partyName = new Map(parties.map((p) => [p.id, p.name]));
    const now = Date.now();
    return suppliers
      .map((supplier) => {
        const pos = orders.filter((po) => po.supplierId === supplier.id);
        let spend = 0;
        let ordered = 0;
        let received = 0;
        let overdue = 0;
        for (const po of pos) {
          spend += Number(po.total);
          for (const line of po.lines) {
            ordered += Number(line.quantity) * Number(line.unitPrice);
            received += Number(line.receivedQty) * Number(line.unitPrice);
          }
          if (po.status === 'OPEN' && po.expectedAt !== null && po.expectedAt.getTime() < now) {
            overdue += 1;
          }
        }
        return {
          supplierId: supplier.id,
          name: partyName.get(supplier.partyId) ?? '(nepoznat)',
          purchaseOrders: pos.length,
          openOrders: pos.filter((po) => po.status === 'OPEN' || po.status === 'PARTIALLY_RECEIVED')
            .length,
          spend: spend.toFixed(2),
          receivedSharePct: ordered > 0 ? ((received / ordered) * 100).toFixed(1) : '0.0',
          overduePos: overdue,
        };
      })
      .sort((a, b) => Number(b.spend) - Number(a.spend));
  }

  /**
   * Process analytics (BI-013): cycle times through the core flows —
   * order to fulfilment, PO to receipt, work order to completion.
   */
  async processAnalytics(
    ctx: RequestContext,
  ): Promise<Array<{ process: string; completed: number; avgHours: string | null }>> {
    const [orders, workOrders] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: { tenantId: ctx.tenantId, status: 'FULFILLED' },
        select: { createdAt: true, updatedAt: true },
        take: 2000,
      }),
      this.prisma.workOrder.findMany({
        where: { tenantId: ctx.tenantId, status: 'COMPLETED' },
        select: { createdAt: true, completedAt: true },
        take: 2000,
      }),
    ]);
    const receipts = await this.prisma.purchaseOrder.findMany({
      where: { tenantId: ctx.tenantId, status: 'RECEIVED' },
      select: { createdAt: true, updatedAt: true },
      take: 2000,
    });
    const avg = (pairs: Array<[Date, Date | null]>): string | null => {
      const spans = pairs
        .filter((p): p is [Date, Date] => p[1] !== null)
        .map(([a, b]) => (b.getTime() - a.getTime()) / 3_600_000);
      if (spans.length === 0) return null;
      return (spans.reduce((x, y) => x + y, 0) / spans.length).toFixed(2);
    };
    return [
      {
        process: 'order_to_fulfilment',
        completed: orders.length,
        avgHours: avg(orders.map((o) => [o.createdAt, o.updatedAt])),
      },
      {
        process: 'po_to_receipt',
        completed: receipts.length,
        avgHours: avg(receipts.map((o) => [o.createdAt, o.updatedAt])),
      },
      {
        process: 'wo_to_completion',
        completed: workOrders.length,
        avgHours: avg(workOrders.map((o) => [o.createdAt, o.completedAt])),
      },
    ];
  }

  /**
   * Profitability analytics (BI-008): per sales channel — revenue
   * from non-cancelled orders, estimated cost from the SKUs' standard
   * costs, margin and margin % — where the money is actually made.
   */
  async profitabilityAnalytics(ctx: RequestContext): Promise<
    Array<{
      channel: string;
      orders: number;
      revenue: string;
      estCost: string;
      margin: string;
      marginPct: string | null;
    }>
  > {
    const orders = await this.prisma.salesOrder.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'CANCELLED' } },
      include: { lines: true },
      take: 2000,
    });
    const skuIds = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.skuId)))];
    const skus = await this.prisma.sku.findMany({
      where: { tenantId: ctx.tenantId, id: { in: skuIds } },
      select: { id: true, standardCost: true },
    });
    const costOf = new Map(skus.map((s) => [s.id, Number(s.standardCost ?? 0)]));
    const rows = new Map<string, { orders: number; revenue: number; cost: number }>();
    for (const order of orders) {
      const entry = rows.get(order.channel) ?? { orders: 0, revenue: 0, cost: 0 };
      entry.orders += 1;
      entry.revenue += Number(order.total);
      for (const line of order.lines) {
        entry.cost += Number(line.quantity) * (costOf.get(line.skuId) ?? 0);
      }
      rows.set(order.channel, entry);
    }
    return [...rows.entries()]
      .map(([channel, v]) => {
        const margin = v.revenue - v.cost;
        return {
          channel,
          orders: v.orders,
          revenue: v.revenue.toFixed(2),
          estCost: v.cost.toFixed(2),
          margin: margin.toFixed(2),
          marginPct: v.revenue > 0 ? ((margin / v.revenue) * 100).toFixed(1) : null,
        };
      })
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));
  }

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

  /**
   * Control Center (BI-014): one call with the operational pulse —
   * everything a manager scans first thing in the morning. Every
   * number derives live from the transactional source of truth.
   */
  async controlCenter(ctx: RequestContext): Promise<{
    openOrders: number;
    backorderedLines: number;
    overdueApprovals: number;
    openCases: number;
    pendingChangeRequests: number;
    activeBreakGlass: number;
    openNcrs: number;
    draftInvoicesOverdue: number;
  }> {
    const t = ctx.tenantId;
    const now = new Date();
    const dayAgo = new Date(Date.now() - 24 * 3_600_000);
    const [
      openOrders,
      backorderedLines,
      overdueApprovals,
      openCases,
      pendingChangeRequests,
      activeBreakGlass,
      openNcrs,
      draftInvoicesOverdue,
    ] = await Promise.all([
      this.prisma.salesOrder.count({
        where: { tenantId: t, status: { in: ['DRAFT', 'CONFIRMED', 'ON_HOLD'] } },
      }),
      this.prisma.salesOrderLine.count({ where: { tenantId: t, backordered: true } }),
      this.prisma.approval.count({
        where: { tenantId: t, status: 'REQUESTED', createdAt: { lt: dayAgo } },
      }),
      this.prisma.supportCase.count({
        where: { tenantId: t, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.masterDataRequest.count({ where: { tenantId: t, status: 'PENDING' } }),
      this.prisma.breakGlassGrant.count({
        where: { tenantId: t, revokedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.ncr.count({ where: { tenantId: t, status: 'OPEN' } }),
      this.prisma.invoice.count({
        where: { tenantId: t, status: { in: ['OPEN', 'PARTIALLY_PAID'] }, dueAt: { lt: now } },
      }),
    ]);
    return {
      openOrders,
      backorderedLines,
      overdueApprovals,
      openCases,
      pendingChangeRequests,
      activeBreakGlass,
      openNcrs,
      draftInvoicesOverdue,
    };
  }
}
