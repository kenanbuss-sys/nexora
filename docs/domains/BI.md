# Domain Spec — BI

## Purpose
Governed metrics, dashboards, reports, analytics and management control center.

## Owns
- `KPIDefinition`
- `MetricVersion`
- `DashboardDefinition`
- `ReportDefinition`
- `AnalyticsReadModel`

## Core invariants
- Metric definitions versioned.
- BI cannot mutate transaction truth.
- Restricted data remains restricted.

## Commands
- `PublishMetric`
- `SaveDashboard`
- `ScheduleReport`

## Queries
- `QueryMetric`
- `RunReport`
- `GetControlCenter`
- `DrillThrough`

## Events published
- None required at current level.

## Permissions
- `analytics.read`
- `analytics.build`
- `analytics.restricted`
- `analytics.export`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
