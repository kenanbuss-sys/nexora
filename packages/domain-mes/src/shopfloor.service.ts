import { writeAudit } from '@nexora/audit';
import type { DowntimeCategory, PrismaClient } from '@nexora/db';
import { DomainError, notFound } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Shop-floor infrastructure — work-center master data (MES-003),
 * downtime logging (MES-014) and OEE inputs (MES-021).
 *
 * OEE inputs stay honest: without machine telemetry the service reports
 * the measured ingredients (downtime by category, produced and scrapped
 * quantities, operation counts and durations) rather than a fabricated
 * single OEE percentage.
 */

export interface WorkCenterView {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface DowntimeView {
  id: string;
  workCenterId: string;
  workOrderId: string | null;
  category: DowntimeCategory;
  minutes: number;
  reason: string;
  occurredAt: string;
}

export interface OeeInputRow {
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  downtimeMinutes: number;
  downtimeByCategory: Record<string, number>;
  operationsCompleted: number;
  avgOperationMinutes: string | null;
}

export class ShopFloorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly andonTasks?: {
      createTask(
        input: {
          title: string;
          relatedObjectType?: string | undefined;
          relatedObjectId?: string | undefined;
        },
        ctx: RequestContext,
      ): Promise<{ id: string }>;
    },
    private readonly config?: {
      getEffectiveConfiguration(tenantId: string): Promise<{ version: number; config: unknown }>;
    },
  ) {}

  /** Andon threshold in minutes (mes.andon.downtimeMinutes; null = off). */
  private async andonThreshold(tenantId: string): Promise<number | null> {
    if (!this.config) return null;
    try {
      const { config } = await this.config.getEffectiveConfiguration(tenantId);
      const raw = (config as { mes?: { andon?: { downtimeMinutes?: unknown } } })?.mes?.andon
        ?.downtimeMinutes;
      return typeof raw === 'number' && raw > 0 ? raw : null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------ work centers

  async listWorkCenters(ctx: RequestContext): Promise<WorkCenterView[]> {
    const centers = await this.prisma.workCenter.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
    });
    return centers.map((c) => ({ id: c.id, code: c.code, name: c.name, active: c.active }));
  }

  async createWorkCenter(
    input: { code: string; name: string },
    ctx: RequestContext,
  ): Promise<WorkCenterView> {
    try {
      const center = await this.prisma.$transaction(async (tx) => {
        const created = await tx.workCenter.create({
          data: { tenantId: ctx.tenantId, code: input.code, name: input.name },
        });
        await writeAudit(tx, {
          tenantId: ctx.tenantId,
          actorType: ctx.actorType,
          actorId: ctx.userId,
          action: 'mes.work_center.create',
          objectType: 'WorkCenter',
          objectId: created.id,
          source: 'api',
          newValues: { code: input.code, name: input.name },
        });
        return created;
      });
      return { id: center.id, code: center.code, name: center.name, active: center.active };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new DomainError('CONFLICT', `Work center '${input.code}' already exists`);
      }
      throw error;
    }
  }

  /** Open andon alerts (MES-022): unresolved alert tasks with context. */
  async andonBoard(
    ctx: RequestContext,
  ): Promise<Array<{ taskId: string; title: string; createdAt: string }>> {
    const tasks = await this.prisma.task.findMany({
      where: { tenantId: ctx.tenantId, relatedObjectType: 'mes_andon', status: 'OPEN' },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });
    return tasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  // --------------------------------------------------------------- downtime

  async logDowntime(
    input: {
      workCenterId: string;
      category: DowntimeCategory;
      minutes: number;
      reason: string;
      workOrderId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<DowntimeView> {
    if (!Number.isInteger(input.minutes) || input.minutes <= 0 || input.minutes > 24 * 60) {
      throw new DomainError('VALIDATION_FAILED', 'Downtime must be 1-1440 whole minutes');
    }
    const center = await this.prisma.workCenter.findFirst({
      where: { id: input.workCenterId, tenantId: ctx.tenantId, active: true },
    });
    if (!center) throw notFound('WorkCenter', input.workCenterId);
    if (input.workOrderId) {
      const workOrder = await this.prisma.workOrder.findFirst({
        where: { id: input.workOrderId, tenantId: ctx.tenantId },
      });
      if (!workOrder) throw notFound('WorkOrder', input.workOrderId);
    }
    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.downtimeEvent.create({
        data: {
          tenantId: ctx.tenantId,
          workCenterId: input.workCenterId,
          workOrderId: input.workOrderId ?? null,
          category: input.category,
          minutes: input.minutes,
          reason: input.reason.trim(),
          createdBy: ctx.userId ?? null,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'mes.downtime.log',
        objectType: 'DowntimeEvent',
        objectId: created.id,
        source: 'api',
        newValues: { category: input.category, minutes: input.minutes },
      });
      return created;
    });
    // Andon (MES-022): downtime at or beyond the configured threshold
    // raises a work-queue alert exactly once per downtime event.
    const threshold = await this.andonThreshold(ctx.tenantId);
    if (threshold !== null && this.andonTasks && input.minutes >= threshold) {
      await this.andonTasks.createTask(
        {
          title: `ANDON: ${center.code} — ${input.category} ${input.minutes} min (${input.reason.trim()})`,
          relatedObjectType: 'mes_andon',
          relatedObjectId: event.id,
        },
        ctx,
      );
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'mes.andon.raise',
        objectType: 'DowntimeEvent',
        objectId: event.id,
        source: 'api',
        newValues: { workCenter: center.code, minutes: input.minutes },
      });
    }
    return {
      id: event.id,
      workCenterId: event.workCenterId,
      workOrderId: event.workOrderId,
      category: event.category,
      minutes: event.minutes,
      reason: event.reason,
      occurredAt: event.occurredAt.toISOString(),
    };
  }

  async listDowntime(ctx: RequestContext): Promise<DowntimeView[]> {
    const events = await this.prisma.downtimeEvent.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
    return events.map((e) => ({
      id: e.id,
      workCenterId: e.workCenterId,
      workOrderId: e.workOrderId,
      category: e.category,
      minutes: e.minutes,
      reason: e.reason,
      occurredAt: e.occurredAt.toISOString(),
    }));
  }

  // -------------------------------------------------------------- OEE inputs

  /** Measured OEE ingredients per work center over the last N days. */
  async oeeInputs(days: number, ctx: RequestContext): Promise<OeeInputRow[]> {
    const span = Math.min(Math.max(days, 1), 90);
    const from = new Date(Date.now() - span * 86_400_000);
    const centers = await this.prisma.workCenter.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: 'asc' },
    });
    const rows: OeeInputRow[] = [];
    for (const center of centers) {
      const downtimes = await this.prisma.downtimeEvent.findMany({
        where: { tenantId: ctx.tenantId, workCenterId: center.id, occurredAt: { gte: from } },
      });
      const byCategory: Record<string, number> = {};
      let total = 0;
      for (const event of downtimes) {
        byCategory[event.category] = (byCategory[event.category] ?? 0) + event.minutes;
        total += event.minutes;
      }
      // Operations executed on this work center (matched by code, since
      // routing operations carry the work-center code).
      const operations = await this.prisma.workOrderOperation.findMany({
        where: {
          tenantId: ctx.tenantId,
          workCenter: center.code,
          status: 'DONE',
          completedAt: { gte: from },
        },
      });
      const durations = operations
        .filter((op) => op.startedAt && op.completedAt)
        .map((op) => (op.completedAt!.getTime() - op.startedAt!.getTime()) / 60_000);
      rows.push({
        workCenterId: center.id,
        workCenterCode: center.code,
        workCenterName: center.name,
        downtimeMinutes: total,
        downtimeByCategory: byCategory,
        operationsCompleted: operations.length,
        avgOperationMinutes:
          durations.length > 0
            ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)
            : null,
      });
    }
    return rows;
  }
}
