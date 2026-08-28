# Domain Spec — INT

## Purpose
External connector framework, mapping, sync, reconciliation and health.

## Owns
- `IntegrationConnection`
- `MappingVersion`
- `SyncCursor`
- `IntegrationRun`
- `IntegrationItemResult`
- `DeadLetterItem`

## Core invariants
- Credentials are secret references, not plaintext.
- Retry idempotent.
- Mapping versioned.
- Failure visible/recoverable.

## Commands
- `ConnectIntegration`
- `RunSync`
- `RetryFailedItem`
- `ReconcileIntegration`
- `PublishMapping`

## Queries
- `GetIntegrationHealth`
- `GetRunHistory`
- `GetDeadLetters`
- `GetReconciliation`

## Events published
- `integration.failed`
- `integration.recovered`

## Permissions
- `integration.read`
- `integration.manage`
- `integration.retry`
- `integration.secrets.manage`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
