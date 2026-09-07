#!/bin/sh
# NexoraOS — nightly base backup for point-in-time recovery (OPS-012).
#
# Takes a pg_basebackup from the running db container into
# /var/backups/nexora/<timestamp>/ and prunes backups older than
# RETENTION_DAYS (default 14). Combined with the WAL archive volume,
# any moment between the oldest base backup and now is recoverable.
#
# Install as a cron job on the host (root):
#   17 2 * * * /opt/nexora/repo/deploy/backup.sh >> /var/log/nexora-backup.log 2>&1
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/nexora}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_ROOT/$STAMP"

mkdir -p "$TARGET"

# Base backup in tar format, WAL included for standalone restores.
docker exec nexora-db-1 pg_basebackup -U app -D - -Ft -X fetch -z \
  > "$TARGET/base.tar.gz"

# Snapshot the WAL archive alongside (cheap hardlink-free copy).
docker run --rm -v nexora_wal_archive:/wal_archive:ro -v "$TARGET":/out alpine \
  sh -c 'tar -czf /out/wal_archive.tar.gz -C /wal_archive .'

echo "$(date -u '+%F %T') backup written to $TARGET"

# Prune old backups.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" \
  -exec rm -rf {} + 2>/dev/null || true
