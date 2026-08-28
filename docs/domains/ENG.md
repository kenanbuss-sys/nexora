# Domain Spec — ENG

## Purpose
Engineering revisions, BOM, parametric formulas, routing and technical change.

## Owns
- `ProductRevision`
- `BOM`
- `BOMRevision`
- `BOMLine`
- `FormulaDefinition`
- `Routing`
- `RoutingRevision`
- `RoutingOperation`
- `EngineeringChangeRequest`
- `EngineeringChangeOrder`

## Core invariants
- Released revision immutable; change creates new revision.
- Order/work order references exact released revision/specification.
- Formula execution deterministic/versioned.

## Commands
- `CreateProductRevision`
- `ReleaseBomRevision`
- `ReleaseRoutingRevision`
- `ApproveEngineeringChange`
- `EvaluateParametricBom`

## Queries
- `GetReleasedBom`
- `GetRouting`
- `CompareRevisions`
- `CalculateMaterialRequirement`

## Events published
- `bom.revision.released`
- `routing.revision.released`
- `engineering_change.approved`

## Permissions
- `engineering.read`
- `engineering.manage`
- `engineering.release`
- `engineering.change.approve`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
