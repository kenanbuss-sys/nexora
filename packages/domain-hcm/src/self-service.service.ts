import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { DEFAULT_ATTENDANCE_STATUSES, type AttendanceStatusDef } from './attendance.service';
import type { PrivateDocumentGate } from './contract.service';
import { withLeaveLock, type WorkforceConfigGate } from './workforce.service';

/**
 * HCM-018 (Sprint 253) — employee self-service: the signed-in user sees
 * ONLY the employee record linked to them (`employee.user_id`); no
 * endpoint takes an employee id from the client. Profile, own attendance
 * month, own leave (list + request), own contracts and private documents.
 * Payslips are OFF by design and appear only when the tenant enables
 * `hcm.selfService.payslips` — and then only CONFIRMED runs. Document and
 * payslip reads are audited.
 */

/** Cross-domain contract: approvals (owned by WF). */
export interface SelfLeaveGate {
  requestApproval(
    input: { title: string; subjectObjectType: string; subjectObjectId: string },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  /** Leave approvals whose subject id starts with `prefix`, newest first. */
  listForSubjectPrefix(
    tenantId: string,
    subjectObjectType: string,
    prefix: string,
  ): Promise<Array<{ subjectObjectId: string; title: string; status: string; createdAt: Date }>>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEAVE_TYPES = ['GODISNJI', 'BOLOVANJE', 'PLACENO', 'NEPLACENO', 'OSTALO'] as const;
export type SelfLeaveType = (typeof LEAVE_TYPES)[number];
const day = (d: Date) => d.toISOString().slice(0, 10);
const isCalendarDate = (s: string) => {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && day(d) === s;
};

export class SelfServiceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: WorkforceConfigGate,
    private readonly documents: Pick<
      PrivateDocumentGate,
      'listPrivateDocuments' | 'readPrivateDocument'
    >,
    private readonly leave: SelfLeaveGate,
  ) {}

  /** The employee linked to the caller; 404 with a clear reason otherwise. */
  private async me(ctx: RequestContext) {
    if (!ctx.userId) throw new DomainError('FORBIDDEN', 'Self-service needs a signed-in user');
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
    });
    if (!employee) {
      throw new DomainError(
        'NOT_FOUND',
        'Your user is not linked to an employee record — ask HR to link it',
      );
    }
    return employee;
  }

  private async hcmConfig(tenantId: string): Promise<Record<string, unknown>> {
    try {
      const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
      return ((config as Record<string, unknown>)?.hcm ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async payslipsEnabled(tenantId: string): Promise<boolean> {
    const hcm = await this.hcmConfig(tenantId);
    const self = (hcm.selfService ?? {}) as { payslips?: unknown };
    return self.payslips === true;
  }

  async profile(ctx: RequestContext) {
    const e = await this.me(ctx);
    return {
      employeeNumber: e.employeeNumber,
      name: e.name,
      email: e.email,
      title: e.title,
      status: e.status,
      hiredAt: e.hiredAt ? day(e.hiredAt) : null,
      qualificationLevel: e.qualificationLevel,
      payslipsEnabled: await this.payslipsEnabled(ctx.tenantId),
    };
  }

  async attendance(params: { year: number; month: number }, ctx: RequestContext) {
    if (!Number.isInteger(params.year) || params.month < 1 || params.month > 12) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid year/month');
    }
    const e = await this.me(ctx);
    const from = new Date(Date.UTC(params.year, params.month - 1, 1));
    const to = new Date(Date.UTC(params.year, params.month, 1));
    const [rows, period, hcm] = await Promise.all([
      this.prisma.attendanceDay.findMany({
        where: { tenantId: ctx.tenantId, employeeId: e.id, day: { gte: from, lt: to } },
        orderBy: { day: 'asc' },
        select: { day: true, statusKey: true },
      }),
      this.prisma.attendancePeriod.findFirst({
        where: { tenantId: ctx.tenantId, year: params.year, month: params.month },
        select: { status: true },
      }),
      this.hcmConfig(ctx.tenantId),
    ]);
    const configured = Array.isArray(hcm.attendanceStatuses)
      ? (hcm.attendanceStatuses as AttendanceStatusDef[]).filter(
          (s) => typeof s?.key === 'string' && typeof s?.label === 'string',
        )
      : [];
    const statuses = configured.length ? configured : DEFAULT_ATTENDANCE_STATUSES;
    const byKey = new Map(statuses.map((s) => [s.key, s]));
    const days = rows.map((r) => ({
      day: day(r.day),
      statusKey: r.statusKey,
      label: byKey.get(r.statusKey)?.label ?? r.statusKey,
      countsAsWorked: byKey.get(r.statusKey)?.countsAsWorked ?? false,
    }));
    return {
      year: params.year,
      month: params.month,
      locked: period?.status === 'LOCKED',
      workedDays: days.filter((d) => d.countsAsWorked).length,
      days,
    };
  }

  async leaveList(ctx: RequestContext) {
    const e = await this.me(ctx);
    const rows = await this.leave.listForSubjectPrefix(ctx.tenantId, 'hcm_leave', `${e.id}:leave:`);
    return rows.map((r) => {
      const [, , from = '', to = ''] = r.subjectObjectId.split(':');
      const type = /^Odsustvo \(([^)]+)\)/.exec(r.title)?.[1] ?? null;
      return { from, to, type, status: r.status, requestedAt: r.createdAt.toISOString() };
    });
  }

  /**
   * Request own leave. Same key as HR-entered leave (`<employee>:leave:from:to`),
   * so HR and the employee can never create two approvals for one period.
   */
  async requestLeave(
    input: { from: string; to: string; type: SelfLeaveType },
    ctx: RequestContext,
  ) {
    if (!isCalendarDate(input.from) || !isCalendarDate(input.to)) {
      throw new DomainError('VALIDATION_FAILED', 'Dates must be real YYYY-MM-DD dates');
    }
    if (input.to < input.from) {
      throw new DomainError('VALIDATION_FAILED', 'Leave cannot end before it starts');
    }
    if (!LEAVE_TYPES.includes(input.type)) {
      throw new DomainError('VALIDATION_FAILED', 'Unknown leave type');
    }
    const days = (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000 + 1;
    if (days > 366) throw new DomainError('VALIDATION_FAILED', 'Leave longer than a year');
    const e = await this.me(ctx);
    // Former employees keep read access to their own records, but cannot
    // file new requests.
    if (e.status !== 'ACTIVE') {
      throw new DomainError('INVALID_STATE', 'Only active employees can request leave');
    }
    const leaveKey = `${e.id}:leave:${input.from}:${input.to}`;
    // Serialized per period with the HR path (same lock and key): a double
    // click, a retry or HR entering the same period never create two
    // approvals. The note is free text (may hold health details) and is
    // deliberately not stored anywhere.
    const outcome = await withLeaveLock(this.prisma, ctx.tenantId, leaveKey, async (tx) => {
      const existing = await this.leave.listForSubjectPrefix(ctx.tenantId, 'hcm_leave', leaveKey);
      const open = existing.find(
        (r) => r.subjectObjectId === leaveKey && ['REQUESTED', 'GRANTED'].includes(r.status),
      );
      if (open) return { status: open.status, duplicate: true };
      await this.leave.requestApproval(
        {
          title: `Odsustvo (${input.type}): ${e.name} ${input.from} → ${input.to}`,
          subjectObjectType: 'hcm_leave',
          subjectObjectId: leaveKey,
        },
        ctx,
      );
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'hcm.self.leave.request',
        objectType: 'Employee',
        objectId: e.id,
        source: 'api',
        newValues: { type: input.type, from: input.from, to: input.to },
      });
      return { status: 'REQUESTED', duplicate: false };
    });
    return { from: input.from, to: input.to, ...outcome };
  }

  /**
   * Own contracts. A contract that states the salary is shown in full only
   * when the company opened salary data to self-service (same switch as
   * payslips); such reads are audited.
   */
  async contracts(ctx: RequestContext) {
    const e = await this.me(ctx);
    const salaryVisible = await this.payslipsEnabled(ctx.tenantId);
    const rows = await this.prisma.employmentContract.findMany({
      where: { tenantId: ctx.tenantId, employeeId: e.id },
      orderBy: { startDate: 'desc' },
      take: 50,
    });
    const withSalary = rows.filter((c) => c.containsSalary && salaryVisible).map((c) => c.id);
    if (withSalary.length > 0) {
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'hcm.self.contract.read',
        objectType: 'Employee',
        objectId: e.id,
        source: 'api',
        newValues: { contractIds: withSalary },
      });
    }
    return rows.map((c) => {
      const restricted = c.containsSalary && !salaryVisible;
      return {
        id: c.id,
        contractNumber: c.contractNumber,
        contractType: c.contractType,
        startDate: day(c.startDate),
        endDate: c.endDate ? day(c.endDate) : null,
        position: c.position,
        status: c.status,
        restricted,
        content: restricted ? null : c.content,
      };
    });
  }

  async myDocuments(ctx: RequestContext) {
    const e = await this.me(ctx);
    return this.documents.listPrivateDocuments('hcm_employee', e.id, ctx);
  }

  async downloadDocument(attachmentId: string, ctx: RequestContext) {
    const e = await this.me(ctx);
    // Only ids from the caller's own list are read at all: another
    // employee's document behaves exactly like a missing one.
    const own = await this.documents.listPrivateDocuments('hcm_employee', e.id, ctx);
    if (!own.some((d) => d.id === attachmentId)) throw notFound('Attachment', attachmentId);
    const doc = await this.documents.readPrivateDocument('hcm_employee', attachmentId, ctx);
    if (doc.entityId !== e.id) throw notFound('Attachment', attachmentId);
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.self.document.read',
      objectType: 'Employee',
      objectId: e.id,
      source: 'api',
      newValues: { attachmentId: doc.id },
    });
    return doc;
  }

  private async assertPayslips(ctx: RequestContext) {
    if (!(await this.payslipsEnabled(ctx.tenantId))) {
      throw new DomainError(
        'FORBIDDEN',
        'Payslips are not available in self-service for this company (hcm.selfService.payslips)',
      );
    }
  }

  async payslips(ctx: RequestContext) {
    await this.assertPayslips(ctx);
    const e = await this.me(ctx);
    return this.prisma.payrollRun.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'CONFIRMED',
        lines: { some: { tenantId: ctx.tenantId, employeeId: e.id } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 120,
      select: { year: true, month: true, currency: true },
    });
  }

  async payslip(params: { year: number; month: number }, ctx: RequestContext) {
    await this.assertPayslips(ctx);
    const e = await this.me(ctx);
    const run = await this.prisma.payrollRun.findFirst({
      where: {
        tenantId: ctx.tenantId,
        year: params.year,
        month: params.month,
        status: 'CONFIRMED',
      },
    });
    const line = run
      ? await this.prisma.payrollLine.findFirst({
          where: { tenantId: ctx.tenantId, runId: run.id, employeeId: e.id },
        })
      : null;
    if (!run || !line) throw notFound('Payslip', `${params.year}-${params.month}`);
    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: {
        tenantId: ctx.tenantId,
        year: params.year,
        month: params.month,
        employeeId: e.id,
        // Only what the confirmed snapshot contains.
        ...(run.confirmedAt ? { createdAt: { lte: run.confirmedAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.self.payslip.view',
      objectType: 'PayrollLine',
      objectId: line.id,
      source: 'api',
      newValues: { year: params.year, month: params.month },
    });
    return {
      title: `ISPLATNI LISTIĆ ${String(params.month).padStart(2, '0')}/${params.year}`,
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
