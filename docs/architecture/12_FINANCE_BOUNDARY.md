# Finance Boundary

The platform includes operational finance and management control. Statutory accounting is available as a dedicated localization inside FIN (ADR-0001: general-ledger core FIN-023..FIN-033, starting with the BiH pack); tenants may instead keep statutory accounting in an external localized system via the accounting connector.

Owns financial dimensions, management budgets/forecast, cost/margin models, AP/AR operational views where enabled, operational invoices/payment matching, management P&L/cash/profitability read models.

Does not hardcode country-specific statutory tax/ledger law into generic core; country rules live in localization packs (configuration + localized capabilities), and GL postings are created only through owned FIN commands (draft -> reviewed -> posted; storno is the only correction).

Cost model can include material + labor + machine + overhead with versioned policy. Operational domains publish facts; FIN turns allowed facts into management-finance entries/read models. External accounting connector maps canonical documents/events.

Money is decimal + currency; issued financial documents corrected by controlled reversal/credit/correction.
