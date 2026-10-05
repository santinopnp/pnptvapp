#!/usr/bin/env bash
# Daily revenue digest to Slack. Scheduled via /etc/cron.d/pnptv-daily-digest
# at 08:00 UTC. Pulls env from the live bot container so no secret duplication.

set -euo pipefail

LOG=/opt/pnptvapp/logs/daily-digest.log
SCRIPT=/opt/pnptvapp/apps/backend/scripts/daily-revenue-digest.js

{
  echo "═══ $(date -Is) — daily digest ═══"

  eval "$(docker exec pnptv-bot printenv | grep -E '^(DATABASE_URL|POSTGRES_HOST|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DATABASE|POSTGRES_PORT|POSTGRES_SSL|SLACK_BOT_TOKEN|SLACK_OPS_ADMIN_CHANNEL)=' | sed 's/^/export /')"

  docker run --rm \
    --network pnptvapp_pnptvapp_net \
    -e "DATABASE_URL=$DATABASE_URL" \
    -e "POSTGRES_HOST=$POSTGRES_HOST" \
    -e "POSTGRES_USER=$POSTGRES_USER" \
    -e "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
    -e "POSTGRES_DATABASE=$POSTGRES_DATABASE" \
    -e "POSTGRES_PORT=$POSTGRES_PORT" \
    -e "POSTGRES_SSL=$POSTGRES_SSL" \
    -e "SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN" \
    -e "SLACK_OPS_ADMIN_CHANNEL=$SLACK_OPS_ADMIN_CHANNEL" \
    -e NODE_ENV=production \
    -v "$SCRIPT:$SCRIPT:ro" \
    pnptv-bot:latest \
    node "$SCRIPT"
} >>"$LOG" 2>&1
