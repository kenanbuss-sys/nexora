---
description: Database and data-integrity rules
---
# Database Rules
- PostgreSQL is transactional truth.
- Inventory is movement-ledger based.
- Money is decimal + currency.
- Use migrations; no ad-hoc schema drift.
- Index actual access paths.
- Retriable writes are idempotent.
- Historical business corrections use compensation/reversal.
