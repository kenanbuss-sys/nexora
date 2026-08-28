# Domain Spec — MDM

## Purpose
Canonical parties, reference data, duplicates and source mappings.

## Owns
- `Party`
- `PartyMerge`
- `ReferenceValue`
- `ExternalIdentityMap`
- `DataQualityIssue`

## Core invariants
- Merge preserves redirects/history.
- External mapping unique per source/entity/external ID.
- Golden-record changes auditable.

## Commands
- `CreateParty`
- `MergeParty`
- `MapExternalIdentity`
- `ResolveDataQualityIssue`

## Queries
- `SearchParty`
- `FindDuplicates`
- `ResolveExternalIdentity`

## Events published
- `party.created`

## Permissions
- `mdm.read`
- `mdm.create`
- `mdm.merge`
- `mdm.steward`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
