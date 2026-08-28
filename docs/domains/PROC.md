# Domain Spec — PROC

## Purpose
Supplier sourcing, purchasing, inbound shipments and import cost.

## Owns
- `SupplierAccount`
- `PurchaseRequest`
- `RFQ`
- `PurchaseOrder`
- `PurchaseOrderLine`
- `InboundShipment`
- `Container`
- `LandedCostAllocation`

## Core invariants
- Issued PO revision preserved.
- Receipt is posted by WMS.
- Landed cost reproducible/versioned.

## Commands
- `CreatePurchaseRequest`
- `ApprovePurchaseRequest`
- `CreateRFQ`
- `IssuePurchaseOrder`
- `AcknowledgePurchaseOrder`
- `CreateInboundShipment`
- `AllocateLandedCost`

## Queries
- `GetPurchaseOrder`
- `GetSupplierPerformance`
- `GetInboundETA`
- `GetPurchaseSuggestions`

## Events published
- `purchase.requested`
- `purchase.approved`
- `purchase_order.issued`
- `purchase_order.acknowledged`
- `inbound_shipment.created`
- `inbound_shipment.arrived`
- `landed_cost.allocated`

## Permissions
- `procurement.read`
- `procurement.request`
- `procurement.approve`
- `purchase_order.issue`
- `import.manage`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
