import { writeAudit } from '@nexora/audit';
import type { Prisma, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Multi-assignee and recurring tasks (WF-013, task engine CORE-014).
 *
 * A team task has several assignees, each with an own status. Rule ALL:
 * the task is DONE only when every assignee is done; ANY: the first one
 * closes it. Each person completes only their own part, answering the
 * task's checklist (an item that is not OK needs a note).
 *
 * Recurring templates (store opening/closing, shift checks, HACCP/OHS
 * rounds) generate one task per due date — idempotent per template and
 * date (unique index), with the template's title, checklist and assignees
 * COPIED, so later template edits never rewrite history. The template log
 * shows per date who did what and when, and what was missed.
 */

export type CompletionRule = 'ALL' | 'ANY';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ChecklistItem {
  label: string;
  required: boolean;
}
export interface ChecklistAnswer {
  label: string;
  ok: boolean;
  value?: string | undefined;
  note?: string | undefined;
}

export interface TeamTaskView {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completionRule: CompletionRule;
  dueAt: string | null;
  completedAt: string | null;
  occurrenceDate: string | null;
  templateId: string | null;
  checklist: ChecklistItem[];
  assignees: Array<{
    userId: string;
    status: string;
    completedAt: string | null;
    note: string | null;
    results: ChecklistAnswer[] | null;
  }>;
}

export interface TemplateView {
  id: string;
  code: string;
  title: string;
  description: string | null;
  frequency: Frequency;
  weekdays: number[];
  dayOfMonth: number | null;
  dueTime: string;
  assigneeUserIds: string[];
  completionRule: CompletionRule;
  checklist: ChecklistItem[];
  relatedObjectType: string | null;
  relatedObjectId: string | null;
  active: boolean;
}

export interface TemplateInput {
  code: string;
  title: string;
  description?: string | undefined;
  frequency: Frequency;
  weekdays?: number[] | undefined;
  dayOfMonth?: number | undefined;
  dueTime?: string | undefined;
  assigneeUserIds: string[];
  completionRule?: CompletionRule | undefined;
  checklist?: ChecklistItem[] | undefined;
  relatedObjectType?: string | undefined;
  relatedObjectId?: string | undefined;
}

const DAY_MS = 86_400_000;

function asChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({ label: String(i.label ?? ''), required: i.required !== false }))
    .filter((i) => i.label.length > 0);
}

function validateChecklist(items: ChecklistItem[] | undefined): ChecklistItem[] {
  const list = items ?? [];
  if (list.length > 50) throw new DomainError('VALIDATION_FAILED', 'At most 50 checklist items');
  const seen = new Set<string>();
  return list.map((i) => {
    const label = i.label?.trim() ?? '';
    if (label.length === 0 || label.length > 200) {
      throw new DomainError('VALIDATION_FAILED', 'Checklist items need a label (1-200 chars)');
    }
    if (seen.has(label)) throw new DomainError('VALIDATION_FAILED', `Duplicate item '${label}'`);
    seen.add(label);
    return { label, required: i.required !== false };
  });
}

/** ISO weekday 1 (Mon) … 7 (Sun) of a UTC date. */
function isoDay(date: Date): number {
  const d = date.getUTCDay();
  return d === 0 ? 7 : d;
}

function dateOnly(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export class TeamTaskService {
  constructor(private readonly prisma: PrismaClient) {}

  private async activeUsers(
    db: Prisma.TransactionClient | PrismaClient,
    tenantId: string,
    userIds: string[],
  ): Promise<string[]> {
    const rows = await db.user.findMany({
      where: { tenantId, id: { in: userIds }, status: 'ACTIVE' },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async view(taskId: string, tenantId: string): Promise<TeamTaskView> {
    const t = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId },
      include: { assignees: { orderBy: { userId: 'asc' } } },
    });
    if (!t) throw notFound('Task', taskId);
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      completionRule: (t.completionRule as CompletionRule | null) ?? 'ALL',
      dueAt: t.dueAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      occurrenceDate: t.occurrenceDate?.toISOString().slice(0, 10) ?? null,
      templateId: t.templateId,
      checklist: asChecklist(t.checklist),
      assignees: t.assignees.map((a) => ({
        userId: a.userId,
        status: a.status,
        completedAt: a.completedAt?.toISOString() ?? null,
        note: a.note,
        results: (a.results as ChecklistAnswer[] | null) ?? null,
      })),
    };
  }

  /** Permission: task.manage. A task for several people with per-person status. */
  async createTeamTask(
    input: {
      title: string;
      description?: string | undefined;
      assigneeUserIds: string[];
      completionRule?: CompletionRule | undefined;
      dueAt?: Date | undefined;
      checklist?: ChecklistItem[] | undefined;
      relatedObjectType?: string | undefined;
      relatedObjectId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<TeamTaskView> {
    const title = input.title?.trim() ?? '';
    if (!title) throw new DomainError('VALIDATION_FAILED', 'Task title is required');
    const userIds = [...new Set(input.assigneeUserIds.map((u) => u.toLowerCase()))];
    if (userIds.length < 1 || userIds.length > 50) {
      throw new DomainError('VALIDATION_FAILED', 'A team task needs 1-50 assignees');
    }
    const checklist = validateChecklist(input.checklist);
    const rule: CompletionRule = input.completionRule ?? 'ALL';
    const id = await this.prisma.$transaction(async (tx) => {
      const active = await this.activeUsers(tx, ctx.tenantId, userIds);
      const missing = userIds.filter((u) => !active.includes(u));
      if (missing.length > 0) {
        throw new DomainError('VALIDATION_FAILED', 'Assignees must be active users', { missing });
      }
      const task = await tx.task.create({
        data: {
          tenantId: ctx.tenantId,
          title,
          description: input.description?.trim() || null,
          dueAt: input.dueAt ?? null,
          completionRule: rule,
          checklist: checklist as unknown as Prisma.InputJsonValue,
          relatedObjectType: input.relatedObjectType ?? null,
          relatedObjectId: input.relatedObjectId ?? null,
          createdByUserId: ctx.userId ?? null,
          assignees: {
            create: userIds.map((userId) => ({ tenantId: ctx.tenantId, userId })),
          },
        },
      });
      await this.notify(tx, ctx.tenantId, userIds, task.id, title);
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'task.team.create',
        objectType: 'Task',
        objectId: task.id,
        source: 'api',
        newValues: { title, assignees: userIds.length, completionRule: rule },
      });
      return task.id;
    });
    return this.view(id, ctx.tenantId);
  }

  private async notify(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userIds: string[],
    taskId: string,
    title: string,
  ): Promise<void> {
    if (userIds.length === 0) return;
    await tx.notification.createMany({
      data: userIds.map((userId) => ({
        tenantId,
        userId,
        type: 'TASK_ASSIGNED',
        title,
        relatedObjectType: 'Task',
        relatedObjectId: taskId,
      })),
    });
  }

  /**
   * The caller completes THEIR part (no permission beyond being an
   * assignee). Idempotent: completing twice returns the task unchanged.
   * The task row is locked so the last of several concurrent completions
   * closes the task exactly once.
   */
  async completeMine(
    taskId: string,
    input: { results?: ChecklistAnswer[] | undefined; note?: string | undefined },
    ctx: RequestContext,
  ): Promise<TeamTaskView & { duplicate: boolean }> {
    if (!ctx.userId) throw new DomainError('FORBIDDEN', 'A user session is required');
    const userId = ctx.userId;
    const duplicate = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM task
         WHERE id = ${taskId}::uuid AND tenant_id = ${ctx.tenantId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw notFound('Task', taskId);
      const task = await tx.task.findFirst({
        where: { id: taskId, tenantId: ctx.tenantId },
        include: { assignees: true },
      });
      const mine = task!.assignees.find((a) => a.userId === userId);
      if (!mine) throw notFound('Task', taskId); // not yours: indistinguishable from absent
      if (mine.status === 'DONE') return true;
      if (task!.status !== 'OPEN') {
        throw new DomainError('INVALID_STATE', `The task is already ${task!.status}`);
      }
      const results = this.checkAnswers(asChecklist(task!.checklist), input.results ?? []);
      const now = new Date();
      await tx.taskAssignee.update({
        where: { id: mine.id },
        data: {
          status: 'DONE',
          completedAt: now,
          completedBy: userId,
          note: input.note?.trim() || null,
          results: results as unknown as Prisma.InputJsonValue,
        },
      });
      const rule = (task!.completionRule as CompletionRule | null) ?? 'ALL';
      const openLeft = task!.assignees.filter((a) => a.id !== mine.id && a.status !== 'DONE');
      const closes = rule === 'ANY' || openLeft.length === 0;
      if (closes) {
        await tx.task.update({
          where: { id: task!.id },
          data: { status: 'DONE', completedAt: now },
        });
      }
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: userId,
        action: 'task.assignee.complete',
        objectType: 'Task',
        objectId: task!.id,
        source: 'api',
        newValues: {
          userId,
          failedItems: results.filter((r) => !r.ok).map((r) => r.label),
          taskClosed: closes,
        } as Prisma.InputJsonValue,
      });
      return false;
    });
    return { ...(await this.view(taskId, ctx.tenantId)), duplicate };
  }

  private checkAnswers(items: ChecklistItem[], answers: ChecklistAnswer[]): ChecklistAnswer[] {
    const byLabel = new Map(answers.map((a) => [a.label, a]));
    for (const a of answers) {
      if (!items.some((i) => i.label === a.label)) {
        throw new DomainError('VALIDATION_FAILED', `'${a.label}' is not on the checklist`);
      }
    }
    const out: ChecklistAnswer[] = [];
    for (const item of items) {
      const a = byLabel.get(item.label);
      if (!a) {
        if (item.required) {
          throw new DomainError('VALIDATION_FAILED', `Checklist item '${item.label}' is required`);
        }
        continue;
      }
      if (!a.ok && !a.note?.trim()) {
        throw new DomainError(
          'VALIDATION_FAILED',
          `'${item.label}' is not OK — a note (what was done) is required`,
        );
      }
      const answer: ChecklistAnswer = { label: item.label, ok: a.ok };
      if (a.value?.trim()) answer.value = a.value.trim().slice(0, 200);
      if (a.note?.trim()) answer.note = a.note.trim().slice(0, 500);
      out.push(answer);
    }
    return out;
  }

  /** Permission: task.manage. Team task with per-person status. */
  async getTask(taskId: string, ctx: RequestContext): Promise<TeamTaskView> {
    return this.view(taskId, ctx.tenantId);
  }

  /**
   * The team task as one of its assignees sees it (checklist + everyone's
   * progress) — no permission beyond being an assignee; others get 404.
   */
  async getForAssignee(taskId: string, ctx: RequestContext): Promise<TeamTaskView> {
    const mine = ctx.userId
      ? await this.prisma.taskAssignee.findFirst({
          where: { tenantId: ctx.tenantId, taskId, userId: ctx.userId },
        })
      : null;
    if (!mine) throw notFound('Task', taskId);
    return this.view(taskId, ctx.tenantId);
  }

  // ------------------------------------------------------------ templates

  private templateView(t: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    frequency: string;
    weekdays: number[];
    dayOfMonth: number | null;
    dueTime: string;
    assigneeUserIds: string[];
    completionRule: string;
    checklist: unknown;
    relatedObjectType: string | null;
    relatedObjectId: string | null;
    active: boolean;
  }): TemplateView {
    return {
      id: t.id,
      code: t.code,
      title: t.title,
      description: t.description,
      frequency: t.frequency as Frequency,
      weekdays: t.weekdays,
      dayOfMonth: t.dayOfMonth,
      dueTime: t.dueTime,
      assigneeUserIds: t.assigneeUserIds,
      completionRule: t.completionRule as CompletionRule,
      checklist: asChecklist(t.checklist),
      relatedObjectType: t.relatedObjectType,
      relatedObjectId: t.relatedObjectId,
      active: t.active,
    };
  }

  private validateTemplate(input: TemplateInput) {
    const code = input.code?.trim() ?? '';
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(code)) {
      throw new DomainError('VALIDATION_FAILED', 'Code: 2-40 letters, digits, . _ -');
    }
    const title = input.title?.trim() ?? '';
    if (!title || title.length > 300) {
      throw new DomainError('VALIDATION_FAILED', 'Title is required (max 300)');
    }
    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(input.frequency)) {
      throw new DomainError('VALIDATION_FAILED', 'Frequency must be DAILY, WEEKLY or MONTHLY');
    }
    const weekdays = [...new Set(input.weekdays ?? [])].sort();
    if (weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
      throw new DomainError('VALIDATION_FAILED', 'Weekdays are 1 (Monday) to 7 (Sunday)');
    }
    if (input.frequency === 'WEEKLY' && weekdays.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'A weekly template needs weekdays');
    }
    const dayOfMonth = input.dayOfMonth ?? null;
    if (input.frequency === 'MONTHLY') {
      if (!Number.isInteger(dayOfMonth) || dayOfMonth! < 1 || dayOfMonth! > 31) {
        throw new DomainError('VALIDATION_FAILED', 'A monthly template needs a day of month 1-31');
      }
    }
    const dueTime = input.dueTime ?? '23:59';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) {
      throw new DomainError('VALIDATION_FAILED', 'Due time must be HH:MM');
    }
    const assignees = [...new Set(input.assigneeUserIds.map((u) => u.toLowerCase()))];
    if (assignees.length < 1 || assignees.length > 50) {
      throw new DomainError('VALIDATION_FAILED', 'A template needs 1-50 assignees');
    }
    return {
      code,
      title,
      weekdays,
      dayOfMonth: input.frequency === 'MONTHLY' ? dayOfMonth : null,
      dueTime,
      assignees,
      checklist: validateChecklist(input.checklist),
      rule: input.completionRule ?? 'ALL',
    };
  }

  /** Permission: task.manage. Create or update (by code) a recurring template. */
  async upsertTemplate(input: TemplateInput, ctx: RequestContext): Promise<TemplateView> {
    const v = this.validateTemplate(input);
    const active = await this.activeUsers(this.prisma, ctx.tenantId, v.assignees);
    const missing = v.assignees.filter((u) => !active.includes(u));
    if (missing.length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'Assignees must be active users', { missing });
    }
    const data = {
      title: v.title,
      description: input.description?.trim() || null,
      frequency: input.frequency,
      weekdays: v.weekdays,
      dayOfMonth: v.dayOfMonth,
      dueTime: v.dueTime,
      assigneeUserIds: v.assignees,
      completionRule: v.rule,
      checklist: v.checklist as unknown as Prisma.InputJsonValue,
      relatedObjectType: input.relatedObjectType ?? null,
      relatedObjectId: input.relatedObjectId ?? null,
      active: true,
    };
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.recurringTaskTemplate.findUnique({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: v.code } },
      });
      const saved = await tx.recurringTaskTemplate.upsert({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: v.code } },
        create: { tenantId: ctx.tenantId, code: v.code, createdBy: ctx.userId ?? null, ...data },
        update: data,
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: before ? 'task.template.update' : 'task.template.create',
        objectType: 'RecurringTaskTemplate',
        objectId: saved.id,
        source: 'api',
        ...(before
          ? {
              previousValues: {
                title: before.title,
                frequency: before.frequency,
                assignees: before.assigneeUserIds,
              } as Prisma.InputJsonValue,
            }
          : {}),
        newValues: {
          code: v.code,
          title: v.title,
          frequency: input.frequency,
          assignees: v.assignees,
        } as Prisma.InputJsonValue,
      });
      return this.templateView(saved);
    });
  }

  /** Permission: task.manage. Stop generating (history stays). */
  async deactivateTemplate(templateId: string, ctx: RequestContext): Promise<TemplateView> {
    const t = await this.prisma.recurringTaskTemplate.findFirst({
      where: { id: templateId, tenantId: ctx.tenantId },
    });
    if (!t) throw notFound('RecurringTaskTemplate', templateId);
    const saved = await this.prisma.recurringTaskTemplate.update({
      where: { id: t.id },
      data: { active: false },
    });
    await writeAudit(this.prisma, {
      tenantId: ctx.tenantId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      action: 'task.template.deactivate',
      objectType: 'RecurringTaskTemplate',
      objectId: t.id,
      source: 'api',
      previousValues: { active: t.active },
      newValues: { active: false },
    });
    return this.templateView(saved);
  }

  async listTemplates(ctx: RequestContext): Promise<TemplateView[]> {
    const rows = await this.prisma.recurringTaskTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
      take: 200,
    });
    return rows.map((r) => this.templateView(r));
  }

  /**
   * Permission: task.manage (or the worker). Generates the occurrences due
   * on `date` (UTC date). Idempotent: an existing occurrence is counted,
   * never duplicated (unique index on template + date).
   */
  async generate(
    date: Date,
    ctx: RequestContext,
  ): Promise<{ date: string; created: number; existing: number; skipped: string[] }> {
    const day = dateOnly(date);
    const templates = await this.prisma.recurringTaskTemplate.findMany({
      where: { tenantId: ctx.tenantId, active: true },
    });
    let created = 0;
    let existing = 0;
    const skipped: string[] = [];
    for (const t of templates) {
      if (!this.isDue(t, day)) continue;
      const active = await this.activeUsers(this.prisma, ctx.tenantId, t.assigneeUserIds);
      if (active.length === 0) {
        skipped.push(t.code);
        continue;
      }
      const [hh, mm] = t.dueTime.split(':').map(Number);
      const dueAt = new Date(day.getTime() + ((hh ?? 23) * 60 + (mm ?? 59)) * 60_000);
      try {
        await this.prisma.$transaction(async (tx) => {
          const task = await tx.task.create({
            data: {
              tenantId: ctx.tenantId,
              title: t.title,
              description: t.description,
              dueAt,
              completionRule: t.completionRule,
              checklist: (t.checklist ?? []) as Prisma.InputJsonValue,
              templateId: t.id,
              occurrenceDate: day,
              relatedObjectType: t.relatedObjectType,
              relatedObjectId: t.relatedObjectId,
              createdByUserId: ctx.userId ?? null,
              assignees: {
                create: active.map((userId) => ({ tenantId: ctx.tenantId, userId })),
              },
            },
          });
          await this.notify(tx, ctx.tenantId, active, task.id, t.title);
        });
        created += 1;
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          existing += 1;
          continue;
        }
        throw error;
      }
    }
    if (created > 0) {
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'task.recurring.generate',
        objectType: 'RecurringTaskTemplate',
        objectId: day.toISOString().slice(0, 10),
        source: ctx.actorType === 'SERVICE' ? 'worker' : 'api',
        newValues: { created, existing, skipped },
      });
    }
    return { date: day.toISOString().slice(0, 10), created, existing, skipped };
  }

  private isDue(
    t: { frequency: string; weekdays: number[]; dayOfMonth: number | null },
    day: Date,
  ): boolean {
    if (t.frequency === 'DAILY') return t.weekdays.length === 0 || t.weekdays.includes(isoDay(day));
    if (t.frequency === 'WEEKLY') return t.weekdays.includes(isoDay(day));
    if (t.frequency === 'MONTHLY' && t.dayOfMonth) {
      const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
      return day.getUTCDate() === Math.min(t.dayOfMonth, last);
    }
    return false;
  }

  /**
   * Permission: task.manage. Daily log of a template: per occurrence the
   * status, every assignee's completion time and checklist answers, and
   * whether it was missed (past due and not done).
   */
  async templateLog(
    templateId: string,
    range: { from: Date; to: Date },
    ctx: RequestContext,
  ): Promise<{
    template: TemplateView;
    occurrences: Array<{
      taskId: string;
      date: string;
      status: string;
      dueAt: string | null;
      completedAt: string | null;
      missed: boolean;
      assignees: TeamTaskView['assignees'];
    }>;
  }> {
    const t = await this.prisma.recurringTaskTemplate.findFirst({
      where: { id: templateId, tenantId: ctx.tenantId },
    });
    if (!t) throw notFound('RecurringTaskTemplate', templateId);
    const from = dateOnly(range.from);
    const to = dateOnly(range.to);
    if (to.getTime() < from.getTime() || to.getTime() - from.getTime() > 366 * DAY_MS) {
      throw new DomainError('VALIDATION_FAILED', 'Range must be 0-366 days, from <= to');
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        templateId: t.id,
        occurrenceDate: { gte: from, lte: to },
      },
      include: { assignees: { orderBy: { userId: 'asc' } } },
      orderBy: { occurrenceDate: 'asc' },
    });
    const now = Date.now();
    return {
      template: this.templateView(t),
      occurrences: tasks.map((task) => ({
        taskId: task.id,
        date: task.occurrenceDate!.toISOString().slice(0, 10),
        status: task.status,
        dueAt: task.dueAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        missed: task.status === 'OPEN' && !!task.dueAt && task.dueAt.getTime() < now,
        assignees: task.assignees.map((a) => ({
          userId: a.userId,
          status: a.status,
          completedAt: a.completedAt?.toISOString() ?? null,
          note: a.note,
          results: (a.results as ChecklistAnswer[] | null) ?? null,
        })),
      })),
    };
  }
}
