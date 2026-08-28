# Domain Spec — OPS

## Purpose
Operate the platform across tenants, environments and releases: provisioning, licensing, rollout, health, support, backup/recovery visibility and usage.

## Owns
- TenantProvisioningJob
- ModuleLicenseAssignment
- ReleaseAssignment
- PlatformHealthSnapshot
- SupportAccessGrant
- UsageRecord

## Invariants
- Platform support access never bypasses audit.
- Release assignment does not create tenant-specific branches.
- Tenant provisioning is idempotent.
- Support impersonation is time-limited, permissioned and auditable.

## Commands
`ProvisionTenant`, `AssignModules`, `AssignRelease`, `GrantSupportAccess`, `RevokeSupportAccess`, `ExportTenantData`.

## Queries
`GetPlatformHealth`, `GetTenantHealth`, `GetUsage`, `GetReleaseAssignments`, `GetSupportAccessHistory`.

## Permissions
`platform.tenant.provision`, `platform.release.manage`, `platform.support.impersonate`, `platform.health.read`, `platform.usage.read`.
