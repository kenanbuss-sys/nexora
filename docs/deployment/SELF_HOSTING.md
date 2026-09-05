# NexoraOS — self-hosting guide

Everything runs on your own server. No public platforms are involved:
web, API, worker, PostgreSQL, Redis and HTTPS all live in Docker on one
machine, and all data stays with you.

## What you need

- A Linux server (VPS or on-premises) with 2 GB+ RAM, Docker and the
  Docker Compose plugin installed. Ports 80 and 443 open.
- A DNS record for your domain pointing at the server, e.g.
  `nexora.xcall.ba` → `A` record → your server's IP. If the parent
  domain is managed elsewhere (e.g. Globalhost for `xcall.ba`), add the
  record in that DNS panel — nothing else moves.

## Five steps

```bash
# 1. Get the code onto the server
git clone https://github.com/kenanbuss-sys/nexora.git && cd nexora

# 2. Configure (domain, database password, auth secret)
cp deploy/env.example deploy/.env
nano deploy/.env

# 3. Build and start everything
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

# 4. (optional) Load the demo tenant with data
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  exec api node scripts/seed-demo.mjs

# 5. Open https://<your domain> — HTTPS is issued automatically
```

Caddy obtains and renews the Let's Encrypt certificate on its own the
first time the domain resolves to the server.

## Updating

```bash
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Database migrations apply automatically on every start (the `migrate`
service tracks what has already run).

## Backups

All state lives in two Docker volumes. A nightly database dump:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  exec db pg_dump -U app enterprise_os | gzip > nexora-$(date +%F).sql.gz
```

Restore with `gunzip -c file.sql.gz | docker compose ... exec -T db psql -U app enterprise_os`.

## Cloudflare (optional)

You can put Cloudflare in front (orange-cloud proxy on the DNS record)
for CDN/shielding. Set SSL mode to **Full (strict)** — Caddy still
terminates HTTPS on the server. This is optional; the stack is fully
self-sufficient without it.

## Notes

- `deploy/.env` holds the only secrets (DB password, auth secret) and is
  git-ignored — never commit it.
- The identity mode is the built-in dev adapter; for production SSO the
  OIDC adapter slot is ready (`AUTH_MODE=oidc`) and can be wired to any
  provider.
