# Concurrency, Idempotency & Transaction Boundaries

Correctness outranks convenience.

A command transaction validates current owned state, writes owned tables, audit and outbox. It does not synchronously mutate another domain's internal tables.

Use optimistic concurrency for orders, POs, work orders, workflow/configuration versions, count approvals and duplicate-sensitive document issuance.

Inventory reservations must atomically enforce policy; never `read available -> later write` without locks/constraints. Stock movements carry unique business idempotency keys.

Duplicate receipt/offline device/courier webhook/order import must produce one business effect.

External side effects run after commit through outbox/worker. Once downstream physical/financial effect exists, reverse with compensating transactions, never erase history.
