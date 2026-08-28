# Domain Spec — CPQ

## Purpose
Pricing, quotations and configurable-product rules.

## Owns
- `PriceList`
- `PriceListVersion`
- `PriceRule`
- `Quote`
- `QuoteLine`
- `ConfigurationDefinition`
- `ProductConfiguration`

## Core invariants
- Accepted quote preserves exact pricing/configuration revision.
- Margin-floor override requires permission/approval.
- Formula evaluation deterministic/versioned.

## Commands
- `CalculatePrice`
- `CreateQuote`
- `ReviseQuote`
- `SubmitQuoteApproval`
- `AcceptQuote`
- `PublishPriceList`

## Queries
- `GetEffectivePrice`
- `GetQuote`
- `ValidateConfiguration`
- `GetPromiseEstimate`

## Events published
- `price_list.published`
- `quote.created`
- `quote.approved`
- `quote.accepted`

## Permissions
- `pricing.read`
- `pricing.manage`
- `pricing.override`
- `quote.read`
- `quote.create`
- `quote.approve`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
