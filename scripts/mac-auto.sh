#!/bin/bash
# Self-updating dev stack for macOS.
#
#   bash scripts/mac-auto.sh        <- run ONCE: installs a LaunchAgent and starts it
#   bash scripts/mac-auto.sh run    <- (internal) the update-and-serve loop
#   bash scripts/mac-auto.sh stop   <- uninstall the LaunchAgent and stop everything
#
# After install, the machine keeps the platform at http://localhost:3000 and
# automatically picks up every new commit on origin/main within ~60 seconds:
# fetch -> reset -> apply new migrations -> build -> restart API and web.
# Survives reboots (LaunchAgent, RunAtLoad + KeepAlive). Logs: /tmp/nexora-auto.log
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.nexora.autodev"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="/tmp/nexora-auto.log"

if [ "${1:-install}" = "stop" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  pkill -f 'apps/api/dist/main.js' 2>/dev/null || true
  pkill -f 'next start' 2>/dev/null || true
  echo "Auto-dev stopped and uninstalled."
  exit 0
fi

if [ "${1:-install}" != "run" ]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/scripts/mac-auto.sh</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "Auto-dev installed. The platform will be at http://localhost:3000 shortly"
  echo "and will update itself automatically after every finished change."
  echo "Log: tail -f $LOG"
  exit 0
fi

# ---------------- run mode (under launchd) ----------------
eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null)" || true
eval "$(/usr/local/bin/brew shellenv 2>/dev/null)" || true
if command -v brew >/dev/null 2>&1; then
  PG_PREFIX="$(brew --prefix)/opt/postgresql@17/bin"
  [ -d "$PG_PREFIX" ] && export PATH="$PG_PREFIX:$PATH"
fi

cd "$REPO"
DB_URL="postgresql://$USER@localhost:5432/enterprise_os"

log() { printf '%s %s\n' "$(date '+%H:%M:%S')" "$1"; }

apply_migrations() {
  local applied="$REPO/.applied_migrations"
  touch "$applied"
  for dir in prisma/migrations/*/; do
    local name
    name="$(basename "$dir")"
    if ! grep -qx "$name" "$applied"; then
      log "migrating: $name"
      if psql -v ON_ERROR_STOP=1 -d enterprise_os -f "$dir/migration.sql" >/dev/null 2>&1; then
        echo "$name" >> "$applied"
      else
        log "migration $name failed (see manually)"
      fi
    fi
  done
}

start_stack() {
  brew services start postgresql@17 >/dev/null 2>&1 || brew services start postgresql >/dev/null 2>&1 || true
  brew services start redis >/dev/null 2>&1 || true
  sleep 2
  psql -lqt 2>/dev/null | cut -d '|' -f 1 | grep -qw enterprise_os || createdb enterprise_os || true
  apply_migrations
  log "installing dependencies"
  pnpm install --silent >/dev/null 2>&1 || pnpm install
  log "building"
  pnpm turbo build --filter=@nexora/api --filter=@nexora/web --output-logs=errors-only || return 1
  pkill -f 'apps/api/dist/main.js' 2>/dev/null || true
  sleep 1
  DATABASE_URL="$DB_URL" REDIS_URL="redis://localhost:6379" nohup node "$REPO/apps/api/dist/main.js" >> "$LOG" 2>&1 &
  pkill -f 'next start' 2>/dev/null || true
  sleep 1
  (cd "$REPO/apps/web" && nohup npx next start --port 3000 >> "$LOG" 2>&1 &)
  sleep 3
  # Keep the demo tenant topped up (idempotent; also refreshes permissions
  # when new modules arrive).
  node "$REPO/scripts/seed-demo.mjs" >> "$LOG" 2>&1 || true
  log "stack (re)started — http://localhost:3000"
}

log "auto-dev loop starting in $REPO"
start_stack

while true; do
  sleep 60
  git fetch -q origin main 2>/dev/null || continue
  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse origin/main)"
  if [ "$LOCAL" != "$REMOTE" ]; then
    log "update found: ${LOCAL:0:7} -> ${REMOTE:0:7}"
    git reset --hard origin/main >/dev/null
    start_stack
  fi
done
