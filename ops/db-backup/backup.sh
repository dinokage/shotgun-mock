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

fail() {
  log "BACKUP FAILED: $*"
  rm -f "$tmp"
}

run_backup() {
  ts=$(date +%Y%m%d-%H%M%S)
  out="$BACKUP_DIR/forge-${ts}.sql.gz"
  tmp="${out}.tmp"

  log "starting backup -> $out"

  # pg_dump compresses its own output (-Z) rather than being piped into gzip.
  # This used to be `pg_dump | gzip > "$tmp"`, and a shell reports only the
  # LAST command of a pipeline -- gzip's. So a dump that could not even connect
  # still produced a valid, empty gzip file and was logged "backup complete".
  # That is exactly what happened when this container started while Postgres
  # was still in crash recovery: a 20-byte file that restores nothing, sitting
  # beside real backups and looking just like one. With no pipe, a failed dump
  # fails here.
  if ! pg_dump -Z 6 -f "$tmp"; then
    fail "pg_dump exited non-zero"
    return 1
  fi

  # A zero exit is necessary but not sufficient. The file must be an intact
  # gzip stream, and pg_dump must have reached the end of the database: every
  # plain-format dump finishes with the trailer below, so its absence means a
  # truncated or empty dump. Checking file size instead would repeat the
  # original mistake -- an empty gzip is a perfectly well-formed file.
  if ! gzip -dc "$tmp" > /dev/null; then
    fail "backup file is not a valid gzip stream"
    return 1
  fi
  # The window is 20 lines, not 5, on purpose. Current Postgres releases write
  # a `\unrestrict <token>` security line AFTER this trailer, which already puts
  # it exactly 5 lines from the end; a tighter window would break -- and reject
  # every good backup -- the first time a release appends one more line.
  if ! gzip -dc "$tmp" | tail -n 20 | grep -q "PostgreSQL database dump complete"; then
    fail "dump is missing pg_dump's completion trailer (truncated or empty)"
    return 1
  fi

  mv "$tmp" "$out"
  bytes=$(wc -c < "$out" | tr -d ' ')
  log "backup complete: $out (${bytes} bytes, verified)"

  # Retention: delete dumps older than RETENTION_DAYS. A failed or unverified
  # backup never reaches this line (every `return 1` above exits first), so a
  # string of failures cannot silently prune away the last good dump. That
  # guarantee was not actually true before: failures were reported as
  # successes, so two weeks of empty backups would have deleted every real one.
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
