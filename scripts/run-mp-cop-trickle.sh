#!/usr/bin/env bash
# MP COP trickle Telegram broadcast — recurring every 6h via
# /etc/cron.d/pnptv-mp-cop-trickle. Rotates promo videos from /root/promos.
# Dedup resets manually; each reset re-sends to all eligible users.

set -euo pipefail

LOG=/opt/pnptvapp/logs/mp-cop-trickle.log
SCRIPT=/opt/pnptvapp/apps/backend/scripts/broadcast-mp-cop-trickle.js

{
  echo "═══ $(date -Is) — MP COP trickle cycle ═══"

  eval "$(docker exec pnptv-bot printenv | grep -E '^(DATABASE_URL|POSTGRES_HOST|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DATABASE|POSTGRES_PORT|POSTGRES_SSL|BOT_TOKEN)=' | sed 's/^/export /')"

  docker run --rm \
    --network pnptvapp_pnptvapp_net \
    -e "DATABASE_URL=$DATABASE_URL" \
    -e "POSTGRES_HOST=$POSTGRES_HOST" \
    -e "POSTGRES_USER=$POSTGRES_USER" \
    -e "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
    -e "POSTGRES_DATABASE=$POSTGRES_DATABASE" \
    -e "POSTGRES_PORT=$POSTGRES_PORT" \
    -e "POSTGRES_SSL=$POSTGRES_SSL" \
    -e "BOT_TOKEN=$BOT_TOKEN" \
    -e NODE_ENV=production \
    -v "$SCRIPT:$SCRIPT:ro" \
    -v "/root/promos:/root/promos:ro" \
    pnptv-bot:latest \
    node "$SCRIPT"
} >>"$LOG" 2>&1
