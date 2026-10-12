import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { DEFAULT_ATTENDANCE_STATUSES, type AttendanceStatusDef } from './attendance.service';
import type { PrivateDocumentGate } from './contract.service';
import type { WorkforceConfigGate } from './workforce.service';

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
    input: { from: string; to: string; type: SelfLeaveType; note?: string | undefined },
    ctx: RequestContext,
  ) {
    if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) {
      throw new DomainError('VALIDATION_FAILED', 'Dates must be YYYY-MM-DD');
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
    const leaveKey = `${e.id}:leave:${input.from}:${input.to}`;
    // Serialize per period (double click / retry): the check and the
    // approval request run under one advisory lock, so only one approval
    // can exist for the key.
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`hcm_leave:${ctx.tenantId}:${leaveKey}`}, 0))`;
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
        return { status: 'REQUESTED', duplicate: false };
      },
      { timeout: 15_000 },
    );
    if (outcome.duplicate) return { from: input.from, to: input.to, ...outcome };
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.self.leave.request',
      objectType: 'Employee',
      objectId: e.id,
      source: 'api',
      newValues: {
        type: input.type,
        from: input.from,
        to: input.to,
        ...(input.note ? { note: input.note.slice(0, 300) } : {}),
      },
    });
    return { from: input.from, to: input.to, status: 'REQUESTED', duplicate: false };
  }

  async contracts(ctx: RequestContext) {
    const e = await this.me(ctx);
    const rows = await this.prisma.employmentContract.findMany({
      where: { tenantId: ctx.tenantId, employeeId: e.id },
      orderBy: { startDate: 'desc' },
      take: 50,
    });
    return rows.map((c) => ({
      id: c.id,
      contractNumber: c.contractNumber,
      contractType: c.contractType,
      startDate: day(c.startDate),
      endDate: c.endDate ? day(c.endDate) : null,
      position: c.position,
      status: c.status,
      content: c.content,
    }));
  }

  async myDocuments(ctx: RequestContext) {
    const e = await this.me(ctx);
    return this.documents.listPrivateDocuments('hcm_employee', e.id, ctx);
  }

  async downloadDocument(attachmentId: string, ctx: RequestContext) {
    const e = await this.me(ctx);
    const doc = await this.documents.readPrivateDocument('hcm_employee', attachmentId, ctx);
    // Another employee's document behaves as non-existent.
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
    const lines = await this.prisma.payrollLine.findMany({
      where: { tenantId: ctx.tenantId, employeeId: e.id },
      select: { runId: true },
      take: 120,
    });
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        tenantId: ctx.tenantId,
        id: { in: lines.map((l) => l.runId) },
        status: 'CONFIRMED',
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true, currency: true },
    });
    return runs;
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
