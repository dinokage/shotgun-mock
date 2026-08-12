#!/usr/bin/env bash
# Manage the local Postgres container used for Forge dev/test.
set -euo pipefail

CONTAINER_NAME=forge-postgres
PORT=5433

case "${1:-}" in
  start)
    if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
      docker start "$CONTAINER_NAME" >/dev/null
    else
      docker run -d \
        --name "$CONTAINER_NAME" \
        -e POSTGRES_USER=forge \
        -e POSTGRES_PASSWORD=forge \
        -e POSTGRES_DB=forge \
        -p "${PORT}:5432" \
        -v forge_postgres_data:/var/lib/postgresql/data \
        postgres:16-alpine >/dev/null
    fi
    echo -n "Waiting for Postgres to accept connections"
    for _ in $(seq 1 30); do
      if docker exec "$CONTAINER_NAME" pg_isready -U forge -d forge >/dev/null 2>&1; then
        echo " — ready."
        exit 0
      fi
      echo -n "."
      sleep 1
    done
    echo " — timed out waiting for Postgres to start." >&2
    exit 1
    ;;
  stop)
    docker stop "$CONTAINER_NAME" >/dev/null
    ;;
  status)
    docker ps --filter "name=$CONTAINER_NAME" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
