# Domain Spec — DOC

## Purpose
Controlled business documents, templates, contracts and signatures.

## Owns
- `DocumentTemplate`
- `DocumentTemplateVersion`
- `Document`
- `DocumentRender`
- `Contract`
- `ContractVersion`
- `SignatureRequest`

## Core invariants
- Issued document retains template/data snapshot/hash.
- Numbering follows tenant/legal-entity policy.
- Void/replacement preserves history.

## Commands
- `RenderDocument`
- `IssueDocument`
- `VoidDocument`
- `CreateContract`
- `PublishContractVersion`
- `RequestSignature`

## Queries
- `GetDocument`
- `GetDocumentHistory`
- `GetExpiringContracts`

## Events published
- `document.issued`
- `contract.expiring`

## Permissions
- `document.read`
- `document.issue`
- `document.void`
- `contract.read`
- `contract.manage`
- `contract.approve`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
