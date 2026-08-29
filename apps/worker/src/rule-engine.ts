import type { PrismaClient } from '@nexora/db';
import { TaskService } from '@nexora/domain-core';
import { ApprovalService, RuleService, type ActionExecutor } from '@nexora/domain-wf';
import type { DispatchedEvent } from './outbox';

/**
 * Event-driven automation consumer: feeds dispatched business events into the
 * WF rule evaluator. Idempotent per event via the processed_event claim inside
 * the evaluator's transaction — redelivery cannot duplicate actions.
 *
 * Actions execute strictly through owning-domain public services (CORE tasks/
 * notifications, WF approvals) — the automation actor is explicit.
 */
export function createRuleEngineConsumer(prisma: PrismaClient): {
  handle: (event: DispatchedEvent) => Promise<void>;
} {
  const rules = new RuleService(prisma);
  const tasks = new TaskService(prisma);
  const approvals = new ApprovalService(prisma);

  const executor: ActionExecutor = {
    createTask: async (tx, tenantId, input) => {
      await tasks.createTaskInTx(tx, tenantId, {
        title: input.title,
        assigneeUserId: input.assigneeUserId,
        relatedObjectType: 'OutboxEvent',
        relatedObjectId: input.relatedEventId,
      });
    },
    notify: async (tx, tenantId, input) => {
      await tasks.notifyInTx(tx, tenantId, {
        userId: input.userId,
        type: 'automation',
        title: input.title,
        relatedObjectType: 'OutboxEvent',
        relatedObjectId: input.relatedEventId,
      });
    },
    requestApproval: async (tx, tenantId, input) => {
      await approvals.requestApprovalInTx(
        tx,
        {
          title: input.title,
          subjectObjectType: 'OutboxEvent',
          subjectObjectId: input.relatedEventId,
        },
        { tenantId, actorType: 'SYSTEM', source: 'worker' },
      );
    },
  };

  return {
    handle: async (event) => {
      const applied = await rules.evaluateEvent(
        {
          id: event.id,
          tenantId: event.tenantId,
          eventType: event.eventType,
          payload: event.payload,
          correlationId: event.correlationId,
        },
        executor,
      );
      if (applied > 0) {
        console.log(
          `[nexora-worker] rule-engine applied ${applied} action(s) for ${event.eventType} correlationId=${event.correlationId}`,
        );
      }
    },
  };
}
