# Domain Spec — PIM

## Purpose
Products, SKUs, identifiers, attributes and logistics metadata.

## Owns
- `Product`
- `SKU`
- `Barcode`
- `AttributeDefinition`
- `ProductAttributeValue`
- `PackagingLevel`
- `UomConversion`
- `ProductMedia`

## Core invariants
- Barcode uniqueness tenant-scoped/policy-controlled.
- Base UOM cannot casually change after transactions.
- Inactive SKU cannot be newly transacted unless policy allows.

## Commands
- `CreateProduct`
- `CreateSKU`
- `AssignBarcode`
- `PublishProduct`
- `DiscontinueSKU`

## Queries
- `GetProduct`
- `LookupBarcode`
- `SearchCatalog`
- `GetPackagingHierarchy`

## Events published
- `product.created`
- `sku.activated`

## Permissions
- `product.read`
- `product.manage`
- `product.barcode.manage`
- `product.publish`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
