#!/usr/bin/env bash
# NexoraOS — one-command installer for a fresh Ubuntu 22.04/24.04 server.
#
#   curl -fsSL https://raw.githubusercontent.com/kenanbuss-sys/nexora/main/deploy/install.sh | sudo bash
#
# Installs Docker, clones the repository, asks for the domain and
# secrets, and starts the full self-hosted stack with automatic HTTPS.
# Everything stays on this server.
set -euo pipefail

REPO_URL="${NEXORA_REPO:-https://github.com/kenanbuss-sys/nexora.git}"
TARGET_DIR="${NEXORA_DIR:-/opt/nexora}"

say() { printf '\n\033[1;34m[nexora]\033[0m %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

say "Installing prerequisites…"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker…"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi

if [ -d "$TARGET_DIR/.git" ]; then
  say "Updating existing installation in $TARGET_DIR…"
  git -C "$TARGET_DIR" pull --ff-only
else
  say "Cloning NexoraOS into $TARGET_DIR…"
  git clone --depth 1 "$REPO_URL" "$TARGET_DIR"
fi
cd "$TARGET_DIR"

if [ ! -f deploy/.env ]; then
  say "Configuration"
  read -rp "  Domain (e.g. nexora.xcall.ba): " DOMAIN </dev/tty
  DB_PASSWORD="$(openssl rand -hex 16)"
  AUTH_SECRET="$(openssl rand -hex 24)"
  cat > deploy/.env <<ENV
DOMAIN=${DOMAIN}
DB_PASSWORD=${DB_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
ENV
  chmod 600 deploy/.env
  say "Secrets generated and stored in deploy/.env (kept on this server only)."
fi

say "Building and starting the stack (first build takes a few minutes)…"
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

say "Waiting for the API…"
for _ in $(seq 1 60); do
  if docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
    exec -T api sh -c 'true' 2>/dev/null; then
    break
  fi
  sleep 2
done

read -rp "Load the demo tenant with sample data? [Y/n] " SEED </dev/tty || SEED=Y
if [ "${SEED:-Y}" != "n" ] && [ "${SEED:-Y}" != "N" ]; then
  say "Seeding demo data…"
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
    exec -T api node scripts/seed-demo.mjs || true
fi

DOMAIN_VALUE="$(grep '^DOMAIN=' deploy/.env | cut -d= -f2)"
say "Done. Open https://${DOMAIN_VALUE} (the certificate is issued automatically"
say "on the first visit once the DNS record points here)."
say "Sign in with the one-click 'Administrator (demo)' identity."
