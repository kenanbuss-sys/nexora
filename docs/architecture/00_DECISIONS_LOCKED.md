# Locked Architecture Decisions

Changing these defaults requires an ADR.

## Product architecture
- Modular monolith first; strict bounded contexts and public application interfaces.
- One codebase for shared and dedicated tenant deployments.
- Configuration/extension before customer-specific code.
- PostgreSQL is transactional source of truth.
- Not fully event-sourced: normal transactional models + business events + immutable audit.
- Inventory uses immutable movement ledger + projections.

## Repository and applications
- pnpm workspace + Turborepo + TypeScript strict.
- `apps/web`: Next.js App Router.
- `apps/api`: NestJS with Fastify adapter.
- `apps/worker`: background jobs/outbox/integration work.
- `apps/mobile`: React Native with native-module support; Android operational devices first.
- `apps/platform-admin`: internal platform operations/configuration.

## Data/infrastructure
- PostgreSQL + Prisma for standard persistence/migrations; documented repository-scoped raw SQL only when PostgreSQL-specific behavior is justified.
- Redis + BullMQ.
- S3-compatible object storage.
- PostgreSQL search initially; dedicated search only when measured need justifies it.
- Transactional outbox.
- OpenTelemetry.

## API/identity
- REST + OpenAPI first; versioned public API; signed webhooks.
- Idempotency keys for retriable external mutations.
- OIDC-first provider-neutral identity boundary; production IdP can vary without changing business domains.

## UI/testing/deployment
- Shared accessible design system + runtime design tokens.
- Vitest for unit/domain; real PostgreSQL/Redis integration tests; Playwright for web E2E.
- Containers, separate dev/staging/prod, gated migrations, feature flags, same migration stream for shared/dedicated deployments.

## Do not adopt prematurely
Microservices, Kafka, Kubernetes, full event sourcing, dedicated search, lakehouse: only after measured requirement + accepted ADR.
