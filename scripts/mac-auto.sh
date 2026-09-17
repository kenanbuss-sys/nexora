#!/bin/bash
# Self-updating dev stack for macOS.
#
#   bash scripts/mac-auto.sh        <- run ONCE: installs a LaunchAgent and starts it
#   bash scripts/mac-auto.sh run    <- (internal) the update-and-serve loop
#   bash scripts/mac-auto.sh stop   <- uninstall the LaunchAgent and stop everything
#
# After install, the machine keeps the platform at http://localhost:3000 and
# automatically picks up every new commit on origin/main within ~60 seconds:
# fetch -> fast-forward (clean tree only; never discards local work) ->
# apply new migrations -> build -> restart API and web.
# Survives reboots (LaunchAgent, RunAtLoad + KeepAlive). Logs: /tmp/nexora-auto.log
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.nexora.autodev"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="/tmp/nexora-auto.log"

if [ "${1:-install}" = "stop" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  # Stop only what this agent started (PID files); never a manual stack.
  for f in /tmp/nexora-auto.api.pid /tmp/nexora-auto.web.pid; do
    [ -f "$f" ] && kill "$(cat "$f" 2>/dev/null)" 2>/dev/null || true
    rm -f "$f"
  done
  echo "Auto-dev stopped and uninstalled (manually started processes were left alone)."
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

# Environment-stabilization rules (Sprint 224):
# - The database is NEVER stopped, dropped or reseeded destructively here;
#   seed-demo.mjs only ADDS missing demo records (idempotent) and a
#   reset/reseed is never an automatic recovery path.
# - Only processes THIS agent started (tracked in PID files) are restarted.
#   A foreign process holding :3000/:3001 (a manual `pnpm start`, another
#   checkout) is reported loudly and left alone — no blind pkill, so the
#   LaunchAgent can no longer kill a manually started stack.
API_PID_FILE="/tmp/nexora-auto.api.pid"
WEB_PID_FILE="/tmp/nexora-auto.web.pid"

stop_own() {
  # Stops only the instance this agent started earlier.
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null)"
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
    sleep 1
  fi
}

port_owner() { lsof -ti tcp:"$1" 2>/dev/null | head -1; }

start_stack() {
  brew services start postgresql@17 >/dev/null 2>&1 || brew services start postgresql >/dev/null 2>&1 || true
  brew services start redis >/dev/null 2>&1 || true
  sleep 2
  if ! pg_isready -q 2>/dev/null; then
    log "ERROR: PostgreSQL is not accepting connections — stack NOT (re)started; existing data left untouched"
    return 1
  fi
  psql -lqt 2>/dev/null | cut -d '|' -f 1 | grep -qw enterprise_os || createdb enterprise_os || true
  apply_migrations
  log "installing dependencies"
  pnpm install --silent >/dev/null 2>&1 || pnpm install
  log "building"
  pnpm turbo build --filter=@nexora/api --filter=@nexora/web --output-logs=errors-only || {
    log "ERROR: build failed — keeping the currently running stack as-is"
    return 1
  }
  stop_own "$API_PID_FILE"
  if [ -n "$(port_owner 3001)" ]; then
    log "ERROR: port 3001 is held by a process this agent did not start (PID $(port_owner 3001)) — not touching it; stop it manually if you want the agent to serve the API"
  else
    DATABASE_URL="$DB_URL" REDIS_URL="redis://localhost:6379" nohup node "$REPO/apps/api/dist/main.js" >> "$LOG" 2>&1 &
    echo $! > "$API_PID_FILE"
  fi
  stop_own "$WEB_PID_FILE"
  if [ -n "$(port_owner 3000)" ]; then
    log "ERROR: port 3000 is held by a process this agent did not start (PID $(port_owner 3000)) — not touching it; stop it manually if you want the agent to serve the web app"
  else
    (cd "$REPO/apps/web" && nohup npx next start --port 3000 >> "$LOG" 2>&1 & echo $! > "$WEB_PID_FILE")
  fi
  sleep 3
  # Top up MISSING demo records only (seed-demo is idempotent/additive —
  # existing records are never overwritten).
  node "$REPO/scripts/seed-demo.mjs" >> "$LOG" 2>&1 || true
  log "stack (re)started — http://localhost:3000"
}

log "auto-dev loop starting in $REPO (sync policy v2: main-only, clean tree, ff-only — never discards work)"
start_stack

# Sync policy: NEVER discard local work. Updates apply only when the
# checkout is on main, the working tree is clean, and origin/main is a
# fast-forward of HEAD. In every other case the loop pauses and says why.
while true; do
  sleep 60
  git fetch -q origin main 2>/dev/null || continue
  BRANCH="$(git symbolic-ref --short -q HEAD || echo detached)"
  if [ "$BRANCH" != "main" ]; then
    log "on branch '$BRANCH' — auto-update paused (checkout main to resume)"
    continue
  fi
  if [ -n "$(git status --porcelain)" ]; then
    log "working tree not clean — auto-update paused (commit or stash to resume)"
    continue
  fi
  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse origin/main)"
  if [ "$LOCAL" != "$REMOTE" ]; then
    if git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
      log "update found: ${LOCAL:0:7} -> ${REMOTE:0:7} (fast-forward)"
      git merge --ff-only origin/main >/dev/null || { log "fast-forward failed — paused"; continue; }
      start_stack
    else
      log "local main diverged from origin/main — auto-update stopped WITHOUT discarding local commits"
      continue
    fi
  fi
done
