# Domain Spec — FIN

## Purpose
Operational finance, cost, margin, budget, cash, AR/AP and accounting integration boundary.

## Owns
- `OperationalFinancialEvent`
- `Invoice`
- `Payment`
- `PaymentMatch`
- `Budget`
- `ForecastFinancial`
- `CostAllocation`
- `ManagementLedgerEntry`

## Core invariants
- Money decimal+currency.
- Duplicate operational event does not duplicate finance impact.
- Issued docs corrected by reversal/credit.
- Statutory localization remains boundary.

## Commands
- `IssueInvoice`
- `ImportInvoice`
- `RecordPayment`
- `MatchPayment`
- `PublishBudget`
- `AllocateCost`
- `PostOperationalFinancialEvent`

## Queries
- `GetOperationalPnL`
- `GetCashPosition`
- `GetARAgeing`
- `GetAPAgeing`
- `GetProfitability`
- `GetBudgetVsActual`

## Events published
- `invoice.issued`
- `payment.received`
- `payment.matched`
- `budget.published`

## Permissions
- `finance.read`
- `finance.cost.read`
- `finance.invoice`
- `finance.payment`
- `finance.budget`
- `finance.treasury`
- `finance.export`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
