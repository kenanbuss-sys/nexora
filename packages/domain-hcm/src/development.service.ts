import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import type { SalaryPermissionGate } from './payroll.service';
import type { WorkforceConfigGate } from './workforce.service';

/**
 * HCM-017 (Sprint 237) — employee development for production, commercial
 * and retail organisations: qualification levels (tenant catalog),
 * versioned training-plan templates per level, training plans per
 * employee (onboarding, machine/workplace qualification, sales skills…)
 * and an append-only training/mentoring record.
 *
 * Mentor scope is server-side:
 *   hcm.development.manage  all employees; templates; mentor/level assignment
 *   hcm.development.own     only employees whose mentorUserId is the caller;
 *                           cannot change mentor/level assignment
 * Out-of-scope employees behave as non-existent (404). Items in a closed
 * status (Završeno / Osposobljen) cannot be reopened; plans and records
 * are never deleted (corrections are new entries). All changes audited.
 */

export const DEVELOPMENT_PERMISSIONS = {
  manage: 'hcm.development.manage',
  own: 'hcm.development.own',
} as const;

export const TRAINING_ITEM_STATUSES = {
  NOT_STARTED: 'Nije započeto',
  IN_PROGRESS: 'U toku',
  DONE: 'Završeno',
  AWAITING_CHECK: 'Čeka provjeru',
  QUALIFIED: 'Osposobljen (potvrđeno)',
  PARTIALLY_QUALIFIED: 'Djelimično osposobljen',
  NOT_QUALIFIED: 'Nije osposobljen',
  RETRAINING: 'Potrebna ponovna obuka',
  ESCALATED: 'Eskalirano rukovodiocu',
} as const;
export type TrainingItemStatus = keyof typeof TRAINING_ITEM_STATUSES;
const CLOSED_STATUSES = new Set<TrainingItemStatus>(['DONE', 'QUALIFIED']);

export const DEFAULT_QUALIFICATION_LEVELS = [
  { key: 'TRAINEE', label: 'Pripravnik' },
  { key: 'OPERATOR', label: 'Operater' },
  { key: 'SKILLED', label: 'Samostalni radnik' },
  { key: 'EXPERT', label: 'Stručnjak' },
  { key: 'INSTRUCTOR', label: 'Instruktor' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Za-z0-9_.:-]{8,80}$/;
const TEMPLATE_KEY_RE = /^[a-z][a-z0-9-]{1,63}$/;
const ITEM_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const day = (d: Date): string => d.toISOString().slice(0, 10);

interface Scope {
  manage: boolean;
  own: boolean;
  userId: string | undefined;
}

export class DevelopmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly permissions: SalaryPermissionGate,
    private readonly configuration: WorkforceConfigGate,
  ) {}

  // ------------------------------------------------------------ scope

  private async scope(ctx: RequestContext): Promise<Scope> {
    const keys = new Set(
      ctx.userId ? await this.permissions.getPermissionKeys(ctx.userId, ctx.tenantId) : [],
    );
    const s = {
      manage: keys.has(DEVELOPMENT_PERMISSIONS.manage),
      own: keys.has(DEVELOPMENT_PERMISSIONS.own),
      userId: ctx.userId,
    };
    if (!s.manage && !s.own) {
      throw new DomainError(
        'FORBIDDEN',
        `Employee development requires '${DEVELOPMENT_PERMISSIONS.own}' or '${DEVELOPMENT_PERMISSIONS.manage}'`,
      );
    }
    return s;
  }

  private requireManage(s: Scope) {
    if (!s.manage) {
      throw new DomainError(
        'FORBIDDEN',
        `This action requires '${DEVELOPMENT_PERMISSIONS.manage}'`,
      );
    }
  }

  private scopeWhere(s: Scope): Prisma.EmployeeWhereInput {
    return s.manage ? {} : { mentorUserId: s.userId ?? '00000000-0000-0000-0000-000000000000' };
  }

  /** An employee outside the caller's scope is reported as not found. */
  private async member(employeeId: string, s: Scope, ctx: RequestContext) {
    const e = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: ctx.tenantId, ...this.scopeWhere(s) },
    });
    if (!e) throw notFound('Employee', employeeId);
    return e;
  }

  private async audit(
    action: string,
    objectType: string,
    objectId: string,
    newValues: Record<string, unknown>,
    ctx: RequestContext,
    previousValues?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ) {
    await writeAudit(tx ?? this.prisma, {
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

  // ------------------------------------------------------------ settings

  async settings(ctx: RequestContext) {
    let qualificationLevels = DEFAULT_QUALIFICATION_LEVELS;
    try {
      const { config } = await this.configuration.getEffectiveConfiguration(ctx.tenantId);
      const hcm = ((config as Record<string, unknown>).hcm ?? {}) as Record<string, unknown>;
      if (Array.isArray(hcm.qualificationLevels)) {
        const parsed = (hcm.qualificationLevels as unknown[])
          .map((l) => l as { key?: unknown; label?: unknown })
          .filter(
            (l): l is { key: string; label: string } =>
              typeof l.key === 'string' &&
              /^[A-Z][A-Z0-9_]{1,29}$/.test(l.key) &&
              typeof l.label === 'string',
          );
        if (parsed.length) qualificationLevels = parsed;
      }
    } catch {
      qualificationLevels = DEFAULT_QUALIFICATION_LEVELS;
    }
    return {
      qualificationLevels,
      itemStatuses: TRAINING_ITEM_STATUSES,
      closedStatuses: [...CLOSED_STATUSES],
    };
  }

  // ------------------------------------------------------------ assignment

  async assign(
    input: { employeeId: string; mentorUserId: string | null; qualificationLevel: string | null },
    ctx: RequestContext,
  ) {
    const s = await this.scope(ctx);
    this.requireManage(s);
    const e = await this.member(input.employeeId, s, ctx);
    if (input.mentorUserId) {
      const mentor = await this.prisma.user.findFirst({
        where: { id: input.mentorUserId, tenantId: ctx.tenantId },
      });
      if (!mentor) throw notFound('User', input.mentorUserId);
    }
    if (input.qualificationLevel) {
      const { qualificationLevels } = await this.settings(ctx);
      if (!qualificationLevels.some((l) => l.key === input.qualificationLevel)) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Unknown qualification level '${input.qualificationLevel}'`,
        );
      }
    }
    if (
      e.mentorUserId === input.mentorUserId &&
      e.qualificationLevel === input.qualificationLevel
    ) {
      return {
        employeeId: e.id,
        mentorUserId: e.mentorUserId,
        qualificationLevel: e.qualificationLevel,
      };
    }
    await this.prisma.employee.updateMany({
      where: { id: e.id, tenantId: ctx.tenantId },
      data: { mentorUserId: input.mentorUserId, qualificationLevel: input.qualificationLevel },
    });
    await this.audit(
      'hcm.development.assign',
      'Employee',
      e.id,
      { mentorUserId: input.mentorUserId, qualificationLevel: input.qualificationLevel },
      ctx,
      { mentorUserId: e.mentorUserId, qualificationLevel: e.qualificationLevel },
    );
    return {
      employeeId: e.id,
      mentorUserId: input.mentorUserId,
      qualificationLevel: input.qualificationLevel,
    };
  }

  /** Employees in scope with development status (no salary data). */
  async staff(ctx: RequestContext, asOf?: string) {
    const s = await this.scope(ctx);
    const today = new Date(asOf && DATE_RE.test(asOf) ? asOf : day(new Date()));
    const employees = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE', ...this.scopeWhere(s) },
      orderBy: { employeeNumber: 'asc' },
      take: 1000,
    });
    const ids = employees.map((e) => e.id);
    const open = await this.prisma.trainingPlan.findMany({
      where: { tenantId: ctx.tenantId, employeeId: { in: ids }, status: 'OPEN' },
    });
    return employees.map((e) => {
      const mine = open.filter((c) => c.employeeId === e.id);
      return {
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        name: e.name,
        mentorUserId: e.mentorUserId,
        qualificationLevel: e.qualificationLevel,
        openPlans: mine.length,
        overdue: mine.filter((c) => c.dueDate < today).length,
        rechecksDue: mine.filter((c) => c.recheckDate && c.recheckDate <= today).length,
      };
    });
  }

  /** Badge data: overdue plans + due rechecks in the caller's scope. */
  async overview(ctx: RequestContext, asOf?: string) {
    const rows = await this.staff(ctx, asOf);
    return {
      employees: rows.length,
      overdue: rows.reduce((s, r) => s + r.overdue, 0),
      rechecksDue: rows.reduce((s, r) => s + r.rechecksDue, 0),
    };
  }

  // ------------------------------------------------------------ templates

  async publishTemplate(
    input: {
      key: string;
      name: string;
      qualificationLevel?: string | undefined;
      items: Array<{ key: string; text: string }>;
    },
    ctx: RequestContext,
  ) {
    const s = await this.scope(ctx);
    this.requireManage(s);
    if (!TEMPLATE_KEY_RE.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Template key must be kebab-case');
    }
    if (!input.items.length || input.items.length > 100) {
      throw new DomainError('VALIDATION_FAILED', 'A training plan needs 1-100 items');
    }
    const keys = new Set<string>();
    for (const item of input.items) {
      if (!ITEM_KEY_RE.test(item.key) || !item.text.trim()) {
        throw new DomainError('VALIDATION_FAILED', `Invalid item '${item.key}'`);
      }
      if (keys.has(item.key))
        throw new DomainError('VALIDATION_FAILED', `Duplicate item '${item.key}'`);
      keys.add(item.key);
    }
    if (input.qualificationLevel) {
      const { qualificationLevels } = await this.settings(ctx);
      if (!qualificationLevels.some((l) => l.key === input.qualificationLevel)) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `Unknown qualification level '${input.qualificationLevel}'`,
        );
      }
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const last = await this.prisma.trainingPlanTemplate.findFirst({
        where: { tenantId: ctx.tenantId, key: input.key },
        orderBy: { version: 'desc' },
      });
      try {
        const row = await this.prisma.trainingPlanTemplate.create({
          data: {
            tenantId: ctx.tenantId,
            key: input.key,
            version: (last?.version ?? 0) + 1,
            name: input.name.trim(),
            qualificationLevel: input.qualificationLevel ?? null,
            items: input.items.map((i) => ({ key: i.key, text: i.text.trim() })),
            createdBy: ctx.userId ?? null,
          },
        });
        await this.audit(
          'hcm.training_template.publish',
          'TrainingPlanTemplate',
          row.id,
          {
            key: row.key,
            version: row.version,
          },
          ctx,
        );
        return this.templateView(row);
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
    throw new DomainError('CONFLICT', 'Template versioning is busy — retry');
  }

  private templateView(t: Prisma.TrainingPlanTemplateGetPayload<object>) {
    return {
      key: t.key,
      version: t.version,
      name: t.name,
      qualificationLevel: t.qualificationLevel,
      items: t.items as Array<{ key: string; text: string }>,
    };
  }

  /** Latest version of every template. */
  async templates(ctx: RequestContext) {
    await this.scope(ctx);
    const rows = await this.prisma.trainingPlanTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.key)) latest.set(r.key, r);
    return [...latest.values()].map((t) => this.templateView(t));
  }

  // ------------------------------------------------------------ training plans

  async startPlan(
    input: {
      employeeId: string;
      templateKey?: string | undefined;
      dueDate: string;
      recheckDate?: string | undefined;
      requestKey: string;
    },
    ctx: RequestContext,
  ) {
    const s = await this.scope(ctx);
    if (!KEY_RE.test(input.requestKey)) {
      throw new DomainError('VALIDATION_FAILED', 'requestKey: 8-80 safe characters');
    }
    if (!DATE_RE.test(input.dueDate) || (input.recheckDate && !DATE_RE.test(input.recheckDate))) {
      throw new DomainError('VALIDATION_FAILED', 'Dates must be YYYY-MM-DD');
    }
    const e = await this.member(input.employeeId, s, ctx);
    const existing = await this.prisma.trainingPlan.findFirst({
      where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
    });
    if (existing) {
      if (existing.employeeId !== e.id) {
        throw new DomainError('CONFLICT', 'This requestKey was used for another training plan');
      }
      return this.plan(existing.id, ctx);
    }
    // Template: explicit key, else the one matching the employee's qualification level.
    const template = await this.prisma.trainingPlanTemplate.findFirst({
      where: {
        tenantId: ctx.tenantId,
        ...(input.templateKey
          ? { key: input.templateKey }
          : { qualificationLevel: e.qualificationLevel ?? '__none__' }),
      },
      orderBy: { version: 'desc' },
    });
    if (!template) {
      throw new DomainError(
        'VALIDATION_FAILED',
        input.templateKey
          ? `Unknown training-plan template '${input.templateKey}'`
          : 'No training-plan template matches the employee’s qualification level — choose a template',
      );
    }
    const items = template.items as Array<{ key: string; text: string }>;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.trainingPlan.create({
          data: {
            tenantId: ctx.tenantId,
            employeeId: e.id,
            templateKey: template.key,
            templateVersion: template.version,
            title: template.name,
            dueDate: new Date(input.dueDate),
            recheckDate: input.recheckDate ? new Date(input.recheckDate) : null,
            requestKey: input.requestKey,
            createdBy: ctx.userId ?? null,
          },
        });
        await tx.trainingPlanItem.createMany({
          data: items.map((i) => ({
            tenantId: ctx.tenantId,
            planId: row.id,
            itemKey: i.key,
            text: i.text,
            updatedBy: ctx.userId ?? null,
          })),
        });
        await this.audit(
          'hcm.training_plan.start',
          'TrainingPlan',
          row.id,
          {
            employeeId: e.id,
            templateKey: template.key,
            templateVersion: template.version,
          },
          ctx,
          undefined,
          tx,
        );
        return row;
      });
      return this.plan(created.id, ctx);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const winner = await this.prisma.trainingPlan.findFirst({
          where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
        });
        if (winner) return this.plan(winner.id, ctx);
      }
      throw error;
    }
  }

  async plan(id: string, ctx: RequestContext) {
    const s = await this.scope(ctx);
    const c = await this.prisma.trainingPlan.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { items: { orderBy: { itemKey: 'asc' } } },
    });
    if (!c) throw notFound('TrainingPlan', id);
    await this.member(c.employeeId, s, ctx).catch(() => {
      throw notFound('TrainingPlan', id);
    });
    return {
      id: c.id,
      employeeId: c.employeeId,
      title: c.title,
      templateKey: c.templateKey,
      templateVersion: c.templateVersion,
      status: c.status,
      dueDate: day(c.dueDate),
      recheckDate: c.recheckDate ? day(c.recheckDate) : null,
      closedAt: c.closedAt?.toISOString() ?? null,
      items: c.items.map((i) => ({
        itemKey: i.itemKey,
        text: i.text,
        status: i.status,
        closed: CLOSED_STATUSES.has(i.status as TrainingItemStatus),
        note: i.note,
        version: i.version,
      })),
    };
  }

  async plans(
    params: { employeeId?: string | undefined; status?: string | undefined },
    ctx: RequestContext,
  ) {
    const s = await this.scope(ctx);
    const inScope = await this.prisma.employee.findMany({
      where: { tenantId: ctx.tenantId, ...this.scopeWhere(s) },
      select: { id: true },
    });
    const ids = new Set(inScope.map((e) => e.id));
    if (params.employeeId && !ids.has(params.employeeId))
      throw notFound('Employee', params.employeeId);
    const rows = await this.prisma.trainingPlan.findMany({
      where: {
        tenantId: ctx.tenantId,
        employeeId: params.employeeId ? params.employeeId : { in: [...ids] },
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: [{ status: 'desc' }, { dueDate: 'asc' }],
      take: 500,
    });
    return rows.map((c) => ({
      id: c.id,
      employeeId: c.employeeId,
      title: c.title,
      status: c.status,
      dueDate: day(c.dueDate),
      recheckDate: c.recheckDate ? day(c.recheckDate) : null,
    }));
  }

  /**
   * Item status change with optimistic concurrency. A closed item
   * (Završeno / Osposobljen) can never be reopened.
   */
  async setItem(
    input: {
      planId: string;
      itemKey: string;
      status: TrainingItemStatus;
      note?: string | undefined;
      expectedVersion: number;
    },
    ctx: RequestContext,
  ) {
    if (!(input.status in TRAINING_ITEM_STATUSES)) {
      throw new DomainError('VALIDATION_FAILED', `Unknown item status '${input.status}'`);
    }
    const view = await this.plan(input.planId, ctx); // scope check
    if (view.status === 'CLOSED') {
      throw new DomainError('INVALID_STATE', 'The training plan is closed');
    }
    const item = view.items.find((i) => i.itemKey === input.itemKey);
    if (!item) throw notFound('TrainingPlanItem', input.itemKey);
    if (item.closed && item.status !== input.status) {
      throw new DomainError(
        'INVALID_STATE',
        'A closed item cannot be reopened — start a new training plan',
      );
    }
    const note = input.note?.trim() || null;
    if (item.status === input.status && (item.note ?? null) === note)
      return this.plan(input.planId, ctx);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.trainingPlanItem.updateMany({
        where: {
          tenantId: ctx.tenantId,
          planId: input.planId,
          itemKey: input.itemKey,
          version: input.expectedVersion,
        },
        data: {
          status: input.status,
          note,
          version: { increment: 1 },
          updatedBy: ctx.userId ?? null,
        },
      });
      if (updated.count === 0) {
        throw new DomainError('CONFLICT', 'The item was changed meanwhile — reload', {
          currentVersion: item.version,
        });
      }
      await this.audit(
        'hcm.training_plan.item',
        'TrainingPlan',
        input.planId,
        { itemKey: input.itemKey, status: input.status, note },
        ctx,
        { status: item.status, note: item.note },
        tx,
      );
    });
    return this.plan(input.planId, ctx);
  }

  async closePlan(id: string, ctx: RequestContext) {
    const view = await this.plan(id, ctx);
    if (view.status === 'CLOSED') return view;
    const open = view.items.filter((i) => !i.closed);
    if (open.length) {
      throw new DomainError(
        'INVALID_STATE',
        `${open.length} item(s) are not closed yet (Završeno / Osposobljen)`,
      );
    }
    const flipped = await this.prisma.trainingPlan.updateMany({
      where: { id, tenantId: ctx.tenantId, status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    if (flipped.count > 0) await this.audit('hcm.training_plan.close', 'TrainingPlan', id, {}, ctx);
    return this.plan(id, ctx);
  }

  // ------------------------------------------------------------ training records

  async logTraining(
    input: {
      employeeId: string;
      sessionDate: string;
      topic: string;
      notes: string;
      outcome?: string | undefined;
      recheckDate?: string | undefined;
      requestKey: string;
    },
    ctx: RequestContext,
  ) {
    const s = await this.scope(ctx);
    if (!KEY_RE.test(input.requestKey)) {
      throw new DomainError('VALIDATION_FAILED', 'requestKey: 8-80 safe characters');
    }
    if (
      !DATE_RE.test(input.sessionDate) ||
      (input.recheckDate && !DATE_RE.test(input.recheckDate))
    ) {
      throw new DomainError('VALIDATION_FAILED', 'Dates must be YYYY-MM-DD');
    }
    if (!input.topic.trim() || !input.notes.trim()) {
      throw new DomainError('VALIDATION_FAILED', 'Topic and notes are required');
    }
    const e = await this.member(input.employeeId, s, ctx);
    const existing = await this.prisma.trainingRecord.findFirst({
      where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
    });
    if (existing) return this.recordView(existing);
    try {
      const row = await this.prisma.trainingRecord.create({
        data: {
          tenantId: ctx.tenantId,
          employeeId: e.id,
          mentorUserId: ctx.userId ?? null,
          sessionDate: new Date(input.sessionDate),
          topic: input.topic.trim(),
          notes: input.notes.trim(),
          outcome: input.outcome?.trim() || null,
          recheckDate: input.recheckDate ? new Date(input.recheckDate) : null,
          requestKey: input.requestKey,
        },
      });
      await this.audit(
        'hcm.training_record.log',
        'TrainingRecord',
        row.id,
        { employeeId: e.id },
        ctx,
      );
      return this.recordView(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const winner = await this.prisma.trainingRecord.findFirst({
          where: { tenantId: ctx.tenantId, requestKey: input.requestKey },
        });
        if (winner) return this.recordView(winner);
      }
      throw error;
    }
  }

  private recordView(c: Prisma.TrainingRecordGetPayload<object>) {
    return {
      id: c.id,
      employeeId: c.employeeId,
      mentorUserId: c.mentorUserId,
      sessionDate: day(c.sessionDate),
      topic: c.topic,
      notes: c.notes,
      outcome: c.outcome,
      recheckDate: c.recheckDate ? day(c.recheckDate) : null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async records(employeeId: string, ctx: RequestContext) {
    const s = await this.scope(ctx);
    const e = await this.member(employeeId, s, ctx);
    const rows = await this.prisma.trainingRecord.findMany({
      where: { tenantId: ctx.tenantId, employeeId: e.id },
      orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((r) => this.recordView(r));
  }
}
