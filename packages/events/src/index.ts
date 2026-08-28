import type { Db, Prisma } from '@nexora/db';
import { getOrCreateCorrelationId } from '@nexora/observability';

/**
 * Transactional outbox writer (docs/architecture/03_EVENT_ARCHITECTURE.md).
 *
 * State change + outbox row happen in ONE database transaction — pass the
 * transaction client. The worker dispatches PENDING rows; consumers must be
 * idempotent.
 */

/** Canonical event types published in Sprint 001 (specs/events.json). */
export const EVENT_TYPES = {
  TENANT_CREATED: 'tenant.created',
  TENANT_CONFIGURATION_CHANGED: 'tenant.configuration.changed',
  USER_INVITED: 'user.invited',
  PERMISSION_CHANGED: 'permission.changed',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface BusinessEvent {
  tenantId: string;
  eventType: EventType;
  eventVersion?: number | undefined;
  aggregateType: string;
  aggregateId: string;
  actorType: 'USER' | 'SERVICE' | 'SYSTEM';
  actorId?: string | undefined;
  payload: Prisma.InputJsonValue;
  causationId?: string | undefined;
  correlationId?: string | undefined;
}

export async function publishToOutbox(db: Db, event: BusinessEvent): Promise<void> {
  await db.outboxEvent.create({
    data: {
      tenantId: event.tenantId,
      eventType: event.eventType,
      eventVersion: event.eventVersion ?? 1,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      correlationId: event.correlationId ?? getOrCreateCorrelationId(),
      causationId: event.causationId ?? null,
      payload: event.payload,
    },
  });
}
