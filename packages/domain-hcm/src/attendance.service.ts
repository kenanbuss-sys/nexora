import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { WorkforceConfigGate } from './workforce.service';

/**
 * HCM-015 (Sprint 234) — attendance status matrix ("šihtarica"), change
 * audit and monthly digest. ODL-002 (owner decision 28.09.2026): BOTH
 * models are supported — the day-status matrix is the payroll source of
 * truth; the HCM-003 clock trail and granted leave only SUGGEST statuses,
 * which a person applies explicitly and which never overwrite a set day.
 *
 * Tenant configuration (never code branches):
 *   hcm.attendanceModel    'BOTH' (default) | 'MATRIX' | 'CLOCK'
 *   hcm.attendanceStatuses [{ key, label, countsAsWorked }]
 * Every change is audited old → new; a LOCKED month refuses edits.
 */

export interface AttendanceStatusDef {
  key: string;
  label: string;
  countsAsWorked: boolean;
}

/** Default catalog (data) when the tenant configures none. */
export const DEFAULT_ATTENDANCE_STATUSES: AttendanceStatusDef[] = [
  { key: 'PRESENT', label: 'Prisutan', countsAsWorked: true },
  { key: 'TRAINING', label: 'Obuka', countsAsWorked: true },
  { key: 'SICK', label: 'Bolovanje', countsAsWorked: false },
  { key: 'ANNUAL', label: 'Godišnji odmor', countsAsWorked: false },
  { key: 'DAY_OFF', label: 'Slobodan dan', countsAsWorked: false },
  { key: 'ABSENT', label: 'Odsutan', countsAsWorked: false },
];

export type AttendanceModel = 'BOTH' | 'MATRIX' | 'CLOCK';

/** Cross-domain read contract: granted leave (owned by WF approvals). */
export interface GrantedLeaveGate {
  grantedLeaveKeys(tenantId: string, employeeIds: string[]): Promise<string[]>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Z][A-Z0-9_]{1,29}$/;
const MAX_APPLY = 5000;

interface Cell {
  status: string;
  source: string;
  version: number;
  note: string | null;
}

function monthDays(year: number, month: number): string[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new DomainError('VALIDATION_FAILED', 'Year must be 2000-2100');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new DomainError('VALIDATION_FAILED', 'Month must be 1-12');
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return Array.from({ length: last }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, '0')}`);
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

export class AttendanceMatrixService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: WorkforceConfigGate,
    private readonly leave?: GrantedLeaveGate,
  ) {}

  // ------------------------------------------------------ configuration

  async settings(ctx: RequestContext): Promise<{
    model: AttendanceModel;
    statuses: AttendanceStatusDef[];
  }> {
    let hcm: Record<string, unknown> = {};
    try {
      const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
      hcm = ((config as Record<string, unknown>).hcm ?? {}) as Record<string, unknown>;
    } catch {
      hcm = {};
    }
    const model: AttendanceModel =
      hcm.attendanceModel === 'MATRIX' || hcm.attendanceModel === 'CLOCK'
        ? hcm.attendanceModel
        : 'BOTH';
    const configured = Array.isArray(hcm.attendanceStatuses)
      ? (hcm.attendanceStatuses as unknown[])
          .map((s) => s as Partial<AttendanceStatusDef>)
          .filter(
            (s): s is AttendanceStatusDef =>
              typeof s.key === 'string' &&
              KEY_RE.test(s.key) &&
              typeof s.label === 'string' &&
              typeof s.countsAsWorked === 'boolean',
          )
      : [];
    return { model, statuses: configured.length ? configured : DEFAULT_ATTENDANCE_STATUSES };
  }

  private async employees(ctx: RequestContext, employeeIds?: string[]) {
    return this.prisma.employee.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(employeeIds ? { id: { in: employeeIds } } : { status: 'ACTIVE' }),
      },
      orderBy: { employeeNumber: 'asc' },
      select: { id: true, employeeNumber: true, name: true, status: true },
      take: 1000,
    });
  }

  private async periodStatus(year: number, month: number, ctx: RequestContext) {
    const period = await this.prisma.attendancePeriod.findFirst({
      where: { tenantId: ctx.tenantId, year, month },
    });
    return period?.status ?? 'OPEN';
  }

  /**
   * Inside the writing transaction: share-lock the month row so a
   * concurrent lock (which updates that row) serializes with this write —
   * a change can never land in a month locked for payroll.
   */
  private async lockedInTx(tx: Prisma.TransactionClient, day: string, ctx: RequestContext) {
    const d = new Date(day);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM attendance_period
      WHERE tenant_id = ${ctx.tenantId}::uuid AND year = ${year} AND month = ${month}
      FOR SHARE`;
    if (rows[0]?.status === 'LOCKED') {
      throw new DomainError(
        'INVALID_STATE',
        `Attendance for ${month}/${year} is locked — unlock the month first`,
      );
    }
  }

  private async ensurePeriod(day: string, ctx: RequestContext) {
    const d = new Date(day);
    await this.prisma.attendancePeriod.upsert({
      where: {
        tenantId_year_month: {
          tenantId: ctx.tenantId,
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
        },
      },
      create: { tenantId: ctx.tenantId, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 },
      update: {},
    });
  }

  private async assertEditable(day: string, ctx: RequestContext) {
    const d = new Date(day);
    const status = await this.periodStatus(d.getUTCFullYear(), d.getUTCMonth() + 1, ctx);
    if (status === 'LOCKED') {
      throw new DomainError(
        'INVALID_STATE',
        `Attendance for ${d.getUTCMonth() + 1}/${d.getUTCFullYear()} is locked — unlock the month first`,
      );
    }
  }

  // ------------------------------------------------------ clock / leave

  /** Clock trail per employee/day within the month: hours of closed sessions. */
  private async clockByDay(employeeIds: string[], days: string[], ctx: RequestContext) {
    const from = new Date(`${days[0]}T00:00:00.000Z`);
    const to = new Date(`${days[days.length - 1]}T23:59:59.999Z`);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'hcm.attendance',
        objectType: 'Employee',
        occurredAt: {
          gte: new Date(from.getTime() - 86_400_000),
          lte: new Date(to.getTime() + 86_400_000),
        },
      },
      orderBy: { occurredAt: 'asc' },
      take: 50_000,
    });
    const wanted = new Set(employeeIds);
    const result = new Map<string, Map<string, number>>(); // employee → day → ms
    const open = new Map<string, number>();
    for (const e of events) {
      const v = e.newValues as { employeeId?: string; event?: string; at?: string } | null;
      if (!v?.employeeId || !wanted.has(v.employeeId)) continue;
      const at = v.at ? Date.parse(v.at) : e.occurredAt.getTime();
      if (v.event === 'IN') {
        open.set(v.employeeId, at);
        const day = new Date(at).toISOString().slice(0, 10);
        if (at >= from.getTime() && at <= to.getTime()) {
          const byDay = result.get(v.employeeId) ?? new Map<string, number>();
          if (!byDay.has(day)) byDay.set(day, 0);
          result.set(v.employeeId, byDay);
        }
      } else if (v.event === 'OUT') {
        const since = open.get(v.employeeId);
        if (since === undefined) continue;
        open.delete(v.employeeId);
        if (since < from.getTime() || since > to.getTime()) continue;
        const day = new Date(since).toISOString().slice(0, 10);
        const byDay = result.get(v.employeeId) ?? new Map<string, number>();
        byDay.set(day, (byDay.get(day) ?? 0) + (at - since));
        result.set(v.employeeId, byDay);
      }
    }
    return result;
  }

  /** Granted leave days per employee (leave key: `${employeeId}:leave:${from}:${to}`). */
  private async leaveByDay(employeeIds: string[], days: string[], ctx: RequestContext) {
    const result = new Map<string, Set<string>>();
    if (!this.leave || !employeeIds.length) return result;
    const keys = await this.leave.grantedLeaveKeys(ctx.tenantId, employeeIds);
    const inMonth = new Set(days);
    for (const key of keys) {
      const [employeeId, kind, from, to] = key.split(':');
      if (kind !== 'leave' || !employeeId || !from || !to) continue;
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) continue;
      for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
        const day = new Date(t).toISOString().slice(0, 10);
        if (!inMonth.has(day)) continue;
        const set = result.get(employeeId) ?? new Set<string>();
        set.add(day);
        result.set(employeeId, set);
      }
    }
    return result;
  }

  private async suggestions(
    employeeIds: string[],
    days: string[],
    model: AttendanceModel,
    ctx: RequestContext,
  ) {
    const out = new Map<string, Map<string, { status: string; source: 'LEAVE' | 'CLOCK' }>>();
    if (model === 'CLOCK' || model === 'BOTH') {
      const clock = await this.clockByDay(employeeIds, days, ctx);
      for (const [employeeId, byDay] of clock) {
        const m = out.get(employeeId) ?? new Map();
        for (const day of byDay.keys()) m.set(day, { status: 'PRESENT', source: 'CLOCK' });
        out.set(employeeId, m);
      }
    }
    // Granted leave wins over a clock suggestion on the same day.
    const leave = await this.leaveByDay(employeeIds, days, ctx);
    for (const [employeeId, set] of leave) {
      const m = out.get(employeeId) ?? new Map();
      for (const day of set) m.set(day, { status: 'ANNUAL', source: 'LEAVE' });
      out.set(employeeId, m);
    }
    return out;
  }

  // ------------------------------------------------------ queries

  async matrix(params: { year: number; month: number }, ctx: RequestContext) {
    const days = monthDays(params.year, params.month);
    const settings = await this.settings(ctx);
    const employees = await this.employees(ctx);
    const ids = employees.map((e) => e.id);
    const rows = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId: ctx.tenantId,
        employeeId: { in: ids },
        day: { gte: new Date(days[0]!), lte: new Date(days[days.length - 1]!) },
      },
    });
    const cells = new Map<string, Record<string, Cell>>();
    for (const r of rows) {
      const c = cells.get(r.employeeId) ?? {};
      c[dayOf(r.day)] = { status: r.statusKey, source: r.source, version: r.version, note: r.note };
      cells.set(r.employeeId, c);
    }
    const suggested = await this.suggestions(ids, days, settings.model, ctx);
    const known = new Set(settings.statuses.map((s) => s.key));
    return {
      year: params.year,
      month: params.month,
      days,
      model: settings.model,
      statuses: settings.statuses,
      periodStatus: await this.periodStatus(params.year, params.month, ctx),
      employees: employees.map((e) => {
        const own = cells.get(e.id) ?? {};
        const sug: Record<string, { status: string; source: string }> = {};
        for (const [day, s] of suggested.get(e.id) ?? []) {
          if (!own[day] && known.has(s.status)) sug[day] = s;
        }
        return {
          id: e.id,
          employeeNumber: e.employeeNumber,
          name: e.name,
          cells: own,
          suggestions: sug,
        };
      }),
    };
  }

  /** "Presjek": per employee counts per status, worked days, clock hours. */
  async digest(params: { year: number; month: number }, ctx: RequestContext) {
    const days = monthDays(params.year, params.month);
    const settings = await this.settings(ctx);
    const worked = new Set(settings.statuses.filter((s) => s.countsAsWorked).map((s) => s.key));
    const employees = await this.employees(ctx);
    const ids = employees.map((e) => e.id);
    const rows = await this.prisma.attendanceDay.findMany({
      where: {
        tenantId: ctx.tenantId,
        employeeId: { in: ids },
        day: { gte: new Date(days[0]!), lte: new Date(days[days.length - 1]!) },
      },
    });
    const clock = await this.clockByDay(ids, days, ctx);
    const out = employees.map((e) => {
      const own = rows.filter((r) => r.employeeId === e.id);
      const counts: Record<string, number> = {};
      for (const r of own) counts[r.statusKey] = (counts[r.statusKey] ?? 0) + 1;
      const ms = [...(clock.get(e.id)?.values() ?? [])].reduce((s, v) => s + v, 0);
      return {
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        name: e.name,
        counts,
        workedDays: own.filter((r) => worked.has(r.statusKey)).length,
        recordedDays: own.length,
        unrecordedDays: days.length - own.length,
        clockHours: (ms / 3_600_000).toFixed(2),
      };
    });
    return {
      year: params.year,
      month: params.month,
      periodStatus: await this.periodStatus(params.year, params.month, ctx),
      statuses: settings.statuses,
      rows: out,
      totals: {
        workedDays: out.reduce((s, r) => s + r.workedDays, 0),
        clockHours: out.reduce((s, r) => s + Number(r.clockHours), 0).toFixed(2),
      },
    };
  }

  /** Worked days per employee for a YYYY-MM period (payroll source). */
  async workedDaysFor(period: string, ctx: RequestContext): Promise<Map<string, number>> {
    const [y, m] = period.split('-').map(Number);
    const d = await this.digest({ year: y!, month: m! }, ctx);
    return new Map(d.rows.map((r) => [r.employeeId, r.workedDays]));
  }

  /** "Kontrola izmjena": audited changes in the month (old → new). */
  async changes(
    params: { year: number; month: number; employeeId?: string | undefined },
    ctx: RequestContext,
  ) {
    monthDays(params.year, params.month);
    const ym = `${params.year}-${String(params.month).padStart(2, '0')}`;
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'hcm.attendance_day.set',
        objectType: 'AttendanceDay',
        objectId: params.employeeId
          ? { startsWith: `${params.employeeId}:${ym}-` }
          : { contains: `:${ym}-` },
      },
      orderBy: { occurredAt: 'desc' },
      take: 1000,
    });
    const employees = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, employeeNumber: true, name: true },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));
    return events.map((e) => {
      const [employeeId, day] = e.objectId.split(':');
      const prev = (e.previousValues ?? {}) as { status?: string | null; source?: string | null };
      const next = (e.newValues ?? {}) as {
        status?: string | null;
        source?: string | null;
        note?: string | null;
      };
      return {
        at: e.occurredAt.toISOString(),
        actorId: e.actorId,
        employeeId,
        employeeNumber: byId.get(employeeId ?? '')?.employeeNumber ?? null,
        employeeName: byId.get(employeeId ?? '')?.name ?? null,
        day,
        from: prev.status ?? null,
        to: next.status ?? null,
        source: next.source ?? null,
        note: next.note ?? null,
      };
    });
  }

  // ------------------------------------------------------ commands

  /**
   * Set (or clear with statusKey=null) one day. Optimistic concurrency via
   * expectedVersion (0 = the day must still be empty); setting the same
   * status again is a no-op (idempotent, no audit).
   */
  async setDay(
    input: {
      employeeId: string;
      day: string;
      statusKey: string | null;
      note?: string | undefined;
      expectedVersion?: number | undefined;
    },
    ctx: RequestContext,
  ) {
    if (!DATE_RE.test(input.day))
      throw new DomainError('VALIDATION_FAILED', 'Day must be YYYY-MM-DD');
    const settings = await this.settings(ctx);
    if (settings.model === 'CLOCK') {
      throw new DomainError(
        'INVALID_STATE',
        'This tenant records attendance by clock only (hcm.attendanceModel = CLOCK)',
      );
    }
    if (input.statusKey !== null && !settings.statuses.some((s) => s.key === input.statusKey)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown attendance status '${input.statusKey}'`);
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, tenantId: ctx.tenantId },
    });
    if (!employee) throw notFound('Employee', input.employeeId);
    await this.assertEditable(input.day, ctx);
    await this.ensurePeriod(input.day, ctx);
    const note = input.note?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      await this.lockedInTx(tx, input.day, ctx);
      const existing = await tx.attendanceDay.findFirst({
        where: { tenantId: ctx.tenantId, employeeId: employee.id, day: new Date(input.day) },
      });
      const current = existing?.version ?? 0;
      if (input.expectedVersion !== undefined && input.expectedVersion !== current) {
        throw new DomainError(
          'CONFLICT',
          'The day was changed by someone else — reload the matrix',
          { currentVersion: current, currentStatus: existing?.statusKey ?? null },
        );
      }
      if ((existing?.statusKey ?? null) === input.statusKey && (existing?.note ?? null) === note) {
        return {
          employeeId: employee.id,
          day: input.day,
          status: input.statusKey,
          version: current,
          changed: false,
        };
      }
      let version = 0;
      if (input.statusKey === null) {
        if (existing) {
          const removed = await tx.attendanceDay.deleteMany({
            where: { id: existing.id, tenantId: ctx.tenantId, version: existing.version },
          });
          if (removed.count === 0)
            throw new DomainError('CONFLICT', 'The day was changed meanwhile — reload');
        }
      } else if (existing) {
        const updated = await tx.attendanceDay.updateMany({
          where: { id: existing.id, tenantId: ctx.tenantId, version: existing.version },
          data: {
            statusKey: input.statusKey,
            source: 'MANUAL',
            note,
            version: { increment: 1 },
            updatedBy: ctx.userId ?? null,
          },
        });
        if (updated.count === 0)
          throw new DomainError('CONFLICT', 'The day was changed meanwhile — reload');
        version = existing.version + 1;
      } else {
        try {
          await tx.attendanceDay.create({
            data: {
              tenantId: ctx.tenantId,
              employeeId: employee.id,
              day: new Date(input.day),
              statusKey: input.statusKey,
              source: 'MANUAL',
              note,
              updatedBy: ctx.userId ?? null,
            },
          });
        } catch (error) {
          if ((error as { code?: string }).code === 'P2002') {
            throw new DomainError('CONFLICT', 'The day was set meanwhile — reload');
          }
          throw error;
        }
        version = 1;
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'hcm.attendance_day.set',
        objectType: 'AttendanceDay',
        objectId: `${employee.id}:${input.day}`,
        source: 'api',
        previousValues: { status: existing?.statusKey ?? null, source: existing?.source ?? null },
        newValues: { status: input.statusKey, source: 'MANUAL', note } as Prisma.InputJsonValue,
      });
      return {
        employeeId: employee.id,
        day: input.day,
        status: input.statusKey,
        version,
        changed: true,
      };
    });
  }

  /**
   * Apply clock/leave suggestions to EMPTY days of the month only — a set
   * day is never overwritten. Idempotent: a second run applies nothing.
   */
  async applySuggestions(params: { year: number; month: number }, ctx: RequestContext) {
    const days = monthDays(params.year, params.month);
    const settings = await this.settings(ctx);
    if (settings.model === 'CLOCK') {
      throw new DomainError('INVALID_STATE', 'Clock-only tenants have no matrix to fill');
    }
    await this.assertEditable(days[0]!, ctx);
    const matrix = await this.matrix(params, ctx);
    const todo = matrix.employees.flatMap((e) =>
      Object.entries(e.suggestions).map(([day, s]) => ({ employeeId: e.id, day, ...s })),
    );
    if (todo.length > MAX_APPLY) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Too many suggestions (${todo.length}) — apply per employee`,
      );
    }
    let applied = 0;
    await this.ensurePeriod(days[0]!, ctx);
    await this.prisma.$transaction(async (tx) => {
      await this.lockedInTx(tx, days[0]!, ctx);
      for (const s of todo) {
        const created = await tx.attendanceDay.createMany({
          data: [
            {
              tenantId: ctx.tenantId,
              employeeId: s.employeeId,
              day: new Date(s.day),
              statusKey: s.status,
              source: s.source,
              updatedBy: ctx.userId ?? null,
            },
          ],
          skipDuplicates: true,
        });
        if (created.count === 0) continue;
        applied += 1;
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'hcm.attendance_day.set',
          objectType: 'AttendanceDay',
          objectId: `${s.employeeId}:${s.day}`,
          source: 'api',
          previousValues: { status: null, source: null },
          newValues: { status: s.status, source: s.source, note: null },
        });
      }
    });
    return { applied, skipped: todo.length - applied };
  }

  async lockMonth(params: { year: number; month: number }, ctx: RequestContext) {
    monthDays(params.year, params.month);
    const period = await this.prisma.attendancePeriod.upsert({
      where: {
        tenantId_year_month: { tenantId: ctx.tenantId, year: params.year, month: params.month },
      },
      create: { tenantId: ctx.tenantId, year: params.year, month: params.month },
      update: {},
    });
    if (period.status === 'LOCKED')
      return { year: params.year, month: params.month, status: 'LOCKED' };
    const flipped = await this.prisma.attendancePeriod.updateMany({
      where: { id: period.id, tenantId: ctx.tenantId, status: 'OPEN' },
      data: { status: 'LOCKED', lockedAt: new Date(), lockedBy: ctx.userId ?? null },
    });
    if (flipped.count > 0) {
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'hcm.attendance_period.lock',
        objectType: 'AttendancePeriod',
        objectId: period.id,
        source: 'api',
        previousValues: { status: 'OPEN' },
        newValues: { status: 'LOCKED', year: params.year, month: params.month },
      });
    }
    return { year: params.year, month: params.month, status: 'LOCKED' };
  }

  async unlockMonth(params: { year: number; month: number; reason: string }, ctx: RequestContext) {
    monthDays(params.year, params.month);
    if (params.reason.trim().length < 5) {
      throw new DomainError('VALIDATION_FAILED', 'Unlocking needs a reason (min. 5 characters)');
    }
    const period = await this.prisma.attendancePeriod.findFirst({
      where: { tenantId: ctx.tenantId, year: params.year, month: params.month },
    });
    if (!period || period.status !== 'LOCKED') {
      return { year: params.year, month: params.month, status: 'OPEN' };
    }
    // Serialize with payroll confirmation (which share-locks this row) and
    // refuse once a confirmed payroll depends on the month (HCM-013).
    const flipped = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM attendance_period WHERE id = ${period.id}::uuid FOR UPDATE`;
      const payroll = await tx.payrollRun.findFirst({
        where: { tenantId: ctx.tenantId, year: params.year, month: params.month },
      });
      if (payroll?.status === 'CONFIRMED') {
        throw new DomainError(
          'INVALID_STATE',
          'The payroll for this month is confirmed — attendance cannot be unlocked',
        );
      }
      return tx.attendancePeriod.updateMany({
        where: { id: period.id, tenantId: ctx.tenantId, status: 'LOCKED' },
        data: { status: 'OPEN', unlockReason: params.reason.trim() },
      });
    });
    if (flipped.count > 0) {
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'hcm.attendance_period.unlock',
        objectType: 'AttendancePeriod',
        objectId: period.id,
        source: 'api',
        previousValues: { status: 'LOCKED' },
        newValues: { status: 'OPEN', year: params.year, month: params.month },
        reason: params.reason.trim(),
      });
    }
    return { year: params.year, month: params.month, status: 'OPEN' };
  }
}
