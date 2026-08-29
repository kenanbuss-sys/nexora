import { DomainError } from '@nexora/kernel';
import { z } from 'zod';

/**
 * WF — versioned workflow graph (docs/architecture/05_WORKFLOW_RULES_AUTOMATION.md).
 *
 * A published version is immutable; running instances stay pinned to their
 * version. The graph protects orchestration only — domain invariants live in
 * the owning domains and a workflow may never force an invalid domain
 * transition.
 */

const stateNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'State names are UPPER_SNAKE_CASE');

export const workflowSpecSchema = z.object({
  initial: stateNameSchema,
  states: z.array(z.object({ name: stateNameSchema, terminal: z.boolean().optional() })).min(1),
  transitions: z
    .array(
      z.object({
        from: stateNameSchema,
        to: stateNameSchema,
        trigger: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z][a-z0-9_]*$/),
        /** Permission required to fire this transition (default: workflow.read suffices). */
        requiredPermission: z.string().min(3).max(100).optional(),
      }),
    )
    .min(1),
});

export type WorkflowSpec = z.infer<typeof workflowSpecSchema>;

/** Validate a workflow graph; throws VALIDATION_FAILED with precise reasons. */
export function validateWorkflowSpec(raw: unknown): WorkflowSpec {
  const parsed = workflowSpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError('VALIDATION_FAILED', 'Invalid workflow specification', {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join('.') || '(root)', i.message]),
      ),
    });
  }
  const spec = parsed.data;
  const names = new Set<string>();
  for (const s of spec.states) {
    if (names.has(s.name)) {
      throw new DomainError('VALIDATION_FAILED', `Duplicate state: ${s.name}`);
    }
    names.add(s.name);
  }
  if (!names.has(spec.initial)) {
    throw new DomainError('VALIDATION_FAILED', `Initial state ${spec.initial} is not defined`);
  }
  for (const t of spec.transitions) {
    if (!names.has(t.from) || !names.has(t.to)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `Transition ${t.trigger} references unknown state ${!names.has(t.from) ? t.from : t.to}`,
      );
    }
  }
  return spec;
}

export interface TransitionMatch {
  to: string;
  requiredPermission?: string | undefined;
  toTerminal: boolean;
}

/** Find the transition for (currentState, trigger); null when not allowed. */
export function findTransition(
  spec: WorkflowSpec,
  currentState: string,
  trigger: string,
): TransitionMatch | null {
  const transition = spec.transitions.find((t) => t.from === currentState && t.trigger === trigger);
  if (!transition) return null;
  const target = spec.states.find((s) => s.name === transition.to);
  return {
    to: transition.to,
    requiredPermission: transition.requiredPermission,
    toTerminal: target?.terminal === true,
  };
}
