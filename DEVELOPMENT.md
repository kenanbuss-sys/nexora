# Development

One local start path (Sprint 000 acceptance):

```bash
corepack enable                 # provides pnpm
pnpm install                    # installs workspace + generates Prisma client
docker compose up -d            # PostgreSQL 17 + Redis 8 with healthchecks
cp .env.example .env            # local defaults match docker-compose
pnpm db:migrate                 # apply migrations to the empty database
pnpm dev                        # web :3000, api :3001, platform-admin :3002, worker
```

Verify:

- `curl localhost:3001/health` → `{"status":"ok","db":"up","redis":"up",...}` with an
  `x-correlation-id` response header (send your own to see it propagate).
- `curl localhost:3001/ready` → 200 only when PostgreSQL and Redis are reachable.

Checks (same gates as CI):

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Integration tests against real PostgreSQL/Redis run when `INTEGRATION=1` is set;
CI always sets it.

## Layout

- `apps/` — web, api, worker, platform-admin, mobile (placeholder until Sprint 005)
- `packages/` — `@nexora/config` (validated env), `@nexora/observability`
  (correlation ID + OpenTelemetry); domain packages arrive from Sprint 001 on
- `prisma/` — schema and migrations (empty by design in Sprint 000)
- `docs/`, `specs/` — the authoritative specification pack; read
  `docs/00_SOURCE_OF_TRUTH.md` first

Architecture changes require an ADR in `docs/architecture/adr/` — see `CLAUDE.md`.
