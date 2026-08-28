import type { PrismaClient } from '@nexora/db';

/**
 * Transactional outbox dispatcher (docs/architecture/03_EVENT_ARCHITECTURE.md).
 *
 * Claims PENDING rows with FOR UPDATE SKIP LOCKED so concurrent workers never
 * double-dispatch, delivers them, and marks them DISPATCHED. Delivery in
 * Sprint 001 is a structured log; a real consumer/bus attaches in later
 * sprints behind the same claim semantics. Failures increment `attempts` and
 * stay PENDING for retry; consumers must be idempotent regardless.
 */
export interface DispatchedEvent {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
}

export type EventDeliverer = (event: DispatchedEvent) => Promise<void>;

export async function dispatchPendingOutbox(
  prisma: PrismaClient,
  deliver: EventDeliverer,
  batchSize = 50,
): Promise<{ dispatched: number; failed: number }> {
  let dispatched = 0;
  let failed = 0;

  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        tenant_id: string;
        event_type: string;
        aggregate_type: string;
        aggregate_id: string;
        correlation_id: string;
      }>
    >`SELECT id, tenant_id, event_type, aggregate_type, aggregate_id, correlation_id
      FROM "outbox_event"
      WHERE status = 'PENDING'
      ORDER BY occurred_at
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED`;
    return rows;
  });

  for (const row of claimed) {
    const event: DispatchedEvent = {
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      correlationId: row.correlation_id,
    };
    try {
      await deliver(event);
      // Guarded transition: only a still-PENDING row flips, so a concurrent
      // duplicate delivery can never mark twice or resurrect a row.
      const result = await prisma.outboxEvent.updateMany({
        where: { id: event.id, status: 'PENDING' },
        data: { status: 'DISPATCHED', dispatchedAt: new Date(), attempts: { increment: 1 } },
      });
      if (result.count === 1) dispatched += 1;
    } catch (error) {
      failed += 1;
      await prisma.outboxEvent.updateMany({
        where: { id: event.id, status: 'PENDING' },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 500) : String(error),
        },
      });
    }
  }

  return { dispatched, failed };
}
