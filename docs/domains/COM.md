# Domain Spec — COM

## Purpose
Commerce/POS/channel experiences feeding canonical orders.

## Owns
- `Channel`
- `Cart`
- `POSSession`
- `Voucher`
- `LoyaltyAccount`

## Core invariants
- Channel never owns authoritative stock.
- Accepted demand becomes OMS.
- Offline POS must reconcile before authoritative effects per policy.

## Commands
- `CreateCart`
- `Checkout`
- `OpenPOSSession`
- `ClosePOSSession`
- `ApplyVoucher`

## Queries
- `GetChannelAvailability`
- `GetCart`
- `GetLoyaltyBalance`

## Events published
- None required at current level.

## Permissions
- `commerce.use`
- `pos.use`
- `pos.manage`
- `loyalty.manage`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
