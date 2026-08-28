# Non-Functional Requirements

Correctness/traceability first. Integration outage must not corrupt core. Offline physical work queues safely. Long operations become background jobs. Lists paginated and high-volume access indexed. Analytics is separated before harming OLTP.

Scale stateless apps horizontally; introduce partitioning/search/lakehouse only based on measured need. Maintainability requires modular domains, typed contracts, migration discipline, no tenant forks and tests around invariants.

Provider-neutral boundaries for identity/storage/messaging/AI/accounting/couriers/devices/industrial connectivity. Accessibility and internationalization are baseline; currency/UOM/timezones are explicit business data.
