import { writeAudit } from '@nexora/audit';
import type { Db, PrismaClient } from '@nexora/db';
import { DomainError } from '@nexora/kernel';
import type { RequestContext } from '@nexora/tenancy';
import { matchesConditions, validateRuleSpec, type RuleAction, type RuleSpec } from './rule-spec';

/**
 * WF — declarative rules with an idempotent event-driven evaluator.
 *
 * The evaluator claims each (event, consumer) exactly once via the
 * processed_event unique constraint, inside the same transaction that applies
 * the actions — a duplicate event can never duplicate an action.
 * Actions run through the ActionExecutor port; rules never execute code.
 */

export const RULE_ENGINE_CONSUMER = 'rule-engine';

export interface RuleEvent {
  /** Outbox event id (uuid). */
  id: string;
  tenantId: string;
  eventType: string;
  payload: unknown;
  correlationId: string;
}

/** Application-provided action port (implemented over owning-domain services). */
export interface ActionExecutor {
  createTask(
    tx: Db,
    tenantId: string,
    input: { title: string; assigneeUserId?: string | undefined; relatedEventId: string },
  ): Promise<void>;
  notify(
    tx: Db,
    tenantId: string,
    input: { userId: string; title: string; relatedEventId: string },
  ): Promise<void>;
  requestApproval(
    tx: Db,
    tenantId: string,
    input: { title: string; relatedEventId: string },
  ): Promise<void>;
}

export interface RuleView {
  key: string;
  name: string;
  version: number;
  enabled: boolean;
  spec: RuleSpec;
}

export class RuleService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Publish a new immutable version of a rule (permission: automation.manage). */
  async publishRule(
    input: { key: string; name: string; spec: unknown; enabled?: boolean | undefined },
    ctx: RequestContext,
  ): Promise<RuleView> {
    const spec = validateRuleSpec(input.spec);
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(input.key)) {
      throw new DomainError('VALIDATION_FAILED', 'Rule key must be kebab-case');
    }
    return this.prisma.$transaction(async (tx) => {
      const definition = await tx.ruleDefinition.upsert({
        where: { tenantId_key: { tenantId: ctx.tenantId, key: input.key } },
        create: { tenantId: ctx.tenantId, key: input.key, name: input.name },
        update: { name: input.name },
      });
      const last = await tx.ruleVersion.findFirst({
        where: { ruleId: definition.id },
        orderBy: { version: 'desc' },
      });
      const version = (last?.version ?? 0) + 1;
      // Newest published version is the only enabled one.
      await tx.ruleVersion.updateMany({
        where: { ruleId: definition.id },
        data: { enabled: false },
      });
      await tx.ruleVersion.create({
        data: {
          tenantId: ctx.tenantId,
          ruleId: definition.id,
          version,
          spec,
          enabled: input.enabled ?? true,
        },
      });
      await writeAudit(tx, {
        tenantId: ctx.tenantId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
        action: 'rule.publish',
        objectType: 'RuleVersion',
        objectId: `${definition.id}:${version}`,
        source: 'api',
        newValues: { key: input.key, version, when: spec.when },
      });
      return { key: input.key, name: input.name, version, enabled: input.enabled ?? true, spec };
    });
  }

  async listRules(ctx: RequestContext): Promise<RuleView[]> {
    const definitions = await this.prisma.ruleDefinition.findMany({
      where: { tenantId: ctx.tenantId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { key: 'asc' },
    });
    return definitions
      .filter((d) => d.versions.length > 0)
      .map((d) => {
        const v = d.versions[0] as (typeof d.versions)[number];
        return {
          key: d.key,
          name: d.name,
          version: v.version,
          enabled: v.enabled,
          spec: v.spec as unknown as RuleSpec,
        };
      });
  }

  /**
   * Evaluate one business event. Idempotent per (event, consumer): repeated
   * delivery is a no-op. Returns the number of actions applied.
   */
  async evaluateEvent(event: RuleEvent, executor: ActionExecutor): Promise<number> {
    let actionsApplied = 0;
    await this.prisma.$transaction(async (tx) => {
      // Claim the event; unique(event_id, consumer) makes duplicates no-ops.
      try {
        await tx.processedEvent.create({
          data: { tenantId: event.tenantId, eventId: event.id, consumer: RULE_ENGINE_CONSUMER },
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'P2002') return; // already processed
        throw error;
      }

      const versions = await tx.ruleVersion.findMany({
        where: { tenantId: event.tenantId, enabled: true },
      });
      for (const version of versions) {
        const spec = version.spec as unknown as RuleSpec;
        if (spec.when !== event.eventType) continue;
        if (!matchesConditions(spec.if, event.payload)) continue;
        for (const action of spec.then as RuleAction[]) {
          switch (action.action) {
            case 'create_task':
              await executor.createTask(tx, event.tenantId, {
                title: action.title,
                assigneeUserId: action.assigneeUserId,
                relatedEventId: event.id,
              });
              break;
            case 'notify':
              await executor.notify(tx, event.tenantId, {
                userId: action.userId,
                title: action.title,
                relatedEventId: event.id,
              });
              break;
            case 'request_approval':
              await executor.requestApproval(tx, event.tenantId, {
                title: action.title,
                relatedEventId: event.id,
              });
              break;
          }
          actionsApplied += 1;
        }
      }
    });
    return actionsApplied;
  }
}
