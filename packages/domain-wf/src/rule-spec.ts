import { DomainError } from '@nexora/kernel';
import { z } from 'zod';

/**
 * WF — declarative rules: WHEN event -> IF conditions -> THEN actions.
 * Rules read approved context and may not execute arbitrary code
 * (docs/architecture/05_WORKFLOW_RULES_AUTOMATION.md).
 */

const conditionSchema = z.object({
  /** Dot path into the event payload, e.g. "configVersion". */
  path: z.string().min(1).max(200),
  op: z.enum(['eq', 'ne', 'gt', 'lt', 'exists']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_task'),
    title: z.string().min(1).max(300),
    assigneeUserId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal('notify'),
    userId: z.string().uuid(),
    title: z.string().min(1).max(300),
  }),
  z.object({
    action: z.literal('request_approval'),
    title: z.string().min(1).max(300),
  }),
]);

export const ruleSpecSchema = z.object({
  when: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/),
  if: z.array(conditionSchema).max(20).default([]),
  then: z.array(actionSchema).min(1).max(10),
});

export type RuleSpec = z.infer<typeof ruleSpecSchema>;
export type RuleCondition = z.infer<typeof conditionSchema>;
export type RuleAction = z.infer<typeof actionSchema>;

export function validateRuleSpec(raw: unknown): RuleSpec {
  const parsed = ruleSpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError('VALIDATION_FAILED', 'Invalid rule specification', {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join('.') || '(root)', i.message]),
      ),
    });
  }
  return parsed.data;
}

function valueAtPath(payload: unknown, path: string): unknown {
  let current: unknown = payload;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Pure condition matcher over an event payload. */
export function matchesConditions(conditions: readonly RuleCondition[], payload: unknown): boolean {
  for (const condition of conditions) {
    const actual = valueAtPath(payload, condition.path);
    switch (condition.op) {
      case 'exists':
        if (actual === undefined || actual === null) return false;
        break;
      case 'eq':
        if (actual !== condition.value) return false;
        break;
      case 'ne':
        if (actual === condition.value) return false;
        break;
      case 'gt':
        if (typeof actual !== 'number' || typeof condition.value !== 'number') return false;
        if (!(actual > condition.value)) return false;
        break;
      case 'lt':
        if (typeof actual !== 'number' || typeof condition.value !== 'number') return false;
        if (!(actual < condition.value)) return false;
        break;
    }
  }
  return true;
}
