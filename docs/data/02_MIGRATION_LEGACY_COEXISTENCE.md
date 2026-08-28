# Data Migration & Legacy Coexistence

Reusable migration factory: source inventory -> profile -> canonical mapping -> clean/dedupe -> dry run -> validate counts/totals -> business sign-off -> delta -> cutover -> reconciliation -> archive plan.

Ingest CSV/XLSX, DB extracts, APIs, SFTP/files, document-assisted extraction where justified. Persist external-ID mappings.

Dry-run reports input/accepted/rejected/warnings/duplicates/control totals/unresolved references.

Never let two systems silently be authoritative. Staged model: READ LEGACY -> DUAL VISIBILITY -> PLATFORM AUTHORITATIVE -> LEGACY ARCHIVE. Reconcile stock, open orders, AR/AP and other critical balances before sign-off.
