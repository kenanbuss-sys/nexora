import { writeAudit } from '@nexora/audit';
import type { Db, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * CORE — task engine (CORE-014) and notifications (CORE-013 foundation).
 * The unified inbox (CORE-012) is assembled at the application layer from
 * tasks + notifications here and pending approvals from the WF domain.
 */

export interface TaskView {
  id: string;
  title: string;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  assigneeUserId: string | null;
  dueAt: Date | null;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  readAt: Date | null;
  createdAt: Date;
}

export class TaskService {
  constructor(private readonly prisma: PrismaClient) {}

  async createTask(
    input: {
      title: string;
      description?: string | undefined;
      assigneeUserId?: string | undefined;
      dueAt?: Date | undefined;
      relatedObjectType?: string | undefined;
      relatedObjectId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<TaskView> {
    if (input.title.trim().length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Task title is required');
    }
    return this.prisma.$transaction(async (tx) => {
      if (input.assigneeUserId) {
        const assignee = await tx.user.findFirst({
          where: { id: input.assigneeUserId, tenantId: ctx.tenantId },
        });
        if (!assignee) throw notFound('User', input.assigneeUserId);
      }
      const task = await this.createTaskInTx(tx, ctx.tenantId, {
        title: input.title.trim(),
        description: input.description,
        assigneeUserId: input.assigneeUserId,
        dueAt: input.dueAt,
        relatedObjectType: input.relatedObjectType,
        relatedObjectId: input.relatedObjectId,
        createdByUserId: ctx.userId,
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'task.create',
        objectType: 'Task',
        objectId: task.id,
        source: 'api',
        newValues: { title: task.title },
      });
      return task;
    });
  }

  /** Transactional variant for automation (rule engine). */
  async createTaskInTx(
    tx: Db,
    tenantId: string,
    input: {
      title: string;
      description?: string | undefined;
      assigneeUserId?: string | undefined;
      dueAt?: Date | undefined;
      relatedObjectType?: string | undefined;
      relatedObjectId?: string | undefined;
      createdByUserId?: string | undefined;
    },
  ): Promise<TaskView> {
    const task = await tx.task.create({
      data: {
        tenantId,
        title: input.title,
        description: input.description ?? null,
        assigneeUserId: input.assigneeUserId ?? null,
        dueAt: input.dueAt ?? null,
        relatedObjectType: input.relatedObjectType ?? null,
        relatedObjectId: input.relatedObjectId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      assigneeUserId: task.assigneeUserId,
      dueAt: task.dueAt,
    };
  }

  async completeTask(taskId: string, ctx: RequestContext): Promise<TaskView> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, tenantId: ctx.tenantId } });
      if (!task) throw notFound('Task', taskId);
      if (task.status !== 'OPEN') {
        throw new DomainError('INVALID_STATE', `Task is already ${task.status}`);
      }
      const updated = await tx.task.update({ where: { id: task.id }, data: { status: 'DONE' } });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'task.complete',
        objectType: 'Task',
        objectId: task.id,
        source: 'api',
        previousValues: { status: 'OPEN' },
        newValues: { status: 'DONE' },
      });
      return {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        assigneeUserId: updated.assigneeUserId,
        dueAt: updated.dueAt,
      };
    });
  }

  /** Open tasks assigned to the caller or unassigned. */
  async listMyTasks(ctx: RequestContext): Promise<TaskView[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'OPEN',
        OR: [
          { assigneeUserId: ctx.userId ?? '00000000-0000-0000-0000-000000000000' },
          { assigneeUserId: null },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assigneeUserId: t.assigneeUserId,
      dueAt: t.dueAt,
    }));
  }

  /** Transactional notification creation (used by API and automation). */
  async notifyInTx(
    tx: Db,
    tenantId: string,
    input: {
      userId: string;
      type: string;
      title: string;
      body?: string | undefined;
      relatedObjectType?: string | undefined;
      relatedObjectId?: string | undefined;
    },
  ): Promise<void> {
    await tx.notification.create({
      data: {
        tenantId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        relatedObjectType: input.relatedObjectType ?? null,
        relatedObjectId: input.relatedObjectId ?? null,
      },
    });
  }

  async listMyNotifications(ctx: RequestContext): Promise<NotificationView[]> {
    if (!ctx.userId) return [];
    const notifications = await this.prisma.notification.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      readAt: n.readAt,
      createdAt: n.createdAt,
    }));
  }

  async markNotificationRead(notificationId: string, ctx: RequestContext): Promise<void> {
    const updated = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        tenantId: ctx.tenantId,
        userId: ctx.userId ?? '00000000-0000-0000-0000-000000000000',
      },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) throw notFound('Notification', notificationId);
  }
}
