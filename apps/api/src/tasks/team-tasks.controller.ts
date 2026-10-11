import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import type { TeamTaskService } from '@nexora/domain-core';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const TEAM_TASK_SERVICE = 'TEAM_TASK_SERVICE';

const checklistSchema = z
  .array(z.object({ label: z.string().min(1).max(200), required: z.boolean().default(true) }))
  .max(50)
  .optional();
const teamTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  assigneeUserIds: z.array(z.string().uuid()).min(1).max(50),
  completionRule: z.enum(['ALL', 'ANY']).optional(),
  dueAt: z.coerce.date().optional(),
  checklist: checklistSchema,
  relatedObjectType: z.string().max(64).optional(),
  relatedObjectId: z.string().max(100).optional(),
});
const completeSchema = z.object({
  note: z.string().max(1000).optional(),
  results: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        ok: z.boolean(),
        value: z.string().max(200).optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .max(50)
    .optional(),
});
const templateSchema = z.object({
  code: z.string().min(2).max(40),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  assigneeUserIds: z.array(z.string().uuid()).min(1).max(50),
  completionRule: z.enum(['ALL', 'ANY']).optional(),
  checklist: checklistSchema,
  relatedObjectType: z.string().max(64).optional(),
  relatedObjectId: z.string().max(100).optional(),
});
const runSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** WF-013: team tasks (per-person status) and recurring task templates. */
@Controller('api/v1/tasks')
export class TeamTasksController {
  constructor(@Inject(TEAM_TASK_SERVICE) private readonly teamTasks: TeamTaskService) {}

  @Post('team')
  @RequirePermission('task.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.teamTasks.createTeamTask(parseBody(teamTaskSchema, body), ctx);
  }

  @Get('recurring/templates')
  @RequirePermission('task.manage')
  async templates(@Ctx() ctx: RequestContext) {
    return { templates: await this.teamTasks.listTemplates(ctx) };
  }

  @Post('recurring/templates')
  @RequirePermission('task.manage')
  async upsertTemplate(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.teamTasks.upsertTemplate(parseBody(templateSchema, body), ctx);
  }

  @Post('recurring/templates/:id/deactivate')
  @RequirePermission('task.manage')
  async deactivate(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.teamTasks.deactivateTemplate(id, ctx);
  }

  @Get('recurring/templates/:id/log')
  @RequirePermission('task.manage')
  async log(
    @Param('id') id: string,
    @Ctx() ctx: RequestContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = parseBody(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      { from, to },
    );
    return this.teamTasks.templateLog(
      id,
      { from: new Date(`${range.from}T00:00:00Z`), to: new Date(`${range.to}T00:00:00Z`) },
      ctx,
    );
  }

  /** Generates today's (or the given date's) occurrences; the worker runs it hourly. */
  @Post('recurring/run')
  @RequirePermission('task.manage')
  async run(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    const input = parseBody(runSchema, body ?? {});
    return this.teamTasks.generate(
      input.date ? new Date(`${input.date}T00:00:00Z`) : new Date(),
      ctx,
    );
  }

  @Get(':id/team')
  @RequirePermission('task.manage')
  async get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.teamTasks.getTask(id, ctx);
  }

  /** The caller's view of a team task (assignees only; checklist + progress). */
  @Get(':id/mine')
  async mine(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.teamTasks.getForAssignee(id, ctx);
  }

  /** The caller completes their own part (assignees only). */
  @Post(':id/complete-mine')
  async completeMine(@Param('id') id: string, @Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.teamTasks.completeMine(id, parseBody(completeSchema, body ?? {}), ctx);
  }
}
