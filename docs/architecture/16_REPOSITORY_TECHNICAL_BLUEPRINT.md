# Repository & Technical Blueprint

```text
apps/{web,api,worker,mobile,platform-admin}
packages/{config,ui,contracts,auth,tenancy,audit,events,workflow,rules,documents,integrations,devices,observability,testing,domain-*}
prisma/
docs/
specs/
infra/
scripts/
```

Apps depend on domain/application packages; domain packages may depend only on small shared primitives and never on app/UI.

Backend domain package pattern: `domain/`, `application/`, `infrastructure/`, `api/`, `tests/`, `public.ts`. Other domains import only public contracts/services.

Single PostgreSQL database per deployment by default; table naming/repositories preserve ownership. Outbox persisted in same transaction, worker dispatches, consumers dedupe. Use projection tables/materialized views for operational dashboards where required.
