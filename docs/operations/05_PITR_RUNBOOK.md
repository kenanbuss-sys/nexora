# Point-in-Time Recovery Runbook (OPS-012)

The self-hosted stack archives every WAL segment (see `deploy/docker-compose.yml`:
`archive_mode=on`, `archive_command` into the `wal_archive` volume, forced segment
switch every 5 minutes) and takes nightly base backups (`deploy/backup.sh`, cron).
Together they make **any moment between the oldest retained base backup and now**
recoverable, not just the nightly snapshot.

## What is running

- `wal_archive` volume — every completed WAL segment, copied by PostgreSQL itself.
- `/var/backups/nexora/<timestamp>/base.tar.gz` — nightly `pg_basebackup` (tar, gzip).
- `/var/backups/nexora/<timestamp>/wal_archive.tar.gz` — WAL archive snapshot at backup time.
- Retention: `RETENTION_DAYS` (default 14) — the PITR window.

## Recover to a point in time

Target example: `2026-09-07 10:15:00 UTC` (just before an incident).

1. **Stop the stack** (keep Caddy up if you want a maintenance page):

   ```sh
   cd /opt/nexora/repo
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env stop api worker web migrate db
   ```

2. **Preserve the damaged data directory** (never delete it):

   ```sh
   docker run --rm -v nexora_db_data:/data -v /var/backups/nexora:/out alpine \
     sh -c 'tar -czf /out/incident-db-data-$(date +%s).tar.gz -C /data .'
   ```

3. **Restore the newest base backup taken BEFORE the target time** into an empty volume:

   ```sh
   docker volume rm nexora_db_data && docker volume create nexora_db_data
   docker run --rm -v nexora_db_data:/restore -v /var/backups/nexora/<STAMP>:/backup alpine \
     sh -c 'tar -xzf /backup/base.tar.gz -C /restore && tar -xzf /restore/base.tar.gz -C /restore && rm /restore/base.tar.gz || true'
   ```

   (`pg_basebackup -Ft` produces `base.tar` plus `pg_wal.tar` inside the archive —
   extract both into the volume root.)

4. **Write the recovery configuration** into the restored data directory:

   ```sh
   docker run --rm -v nexora_db_data:/restore -v nexora_wal_archive:/wal_archive:ro alpine sh -c '
     cat >> /restore/postgresql.auto.conf <<EOF
   restore_command = ''cp /wal_archive/%f %p''
   recovery_target_time = ''2026-09-07 10:15:00 UTC''
   recovery_target_action = ''promote''
   EOF
     touch /restore/recovery.signal'
   ```

5. **Start only the database** and watch it replay WAL to the target:

   ```sh
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d db
   docker logs -f nexora-db-1   # wait for "recovery stopping before/at ..." then "database system is ready"
   ```

6. **Verify** the state (spot-check the ledger and audit trail):

   ```sh
   docker exec -it nexora-db-1 psql -U app -d enterprise_os \
     -c "SELECT max(created_at) FROM audit_event;"
   ```

7. **Bring the rest of the stack up**:

   ```sh
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
   ```

8. **Reconcile integrations**: run `GET /api/v1/integrations/reconciliation` and
   re-dispatch (`POST /api/v1/integrations/process`) — outbound events that were
   published after the recovery target are gone by design; downstream systems that
   already received newer webhooks must be reconciled against the recovered state.

## Restore drills

Schedule a quarterly drill: restore the latest backup to a scratch volume
(steps 3-6 with a different volume name), run the health endpoint against it, and
record the wall-clock time (target RTO ≤ 30 min, RPO ≤ 5 min via `archive_timeout`).

## Failure modes

- **Missing WAL segment during replay** — the archive volume was pruned or lost:
  recovery stops at the last continuous segment; accept that point or use a newer
  base backup. Never prune `wal_archive` manually while the stack runs.
- **Target time before the oldest base backup** — recoverable only if an older
  backup archive still exists off-host; this is why `RETENTION_DAYS` is the PITR
  window and off-host copies (rsync/object storage) are recommended for tier-1.
- **Disk pressure from the archive** — `archive_command` fails, PostgreSQL keeps
  WAL locally and eventually stops accepting writes: monitor the volume and the
  `/ops/observability` endpoint; free space and PostgreSQL resumes archiving.
