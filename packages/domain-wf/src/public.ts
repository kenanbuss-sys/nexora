/**
 * @nexora/domain-wf public application interface.
 * Other domains and apps import ONLY from here.
 */
export {
  findTransition,
  validateWorkflowSpec,
  workflowSpecSchema,
  type TransitionMatch,
  type WorkflowSpec,
} from './workflow-spec';
export {
  matchesConditions,
  ruleSpecSchema,
  validateRuleSpec,
  type RuleAction,
  type RuleCondition,
  type RuleSpec,
} from './rule-spec';
export {
  WorkflowService,
  type AuthorizeFn,
  type WorkflowInstanceView,
  type WorkflowVersionView,
} from './workflow.service';
export { ApprovalService, type ApprovalView } from './approval.service';
export {
  RULE_ENGINE_CONSUMER,
  RuleService,
  type ActionExecutor,
  type RuleEvent,
  type RuleView,
} from './rule.service';
