import { DomainError } from '@nexora/kernel';
import type { PrismaClient } from '@nexora/db';
import type { RequestContext } from '@nexora/tenancy';
import type { AdvancedPlanningService, PlanConfigGate } from './advancedplanning.service';

/**
 * Promise-date engine (PLAN-015). Read-only: never reserves, never posts.
 *
 * Per SKU it builds a supply timeline and consumes it in order:
 *   1. promisable stock now (WMS: on hand − reservations − quarantine);
 *   2. open purchase supply at the PO's expected date (PROC);
 *   3. open production at the work order's finite-schedule finish (MES +
 *      PLAN-011 schedule);
 * after earlier confirmed backorders (OMS) have taken their share. What
 * the timeline cannot cover is promised by capable-to-promise:
 *   - SKUs with a released routing: work-center backlog (plan.capacity)
 *     plus processing time of the shortfall, operations in sequence;
 *   - otherwise the SKU's planning lead time (or plan.promise default).
 * Day offsets count working days of plan.calendar (default: every day)
 * and end with plan.promise.handlingDays.
 */

export interface PromiseStockGate {
  promisableStock(tenantId: string, skuIds: string[]): Promise<Map<string, number>>;
}
export interface PromiseSupplyGate {
  openSupply(
    tenantId: string,
    skuIds: string[],
  ): Promise<
    Array<{ skuId: string; quantity: number; expectedAt: Date | null; reference: string }>
  >;
}
export interface PromiseProductionGate {
  openProduction(
    tenantId: string,
    skuIds: string[],
  ): Promise<Array<{ skuId: string; quantity: number; woNumber: string; startedAt: Date | null }>>;
}
/** OMS-owned open backorders (earlier demand that claims supply first). */
export interface PromiseDemandGate {
  openBackorders(tenantId: string, skuIds: string[]): Promise<Map<string, number>>;
}
export interface PromiseLeadTimeGate {
  leadTimeFor(tenantId: string, skuId: string): Promise<number>;
}

export type PromiseSource =
  'STOCK' | 'RESERVED' | 'PURCHASE_ORDER' | 'WORK_ORDER' | 'PRODUCTION_CAPACITY' | 'LEAD_TIME';

export interface PromiseLineInput {
  skuId: string;
  quantity: number;
  /** Already reserved for this demand (e.g. a confirmed, allocated order line). */
  reserved?: boolean | undefined;
}

export interface PromiseLineResult {
  skuId: string;
  quantity: number;
  /** Quantity that could ship from stock right away (partial delivery). */
  availableNow: number;
  promisedAt: string;
  /** Working days from today until the promise (incl. handling). */
  days: number;
  source: PromiseSource;
  sources: Array<{ kind: PromiseSource; reference: string | null; quantity: number; at: string }>;
  leadTimeDays: number;
  explanation: string;
}

export interface PromiseResult {
  promisedAt: string;
  /** Earliest date by which every line can ship (= latest line). */
  lines: PromiseLineResult[];
  calendar: { workingDays: number[]; holidays: number };
}

interface SupplyEvent {
  day: number;
  quantity: number;
  kind: PromiseSource;
  reference: string | null;
}

const DAY_MS = 86_400_000;

export class PromiseService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: PlanConfigGate,
    private readonly advanced: AdvancedPlanningService,
    private readonly stock: PromiseStockGate,
    private readonly leadTimes: PromiseLeadTimeGate,
    private readonly supply?: PromiseSupplyGate,
    private readonly production?: PromiseProductionGate,
    private readonly demand?: PromiseDemandGate,
  ) {}

  /**
   * Permission: planning.read (or the calling domain's own permission).
   * `competingDemand` = quantities other, earlier demand already claims
   * (e.g. older confirmed backorders) — consumed from supply first.
   */
  async promise(
    input: { lines: PromiseLineInput[]; competingDemand?: Map<string, number> | undefined },
    ctx: RequestContext,
  ): Promise<PromiseResult> {
    if (input.lines.length === 0 || input.lines.length > 200) {
      throw new DomainError('VALIDATION_FAILED', 'Promise needs 1-200 lines');
    }
    for (const line of input.lines) {
      if (!(line.quantity > 0)) {
        throw new DomainError('VALIDATION_FAILED', 'Line quantity must be positive');
      }
    }
    const plan = await this.planConfig(ctx.tenantId);
    const calendar = new WorkingCalendar(plan.calendar);
    const settings = promiseSettings(plan.promise);
    const now = new Date();
    const skuIds = [...new Set(input.lines.map((l) => l.skuId))];

    // Callers that own the demand (OMS) pass it; a standalone query (quote,
    // availability check) counts every open backorder as ahead of it.
    const competingDemand =
      input.competingDemand ??
      (this.demand ? await this.demand.openBackorders(ctx.tenantId, skuIds) : undefined);
    const [free, purchase, production] = await Promise.all([
      this.stock.promisableStock(ctx.tenantId, skuIds),
      this.supply ? this.supply.openSupply(ctx.tenantId, skuIds) : Promise.resolve([]),
      this.production ? this.production.openProduction(ctx.tenantId, skuIds) : Promise.resolve([]),
    ]);
    const woFinish = production.length > 0 ? await this.workOrderFinishDays(ctx) : new Map();

    // Supply timelines per SKU (day = working-day offset from today).
    const timelines = new Map<string, SupplyEvent[]>();
    for (const skuId of skuIds) {
      const events: SupplyEvent[] = [];
      const onHand = free.get(skuId) ?? 0;
      if (onHand > 0) events.push({ day: 0, quantity: onHand, kind: 'STOCK', reference: null });
      timelines.set(skuId, events);
    }
    for (const po of purchase) {
      const lead = po.expectedAt ? null : await this.leadTimes.leadTimeFor(ctx.tenantId, po.skuId);
      const day = po.expectedAt
        ? Math.max(1, calendar.workingDaysUntil(now, po.expectedAt))
        : Math.max(1, lead ?? settings.defaultLeadTimeDays);
      timelines.get(po.skuId)?.push({
        day,
        quantity: po.quantity,
        kind: 'PURCHASE_ORDER',
        reference: po.reference,
      });
    }
    for (const wo of production) {
      const day = woFinish.get(wo.woNumber) ?? settings.defaultLeadTimeDays;
      timelines.get(wo.skuId)?.push({
        day,
        quantity: wo.quantity,
        kind: 'WORK_ORDER',
        reference: wo.woNumber,
      });
    }
    for (const [skuId, events] of timelines) {
      events.sort((a, b) => a.day - b.day);
      // Earlier demand takes its share of the earliest supply first.
      let claim = competingDemand?.get(skuId) ?? 0;
      for (const event of events) {
        if (claim <= 0) break;
        const take = Math.min(event.quantity, claim);
        event.quantity = round6(event.quantity - take);
        claim = round6(claim - take);
      }
    }

    const lines: PromiseLineResult[] = [];
    for (const line of input.lines) {
      if (line.reserved) {
        const days = settings.handlingDays;
        lines.push({
          skuId: line.skuId,
          quantity: line.quantity,
          availableNow: line.quantity,
          promisedAt: calendar.dateAt(now, days).toISOString(),
          days,
          source: 'RESERVED',
          sources: [
            {
              kind: 'RESERVED',
              reference: null,
              quantity: line.quantity,
              at: calendar.dateAt(now, 0).toISOString(),
            },
          ],
          leadTimeDays: 0,
          explanation: 'Already reserved — ships after handling',
        });
        continue;
      }
      const events = timelines.get(line.skuId) ?? [];
      let need = line.quantity;
      let lastDay = 0;
      let lastKind: PromiseSource = 'STOCK';
      const used: PromiseLineResult['sources'] = [];
      const availableNow = Math.min(
        line.quantity,
        events.filter((e) => e.day === 0).reduce((sum, e) => sum + e.quantity, 0),
      );
      for (const event of events) {
        if (need <= 0) break;
        if (event.quantity <= 0) continue;
        const take = Math.min(event.quantity, need);
        event.quantity = round6(event.quantity - take);
        need = round6(need - take);
        lastDay = Math.max(lastDay, event.day);
        lastKind = event.kind;
        used.push({
          kind: event.kind,
          reference: event.reference,
          quantity: take,
          at: calendar.dateAt(now, event.day).toISOString(),
        });
      }
      let leadTimeDays = 0;
      let explanation: string;
      if (need > 0) {
        const ctp = await this.capableToPromise(line.skuId, need, ctx);
        if (ctp) {
          lastDay = Math.max(lastDay, ctp.days);
          lastKind = 'PRODUCTION_CAPACITY';
          explanation = `Short ${need}: production fits after ${ctp.days} working day(s) (${ctp.detail})`;
        } else {
          leadTimeDays = await this.leadTimes.leadTimeFor(ctx.tenantId, line.skuId);
          const days = leadTimeDays > 0 ? leadTimeDays : settings.defaultLeadTimeDays;
          lastDay = Math.max(lastDay, days);
          lastKind = 'LEAD_TIME';
          explanation =
            leadTimeDays > 0
              ? `Short ${need}: replenished within the ${leadTimeDays}-day planning lead time`
              : `Short ${need}: no lead time policy — default ${days} day(s)`;
        }
        used.push({
          kind: lastKind,
          reference: null,
          quantity: need,
          at: calendar.dateAt(now, lastDay).toISOString(),
        });
      } else {
        explanation =
          lastKind === 'STOCK'
            ? 'Covered by promisable stock'
            : `Covered by ${used.map((u) => `${u.kind}${u.reference ? ` ${u.reference}` : ''}`).join(', ')}`;
      }
      const days = lastDay + settings.handlingDays;
      lines.push({
        skuId: line.skuId,
        quantity: line.quantity,
        availableNow,
        promisedAt: calendar.dateAt(now, days).toISOString(),
        days,
        source: lastKind,
        sources: used,
        leadTimeDays,
        explanation,
      });
    }
    const latest = lines.reduce((max, l) => Math.max(max, Date.parse(l.promisedAt)), 0);
    return {
      promisedAt: new Date(latest).toISOString(),
      lines,
      calendar: { workingDays: calendar.workingDays, holidays: calendar.holidayCount },
    };
  }

  private async planConfig(tenantId: string): Promise<Record<string, unknown>> {
    const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
    return ((config as Record<string, unknown> | null)?.plan ?? {}) as Record<string, unknown>;
  }

  /** Work order -> working day its last scheduled operation finishes (PLAN-011). */
  private async workOrderFinishDays(ctx: RequestContext): Promise<Map<string, number>> {
    const finish = new Map<string, number>();
    let schedule: Awaited<ReturnType<AdvancedPlanningService['schedule']>>;
    try {
      schedule = await this.advanced.schedule(ctx);
    } catch {
      return finish; // no capacity configured — fall back to the default lead
    }
    const capacity = await this.capacity(ctx.tenantId);
    for (const center of schedule) {
      const perDay = capacity.get(center.workCenter) ?? 480;
      for (const op of center.queue) {
        const end = op.startDay + Math.max(0, Math.ceil(op.minutes / perDay) - 1);
        finish.set(op.woNumber, Math.max(finish.get(op.woNumber) ?? 0, end));
      }
    }
    return finish;
  }

  private async capacity(tenantId: string): Promise<Map<string, number>> {
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

  /**
   * Capable-to-promise for a make SKU: the released routing's operations
   * run in sequence; each work center first clears its open backlog
   * (in parallel across centers), then processes the shortfall.
   * Null when the SKU has no released routing or a center has no capacity.
   */
  private async capableToPromise(
    skuId: string,
    quantity: number,
    ctx: RequestContext,
  ): Promise<{ days: number; detail: string } | null> {
    const routing = await this.prisma.routing.findFirst({
      where: { tenantId: ctx.tenantId, skuId, status: 'RELEASED' },
      orderBy: { version: 'desc' },
      include: { operations: { orderBy: { seq: 'asc' } } },
    });
    if (!routing || routing.operations.length === 0) return null;
    const capacity = await this.capacity(ctx.tenantId);
    if (capacity.size === 0) return null;
    let rows: Awaited<ReturnType<AdvancedPlanningService['capacity']>>;
    try {
      rows = await this.advanced.capacity(ctx);
    } catch {
      return null;
    }
    const backlog = new Map(rows.map((r) => [r.workCenter, r.daysToClear]));
    let queueDays = 0;
    let processDays = 0;
    const parts: string[] = [];
    for (const op of routing.operations) {
      const perDay = capacity.get(op.workCenter);
      if (!perDay) return null;
      const minutes = Number(op.setupMinutes) + Number(op.runMinutesPerUnit) * quantity;
      const days = Math.max(1, Math.ceil(minutes / perDay));
      queueDays = Math.max(queueDays, Math.ceil(backlog.get(op.workCenter) ?? 0));
      processDays += days;
      parts.push(`${op.workCenter} ${days}d`);
    }
    return {
      days: queueDays + processDays,
      detail: `backlog ${queueDays}d + ${parts.join(' > ')}`,
    };
  }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function promiseSettings(raw: unknown): {
  handlingDays: number;
  defaultLeadTimeDays: number;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const int = (v: unknown, d: number, max: number) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : d;
  return {
    handlingDays: int(r.handlingDays, 1, 30),
    defaultLeadTimeDays: int(r.defaultLeadTimeDays, 2, 365),
  };
}

/**
 * Working calendar from plan.calendar: `workingDays` as ISO weekdays
 * (1 = Monday … 7 = Sunday; default all seven) and `holidays` as
 * YYYY-MM-DD dates. Offsets count working days; the time of day is kept.
 */
export class WorkingCalendar {
  readonly workingDays: number[];
  private readonly holidays: Set<string>;

  constructor(raw: unknown) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const days = Array.isArray(r.workingDays)
      ? [...new Set(r.workingDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))]
      : [];
    this.workingDays = (days.length > 0 ? days : [1, 2, 3, 4, 5, 6, 7]).sort() as number[];
    this.holidays = new Set(
      Array.isArray(r.holidays)
        ? r.holidays.filter(
            (h): h is string => typeof h === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h),
          )
        : [],
    );
  }

  get holidayCount(): number {
    return this.holidays.size;
  }

  isWorking(date: Date): boolean {
    const iso = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    return this.workingDays.includes(iso) && !this.holidays.has(date.toISOString().slice(0, 10));
  }

  /** The date `offset` working days after `from` (0 = from, or the next working day). */
  dateAt(from: Date, offset: number): Date {
    let date = new Date(from.getTime());
    let guard = 0;
    while (!this.isWorking(date) && guard < 400) {
      date = new Date(date.getTime() + DAY_MS);
      guard += 1;
    }
    let left = offset;
    while (left > 0 && guard < 5000) {
      date = new Date(date.getTime() + DAY_MS);
      guard += 1;
      if (this.isWorking(date)) left -= 1;
    }
    return date;
  }

  /** Working days from `from` until `to` (0 when `to` is not later). */
  workingDaysUntil(from: Date, to: Date): number {
    if (to.getTime() <= from.getTime()) return 0;
    let count = 0;
    let date = new Date(from.getTime());
    while (date.getTime() < to.getTime() && count < 5000) {
      date = new Date(date.getTime() + DAY_MS);
      if (this.isWorking(date)) count += 1;
    }
    return count;
  }
}
