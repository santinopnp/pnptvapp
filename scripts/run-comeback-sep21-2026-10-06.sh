#!/usr/bin/env bash
# One-shot runner for the Sep-21 PRIME churner comeback DM.
# Scheduled via /etc/cron.d/pnptv-comeback-sep21-2026-10-06 — this file
# removes that cron entry after a successful send so it never fires twice.

set -euo pipefail

LOG=/opt/pnptvapp/logs/comeback-sep21-2026-10-06.log
SCRIPT=/opt/pnptvapp/apps/backend/scripts/broadcast-comeback-sep21-churners-2026-10-06.js
CRON_FILE=/etc/cron.d/pnptv-comeback-sep21-2026-10-06

{
  echo "═══ $(date -Is) — comeback DM runner starting ═══"

  # Pull live env from the running bot container
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
    -v "$SCRIPT:$SCRIPT:ro" \
    pnptv-bot:latest \
    node "$SCRIPT"

  echo "═══ $(date -Is) — send completed OK — removing cron entry ═══"
  rm -f "$CRON_FILE"
} >>"$LOG" 2>&1
