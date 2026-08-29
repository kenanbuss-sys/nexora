import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import type { TaskService } from '@nexora/domain-core';
import type { ApprovalService } from '@nexora/domain-wf';
import type { RequestContext } from '@nexora/tenancy';
import { z } from 'zod';
import { Ctx } from '../auth/ctx.decorator';
import { RequirePermission } from '../auth/permissions.guard';
import { parseBody } from '../common/validate';

export const TASK_SERVICE = 'TASK_SERVICE';
export const APPROVAL_SERVICE = 'APPROVAL_SERVICE';

const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  assigneeUserId: z.string().uuid().optional(),
  dueAt: z.coerce.date().optional(),
  relatedObjectType: z.string().max(64).optional(),
  relatedObjectId: z.string().max(100).optional(),
});

@Controller('api/v1/tasks')
export class TasksController {
  constructor(@Inject(TASK_SERVICE) private readonly tasks: TaskService) {}

  @Post()
  @RequirePermission('task.manage')
  async create(@Body() body: unknown, @Ctx() ctx: RequestContext) {
    return this.tasks.createTask(parseBody(createTaskSchema, body), ctx);
  }

  @Post(':id/complete')
  @RequirePermission('task.manage')
  async complete(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.tasks.completeTask(id, ctx);
  }

  @Get()
  async listMine(@Ctx() ctx: RequestContext) {
    return { tasks: await this.tasks.listMyTasks(ctx) };
  }
}

/** Unified inbox (CORE-012): tasks + pending approvals + unread notifications. */
@Controller('api/v1/inbox')
export class InboxController {
  constructor(
    @Inject(TASK_SERVICE) private readonly tasks: TaskService,
    @Inject(APPROVAL_SERVICE) private readonly approvals: ApprovalService,
  ) {}

  @Get()
  async inbox(@Ctx() ctx: RequestContext) {
    const [tasks, approvals, notifications] = await Promise.all([
      this.tasks.listMyTasks(ctx),
      this.approvals.pendingForUser(ctx),
      this.tasks.listMyNotifications(ctx),
    ]);
    return { tasks, approvals, notifications };
  }
}

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(@Inject(TASK_SERVICE) private readonly tasks: TaskService) {}

  @Get()
  async listMine(@Ctx() ctx: RequestContext) {
    return { notifications: await this.tasks.listMyNotifications(ctx) };
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    await this.tasks.markNotificationRead(id, ctx);
    return { ok: true };
  }
}
