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

echo "This will DROP and recreate database '$DB' and load $DUMP_FILE."
echo "Type 'restore' to continue:"
read -r CONFIRM
if [ "$CONFIRM" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB\";"
psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB\";"
gunzip -c "$DUMP_FILE" | psql -v ON_ERROR_STOP=1 -d "$DB"

echo "Restore complete."
