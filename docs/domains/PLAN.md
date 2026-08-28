# Domain Spec — PLAN

## Purpose
Demand, MRP, capacity and advanced planning recommendations.

## Owns
- `Forecast`
- `ForecastVersion`
- `MRPRun`
- `PlannedOrder`
- `CapacityPlan`
- `ScheduleScenario`

## Core invariants
- Planning suggestions do not post stock/supplier commitments directly.
- Published plan versions trace input snapshot.

## Commands
- `PublishForecast`
- `RunMRP`
- `AcceptPlannedOrder`
- `RunCapacityPlan`
- `PublishSchedule`

## Queries
- `GetShortages`
- `GetPlannedOrders`
- `GetCapacityLoad`
- `GetPromiseDate`

## Events published
- `forecast.published`
- `mrp.run.completed`
- `planned_order.created`

## Permissions
- `planning.read`
- `planning.forecast`
- `planning.mrp`
- `planning.schedule`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
