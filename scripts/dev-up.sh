#!/bin/bash
# Safe dev-stack starter for the cloud/dev sandbox (Linux).
#
#   bash scripts/dev-up.sh
#
# Diagnosis behind this script (17.09.2026): the dev PostgreSQL "crashes"
# were EXTERNAL process kills — the sandbox suspends the container between
# work sessions and the postmaster dies without a clean shutdown (log shows
# "database system was not properly shut down; automatic recovery", zero
# PANIC/signal/OOM entries). fsync and synchronous_commit are ON, so every
# recovery replayed WAL cleanly and no committed data was lost; the one
# apparent "loss" of the demo tenant was the integration tests' documented
# TRUNCATE of the dev database, not the database.
#
# Rules: never stops/drops/reseeds the database, never starts a second
# instance of anything, and reports errors loudly instead of "fixing" them
# by resetting state. Reseeding is a deliberate, manual step
# (scripts/seed-demo.mjs — additive/idempotent, never overwrites).
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DB_URL="${DATABASE_URL:-postgresql://app:app@localhost:5432/enterprise_os}"
LOG="/tmp/nexora-dev.log"

say() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$1" | tee -a "$LOG"; }
fail() { say "ERROR: $1"; exit 1; }

# --- PostgreSQL: start only when it is not already running ------------------
if pg_isready -h 127.0.0.1 -q 2>/dev/null; then
  say "postgres: already running (left untouched)"
else
  say "postgres: starting (data directory is preserved; recovery, if any, is automatic)"
  service postgresql start >/dev/null 2>&1 || fail "postgres failed to start — check /var/log/postgresql/"
  sleep 2
  pg_isready -h 127.0.0.1 -q 2>/dev/null || fail "postgres started but is not accepting connections"
fi

# --- Redis ------------------------------------------------------------------
if redis-cli ping >/dev/null 2>&1; then
  say "redis: already running"
else
  redis-server --daemonize yes >/dev/null 2>&1 || fail "redis failed to start"
  say "redis: started"
fi

# --- API (:3001) — refuse a duplicate instance ------------------------------
if curl -s -o /dev/null --max-time 2 http://localhost:3001/api/v1/tenants; then
  say "api: already answering on :3001 (left untouched)"
elif [ -n "$(ss -ltnp 2>/dev/null | grep ':3001 ')" ]; then
  fail "port 3001 is occupied but not answering — inspect it manually (no blind kill)"
else
  [ -f "$REPO/apps/api/dist/main.js" ] || fail "apps/api/dist/main.js missing — run the build first"
  (cd "$REPO/apps/api" && DATABASE_URL="$DB_URL" REDIS_URL="redis://localhost:6379" PORT=3001 \
    nohup node dist/main.js >> "$LOG" 2>&1 &)
  sleep 3
  say "api: started on :3001"
fi

# --- Web (:3000) — refuse a duplicate instance ------------------------------
if curl -s -o /dev/null --max-time 2 http://localhost:3000/login; then
  say "web: already answering on :3000 (left untouched)"
elif [ -n "$(ss -ltnp 2>/dev/null | grep ':3000 ')" ]; then
  fail "port 3000 is occupied but not answering — inspect it manually (no blind kill)"
else
  [ -d "$REPO/apps/web/.next" ] || fail "apps/web/.next missing — run the web build first"
  (cd "$REPO/apps/web" && API_URL=http://localhost:3001 \
    nohup node node_modules/next/dist/bin/next start --port 3000 >> "$LOG" 2>&1 &)
  sleep 4
  say "web: started on :3000"
fi

say "dev stack ready — http://localhost:3000 (log: $LOG)"
