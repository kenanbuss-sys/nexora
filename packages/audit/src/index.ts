import type { Db, Prisma } from '@nexora/db';
import { getOrCreateCorrelationId } from '@nexora/observability';

/**
 * Immutable audit writer (docs/security/03_AUDIT_SPEC.md).
 *
 * Written in the SAME transaction as the mutation it records — pass the
 * transaction client. Audit answers who changed what / from-to / when / source;
 * it is not the event bus.
 */
export type AuditActorType = 'USER' | 'SERVICE' | 'SYSTEM';

export interface AuditEntry {
  tenantId: string;
  actorType: AuditActorType;
  actorId?: string | undefined;
  /** e.g. "tenant.suspend", "user.invite", "role.permissions.set" */
  action: string;
  objectType: string;
  objectId: string;
  /** Source channel: api | worker | integration | device | system */
  source: string;
  previousValues?: Prisma.InputJsonValue | undefined;
  newValues?: Prisma.InputJsonValue | undefined;
  /** Required for sensitive overrides. */
  reason?: string | undefined;
  correlationId?: string | undefined;
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditEvent.create({
    data: {
      tenantId: entry.tenantId,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      objectType: entry.objectType,
      objectId: entry.objectId,
      correlationId: entry.correlationId ?? getOrCreateCorrelationId(),
      source: entry.source,
      ...(entry.previousValues !== undefined ? { previousValues: entry.previousValues } : {}),
      ...(entry.newValues !== undefined ? { newValues: entry.newValues } : {}),
      reason: entry.reason ?? null,
    },
  });
}
