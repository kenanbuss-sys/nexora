# Domain Spec — OMS

## Purpose
Canonical order capture, validation, allocation, reservation orchestration and fulfillment.

## Owns
- `SalesOrder`
- `SalesOrderLine`
- `OrderHold`
- `FulfillmentOrder`
- `AllocationDecision`

## Core invariants
- Confirmed order is firm demand.
- Totals preserve accepted pricing snapshot.
- Cancellation cannot erase fulfilled history.
- Fulfillment cannot exceed remaining demand unless explicit policy.

## Commands
- `CreateOrder`
- `ValidateOrder`
- `ConfirmOrder`
- `PlaceHold`
- `ReleaseHold`
- `CancelOrder`
- `PlanFulfillment`
- `AmendOrder`

## Queries
- `GetOrder`
- `GetOrderTimeline`
- `GetFulfillmentPlan`
- `GetOrderPromise`

## Events published
- `order.created`
- `order.validated`
- `order.confirmed`
- `order.held`
- `order.released`
- `order.cancelled`
- `order.fulfillment.planned`

## Permissions
- `order.read`
- `order.create`
- `order.confirm`
- `order.hold`
- `order.cancel`
- `order.override`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
