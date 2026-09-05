#!/bin/sh
# Applies /migrations/*/migration.sql in order, exactly once each
# (tracked in _applied_migrations). Safe to re-run on every deploy.
set -eu

export PGCONNECT_TIMEOUT=10
psql -v ON_ERROR_STOP=1 -c \
  'CREATE TABLE IF NOT EXISTS "_applied_migrations" (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'

for dir in $(ls -1d /migrations/*/ | sort); do
  name="$(basename "$dir")"
  [ -f "$dir/migration.sql" ] || continue
  applied=$(psql -tAc "SELECT 1 FROM \"_applied_migrations\" WHERE name = '$name'")
  if [ "$applied" = "1" ]; then
    echo "skip   $name"
    continue
  fi
  echo "apply  $name"
  psql -v ON_ERROR_STOP=1 -f "$dir/migration.sql"
  psql -v ON_ERROR_STOP=1 -c "INSERT INTO \"_applied_migrations\" (name) VALUES ('$name')"
done
echo "migrations up to date"
