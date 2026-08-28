# Domain Spec — VER

## Purpose
Cross-domain physical verification of identity, work, material, machine, location, QC and evidence.

## Owns
- `VerificationEvent`
- `VerificationPolicy`
- `VerificationRequirement`
- `OfflineReplayRecord`

## Core invariants
- Raw scan never directly mutates business truth.
- Failed required verification blocks target command.
- Offline replay idempotent and re-authorized server-side.

## Commands
- `VerifyBarcode`
- `VerifyWorker`
- `VerifyMaterial`
- `VerifyMachine`
- `VerifyLocation`
- `VerifySupervisor`
- `SubmitOfflineEvents`

## Queries
- `GetVerificationRequirements`
- `GetVerificationHistory`
- `GetOfflineSyncStatus`

## Events published
- `verification.passed`
- `verification.failed`

## Permissions
- `verification.use`
- `verification.override`
- `verification.audit`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
