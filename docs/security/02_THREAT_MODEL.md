# Threat Model

Highest-risk assets: tenant boundary, roles, price/margin/cost, stock/reservations, production/QC, financial/payment data, documents, integration credentials, device identities, audit.

Key threats: cross-tenant access -> server tenant guard/tests; privilege escalation -> scopes/SoD/audit/re-auth; inventory manipulation -> ledger/reasons/approvals; forged devices -> enrollment/auth/replay controls; integration replay -> idempotency/reconciliation; malicious files -> scan/isolation/no execution; bulk exfiltration -> permissions/audit/volume alert; destructive admin -> step-up/backup/history.

AI-specific: recommendations are untrusted until domain validation; external content may contain prompt injection; least-privilege tools; AI cannot bypass authorization/tenant/audit/approval; high-impact actions remain human-controlled by policy.
