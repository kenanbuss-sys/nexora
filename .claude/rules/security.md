---
description: Security rules for auth, APIs, persistence and integrations
---
# Security Rules
- Every request/query/mutation is tenant-aware.
- Server authorization is mandatory.
- Never log credentials/tokens/sensitive content unnecessarily.
- File uploads and external content are untrusted.
- Sensitive exports/actions are permissioned and audited.
- Add tenant-isolation tests for each tenant-scoped repository/query.
