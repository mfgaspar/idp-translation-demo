#!/usr/bin/env sh
# Wrapper for docker compose that auto-loads dev.db override when present.
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE_FILE_ARGS="-f docker-compose.yml"
DEV_DB_PATH=""

if [ "${1:-}" = "--registry" ]; then
  COMPOSE_FILE_ARGS="-f docker-compose.registry.yml"
  shift
fi

if [ -f "$ROOT_DIR/apps/api/dev.db" ]; then
  DEV_DB_PATH="$ROOT_DIR/apps/api/dev.db"
elif [ -f "$ROOT_DIR/dev.db" ]; then
  DEV_DB_PATH="$ROOT_DIR/dev.db"
fi

if [ -n "$DEV_DB_PATH" ]; then
  export DEV_DB_PATH
  COMPOSE_FILE_ARGS="$COMPOSE_FILE_ARGS -f docker-compose.devdb.yml"
  echo "Using $DEV_DB_PATH as /data/app.db"
fi

cd "$ROOT_DIR"
# shellcheck disable=SC2086
exec docker compose $COMPOSE_FILE_ARGS "$@"
