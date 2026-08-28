# Domain Spec — B2B

## Purpose
Tenant-branded customer-company self-service portal and permissions.

## Owns
- `CustomerPortalUserLink`
- `CustomerPortalRole`
- `CustomerEntitlement`
- `CustomerApprovalPolicy`

## Core invariants
- Portal user only accesses linked customer companies/projects.
- Catalog/pricing delegate to canonical services.

## Commands
- `InviteCustomerUser`
- `AssignCustomerRole`
- `SubmitCustomerOrder`
- `ApproveCustomerOrder`

## Queries
- `GetCustomerPortalHome`
- `GetEntitledCatalog`
- `GetCustomerDocuments`

## Events published
- None required at current level.

## Permissions
- `b2b.admin`
- `b2b.user`
- `b2b.approver`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
