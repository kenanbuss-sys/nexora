# Domain Spec — IAM

## Purpose
Identity linkage, roles, scoped authorization, sessions and approval authority.

## Owns
- `User`
- `Role`
- `PermissionGrant`
- `ScopeAssignment`
- `ServiceAccount`
- `ApprovalAuthorityPolicy`

## Core invariants
- Every permission decision is tenant-aware.
- Suspended users cannot mutate business state.
- Role changes are audited.
- Service accounts do not inherit interactive privileges.

## Commands
- `InviteUser`
- `SuspendUser`
- `AssignRole`
- `GrantScopedPermission`
- `RevokeSession`
- `CreateServiceAccount`

## Queries
- `GetEffectivePermissions`
- `ListUserSessions`
- `ExplainAuthorization`

## Events published
- `user.invited`
- `permission.changed`

## Permissions
- `iam.user.manage`
- `iam.role.manage`
- `iam.permission.manage`
- `iam.session.revoke`
- `iam.security.read`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
