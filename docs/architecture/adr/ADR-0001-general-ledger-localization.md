# ADR-0001 — Statutory general ledger as a FIN localization (BiH)

Status: Accepted (owner approval 17.09.2026, ODL-001)

## Context
`12_FINANCE_BOUNDARY.md` scoped Nexora to management finance and allowed statutory accounting to remain external "until a dedicated accounting localization exists". The FinTrack coverage mandate (audit 17.09.2026) requires full double-entry bookkeeping: per-legal-entity chart of accounts, numbered journal entries, opening balances, period locks, storno, cards, KUF/KIF/VAT.

## Decision
Introduce a statutory GL inside the FIN domain as capabilities FIN-023..FIN-033 ("BiH accounting localization"). Core invariants: (1) entries are created only through owned FIN commands (draft → reviewed → posted); (2) posted entries are immutable — the only correction is a linked mirrored storno; (3) numbering is a per-legal-entity sequence; (4) opening-balance date and period lock guard posting; (5) accounts in use are never deleted; (6) all mutations audited; (7) access via per-user `finance.ledger.*` permissions, never roles alone. Country-specific tax rules stay in the localization pack (config + FIN-028), not in generic core.

## Alternatives considered
External accounting via connector only (status quo) — rejected: the mandate requires an internal ledger. A separate GL domain — rejected: FIN owns financial dimensions and documents; a second finance domain would split ownership.

## Consequences
FIN grows a subledger with its own tables (gl_*). Operational domains still publish facts; GL postings derive from allowed business actions (bank statements, KUF/KIF, compensations — later capabilities).

## Security impact
New permissions `finance.ledger.read/post/manage`; financial isolation per legal entity within one tenant; no cross-tenant reads (tenantId on every table and query).

## Data/migration impact
Migration `20260917000211_sprint_211_gl_core` (additive; forward-only; rollback = drop gl_* tables, no existing data touched).

## Compatibility
No changes to existing FIN capabilities or APIs.

## Rollback
Disable the module per tenant (module activation); tables are additive and can be dropped if the localization is abandoned before use.
