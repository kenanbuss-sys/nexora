# Domain Spec — CORE

## Purpose
Tenant, organization, configuration, metadata, audit, tasks, notifications and shared platform primitives.

## Owns
- `Tenant`
- `LegalEntity`
- `BusinessUnit`
- `Branch`
- `Factory`
- `PlatformConfigurationVersion`
- `CustomFieldDefinition`
- `CustomObjectDefinition`
- `Task`
- `Notification`
- `AuditEvent`

## Core invariants
- No behavior branches on tenant name.
- Published configuration is versioned.
- Audit entries are immutable.
- Custom objects are tenant-scoped.
- Organization references cannot cross tenants.

## Commands
- `CreateTenant`
- `PublishTenantConfiguration`
- `CreateOrganizationNode`
- `DefineCustomField`
- `CreateTask`
- `CompleteTask`

## Queries
- `GetTenantContext`
- `GetOrganizationTree`
- `GetEffectiveConfiguration`
- `SearchAudit`
- `GetUnifiedInbox`

## Events published
- `tenant.created`
- `tenant.configuration.changed`

## Permissions
- `platform.tenant.manage`
- `organization.read`
- `organization.manage`
- `configuration.read`
- `configuration.publish`
- `audit.read`
- `task.manage`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
