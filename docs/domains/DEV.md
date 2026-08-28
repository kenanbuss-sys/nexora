# Domain Spec — DEV

## Purpose
Device enrollment, capabilities, health and vendor-neutral adapter boundary.

## Owns
- `Device`
- `DeviceEnrollment`
- `DeviceAssignment`
- `DeviceCapability`
- `DeviceEvent`

## Core invariants
- Revoked device cannot submit trusted events.
- Device belongs to one tenant context.
- Vendor details do not leak into domains.

## Commands
- `EnrollDevice`
- `AssignDevice`
- `RevokeDevice`
- `IngestDeviceEvent`
- `UpdateDeviceHealth`

## Queries
- `GetDevice`
- `ListDevices`
- `GetDeviceHealth`
- `GetCapabilities`

## Events published
- `device.enrolled`
- `device.offline`
- `device.event.received`

## Permissions
- `device.read`
- `device.enroll`
- `device.assign`
- `device.revoke`
- `device.support`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
