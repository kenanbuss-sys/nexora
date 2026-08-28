# Domain Spec — MES

## Purpose
Manufacturing work execution, WIP, consumption, operator/machine status and genealogy.

## Owns
- `WorkOrder`
- `ProductionOperation`
- `OperationExecution`
- `WIPUnit`
- `MaterialConsumptionReference`
- `ScrapRecord`
- `ReworkRecord`
- `ProductionConfirmation`

## Core invariants
- Sequence follows released routing or approved deviation.
- Material issue goes through WMS.
- Required verification must pass.
- Duplicate offline completion cannot double-confirm output.
- Quantity/scrap policy enforced.

## Commands
- `CreateWorkOrder`
- `ReleaseWorkOrder`
- `StartOperation`
- `PauseOperation`
- `CompleteOperation`
- `IssueMaterialRequest`
- `RecordScrap`
- `CreateRework`
- `CompleteWorkOrder`

## Queries
- `GetWorkOrder`
- `GetShopFloorQueue`
- `GetWip`
- `GetProductionGenealogy`
- `GetShiftPerformance`

## Events published
- `work_order.created`
- `work_order.released`
- `work_order.started`
- `work_order.completed`
- `work_order.cancelled`
- `operation.ready`
- `operation.started`
- `operation.paused`
- `operation.completed`
- `material.issued_to_production`
- `scrap.recorded`
- `rework.created`

## Permissions
- `production.read`
- `production.plan`
- `production.release`
- `production.execute`
- `production.override`
- `production.scrap`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
