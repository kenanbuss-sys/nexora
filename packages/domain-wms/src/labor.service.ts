import { writeAudit } from '@nexora/audit';
import type { PrismaClient } from '@nexora/db';
import type { RequestContext } from '@nexora/tenancy';

/**
 * Warehouse labor tasks (WMS-024). Open warehouse execution documents
 * become work-queue tasks through the CORE task domain, exactly once
 * per document — operators work one queue instead of scanning lists.
 */

/** Cross-domain contract: tasks are owned by CORE. */
export interface LaborTaskGate {
  createTask(
    input: {
      title: string;
      relatedObjectType?: string | undefined;
      relatedObjectId?: string | undefined;
    },
    ctx: RequestContext,
  ): Promise<{ id: string }>;
}

const RELATED_TYPE = 'wms_labor';

export class LaborService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tasks: LaborTaskGate,
  ) {}

  /**
   * Create one task per open WMS order that has none yet. Idempotent —
   * re-running never duplicates a task for the same document.
   */
  async generateLaborTasks(
    ctx: RequestContext,
  ): Promise<{ created: number; skipped: number; open: number }> {
    const openOrders = await this.prisma.wmsOrder.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ['DRAFT', 'IN_PROGRESS'] } },
      take: 200,
      orderBy: [{ createdAt: 'asc' }],
    });
    const existing = await this.prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        relatedObjectType: RELATED_TYPE,
        relatedObjectId: { in: openOrders.map((o) => o.id) },
      },
      select: { relatedObjectId: true },
    });
    const covered = new Set(existing.map((t) => t.relatedObjectId));
    let created = 0;
    let skipped = 0;
    for (const order of openOrders) {
      if (covered.has(order.id)) {
        skipped += 1;
        continue;
      }
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: order.warehouseId, tenantId: ctx.tenantId },
        select: { code: true },
      });
      await this.tasks.createTask(
        {
          title: `${order.orderType} u skladištu ${warehouse?.code ?? '?'} (${order.reference ?? order.id.slice(0, 8)})`,
          relatedObjectType: RELATED_TYPE,
          relatedObjectId: order.id,
        },
        ctx,
      );
      created += 1;
    }
    if (created > 0) {
      await writeAudit(this.prisma, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'wms.labor.generate',
        objectType: 'WmsOrder',
        objectId: 'batch',
        source: 'api',
        newValues: { created, skipped, open: openOrders.length },
      });
    }
    return { created, skipped, open: openOrders.length };
  }

  /** Labor queue overview: open tasks against open documents. */
  async laborQueue(ctx: RequestContext): Promise<
    Array<{
      taskId: string;
      title: string;
      taskStatus: string;
      wmsOrderId: string | null;
      wmsOrderStatus: string | null;
    }>
  > {
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        relatedObjectType: RELATED_TYPE,
        status: { not: 'DONE' },
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 100,
    });
    const orders = await this.prisma.wmsOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        id: { in: tasks.map((t) => t.relatedObjectId ?? '').filter(Boolean) },
      },
      select: { id: true, status: true },
    });
    const statusOf = new Map(orders.map((o) => [o.id, o.status as string]));
    return tasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      taskStatus: t.status,
      wmsOrderId: t.relatedObjectId,
      wmsOrderStatus: t.relatedObjectId ? (statusOf.get(t.relatedObjectId) ?? null) : null,
    }));
  }
}
