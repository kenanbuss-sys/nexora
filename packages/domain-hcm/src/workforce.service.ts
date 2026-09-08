import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Workforce operations (HCM-002/003/004/006/007/009/012). Shifts are
 * configuration; attendance, shift assignments, certifications and
 * training completions live on the append-only audit trail; leave
 * rides the WF approval engine; payroll export goes through the
 * connector port exactly once per period.
 */

/** Cross-domain contract: tenant configuration (owned by core). */
export interface WorkforceConfigGate {
  getEffectiveConfiguration(tenantId: string): Promise<{ config: unknown }>;
}

/** Cross-domain contract: approvals (owned by WF). */
export interface LeaveApprovalGate {
  requestApproval(
    input: { title: string; subjectObjectType: string; subjectObjectId: string },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
  getStatusFor(
    tenantId: string,
    subjectObjectType: string,
    subjectObjectId: string,
  ): Promise<'NONE' | 'REQUESTED' | 'GRANTED' | 'REJECTED'>;
}

/** Cross-domain contract: connector push (owned by INT). */
export interface PayrollConnectorGate {
  pushObject(
    input: { key: string; objectType: string; objectId: string; payload: Record<string, unknown> },
    ctx: RequestContext,
  ): Promise<{ ok: boolean; reference: string }>;
}

export class WorkforceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly configuration: WorkforceConfigGate,
    private readonly approvals?: LeaveApprovalGate,
    private readonly connectors?: PayrollConnectorGate,
  ) {}

  private async employee(employeeId: string, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: ctx.tenantId },
    });
    if (!employee) throw notFound('Employee', employeeId);
    return employee;
  }

  // --------------------------------------------------- attendance (HCM-003)

  async clockEvent(
    input: { employeeId: string; event: 'IN' | 'OUT'; eventId: string },
    ctx: RequestContext,
  ): Promise<{ ok: true; duplicate: boolean }> {
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(input.eventId)) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid event id');
    }
    const employee = await this.employee(input.employeeId, ctx);
    const marker = `${employee.id}:clock:${input.eventId}`;
    const duplicate = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'hcm.attendance',
        objectType: 'Employee',
        objectId: marker,
      },
      select: { id: true },
    });
    if (duplicate) return { ok: true, duplicate: true };
    const last = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'hcm.attendance',
        objectType: 'Employee',
        objectId: { startsWith: `${employee.id}:clock:` },
      },
      orderBy: { occurredAt: 'desc' },
    });
    const lastEvent = (last?.newValues as { event?: string } | null)?.event ?? 'OUT';
    if (lastEvent === input.event) {
      throw new DomainError('INVALID_STATE', `Already clocked ${input.event}`);
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.attendance',
      objectType: 'Employee',
      objectId: marker,
      source: 'api',
      newValues: { employeeId: employee.id, event: input.event, at: new Date().toISOString() },
    });
    return { ok: true, duplicate: false };
  }

  async attendanceReport(
    employeeId: string,
    ctx: RequestContext,
  ): Promise<{ sessions: number; hours: string; open: boolean }> {
    const employee = await this.employee(employeeId, ctx);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'hcm.attendance',
        objectType: 'Employee',
        objectId: { startsWith: `${employee.id}:clock:` },
      },
      orderBy: { occurredAt: 'asc' },
      take: 2000,
    });
    let sessions = 0;
    let ms = 0;
    let openSince: number | null = null;
    for (const event of events) {
      const values = event.newValues as { event?: string; at?: string } | null;
      const at = values?.at ? Date.parse(values.at) : event.occurredAt.getTime();
      if (values?.event === 'IN') openSince = at;
      else if (values?.event === 'OUT' && openSince !== null) {
        ms += at - openSince;
        sessions += 1;
        openSince = null;
      }
    }
    return { sessions, hours: (ms / 3_600_000).toFixed(2), open: openSince !== null };
  }

  // ------------------------------------------------------- shifts (HCM-002)

  private async shiftKeys(tenantId: string): Promise<Set<string>> {
    try {
      const { config } = await this.configuration.getEffectiveConfiguration(tenantId);
      const hcm = ((config as Record<string, unknown>).hcm ?? {}) as Record<string, unknown>;
      const shifts = Array.isArray(hcm.shifts) ? hcm.shifts : [];
      return new Set(
        shifts
          .map((shift) => (shift as { key?: unknown }).key)
          .filter((key): key is string => typeof key === 'string'),
      );
    } catch {
      return new Set();
    }
  }

  async assignShift(
    input: { employeeId: string; shiftKey: string; date: string },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw new DomainError('VALIDATION_FAILED', 'Date must be YYYY-MM-DD');
    }
    const shifts = await this.shiftKeys(ctx.tenantId);
    if (!shifts.has(input.shiftKey)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown shift '${input.shiftKey}'`);
    }
    const employee = await this.employee(input.employeeId, ctx);
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.shift.assign',
      objectType: 'Employee',
      objectId: `${employee.id}:shift:${input.date}`,
      source: 'api',
      newValues: { employeeId: employee.id, shiftKey: input.shiftKey, date: input.date },
    });
    return { ok: true };
  }

  async roster(
    date: string,
    ctx: RequestContext,
  ): Promise<Array<{ employeeId: string; name: string; shiftKey: string }>> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new DomainError('VALIDATION_FAILED', 'Date must be YYYY-MM-DD');
    }
    const events = await this.prisma.auditEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: 'hcm.shift.assign',
        objectId: { endsWith: `:shift:${date}` },
      },
      orderBy: { occurredAt: 'asc' },
      take: 2000,
    });
    const latest = new Map<string, string>();
    for (const event of events) {
      const values = event.newValues as { employeeId?: string; shiftKey?: string } | null;
      if (values?.employeeId && values.shiftKey) latest.set(values.employeeId, values.shiftKey);
    }
    const employees = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...latest.keys()] } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(employees.map((e) => [e.id, e.name]));
    return [...latest.entries()].map(([employeeId, shiftKey]) => ({
      employeeId,
      name: nameOf.get(employeeId) ?? '',
      shiftKey,
    }));
  }

  // -------------------------------------------------------- leave (HCM-004)

  async requestLeave(
    input: { employeeId: string; from: string; to: string; type: string },
    ctx: RequestContext,
  ): Promise<{ approvalId: string; leaveKey: string }> {
    if (!this.approvals) throw new DomainError('INVALID_STATE', 'Approvals are not wired');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
      throw new DomainError('VALIDATION_FAILED', 'Dates must be YYYY-MM-DD');
    }
    if (input.to < input.from) {
      throw new DomainError('VALIDATION_FAILED', 'Leave cannot end before it starts');
    }
    const employee = await this.employee(input.employeeId, ctx);
    const leaveKey = `${employee.id}:leave:${input.from}:${input.to}`;
    const status = await this.approvals.getStatusFor(ctx.tenantId, 'hcm_leave', leaveKey);
    if (status === 'REQUESTED' || status === 'GRANTED') {
      throw new DomainError('CONFLICT', 'This leave is already requested or granted');
    }
    const approval = await this.approvals.requestApproval(
      {
        title: `Odsustvo (${input.type}): ${employee.name} ${input.from} → ${input.to}`,
        subjectObjectType: 'hcm_leave',
        subjectObjectId: leaveKey,
      },
      ctx,
    );
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.leave.request',
      objectType: 'Employee',
      objectId: leaveKey,
      source: 'api',
      newValues: { type: input.type, from: input.from, to: input.to },
    });
    return { approvalId: approval.id, leaveKey };
  }

  async leaveStatus(
    leaveKey: string,
    ctx: RequestContext,
  ): Promise<{ status: 'NONE' | 'REQUESTED' | 'GRANTED' | 'REJECTED' }> {
    if (!this.approvals) throw new DomainError('INVALID_STATE', 'Approvals are not wired');
    return { status: await this.approvals.getStatusFor(ctx.tenantId, 'hcm_leave', leaveKey) };
  }

  // --------------------------------------- certifications & training (HCM-006/007)

  async setCertifications(
    input: { employeeId: string; certifications: Array<{ name: string; until: string }> },
    ctx: RequestContext,
  ): Promise<{ ok: true }> {
    const employee = await this.employee(input.employeeId, ctx);
    for (const cert of input.certifications) {
      if (Number.isNaN(Date.parse(cert.until))) {
        throw new DomainError('VALIDATION_FAILED', `Invalid expiry for '${cert.name}'`);
      }
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.cert.set',
      objectType: 'Employee',
      objectId: employee.id,
      source: 'api',
      newValues: { certifications: input.certifications } as Prisma.InputJsonValue,
    });
    return { ok: true };
  }

  async certifications(
    employeeId: string,
    ctx: RequestContext,
  ): Promise<Array<{ name: string; until: string; expired: boolean }>> {
    const employee = await this.employee(employeeId, ctx);
    const latest = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'hcm.cert.set',
        objectType: 'Employee',
        objectId: employee.id,
      },
      orderBy: { occurredAt: 'desc' },
    });
    const certs =
      (latest?.newValues as { certifications?: Array<{ name: string; until: string }> } | null)
        ?.certifications ?? [];
    return certs.map((cert) => ({
      ...cert,
      expired: new Date(cert.until).getTime() < Date.now(),
    }));
  }

  // -------------------------------------------------- performance (HCM-009)

  async performance(
    employeeId: string,
    ctx: RequestContext,
  ): Promise<{ completedOperations: number; attendanceHours: string }> {
    const employee = await this.employee(employeeId, ctx);
    const attendance = await this.attendanceReport(employeeId, ctx);
    const completedOperations = employee.userId
      ? await this.prisma.workOrderOperation.count({
          where: { tenantId: ctx.tenantId, assignedTo: employee.userId, status: 'DONE' },
        })
      : 0;
    return { completedOperations, attendanceHours: attendance.hours };
  }

  // ------------------------------------------------ payroll export (HCM-012)

  async payrollExport(
    input: { connectorKey: string; period: string },
    ctx: RequestContext,
  ): Promise<{ reference: string; employees: number; existing: boolean }> {
    if (!this.connectors) throw new DomainError('INVALID_STATE', 'Connectors are not wired');
    if (!/^\d{4}-\d{2}$/.test(input.period)) {
      throw new DomainError('VALIDATION_FAILED', 'Period must be YYYY-MM');
    }
    const marker = `${input.connectorKey}:${input.period}`;
    const already = await this.prisma.auditEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        action: 'hcm.payroll.export',
        objectType: 'Payroll',
        objectId: marker,
      },
      orderBy: { occurredAt: 'desc' },
    });
    if (already) {
      return {
        reference: (already.newValues as { reference?: string } | null)?.reference ?? '',
        employees: Number((already.newValues as { employees?: number } | null)?.employees ?? 0),
        existing: true,
      };
    }
    const employees = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE' },
      select: { id: true, employeeNumber: true, name: true },
      take: 1000,
    });
    const rows = [];
    for (const employee of employees) {
      const attendance = await this.attendanceReport(employee.id, ctx);
      rows.push({
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        hours: attendance.hours,
      });
    }
    const result = await this.connectors.pushObject(
      {
        key: input.connectorKey,
        objectType: 'payroll_period',
        objectId: input.period,
        payload: { period: input.period, rows },
      },
      ctx,
    );
    if (!result.ok) {
      throw new DomainError('INVALID_STATE', 'The payroll provider refused the export');
    }
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'hcm.payroll.export',
      objectType: 'Payroll',
      objectId: marker,
      source: 'api',
      newValues: { reference: result.reference, employees: rows.length },
    });
    return { reference: result.reference, employees: rows.length, existing: false };
  }
}
