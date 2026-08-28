# Integration Hub

External accounting, commerce, banks, payments, couriers, fiscal/eInvoice, marketplaces, customers/suppliers and industrial systems are adapters behind canonical contracts.

Every production connector has connection state, secret reference, sync direction, mapping version, health, cursor/checkpoint, idempotency, retry/rate-limit policy, dead-letter visibility, reconciliation, run/item logs and safe manual retry.

Use anti-corruption layer: external statuses/IDs/codes map to canonical objects; provider-specific columns do not spread through domains.

During phased rollout maintain a Source-of-Truth Matrix: object/field, authoritative system, direction, latency, conflict owner, cutover state.

Critical connectors reconcile what our platform believes against provider state; HTTP 200 is not enough.
