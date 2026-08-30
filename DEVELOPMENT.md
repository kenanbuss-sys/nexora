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

## Sprint 001 quick reference

Auth (dev mode): sign a bearer token with the `DevIdentityAdapter` from
`@nexora/tenancy` using `DEV_AUTH_SECRET`. Claims: `tenantSlug`, `subject`
(IdP subject linked to a user), optional `platformAdmin: true` for
provisioning. Provision a tenant with an initial admin via
`POST /api/v1/tenants` (platform token), then act as that admin.

Key endpoints: `/api/v1/tenant/configuration`, `/api/v1/organization/*`,
`/api/v1/users/*`, `/api/v1/roles/*`, `/api/v1/me/permissions`.

## Web application (MVP)

- `pnpm --filter @nexora/web dev` starts the UI on http://localhost:3000 (API must run on :3001; override with `API_URL`).
- Sign-in is the dev identity mode: tenant slug + identity subject. Check "Platform operator" to provision tenants at `/platform`.
- Bootstrap flow: sign in as platform operator (any subject, e.g. `ops|root`) -> provision a tenant with an initial admin -> sign out -> sign in with that tenant slug and the admin's identity subject.
- The UI holds no business logic and hides unauthorized modules; every action is authorized server-side.
