# Domain Spec — WF

## Purpose
Versioned workflows, approvals, rules, timers and safe automation.

## Owns
- `WorkflowDefinition`
- `WorkflowVersion`
- `WorkflowInstance`
- `RuleDefinition`
- `RuleVersion`
- `Approval`
- `AutomationExecution`

## Core invariants
- Workflow cannot bypass domain invariants.
- Published versions immutable.
- Automation actor explicit/audited.
- Duplicate event cannot duplicate action.

## Commands
- `PublishWorkflow`
- `StartWorkflow`
- `TransitionWorkflow`
- `RequestApproval`
- `Approve`
- `Reject`
- `PublishRule`

## Queries
- `GetWorkflowInstance`
- `GetPendingApprovals`
- `ExplainRuleExecution`

## Events published
- `workflow.started`
- `workflow.transitioned`
- `approval.requested`
- `approval.granted`
- `approval.rejected`

## Permissions
- `workflow.read`
- `workflow.design`
- `workflow.publish`
- `approval.act`
- `automation.manage`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
