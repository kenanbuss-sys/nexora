# Domain Spec — WMS

## Purpose
Inventory ledger, warehouse execution, traceability and physical stock accuracy.

## Owns
- `Warehouse`
- `WarehouseLocation`
- `StockMovement`
- `StockReservation`
- `InventoryCount`
- `InventoryAdjustment`
- `TransferOrder`
- `GoodsReceipt`
- `PickTask`
- `PackTask`
- `LicensePlate`

## Core invariants
- Stock truth is immutable movement ledger.
- Correction uses reversal/new movement.
- Reservation obeys available-stock policy atomically.
- Lot/serial rules enforced on movement.
- Posted receipt idempotent.

## Commands
- `ReserveStock`
- `ReleaseReservation`
- `CreateGoodsReceipt`
- `PostGoodsReceipt`
- `CreateTransfer`
- `DispatchTransfer`
- `ReceiveTransfer`
- `CreatePickTask`
- `CompletePick`
- `CompletePack`
- `StartInventoryCount`
- `ApproveAdjustment`

## Queries
- `GetStockPosition`
- `GetAvailableToPromiseStock`
- `GetMovementHistory`
- `GetPickQueue`
- `GetInventoryVariance`

## Events published
- `stock.reserved`
- `stock.released`
- `stock.moved`
- `goods.receipt.created`
- `goods.received`
- `goods.receipt.discrepancy`
- `inventory.count.started`
- `inventory.adjustment.requested`
- `inventory.adjusted`
- `transfer.created`
- `transfer.dispatched`
- `transfer.received`
- `pick.task.created`
- `pick.completed`
- `pack.completed`

## Permissions
- `inventory.read`
- `inventory.receive`
- `inventory.transfer`
- `inventory.pick`
- `inventory.pack`
- `inventory.count`
- `inventory.adjust`
- `inventory.adjust.approve`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
