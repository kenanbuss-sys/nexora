# Domain Spec — QMS

## Purpose
Inspection, quarantine, nonconformance and corrective action.

## Owns
- `InspectionPlan`
- `QualityInspection`
- `InspectionResult`
- `NCR`
- `CAPA`
- `DefectCode`
- `QualityDisposition`

## Core invariants
- Failed/blocked quality cannot release without authorized disposition.
- Inspection references exact lot/serial/work context.
- Calibration requirements validated where configured.

## Commands
- `CreateInspection`
- `StartInspection`
- `PassInspection`
- `FailInspection`
- `CreateNCR`
- `CreateCAPA`
- `ReleaseQuarantine`

## Queries
- `GetInspection`
- `GetQualityHold`
- `GetDefectAnalytics`
- `GetSupplierQuality`

## Events published
- `qc.inspection.created`
- `qc.passed`
- `qc.failed`
- `ncr.created`
- `capa.created`

## Permissions
- `quality.read`
- `quality.inspect`
- `quality.release`
- `quality.ncr`
- `quality.capa`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
