#!/bin/sh
# Manual, deliberate restore -- never run automatically. Run from the host:
#   docker compose -p shotgun-mock exec -T db sh /docker-entrypoint-initdb.d/../restore.sh forge-20260904-060000.sql.gz
# or simpler, from the host with the file already inside ./backups:
#   docker compose -p shotgun-mock cp ops/db-backup/restore.sh db:/tmp/restore.sh
#   docker compose -p shotgun-mock exec db sh /tmp/restore.sh /backups/forge-20260904-060000.sql.gz
#
# This DROPS AND RECREATES the target database before loading the dump --
# it is destructive by design (a restore that merges into existing data is
# not a real restore). Confirmation is required.
set -eu

if [ $# -ne 1 ]; then
  echo "Usage: restore.sh <path-to-backup.sql.gz>" >&2
  exit 1
fi

DUMP_FILE="$1"
DB="${PGDATABASE:-forge}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Backup file not found: $DUMP_FILE" >&2
  exit 1
fi

# Validate the dump BEFORE anything destructive happens.
#
# This script used to drop the database first and only then try to load the
# file. Pointed at an empty or truncated backup -- and the backup sidecar was
# producing exactly those, reported as successes -- it would wipe the live
# database, load nothing, and print "Restore complete". A restore is the one
# operation run in a moment of crisis, so it must refuse a bad file while the
# data it would destroy still exists.
if ! gzip -dc "$DUMP_FILE" > /dev/null 2>&1; then
  echo "Refusing to restore: $DUMP_FILE is not a valid gzip file." >&2
  exit 1
fi
# 20-line window: newer Postgres appends a `\unrestrict` line after the
# trailer, so a tight window would refuse every valid backup (see backup.sh).
if ! gzip -dc "$DUMP_FILE" | tail -n 20 | grep -q "PostgreSQL database dump complete"; then
  echo "Refusing to restore: $DUMP_FILE is empty or truncated (no pg_dump completion trailer)." >&2
  exit 1
fi

echo "This will DROP and recreate database '$DB' and load $DUMP_FILE."
echo "Type 'restore' to continue:"
read -r CONFIRM
if [ "$CONFIRM" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

# Decompressed to a file before the drop, and loaded with -f rather than
# `gunzip -c | psql`. Two reasons: a pipe would hide a decompression failure
# behind psql's exit status, and running out of disk while decompressing must
# happen before the database is gone, not halfway through reloading it.
SQL_FILE=$(mktemp /tmp/forge-restore.XXXXXX)
trap 'rm -f "$SQL_FILE"' EXIT
gzip -dc "$DUMP_FILE" > "$SQL_FILE"

# Connect to the maintenance database for the drop: a session cannot drop the
# database it is connected to. WITH (FORCE) ends the API's open connections,
# which would otherwise make the drop fail with "is being accessed by other
# users" -- the likeliest way a real restore stalls. Stopping the api service
# first is still the cleaner option, so nothing reconnects mid-load.
psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);"
psql -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE \"$DB\";"
psql -v ON_ERROR_STOP=1 -d "$DB" -f "$SQL_FILE"

echo "Restore complete."
