#!/usr/bin/env bash
# Generic broadcast runner. Takes a script filename (relative to
# apps/backend/scripts/) and extra args (e.g. --dry-run), pulls env from
# the live bot, and fires it in an isolated docker-run container.
#
# Usage: run-broadcast-generic.sh <script.js> [--dry-run]

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <broadcast-script.js> [extra-args...]" >&2
  exit 1
fi

SCRIPT_NAME="$1"; shift
SCRIPT_PATH="/opt/pnptvapp/apps/backend/scripts/$SCRIPT_NAME"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "no such script: $SCRIPT_PATH" >&2
  exit 1
fi

eval "$(docker exec pnptv-bot printenv | grep -E '^(DATABASE_URL|POSTGRES_HOST|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DATABASE|POSTGRES_PORT|POSTGRES_SSL)=' | sed 's/^/export /')"

docker run --rm \
  --network pnptvapp_pnptvapp_net \
  -e "DATABASE_URL=$DATABASE_URL" \
  -e "POSTGRES_HOST=$POSTGRES_HOST" \
  -e "POSTGRES_USER=$POSTGRES_USER" \
  -e "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
  -e "POSTGRES_DATABASE=$POSTGRES_DATABASE" \
  -e "POSTGRES_PORT=$POSTGRES_PORT" \
  -e "POSTGRES_SSL=$POSTGRES_SSL" \
  -e NODE_ENV=production \
  -v "$SCRIPT_PATH:$SCRIPT_PATH:ro" \
  pnptv-bot:latest \
  node "$SCRIPT_PATH" "$@"
