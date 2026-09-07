#!/bin/sh
# Runs forever inside the db-backup sidecar container: dumps the Postgres
# database on a fixed interval, gzips it, and prunes anything older than the
# retention window. Writes to /backups, which docker-compose.yml binds to a
# host directory (NOT a named Docker volume) specifically so backups survive
# `docker compose down -v` -- if they lived in a volume, deleting volumes
# would delete the backups meant to protect against exactly that kind of
# mistake.
set -eu

BACKUP_DIR="/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-21600}" # 6 hours

mkdir -p "$BACKUP_DIR"

log() {
  echo "[db-backup] $(date -Iseconds) $*"
}

run_backup() {
  ts=$(date +%Y%m%d-%H%M%S)
  out="$BACKUP_DIR/forge-${ts}.sql.gz"
  tmp="${out}.tmp"

  log "starting backup -> $out"
  if pg_dump | gzip > "$tmp"; then
    mv "$tmp" "$out"
    size=$(du -h "$out" | cut -f1)
    log "backup complete: $out ($size)"
  else
    log "BACKUP FAILED"
    rm -f "$tmp"
    return 1
  fi

  # Retention: delete dumps older than RETENTION_DAYS. A failed backup never
  # reaches this line (the `return 1` above exits the function first), so a
  # string of failures can't silently prune away the last good dump.
  find "$BACKUP_DIR" -name 'forge-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete | while read -r f; do
    log "pruned old backup: $f"
  done
}

log "starting with interval=${INTERVAL_SECONDS}s retention=${RETENTION_DAYS}d target=$BACKUP_DIR"

# Take one backup immediately on startup (covers the container being
# recreated well before the first interval would otherwise elapse), then
# loop on the configured interval.
while true; do
  run_backup || true
  sleep "$INTERVAL_SECONDS"
done
