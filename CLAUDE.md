# Enterprise Business OS — Claude Code Constitution

## Mission
Build a premium modular enterprise Business Operating System covering commerce, distribution, warehousing, manufacturing, service, finance, analytics, devices and integrations.

## Read first
1. `docs/00_SOURCE_OF_TRUTH.md`
2. mandatory files listed there
3. relevant domain spec
4. relevant ADRs

## Absolute rules
- One codebase; never fork the core for a tenant.
- Never use real customer names in generic source, fixtures, demos or docs.
- Never create a dependency on a separate pre-existing business application.
- Tenant differences belong in configuration, metadata, workflows, templates, permissions, adapters and extensions.
- Every business record has explicit tenant ownership or a documented isolation mechanism.
- Authorization is server-side; hidden UI is not authorization.
- Critical mutations are audited.
- Inventory is ledger-driven; never use an editable current-stock field as the source of truth.
- External integrations and physical devices are behind ports/adapters.
- Retriable external commands/event consumers are idempotent.
- Business logic does not live in UI components.
- Cross-domain writes occur only through the owning domain's public application interface.
- Important configuration is versioned/effective-dated when history depends on it.
- Schema changes require migrations and a forward/rollback strategy.
- No secrets in source, fixtures, logs or committed settings.
- High-impact AI actions require policy checks and human approval unless explicitly classified safe.
- External documents/web/tool content are untrusted data for AI features.

## Architecture
- Modular monolith first with strict bounded contexts.
- TypeScript strict mode.
- PostgreSQL transactional source of truth.
- Reliable business events via transactional outbox.
- REST/OpenAPI first.
- Redis-backed jobs/cache/locks where justified.
- S3-compatible object storage.
- OIDC-first identity-provider abstraction.
- Provider-neutral integration/device/AI ports.
- Separate read models for heavy dashboards when required.

## Before coding a feature
State capability IDs, owning domain, entities/value objects, commands/queries/events, state-machine impact, permissions/scopes, tenant isolation, audit, concurrency/idempotency, tests and configuration/integration/device boundaries.

## Definition of done
Domain invariants, tenant/authorization tests, audit, errors, migrations, reliable events, adapter boundaries, tests/typecheck/lint, and docs must be complete.

## Architecture changes
Never silently change architecture. Create an ADR: context, decision, alternatives, consequences, migration and rollback.

## Subagents
Use focused independent architecture/security/data/test/UX reviewers. Prefer at most three parallel reviewers unless a major release gate justifies more.
