#!/bin/sh
# NexoraOS — disaster-recovery drill (OPS-013).
#
# Restores the NEWEST nightly base backup into a scratch volume and a
# scratch PostgreSQL container, verifies the restored data answers
# queries, records the wall-clock restore time, then tears everything
# down. Run quarterly (cron suggestion below) and keep the log:
#   43 3 1 */3 * /opt/nexora/repo/deploy/dr-drill.sh >> /var/log/nexora-dr.log 2>&1
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/nexora}"
SCRATCH_VOLUME="nexora_dr_drill"
SCRATCH_CONTAINER="nexora-dr-drill"

LATEST="$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | tail -1)"
[ -n "$LATEST" ] || { echo "DR DRILL FAIL: no backups under $BACKUP_ROOT"; exit 1; }
echo "$(date -u '+%F %T') DR drill from $LATEST"
START=$(date +%s)

docker rm -f "$SCRATCH_CONTAINER" >/dev/null 2>&1 || true
docker volume rm "$SCRATCH_VOLUME" >/dev/null 2>&1 || true
docker volume create "$SCRATCH_VOLUME" >/dev/null

docker run --rm -v "$SCRATCH_VOLUME":/restore -v "$LATEST":/backup:ro alpine sh -c '
  tar -xzf /backup/base.tar.gz -C /restore &&
  if [ -f /restore/base.tar ]; then tar -xf /restore/base.tar -C /restore && rm /restore/base.tar; fi &&
  if [ -f /restore/pg_wal.tar ]; then mkdir -p /restore/pg_wal && tar -xf /restore/pg_wal.tar -C /restore/pg_wal && rm /restore/pg_wal.tar; fi'

docker run -d --name "$SCRATCH_CONTAINER" \
  -v "$SCRATCH_VOLUME":/var/lib/postgresql/data \
  postgres:16-alpine >/dev/null

# Wait for recovery + readiness (up to 5 minutes).
i=0
until docker exec "$SCRATCH_CONTAINER" pg_isready -U app >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -lt 60 ] || { echo "DR DRILL FAIL: restored instance never became ready"; exit 1; }
  sleep 5
done

TENANTS="$(docker exec "$SCRATCH_CONTAINER" psql -U app -d enterprise_os -tAc 'SELECT count(*) FROM tenant' | tr -d '[:space:]')"
AUDITS="$(docker exec "$SCRATCH_CONTAINER" psql -U app -d enterprise_os -tAc 'SELECT count(*) FROM audit_event' | tr -d '[:space:]')"
ELAPSED=$(( $(date +%s) - START ))

docker rm -f "$SCRATCH_CONTAINER" >/dev/null
docker volume rm "$SCRATCH_VOLUME" >/dev/null

echo "$(date -u '+%F %T') DR DRILL OK: tenants=$TENANTS auditEvents=$AUDITS restoreSeconds=$ELAPSED (RTO target 1800s)"
[ "$ELAPSED" -le 1800 ] || echo "WARN: restore exceeded the 30-minute RTO target"
