#!/bin/bash
# One-command local dev setup + start for macOS.
# Usage: bash scripts/mac-dev.sh
# Installs (via Homebrew) anything missing: node, pnpm, postgresql@17, redis;
# creates the database, applies migrations, installs deps, builds, and starts
# the API (:3001) and the web app (:3000).
set -e

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

# --- Homebrew ---------------------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null)" || true
  eval "$(/usr/local/bin/brew shellenv 2>/dev/null)" || true
fi
if ! command -v brew >/dev/null 2>&1; then
  say "Installing Homebrew (you may be asked for your macOS password)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null)" || eval "$(/usr/local/bin/brew shellenv)"
fi

# --- Node + pnpm ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  say "Installing Node.js"
  brew install node
fi
if ! command -v pnpm >/dev/null 2>&1; then
  say "Installing pnpm"
  brew install pnpm
fi

# --- PostgreSQL -------------------------------------------------------------
if ! command -v psql >/dev/null 2>&1; then
  if [ -x "$(brew --prefix)/opt/postgresql@17/bin/psql" ]; then
    export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"
  else
    say "Installing PostgreSQL 17"
    brew install postgresql@17
    export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"
  fi
fi
say "Starting PostgreSQL"
brew services start postgresql@17 >/dev/null 2>&1 || brew services start postgresql >/dev/null 2>&1 || true
sleep 2

# --- Redis ------------------------------------------------------------------
if ! command -v redis-server >/dev/null 2>&1; then
  say "Installing Redis"
  brew install redis
fi
say "Starting Redis"
brew services start redis >/dev/null 2>&1 || true

# --- Database + migrations --------------------------------------------------
DB_URL="postgresql://$USER@localhost:5432/enterprise_os"
if ! psql -lqt 2>/dev/null | cut -d '|' -f 1 | grep -qw enterprise_os; then
  say "Creating database enterprise_os"
  createdb enterprise_os
fi

say "Applying migrations"
APPLIED_FILE="$ROOT/.applied_migrations"
touch "$APPLIED_FILE"
for dir in prisma/migrations/*/; do
  name="$(basename "$dir")"
  if ! grep -qx "$name" "$APPLIED_FILE"; then
    echo "  - $name"
    psql -v ON_ERROR_STOP=1 -d enterprise_os -f "$dir/migration.sql" >/dev/null
    echo "$name" >> "$APPLIED_FILE"
  fi
done

# --- Install + build --------------------------------------------------------
say "Installing dependencies"
pnpm install

say "Building"
pnpm turbo build --filter=@nexora/api --filter=@nexora/web --output-logs=errors-only

# --- Start ------------------------------------------------------------------
say "Starting API on :3001"
pkill -f 'apps/api/dist/main.js' 2>/dev/null || true
DATABASE_URL="$DB_URL" REDIS_URL="redis://localhost:6379" nohup node apps/api/dist/main.js > /tmp/nexora-api.log 2>&1 &
sleep 3
if curl -s localhost:3001/health | grep -q '"status"'; then
  echo "API is up: $(curl -s localhost:3001/health)"
else
  echo "API did not start — check /tmp/nexora-api.log"; exit 1
fi

say "Starting web on http://localhost:3000 (Ctrl+C to stop)"
echo ""
echo "  Sign in at http://localhost:3000/login"
echo "  1) Platform operator: tenant 'platform', subject 'ops|root', check 'Platform operator'"
echo "  2) Provision your tenant at /platform, then sign in with it."
echo ""
cd apps/web && exec npx next start --port 3000
