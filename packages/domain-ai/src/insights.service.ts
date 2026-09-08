import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * AI insights (AI-004/005/008/010/014). Deterministic, explainable
 * analytics over the tenant's own ledgers — no external content, no
 * black boxes: every insight carries its inputs and method
 * (AI-014 explanation), and every run is audited. Provider-backed
 * copilots layer on top through ports; the numbers here never depend
 * on a model.
 */

const DAY = 86_400_000;

export class InsightsService {
  constructor(private readonly prisma: PrismaClient) {}

  private async audit(ctx: RequestContext, insight: string, summary: Record<string, unknown>) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'ai.insight',
      objectType: 'Insight',
      objectId: insight,
      source: 'api',
      newValues: summary as Prisma.InputJsonValue,
    });
  }

  /**
   * Demand forecasting (AI-004): trailing 28-day outbound movement per
   * SKU → average daily demand and a 7/30-day projection. Method:
   * simple moving average — explainable, reproducible.
   */
  async demandForecast(
    skuId: string,
    ctx: RequestContext,
  ): Promise<{
    skuId: string;
    windowDays: number;
    totalOutbound: string;
    avgDailyDemand: string;
    forecast7: string;
    forecast30: string;
    explanation: string;
  }> {
    const sku = await this.prisma.sku.findFirst({
      where: { id: skuId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!sku) throw notFound('Sku', skuId);
    const since = new Date(Date.now() - 28 * DAY);
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId: ctx.tenantId,
        skuId,
        movementType: 'ISSUE',
        occurredAt: { gte: since },
      },
      select: { quantity: true },
      take: 5000,
    });
    const total = movements.reduce((acc, m) => acc + Number(m.quantity), 0);
    const daily = total / 28;
    const result = {
      skuId,
      windowDays: 28,
      totalOutbound: total.toFixed(3),
      avgDailyDemand: daily.toFixed(3),
      forecast7: (daily * 7).toFixed(3),
      forecast30: (daily * 30).toFixed(3),
      explanation: '28-day moving average of ISSUE ledger movements, projected linearly.',
    };
    await this.audit(ctx, 'demand_forecast', { skuId, avgDailyDemand: result.avgDailyDemand });
    return result;
  }

  /**
   * Stockout prediction (AI-005): days of cover per active SKU —
   * ledger on-hand divided by trailing average daily demand.
   */
  async stockoutRisk(ctx: RequestContext): Promise<{
    explanation: string;
    rows: Array<{
      skuId: string;
      code: string;
      onHand: string;
      avgDailyDemand: string;
      daysOfCover: string | null;
      risk: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
  }> {
    const since = new Date(Date.now() - 28 * DAY);
    const [skus, positions, outbound] = await Promise.all([
      this.prisma.sku.findMany({
        where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
        select: { id: true, code: true },
        take: 500,
      }),
      this.prisma.stockMovement.groupBy({
        by: ['skuId', 'movementType'],
        where: { tenantId: ctx.tenantId },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.groupBy({
        by: ['skuId'],
        where: {
          tenantId: ctx.tenantId,
          movementType: 'ISSUE',
          occurredAt: { gte: since },
        },
        _sum: { quantity: true },
      }),
    ]);
    const onHandOf = new Map<string, number>();
    for (const row of positions) {
      const sign =
        row.movementType === 'RECEIPT' ||
        row.movementType === 'ADJUSTMENT_IN' ||
        row.movementType === 'TRANSFER_IN'
          ? 1
          : -1;
      onHandOf.set(row.skuId, (onHandOf.get(row.skuId) ?? 0) + sign * Number(row._sum.quantity));
    }
    const demandOf = new Map(outbound.map((row) => [row.skuId, Number(row._sum.quantity) / 28]));
    const rows = skus.map((sku) => {
      const onHand = onHandOf.get(sku.id) ?? 0;
      const daily = demandOf.get(sku.id) ?? 0;
      const cover = daily > 0 ? onHand / daily : null;
      const risk: 'HIGH' | 'MEDIUM' | 'LOW' =
        cover !== null && cover < 7 ? 'HIGH' : cover !== null && cover < 14 ? 'MEDIUM' : 'LOW';
      return {
        skuId: sku.id,
        code: sku.code,
        onHand: onHand.toFixed(3),
        avgDailyDemand: daily.toFixed(3),
        daysOfCover: cover === null ? null : cover.toFixed(1),
        risk,
      };
    });
    rows.sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return order[a.risk] - order[b.risk];
    });
    await this.audit(ctx, 'stockout_risk', {
      high: rows.filter((r) => r.risk === 'HIGH').length,
    });
    return {
      explanation:
        'Days of cover = ledger on-hand / 28-day average daily ISSUE volume; HIGH under 7 days, MEDIUM under 14.',
      rows,
    };
  }

  /**
   * Bottleneck detection (AI-010): open operation load per work
   * center against everything else — the queue that starves the rest.
   */
  async bottlenecks(ctx: RequestContext): Promise<{
    explanation: string;
    rows: Array<{ workCenter: string; openOperations: number; sharePct: string }>;
  }> {
    const open = await this.prisma.workOrderOperation.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'DONE' } },
      select: { workCenter: true },
      take: 5000,
    });
    const counts = new Map<string, number>();
    for (const op of open) counts.set(op.workCenter, (counts.get(op.workCenter) ?? 0) + 1);
    const total = open.length;
    const rows = [...counts.entries()]
      .map(([workCenter, openOperations]) => ({
        workCenter,
        openOperations,
        sharePct: total > 0 ? ((openOperations / total) * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.openOperations - a.openOperations);
    await this.audit(ctx, 'bottlenecks', { centers: rows.length, openOperations: total });
    return {
      explanation:
        'Open (not DONE) routed operations per work center; the largest queue is the bottleneck.',
      rows,
    };
  }

  /**
   * Anomaly detection (AI-008): last-24h audit volume per action
   * against the prior 7-day daily baseline; flagged over 3× baseline
   * (minimum 10 events). Deterministic and explainable.
   */
  async anomalies(ctx: RequestContext): Promise<{
    explanation: string;
    rows: Array<{ action: string; last24h: number; dailyBaseline: string; factor: string }>;
  }> {
    const now = Date.now();
    const dayAgo = new Date(now - DAY);
    const weekAgo = new Date(now - 8 * DAY);
    const [recent, baseline] = await Promise.all([
      this.prisma.auditEvent.groupBy({
        by: ['action'],
        where: { tenantId: ctx.tenantId, occurredAt: { gte: dayAgo } },
        _count: { _all: true },
      }),
      this.prisma.auditEvent.groupBy({
        by: ['action'],
        where: { tenantId: ctx.tenantId, occurredAt: { gte: weekAgo, lt: dayAgo } },
        _count: { _all: true },
      }),
    ]);
    const baselineOf = new Map(baseline.map((row) => [row.action, row._count._all / 7]));
    const rows = recent
      .map((row) => {
        const daily = baselineOf.get(row.action) ?? 0;
        const factor = daily > 0 ? row._count._all / daily : Number.POSITIVE_INFINITY;
        return {
          action: row.action,
          last24h: row._count._all,
          dailyBaseline: daily.toFixed(2),
          factor: Number.isFinite(factor) ? factor.toFixed(1) : 'new',
        };
      })
      .filter((row) => row.last24h >= 10 && (row.factor === 'new' || Number(row.factor) >= 3))
      .sort((a, b) => b.last24h - a.last24h);
    await this.audit(ctx, 'anomalies', { flagged: rows.length });
    return {
      explanation:
        'Audit actions with ≥10 events in 24h running at ≥3× their prior 7-day daily baseline (or entirely new).',
      rows,
    };
  }

  /**
   * Cash forecasting (AI-007): open receivables minus open payables,
   * bucketed by due date, projected onto the current net position.
   */
  async cashProjection(ctx: RequestContext): Promise<{
    explanation: string;
    netOpen: string;
    buckets: Array<{ bucket: string; inflow: string; outflow: string; net: string }>;
  }> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
      select: { invoiceType: true, total: true, paidAmount: true, dueAt: true },
      take: 5000,
    });
    const buckets = [
      { bucket: '0-30d', maxDays: 30, inflow: 0, outflow: 0 },
      { bucket: '31-60d', maxDays: 60, inflow: 0, outflow: 0 },
      { bucket: '61-90d', maxDays: 90, inflow: 0, outflow: 0 },
      { bucket: '90d+', maxDays: Number.POSITIVE_INFINITY, inflow: 0, outflow: 0 },
    ];
    const now = Date.now();
    let netOpen = 0;
    for (const invoice of invoices) {
      const open = Number(invoice.total) - Number(invoice.paidAmount);
      const days = invoice.dueAt ? Math.max(0, (invoice.dueAt.getTime() - now) / DAY) : 0;
      const bucket = buckets.find((b) => days <= b.maxDays);
      if (!bucket) continue;
      if (invoice.invoiceType === 'CUSTOMER') {
        bucket.inflow += open;
        netOpen += open;
      } else {
        bucket.outflow += open;
        netOpen -= open;
      }
    }
    await this.audit(ctx, 'cash_projection', { netOpen: netOpen.toFixed(2) });
    return {
      explanation: 'Open receivables minus open payables, bucketed by due date from today.',
      netOpen: netOpen.toFixed(2),
      buckets: buckets.map((b) => ({
        bucket: b.bucket,
        inflow: b.inflow.toFixed(2),
        outflow: b.outflow.toFixed(2),
        net: (b.inflow - b.outflow).toFixed(2),
      })),
    };
  }

  /**
   * Production-delay prediction (AI-006): running work orders whose
   * elapsed time already exceeds the routed estimate for the produced
   * quantity are predicted late — before they are late on paper.
   */
  async productionDelays(ctx: RequestContext): Promise<{
    explanation: string;
    rows: Array<{
      woNumber: string;
      elapsedHours: string;
      estimatedHours: string;
      predictedLate: boolean;
    }>;
  }> {
    const orders = await this.prisma.workOrder.findMany({
      where: { tenantId: ctx.tenantId, status: 'IN_PROGRESS' },
      include: { operations: true },
      take: 200,
    });
    const routings = await this.prisma.routingOperation.findMany({
      where: { tenantId: ctx.tenantId },
      select: { routingId: true, runMinutesPerUnit: true },
    });
    const perRouting = new Map<string, number>();
    for (const op of routings) {
      perRouting.set(
        op.routingId,
        (perRouting.get(op.routingId) ?? 0) + Number(op.runMinutesPerUnit),
      );
    }
    const rows = orders.map((wo) => {
      const startedAt = wo.startedAt?.getTime() ?? wo.createdAt.getTime();
      const elapsedHours = (Date.now() - startedAt) / 3_600_000;
      const minutesPerUnit = wo.routingId ? (perRouting.get(wo.routingId) ?? 0) : 0;
      const estimatedHours = (minutesPerUnit * Number(wo.quantity)) / 60;
      return {
        woNumber: wo.woNumber,
        elapsedHours: elapsedHours.toFixed(2),
        estimatedHours: estimatedHours.toFixed(2),
        predictedLate: estimatedHours > 0 && elapsedHours > estimatedHours,
      };
    });
    await this.audit(ctx, 'production_delays', {
      late: rows.filter((r) => r.predictedLate).length,
    });
    return {
      explanation:
        'Elapsed time since start vs routed run-minutes × quantity; over the estimate predicts late.',
      rows,
    };
  }

  /**
   * Process mining (AI-009): observed order-event sequences and their
   * frequencies — the process as it actually runs, not as drawn.
   */
  async processPaths(ctx: RequestContext): Promise<{
    explanation: string;
    paths: Array<{ path: string; orders: number }>;
  }> {
    const events = await this.prisma.orderEvent.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ orderId: 'asc' }, { createdAt: 'asc' }],
      select: { orderId: true, eventType: true },
      take: 5000,
    });
    const byOrder = new Map<string, string[]>();
    for (const event of events) {
      const list = byOrder.get(event.orderId) ?? [];
      list.push(event.eventType);
      byOrder.set(event.orderId, list);
    }
    const counts = new Map<string, number>();
    for (const path of byOrder.values()) {
      const key = path.join(' → ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const paths = [...counts.entries()]
      .map(([path, orders]) => ({ path, orders }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 20);
    await this.audit(ctx, 'process_paths', { distinctPaths: paths.length });
    return {
      explanation: 'Order-event sequences grouped and ranked by frequency (top 20).',
      paths,
    };
  }

  /**
   * Recommendations (AI-011): replenishment suggestions from stockout
   * risk — cover the next 30 days, never a silent purchase (a human
   * turns suggestions into requisitions).
   */
  async replenishmentRecommendations(ctx: RequestContext): Promise<{
    explanation: string;
    rows: Array<{ skuId: string; code: string; risk: string; suggestedQty: string }>;
  }> {
    const risk = await this.stockoutRisk(ctx);
    const rows = risk.rows
      .filter((row) => row.risk !== 'LOW')
      .map((row) => {
        const need = Number(row.avgDailyDemand) * 30 - Number(row.onHand);
        return {
          skuId: row.skuId,
          code: row.code,
          risk: row.risk,
          suggestedQty: Math.max(0, Math.ceil(need)).toString(),
        };
      });
    await this.audit(ctx, 'replenishment', { suggestions: rows.length });
    return {
      explanation: 'For at-risk SKUs: 30 days of average demand minus current on-hand.',
      rows,
    };
  }
}
