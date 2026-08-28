# CI/CD & Release Management

PR gates: lockfile/install, format, lint, typecheck, unit/integration, tenant isolation, authorization, migration validation, build, dependency/secret scan.

Environments: local, CI ephemeral, development, staging, production, optional tenant sandbox.

Migration path prefers expand/backfill/feature-flag/contract; avoid destructive one-step migrations. Releases include version, changelog, feature flags, canary/allowlist where useful, rollback and migration compatibility.

Tenant-specific capabilities use configuration/flags, never branches. Direct manual production DB edits are exceptional and documented/audited.
