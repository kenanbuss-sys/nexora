# Testing Strategy

Pyramid: domain unit -> application -> DB/integration -> contracts -> critical E2E -> load/resilience.

Mandatory cross-cutting: tenant isolation, permissions/scopes, field restriction, audit, idempotency, concurrency, outbox, consumer dedupe, migrations.

Critical WMS tests: no oversell, duplicate receipt one stock effect, transfer preserves quantity, adjustment approval. MES: operation sequence, wrong material block, duplicate offline completion harmless, quantity/scrap. OMS: cancel releases reservation, split totals, holds. Finance: decimal/currency and dedupe.

E2E: online order->branch pick->ship; configured B2B->production->QC->ship; PO/container->receipt->putaway; count->adjustment; service->parts->completion. Synthetic test data only.
