import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Advanced planning (PLAN-001/002/003/010/011/012/013/014): demand
 * forecasts as audited versions, S&OP balancing, capacity
 * requirements from live work-order load against configured work-
 * center capacity, finite scheduling, sequence rules, constraint
 * identification and what-if simulation. Read-only over MES/WMS
 * state; plans are data on the audit ledger, not schema.
 */

const PERIOD_RE = /^\d{4}-\d{2}$/;
const VERSION_RE = /^[A-Za-z0-9._:-]{1,64}$/;

/** Cross-domain contract: tenant configuration (owned by core). */
export interface PlanConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

export interface ForecastEntry {
  skuCode: string;
  period: string;
  qty: number;
}

export interface CapacityRow {
  workCenter: string;
  minutesPerDay: number;
  loadMinutes: number;
  daysToClear: number;
  utilizationPct: number;
}

export class AdvancedPlanningService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: PlanConfigGate,
  ) {}

  private async planConfig(tenantId: string): Promise<Record<string, unknown>> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    return ((config as Record<string, unknown>).plan ?? {}) as Record<string, unknown>;
  }

  private async marked(action: string, objectId: string, tenantId: string) {
    return this.prisma.auditEvent.findFirst({
      where: { tenantId, action, objectType: 'Plan', objectId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  private async mark(
    action: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType: 'Plan',
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
    });
  }

  // ------------------------------------- demand planning & versions (PLAN-001/002)

  /** Publish a demand-forecast version. Immutable once published. */
  async publishForecast(
    input: { version: string; entries: ForecastEntry[] },
    ctx: RequestContext,
  ): Promise<{ version: string; entries: number; duplicate: boolean }> {
    if (!VERSION_RE.test(input.version)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid forecast version');
    }
    if (input.entries.length === 0 || input.entries.length > 500) {
      throw new DomainError('VALIDATION_FAILED', 'A forecast needs 1-500 entries');
    }
    for (const entry of input.entries) {
      if (!PERIOD_RE.test(entry.period)) {
        throw new DomainError('VALIDATION_FAILED', `Period '${entry.period}' must be YYYY-MM`);
      }
      if (!Number.isFinite(entry.qty) || entry.qty < 0) {
        throw new DomainError('VALIDATION_FAILED', 'Forecast quantities must not be negative');
      }
    }
    const objectId = `forecast:${input.version}`;
    if (await this.marked('plan.forecast.publish', objectId, ctx.tenantId)) {
      return { version: input.version, entries: input.entries.length, duplicate: true };
    }
    await this.mark('plan.forecast.publish', objectId, { entries: input.entries }, ctx);
    return { version: input.version, entries: input.entries.length, duplicate: false };
  }

  async forecastVersions(
    ctx: RequestContext,
  ): Promise<Array<{ version: string; publishedAt: string; entries: number }>> {
    const events = await this.prisma.auditEvent.findMany({
      where: { tenantId: ctx.tenantId, action: 'plan.forecast.publish', objectType: 'Plan' },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    });
    return events.map((e) => ({
      version: e.objectId.slice('forecast:'.length),
      publishedAt: e.occurredAt.toISOString(),
      entries: Array.isArray((e.newValues as { entries?: unknown[] } | null)?.entries)
        ? ((e.newValues as { entries: unknown[] }).entries as unknown[]).length
        : 0,
    }));
  }

  async forecast(version: string, ctx: RequestContext): Promise<ForecastEntry[]> {
    const event = await this.marked('plan.forecast.publish', `forecast:${version}`, ctx.tenantId);
    if (!event) throw notFound('Forecast', version);
    const entries = (event.newValues as { entries?: unknown[] } | null)?.entries ?? [];
    return (entries as Array<Record<string, unknown>>).map((e) => ({
      skuCode: String(e.skuCode ?? ''),
      period: String(e.period ?? ''),
      qty: Number(e.qty) || 0,
    }));
  }

  // -------------------------------------------------------------- S&OP (PLAN-003)

  /**
   * Sales & operations balance for one forecast version and period:
   * demand vs on-hand plus open production, per SKU.
   */
  async sop(
    input: { version: string; period: string },
    ctx: RequestContext,
  ): Promise<
    Array<{
      skuCode: string;
      demand: number;
      onHand: number;
      inProduction: number;
      gap: number;
    }>
  > {
    if (!PERIOD_RE.test(input.period)) {
      throw new DomainError('VALIDATION_FAILED', 'Period must be YYYY-MM');
    }
    const entries = (await this.forecast(input.version, ctx)).filter(
      (e) => e.period === input.period,
    );
    const skuCodes = [...new Set(entries.map((e) => e.skuCode))];
    const skus = await this.prisma.sku.findMany({
      where: { tenantId: ctx.tenantId, code: { in: skuCodes } },
      select: { id: true, code: true },
    });
    const byCode = new Map(skus.map((s) => [s.code, s.id]));
    const result = [];
    for (const entry of entries) {
      const skuId = byCode.get(entry.skuCode);
      let onHand = 0;
      let inProduction = 0;
      if (skuId) {
        const movements = await this.prisma.stockMovement.findMany({
          where: { tenantId: ctx.tenantId, skuId },
          select: { movementType: true, quantity: true },
          take: 5000,
        });
        for (const movement of movements) {
          const qty = Number(movement.quantity);
          if (['RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN'].includes(movement.movementType)) {
            onHand += qty;
          } else {
            onHand -= qty;
          }
        }
        const open = await this.prisma.workOrder.findMany({
          where: {
            tenantId: ctx.tenantId,
            skuId,
            status: { in: ['PLANNED', 'RELEASED', 'IN_PROGRESS'] },
          },
          select: { quantity: true, goodQuantity: true },
        });
        inProduction = open.reduce(
          (sum, wo) => sum + Number(wo.quantity) - Number(wo.goodQuantity),
          0,
        );
      }
      result.push({
        skuCode: entry.skuCode,
        demand: entry.qty,
        onHand: Number(onHand.toFixed(3)),
        inProduction: Number(inProduction.toFixed(3)),
        gap: Number((entry.qty - onHand - inProduction).toFixed(3)),
      });
    }
    return result;
  }

  // -------------------------------------- capacity requirements (PLAN-010/013/014)

  private async capacityConfig(tenantId: string): Promise<Map<string, number>> {
    const plan = await this.planConfig(tenantId);
    const raw = Array.isArray(plan.capacity) ? plan.capacity : [];
    const map = new Map<string, number>();
    for (const entry of raw) {
      const c = entry as Record<string, unknown>;
      if (typeof c.workCenter === 'string' && Number(c.minutesPerDay) > 0) {
        map.set(c.workCenter, Number(c.minutesPerDay));
      }
    }
    return map;
  }

  /** Open-operation load per work center (setup + run × remaining qty). */
  private async loadByWorkCenter(tenantId: string): Promise<Map<string, number>> {
    const operations = await this.prisma.workOrderOperation.findMany({
      where: { tenantId, status: { in: ['PENDING', 'RUNNING'] } },
      select: {
        workCenter: true,
        seq: true,
        workOrder: {
          select: { quantity: true, goodQuantity: true, routingId: true, status: true },
        },
      },
      take: 5000,
    });
    const load = new Map<string, number>();
    for (const op of operations) {
      if (['COMPLETED', 'CANCELLED'].includes(op.workOrder.status)) continue;
      const remaining = Math.max(
        0,
        Number(op.workOrder.quantity) - Number(op.workOrder.goodQuantity),
      );
      let minutes = remaining * 1; // fallback: 1 min/unit when no routing op matches
      if (op.workOrder.routingId) {
        const routingOp = await this.prisma.routingOperation.findFirst({
          where: { tenantId, routingId: op.workOrder.routingId, seq: op.seq },
          select: { setupMinutes: true, runMinutesPerUnit: true },
        });
        if (routingOp) {
          minutes =
            Number(routingOp.setupMinutes) + Number(routingOp.runMinutesPerUnit) * remaining;
        }
      }
      load.set(op.workCenter, (load.get(op.workCenter) ?? 0) + minutes);
    }
    return load;
  }

  /** PLAN-010/014: utilization per work center, optionally simulated. */
  async capacity(
    ctx: RequestContext,
    whatIf?: { extraMinutesPerDay?: number | undefined; demandFactor?: number | undefined },
  ): Promise<CapacityRow[]> {
    const capacity = await this.capacityConfig(ctx.tenantId);
    if (capacity.size === 0) {
      throw new DomainError('INVALID_STATE', 'No work-center capacity configured (plan.capacity)');
    }
    const load = await this.loadByWorkCenter(ctx.tenantId);
    const factor =
      whatIf?.demandFactor !== undefined && Number.isFinite(whatIf.demandFactor)
        ? Math.max(0, whatIf.demandFactor)
        : 1;
    const extra =
      whatIf?.extraMinutesPerDay !== undefined && Number.isFinite(whatIf.extraMinutesPerDay)
        ? Math.max(0, whatIf.extraMinutesPerDay)
        : 0;
    const rows: CapacityRow[] = [];
    for (const [workCenter, minutesPerDay] of capacity) {
      const loadMinutes = (load.get(workCenter) ?? 0) * factor;
      const daily = minutesPerDay + extra;
      rows.push({
        workCenter,
        minutesPerDay: daily,
        loadMinutes: Number(loadMinutes.toFixed(1)),
        daysToClear: Number((loadMinutes / daily).toFixed(2)),
        utilizationPct: Number(((loadMinutes / daily) * 100).toFixed(1)),
      });
    }
    return rows.sort((a, b) => b.utilizationPct - a.utilizationPct);
  }

  /** PLAN-013: the binding constraint is the most utilized work center. */
  async constraints(ctx: RequestContext): Promise<{
    bottleneck: string | null;
    utilizationPct: number;
    overloaded: string[];
    suggestion: string | null;
  }> {
    const rows = await this.capacity(ctx);
    const bottleneck = rows[0] ?? null;
    const overloaded = rows.filter((r) => r.utilizationPct > 100).map((r) => r.workCenter);
    return {
      bottleneck: bottleneck?.workCenter ?? null,
      utilizationPct: bottleneck?.utilizationPct ?? 0,
      overloaded,
      suggestion:
        overloaded.length > 0
          ? `Preopterećeni radni centri: ${overloaded.join(', ')} — razmotrite dodatnu smjenu ili preraspodjelu operacija.`
          : null,
    };
  }

  // ------------------------------------ finite scheduling & sequencing (PLAN-011/012)

  /**
   * Finite schedule: open operations per work center are sequenced by
   * the configured rule and packed into capacity days (day 1 = today).
   */
  async schedule(ctx: RequestContext): Promise<
    Array<{
      workCenter: string;
      queue: Array<{ woNumber: string; seq: number; minutes: number; startDay: number }>;
    }>
  > {
    const capacity = await this.capacityConfig(ctx.tenantId);
    if (capacity.size === 0) {
      throw new DomainError('INVALID_STATE', 'No work-center capacity configured (plan.capacity)');
    }
    const plan = await this.planConfig(ctx.tenantId);
    const rule = plan.sequenceRule === 'SPT' ? 'SPT' : 'FIFO';
    const operations = await this.prisma.workOrderOperation.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ['PENDING', 'RUNNING'] } },
      select: {
        workCenter: true,
        seq: true,
        workOrder: {
          select: {
            woNumber: true,
            quantity: true,
            goodQuantity: true,
            routingId: true,
            status: true,
            createdAt: true,
          },
        },
      },
      take: 2000,
    });
    const byCenter = new Map<
      string,
      Array<{ woNumber: string; seq: number; minutes: number; createdAt: Date }>
    >();
    for (const op of operations) {
      if (['COMPLETED', 'CANCELLED'].includes(op.workOrder.status)) continue;
      if (!capacity.has(op.workCenter)) continue;
      const remaining = Math.max(
        0,
        Number(op.workOrder.quantity) - Number(op.workOrder.goodQuantity),
      );
      let minutes = remaining;
      if (op.workOrder.routingId) {
        const routingOp = await this.prisma.routingOperation.findFirst({
          where: { tenantId: ctx.tenantId, routingId: op.workOrder.routingId, seq: op.seq },
          select: { setupMinutes: true, runMinutesPerUnit: true },
        });
        if (routingOp) {
          minutes =
            Number(routingOp.setupMinutes) + Number(routingOp.runMinutesPerUnit) * remaining;
        }
      }
      const list = byCenter.get(op.workCenter) ?? [];
      list.push({
        woNumber: op.workOrder.woNumber,
        seq: op.seq,
        minutes: Number(minutes.toFixed(1)),
        createdAt: op.workOrder.createdAt,
      });
      byCenter.set(op.workCenter, list);
    }
    const result = [];
    for (const [workCenter, queue] of byCenter) {
      // PLAN-012: SPT (shortest processing time) or FIFO by WO age.
      queue.sort((a, b) =>
        rule === 'SPT' ? a.minutes - b.minutes : a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const minutesPerDay = capacity.get(workCenter) ?? 480;
      let used = 0;
      let day = 1;
      const scheduled = [];
      for (const item of queue) {
        if (used + item.minutes > minutesPerDay && used > 0) {
          day += 1;
          used = 0;
        }
        scheduled.push({
          woNumber: item.woNumber,
          seq: item.seq,
          minutes: item.minutes,
          startDay: day,
        });
        used += item.minutes;
      }
      result.push({ workCenter, queue: scheduled });
    }
    return result.sort((a, b) => a.workCenter.localeCompare(b.workCenter));
  }
}
