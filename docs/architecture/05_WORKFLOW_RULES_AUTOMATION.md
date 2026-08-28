# Workflow, Rules & Automation

Domain state machines protect invariants. Workflow orchestrates people/system steps. Rules evaluate declarative conditions. Automation executes approved actions. Workflow may never force an invalid domain transition.

## Workflow definition
Versioned trigger, states/steps, transitions, guards, roles/approvals, required forms/fields, timers/SLA, escalation, parallel branches, cancellation/completion. Running instances remain pinned to a compatible version unless explicitly migrated.

## Rules
`WHEN event -> IF conditions -> THEN actions`.
Rules read approved context/read models and may not execute arbitrary code.

## Actions
Create task/approval/document/notification; invoke owning-domain command; invoke integration; schedule follow-up; request reservation/release/purchase/work order.

## Safety
Automation actor explicit; high-impact actions may require approval; idempotent; correlation ID propagated; simulation before publish; published versions immutable; override requires permission + reason + audit.
