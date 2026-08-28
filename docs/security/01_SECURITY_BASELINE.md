# Enterprise Security Baseline

OIDC-first identity, MFA/SSO, least privilege, server RBAC/scopes/field-record controls, SoD, break-glass audit, separate service accounts.

Tenant context server-resolved; every query/cache/storage/job scoped; no cross-tenant lookup by raw ID; automated isolation tests.

Input validation, output encoding, CSRF where applicable, secure headers, rate limits, SSRF protection, file allowlist/size limits, malware-scan hook, safe document rendering.

Secrets manager/env injection, redaction, rotation; signed/replay-protected integrations; TLS; encrypted infrastructure/storage; controlled export; retention/deletion; secure backups.

Secure SDLC: dependency/secret scanning, SAST where useful, protected branches, review, migration review, environment separation, production-access audit.
