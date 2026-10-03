import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { EVENT_TYPES, publishToOutbox } from '@nexora/events';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { WorkforceConfigGate } from './workforce.service';

/**
 * HCM-013/014 (Sprint 235) — salary data and payroll.
 *
 * Salary access is a server-side policy over explicit permissions (never
 * roles alone, never allowlists in code — FINTRACK_HR_GAP_REGISTER §B3):
 *   hcm.salary.read        salary circle: salaries, payroll runs, payslips
 *   hcm.salary.contract    contract scope: CURRENT base salary only
 *   hcm.salary.manage      set salaries, adjustments, compute/confirm
 *   hcm.salary.management  management lock layer: employees with
 *                          salaryLocked are invisible/immutable without it
 * Restricted values never leave the API (no redaction-by-UI).
 *
 * Payroll: earned = base net ÷ fund days × worked days (HCM-015 matrix,
 * ODL-002) + bonuses − deductions; DRAFT is recomputable, CONFIRMED is an
 * immutable snapshot and needs the attendance month LOCKED.
 */

export const SALARY_PERMISSIONS = {
  read: 'hcm.salary.read',
  contract: 'hcm.salary.contract',
  manage: 'hcm.salary.manage',
  management: 'hcm.salary.management',
} as const;

export interface SalaryPermissionGate {
  getPermissionKeys(userId: string, tenantId: string): Promise<string[]>;
}

/** Same-domain contract: worked days per employee from the HCM-015 matrix. */
export interface WorkedDaysGate {
  workedDaysFor(period: string, ctx: RequestContext): Promise<Map<string, number>>;
}

interface Access {
  read: boolean;
  contract: boolean;
  manage: boolean;
  management: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Za-z0-9_.:-]{8,80}$/;
const cents = (v: number | string | Prisma.Decimal): number => Math.round(Number(v) * 100);
const money = (c: number): string => (c / 100).toFixed(2);
const day = (d: Date): string => d.toISOString().slice(0, 10);

function monthBounds(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new DomainError('VALIDATION_FAILED', 'Year must be 2000-2100');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new DomainError('VALIDATION_FAILED', 'Month must be 1-12');
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { last, end: new Date(Date.UTC(year, month - 1, last)) };
}

function weekdays(year: number, month: number): number {
  const { last } = monthBounds(year, month);
  let n = 0;
  for (let d = 1; d <= last; d += 1) {
    const wd = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}

export class PayrollService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: WorkforceConfigGate,
    private readonly permissions: SalaryPermissionGate,
    private readonly workedDays: WorkedDaysGate,
  ) {}

  // --------------------------------------------------------------- policy

  private async access(ctx: RequestContext): Promise<Access> {
    // No platform-operator bypass: salary access only via explicit tenant grants.
    const keys = new Set(
      ctx.userId ? await this.permissions.getPermissionKeys(ctx.userId, ctx.tenantId) : [],
    );
    return {
      read: keys.has(SALARY_PERMISSIONS.read),
      contract: keys.has(SALARY_PERMISSIONS.contract),
      manage: keys.has(SALARY_PERMISSIONS.manage),
      management: keys.has(SALARY_PERMISSIONS.management),
    };
  }

  private forbid(permission: string): never {
    throw new DomainError('FORBIDDEN', `Salary data requires the '${permission}' permission`);
  }

  private async settings(ctx: RequestContext) {
    let payroll: Record<string, unknown> = {};
    try {
      const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
      const hcm = ((config as Record<string, unknown>).hcm ?? {}) as Record<string, unknown>;
      payroll = (hcm.payroll ?? {}) as Record<string, unknown>;
    } catch {
      payroll = {};
    }
    const currency =
      typeof payroll.currency === 'string' && /^[A-Z]{3}$/.test(payroll.currency)
        ? payroll.currency
        : 'BAM';
    const fixed =
      typeof payroll.fixedWorkDays === 'number' &&
      Number.isInteger(payroll.fixedWorkDays) &&
      payroll.fixedWorkDays > 0 &&
      payroll.fixedWorkDays <= 31
        ? payroll.fixedWorkDays
        : null;
    return { currency, fixedWorkDays: fixed };
  }

  private async employee(employeeId: string, ctx: RequestContext) {
    const e = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: ctx.tenantId },
    });
    if (!e) throw notFound('Employee', employeeId);
    return e;
  }

  /** A locked employee is treated as non-existent without the management layer. */
  private async visibleEmployee(employeeId: string, access: Access, ctx: RequestContext) {
    const e = await this.employee(employeeId, ctx);
    if (e.salaryLocked && !access.management) throw notFound('Employee', employeeId);
    return e;
  }

  private async audit(
    action: string,
    objectType: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
    previousValues?: Record<string, unknown>,
  ) {
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action,
      objectType,
      objectId,
      source: 'api',
      newValues: newValues as Prisma.InputJsonValue,
      ...(previousValues ? { previousValues: previousValues as Prisma.InputJsonValue } : {}),
    });
  }

  // --------------------------------------------------------------- salary

  async setSalary(
    input: { employeeId: string; netAmount: number; validFrom: string; note?: string | undefined },
    ctx: RequestContext,
  ) {
    const access = await this.access(ctx);
    if (!access.manage) this.forbid(SALARY_PERMISSIONS.manage);
    if (!DATE_RE.test(input.validFrom)) {
      throw new DomainError('VALIDATION_FAILED', 'validFrom must be YYYY-MM-DD');
    }
    const amountC = cents(input.netAmount);
    if (!(amountC > 0))
      throw new DomainError('VALIDATION_FAILED', 'The net salary must be positive');
    const employee = await this.visibleEmployee(input.employeeId, access, ctx);
    const { currency } = await this.settings(ctx);
    try {
      const row = await this.prisma.employeeSalary.create({
        data: {
          tenantId: ctx.tenantId,
          employeeId: employee.id,
          netAmount: money(amountC),
          currency,
          validFrom: new Date(input.validFrom),
          note: input.note?.trim() || null,
          createdBy: ctx.userId ?? null,
        },
      });
      // The audit records the fact, never the amount (audit readers are
      // not necessarily in the salary circle).
      await this.audit(
        'hcm.salary.set',
        'EmployeeSalary',
        row.id,
        {
          employeeId: employee.id,
          validFrom: input.validFrom,
          currency,
        },
        ctx,
      );
      return {
        id: row.id,
        employeeId: employee.id,
        netAmount: money(amountC),
        currency,
        validFrom: input.validFrom,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError(
          'CONFLICT',
          `A salary version valid from ${input.validFrom} already exists`,
        );
      }
      throw error;
    }
  }

  async setSalaryLock(input: { employeeId: string; locked: boolean }, ctx: RequestContext) {
    const access = await this.access(ctx);
    if (!access.management) this.forbid(SALARY_PERMISSIONS.management);
    const employee = await this.employee(input.employeeId, ctx);
    if (employee.salaryLocked === input.locked)
      return { employeeId: employee.id, locked: input.locked };
    await this.prisma.employee.updateMany({
      where: { id: employee.id, tenantId: ctx.tenantId },
      data: { salaryLocked: input.locked },
    });
    await this.audit(
      'hcm.salary.lock',
      'Employee',
      employee.id,
      { salaryLocked: input.locked },
      ctx,
      {
        salaryLocked: employee.salaryLocked,
      },
    );
    return { employeeId: employee.id, locked: input.locked };
  }

  private async effectiveSalary(employeeId: string, onDate: Date, ctx: RequestContext) {
    return this.prisma.employeeSalary.findFirst({
      where: { tenantId: ctx.tenantId, employeeId, validFrom: { lte: onDate } },
      orderBy: { validFrom: 'desc' },
    });
  }

  /**
   * Salary overview. Salary circle: current salary + version history.
   * Contract scope: current base salary only. Locked employees appear
   * only for the management layer.
   */
  async salaries(ctx: RequestContext) {
    const access = await this.access(ctx);
    if (!access.read && !access.contract) this.forbid(SALARY_PERMISSIONS.read);
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'ACTIVE',
        ...(access.management ? {} : { salaryLocked: false }),
      },
      orderBy: { employeeNumber: 'asc' },
      take: 1000,
    });
    const today = new Date(new Date().toISOString().slice(0, 10));
    const rows = [];
    for (const e of employees) {
      const current = await this.effectiveSalary(e.id, today, ctx);
      const history = access.read
        ? await this.prisma.employeeSalary.findMany({
            where: { tenantId: ctx.tenantId, employeeId: e.id },
            orderBy: { validFrom: 'desc' },
            take: 24,
          })
        : [];
      rows.push({
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        name: e.name,
        salaryLocked: e.salaryLocked,
        current: current
          ? {
              netAmount: Number(current.netAmount).toFixed(2),
              currency: current.currency,
              validFrom: day(current.validFrom),
            }
          : null,
        ...(access.read
          ? {
              history: history.map((h) => ({
                netAmount: Number(h.netAmount).toFixed(2),
                currency: h.currency,
                validFrom: day(h.validFrom),
                note: h.note,
              })),
            }
          : {}),
      });
    }
    return { scope: access.read ? 'FULL' : 'CONTRACT', rows };
  }

  // --------------------------------------------------------------- adjustments

  private async run(year: number, month: number, ctx: RequestContext) {
    return this.prisma.payrollRun.findFirst({ where: { tenantId: ctx.tenantId, year, month } });
  }

  async addAdjustment(
    input: {
      year: number;
      month: number;
      employeeId: string;
      kind: 'BONUS' | 'DEDUCTION';
      amount: number;
      reason: string;
      requestKey: string;
    },
    ctx: RequestContext,
  ): Promise<{ id: string; replay: boolean }> {
    const access = await this.access(ctx);
    if (!access.manage) this.forbid(SALARY_PERMISSIONS.manage);
    monthBounds(input.year, input.month);
    if (!KEY_RE.test(input.requestKey)) {
      throw new DomainError('VALIDATION_FAILED', 'requestKey: 8-80 safe characters');
    }
    if (input.reason.trim().length < 3) {
      throw new DomainError('VALIDATION_FAILED', 'An adjustment needs a reason');
    }
    const amountC = cents(input.amount);
    if (!(amountC > 0)) throw new DomainError('VALIDATION_FAILED', 'The amount must be positive');
    const employee = await this.visibleEmployee(input.employeeId, access, ctx);
    const existing = await this.prisma.payrollAdjustment.findFirst({
      where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
    });
    if (existing) {
      const same =
        existing.employeeId === employee.id &&
        existing.year === input.year &&
        existing.month === input.month &&
        existing.kind === input.kind &&
        cents(existing.amount) === amountC;
      if (!same)
        throw new DomainError('CONFLICT', 'This requestKey was used for a different adjustment');
      return { id: existing.id, replay: true };
    }
    const run = await this.run(input.year, input.month, ctx);
    if (run?.status === 'CONFIRMED') {
      throw new DomainError(
        'INVALID_STATE',
        'The payroll for this month is confirmed — use the next month',
      );
    }
    try {
      const row = await this.prisma.payrollAdjustment.create({
        data: {
          tenantId: ctx.tenantId,
          year: input.year,
          month: input.month,
          employeeId: employee.id,
          kind: input.kind,
          amount: money(amountC),
          reason: input.reason.trim(),
          requestKey: input.requestKey,
          createdBy: ctx.userId ?? null,
        },
      });
      await this.audit(
        'hcm.payroll.adjustment',
        'PayrollAdjustment',
        row.id,
        {
          employeeId: employee.id,
          year: input.year,
          month: input.month,
          kind: input.kind,
        },
        ctx,
      );
      return { id: row.id, replay: false };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return this.addAdjustment(input, ctx);
      }
      throw error;
    }
  }

  // --------------------------------------------------------------- compute / confirm

  private async calculate(year: number, month: number, ctx: RequestContext) {
    const { end } = monthBounds(year, month);
    const settings = await this.settings(ctx);
    const fundDays = settings.fixedWorkDays ?? weekdays(year, month);
    const worked = await this.workedDays.workedDaysFor(
      `${year}-${String(month).padStart(2, '0')}`,
      ctx,
    );
    const employees = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
      orderBy: { employeeNumber: 'asc' },
      take: 1000,
    });
    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: { tenantId: ctx.tenantId, year, month },
    });
    const lines = [];
    const missingSalary: string[] = [];
    for (const e of employees) {
      const salary = await this.effectiveSalary(e.id, end, ctx);
      if (!salary) {
        missingSalary.push(e.employeeNumber);
        continue;
      }
      if (salary.currency !== settings.currency) {
        throw new DomainError(
          'INVALID_STATE',
          e.salaryLocked
            ? `A salary is not in the payroll currency ${settings.currency}`
            : `Salary of ${e.employeeNumber} is in ${salary.currency}, payroll currency is ${settings.currency}`,
        );
      }
      const baseC = cents(salary.netAmount);
      const workedDays = worked.get(e.id) ?? 0;
      const earnedC = Math.round((baseC * workedDays) / fundDays);
      const own = adjustments.filter((a) => a.employeeId === e.id);
      const bonusC = own.filter((a) => a.kind === 'BONUS').reduce((s, a) => s + cents(a.amount), 0);
      const deductionC = own
        .filter((a) => a.kind === 'DEDUCTION')
        .reduce((s, a) => s + cents(a.amount), 0);
      lines.push({
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        employeeName: e.name,
        salaryLocked: e.salaryLocked,
        salaryId: salary.id,
        baseNet: money(baseC),
        workedDays,
        fundDays,
        earned: money(earnedC),
        bonuses: money(bonusC),
        deductions: money(deductionC),
        netTotal: money(earnedC + bonusC - deductionC),
        negative: earnedC + bonusC - deductionC < 0,
      });
    }
    return {
      fundDays,
      currency: settings.currency,
      lines,
      missingSalary,
      hasLocked: lines.some((l) => l.salaryLocked),
    };
  }

  private async writeRun(
    year: number,
    month: number,
    calc: Awaited<ReturnType<PayrollService['calculate']>>,
    ctx: RequestContext,
    tx: Prisma.TransactionClient,
  ) {
    let run = await tx.payrollRun.findFirst({ where: { tenantId: ctx.tenantId, year, month } });
    if (run?.status === 'CONFIRMED') {
      throw new DomainError('INVALID_STATE', 'The payroll for this month is already confirmed');
    }
    if (!run) {
      run = await tx.payrollRun.create({
        data: {
          tenantId: ctx.tenantId,
          year,
          month,
          fundDays: calc.fundDays,
          currency: calc.currency,
          computedAt: new Date(),
        },
      });
    } else {
      const bumped = await tx.payrollRun.updateMany({
        where: { id: run.id, tenantId: ctx.tenantId, status: 'DRAFT', version: run.version },
        data: {
          fundDays: calc.fundDays,
          currency: calc.currency,
          computedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (bumped.count === 0)
        throw new DomainError('CONFLICT', 'The payroll changed meanwhile — retry');
    }
    await tx.payrollLine.deleteMany({ where: { tenantId: ctx.tenantId, runId: run.id } });
    if (calc.lines.length) {
      await tx.payrollLine.createMany({
        data: calc.lines.map(({ negative: _negative, ...l }) => ({
          ...l,
          tenantId: ctx.tenantId,
          runId: run.id,
        })),
      });
    }
    return run.id;
  }

  async compute(params: { year: number; month: number }, ctx: RequestContext) {
    const access = await this.access(ctx);
    if (!access.manage) this.forbid(SALARY_PERMISSIONS.manage);
    const calc = await this.calculate(params.year, params.month, ctx);
    this.assertCanTouchLocked(calc.hasLocked, access);
    await this.prisma.$transaction((tx) => this.writeRun(params.year, params.month, calc, ctx, tx));
    await this.audit(
      'hcm.payroll.compute',
      'PayrollRun',
      `${params.year}-${params.month}`,
      { computed: true },
      ctx,
    );
    return this.view(params, ctx);
  }

  /**
   * Confirm: the attendance month must be LOCKED (HCM-015); the run is
   * recomputed and frozen in ONE transaction (status CAS), audited and a
   * payroll.confirmed event (no amounts) goes to the outbox. Idempotent.
   */
  async confirm(params: { year: number; month: number }, ctx: RequestContext) {
    const access = await this.access(ctx);
    if (!access.manage) this.forbid(SALARY_PERMISSIONS.manage);
    monthBounds(params.year, params.month);
    const existing = await this.run(params.year, params.month, ctx);
    if (existing?.status === 'CONFIRMED') return this.view(params, ctx);
    const attendance = await this.prisma.attendancePeriod.findFirst({
      where: { tenantId: ctx.tenantId, year: params.year, month: params.month },
    });
    if (attendance?.status !== 'LOCKED') {
      throw new DomainError(
        'INVALID_STATE',
        'Lock the attendance month (šihtarica) before confirming the payroll',
      );
    }
    const calc = await this.calculate(params.year, params.month, ctx);
    this.assertCanTouchLocked(calc.hasLocked, access);
    if (calc.lines.some((l) => l.negative)) {
      throw new DomainError(
        'INVALID_STATE',
        'A payroll line is negative — fix the deductions first',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      // Serialize with an attendance unlock (FOR SHARE on the month row).
      const rows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM attendance_period
        WHERE tenant_id = ${ctx.tenantId}::uuid AND year = ${params.year} AND month = ${params.month}
        FOR SHARE`;
      if (rows[0]?.status !== 'LOCKED') {
        throw new DomainError('INVALID_STATE', 'The attendance month was unlocked meanwhile');
      }
      const runId = await this.writeRun(params.year, params.month, calc, ctx, tx);
      const flipped = await tx.payrollRun.updateMany({
        where: { id: runId, tenantId: ctx.tenantId, status: 'DRAFT' },
        data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: ctx.userId ?? null },
      });
      if (flipped.count === 0) return;
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'hcm.payroll.confirm',
        objectType: 'PayrollRun',
        objectId: runId,
        source: 'api',
        previousValues: { status: 'DRAFT' },
        newValues: { status: 'CONFIRMED' },
      });
      await publishToOutbox(tx, {
        tenantId: ctx.tenantId,
        eventType: EVENT_TYPES.PAYROLL_CONFIRMED,
        aggregateType: 'PayrollRun',
        aggregateId: runId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        // Deliberately no amounts: events are read beyond the salary circle.
        payload: { runId, year: params.year, month: params.month },
      });
    });
    return this.view(params, ctx);
  }

  /**
   * Computing/confirming freezes salary lines of locked employees too —
   * only the management layer may do that (locked = immutable without it).
   */
  private assertCanTouchLocked(hasLocked: boolean, access: Access) {
    if (hasLocked && !access.management) {
      throw new DomainError(
        'FORBIDDEN',
        `This payroll includes employees under the management lock — it requires '${SALARY_PERMISSIONS.management}'`,
      );
    }
  }

  /** Employees CURRENTLY under the management lock (the lock covers history too). */
  private async lockedNow(ctx: RequestContext): Promise<Set<string>> {
    const rows = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, salaryLocked: true },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** True when a confirmed payroll depends on this attendance month. */
  async isConfirmed(year: number, month: number, ctx: RequestContext): Promise<boolean> {
    return (await this.run(year, month, ctx))?.status === 'CONFIRMED';
  }

  // --------------------------------------------------------------- reads

  async view(params: { year: number; month: number }, ctx: RequestContext) {
    const access = await this.access(ctx);
    if (!access.read) this.forbid(SALARY_PERMISSIONS.read);
    monthBounds(params.year, params.month);
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId: ctx.tenantId, year: params.year, month: params.month },
      include: { lines: { orderBy: { employeeNumber: 'asc' } } },
    });
    const attendance = await this.prisma.attendancePeriod.findFirst({
      where: { tenantId: ctx.tenantId, year: params.year, month: params.month },
    });
    if (!run) {
      return {
        year: params.year,
        month: params.month,
        status: 'NONE',
        attendanceStatus: attendance?.status ?? 'OPEN',
        lines: [],
        visibleTotal: '0.00',
      };
    }
    const locked = await this.lockedNow(ctx);
    const visible = run.lines.filter(
      (l) => access.management || (!l.salaryLocked && !locked.has(l.employeeId)),
    );
    return {
      id: run.id,
      year: run.year,
      month: run.month,
      status: run.status,
      attendanceStatus: attendance?.status ?? 'OPEN',
      fundDays: run.fundDays,
      currency: run.currency,
      computedAt: run.computedAt.toISOString(),
      confirmedAt: run.confirmedAt?.toISOString() ?? null,
      lines: visible.map((l) => ({
        employeeId: l.employeeId,
        employeeNumber: l.employeeNumber,
        employeeName: l.employeeName,
        baseNet: Number(l.baseNet).toFixed(2),
        workedDays: l.workedDays,
        fundDays: l.fundDays,
        earned: Number(l.earned).toFixed(2),
        bonuses: Number(l.bonuses).toFixed(2),
        deductions: Number(l.deductions).toFixed(2),
        netTotal: Number(l.netTotal).toFixed(2),
      })),
      // How many employees are locked is itself management-only information.
      ...(access.management
        ? {
            lockedLinesIncluded: visible.filter((l) => l.salaryLocked || locked.has(l.employeeId))
              .length,
          }
        : {}),
      visibleTotal: money(visible.reduce((s, l) => s + cents(l.netTotal), 0)),
    };
  }

  async payslip(params: { year: number; month: number; employeeId: string }, ctx: RequestContext) {
    const access = await this.access(ctx);
    if (!access.read) this.forbid(SALARY_PERMISSIONS.read);
    const run = await this.run(params.year, params.month, ctx);
    if (!run) throw notFound('PayrollRun', `${params.year}-${params.month}`);
    const line = await this.prisma.payrollLine.findFirst({
      where: { tenantId: ctx.tenantId, runId: run.id, employeeId: params.employeeId },
    });
    const lockedNow = !access.management && (await this.lockedNow(ctx)).has(params.employeeId);
    if (!line || ((line.salaryLocked || lockedNow) && !access.management)) {
      throw notFound('Payslip', params.employeeId);
    }
    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: {
        tenantId: ctx.tenantId,
        year: params.year,
        month: params.month,
        employeeId: params.employeeId,
      },
      orderBy: { createdAt: 'asc' },
    });
    await this.audit(
      'hcm.payslip.view',
      'PayrollLine',
      line.id,
      { employeeId: line.employeeId },
      ctx,
    );
    return {
      title: `ISPLATNI LISTIĆ ${String(params.month).padStart(2, '0')}/${params.year}`,
      status: run.status,
      draft: run.status !== 'CONFIRMED',
      employeeNumber: line.employeeNumber,
      employeeName: line.employeeName,
      currency: run.currency,
      baseNet: Number(line.baseNet).toFixed(2),
      fundDays: line.fundDays,
      workedDays: line.workedDays,
      earned: Number(line.earned).toFixed(2),
      adjustments: adjustments.map((a) => ({
        kind: a.kind,
        amount: Number(a.amount).toFixed(2),
        reason: a.reason,
      })),
      bonuses: Number(line.bonuses).toFixed(2),
      deductions: Number(line.deductions).toFixed(2),
      netTotal: Number(line.netTotal).toFixed(2),
    };
  }
}
