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
}
