# Domain Spec — CRM

## Purpose
Commercial relationship and customer account management.

## Owns
- `CustomerAccount`
- `ContactRelationship`
- `Lead`
- `Opportunity`
- `Activity`
- `CustomerSegment`
- `CustomerOnboardingCase`

## Core invariants
- Customer account links to canonical Party.
- Credit-sensitive fields restricted.
- Timeline references source objects, not copied truth.

## Commands
- `CreateLead`
- `ConvertLead`
- `CreateOpportunity`
- `ApproveCustomer`
- `RecordActivity`

## Queries
- `GetCustomer360`
- `GetPipeline`
- `GetCustomerExposureSummary`

## Events published
- `customer.approved`

## Permissions
- `crm.read`
- `crm.manage`
- `crm.credit.read`
- `crm.customer.approve`

## Required behavior
Tenant isolation, server authorization, critical audit, correlation IDs, validation before state transition, external idempotency, explicit transactions, no cross-domain table writes, canonical API errors and tests for invariants/permissions/tenant separation.

## Coding readiness
Before implementation, expand only the sprint-scoped capabilities into feature specs with acceptance criteria.
