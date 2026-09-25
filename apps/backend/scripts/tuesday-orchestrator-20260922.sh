#!/bin/bash
# tuesday-orchestrator-20260922.sh
#
# Alternates card and NowPayments broadcasts every 3 hours
# through all of Tuesday Sep 22, 2026 (UTC).
#
# Wave schedule (UTC):
#   Sep 22: 02:00 nowpayments  05:00 card  08:00 nowpayments  11:00 card
#           14:00 nowpayments  17:00 card  20:00 nowpayments  23:00 card
#
# Usage:
#   nohup bash /opt/pnptvapp/apps/backend/scripts/tuesday-orchestrator-20260922.sh \
#     > /tmp/tuesday-orchestrator.log 2>&1 &
#
set -euo pipefail

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*"; }

# ── Capture env vars once at launch ──────────────────────────────────────────
PG_PASS="$(docker exec pnptv-bot printenv POSTGRES_PASSWORD)"
BOT_TOKEN="$(docker exec pnptv-bot printenv BOT_TOKEN)"
NP_KEY="$(docker exec pnptv-bot printenv NOWPAYMENTS_API_KEY)"
NP_IPN="$(docker exec pnptv-bot printenv NOWPAYMENTS_IPN_SECRET)"
NP_ENV="$(docker exec pnptv-bot printenv NOWPAYMENTS_ENVIRONMENT)"
VAPID_PUB="$(docker exec pnptv-bot printenv VAPID_PUBLIC_KEY)"
VAPID_PRIV="$(docker exec pnptv-bot printenv VAPID_PRIVATE_KEY)"
VAPID_SUB="$(docker exec pnptv-bot printenv VAPID_SUBJECT)"

log "Tuesday orchestrator started. 8 waves queued."

# ── Wave schedule ─────────────────────────────────────────────────────────────
WAVES=(
  "$(date -d '2026-09-22 02:00:00 UTC' +%s) nowpayments 20260922-0200"
  "$(date -d '2026-09-22 05:00:00 UTC' +%s) card        20260922-0500"
  "$(date -d '2026-09-22 08:00:00 UTC' +%s) nowpayments 20260922-0800"
  "$(date -d '2026-09-22 11:00:00 UTC' +%s) card        20260922-1100"
  "$(date -d '2026-09-22 14:00:00 UTC' +%s) nowpayments 20260922-1400"
  "$(date -d '2026-09-22 17:00:00 UTC' +%s) card        20260922-1700"
  "$(date -d '2026-09-22 20:00:00 UTC' +%s) nowpayments 20260922-2000"
  "$(date -d '2026-09-22 23:00:00 UTC' +%s) card        20260922-2300"
)

for entry in "${WAVES[@]}"; do
  TARGET_EPOCH=$(echo "$entry" | awk '{print $1}')
  TYPE=$(echo "$entry"         | awk '{print $2}')
  WAVE_ID=$(echo "$entry"      | awk '{print $3}')
  TARGET_DT=$(date -d "@${TARGET_EPOCH}" -u '+%Y-%m-%d %H:%M UTC')
  NOW_EPOCH=$(date +%s)

  if [ "$TARGET_EPOCH" -le "$NOW_EPOCH" ]; then
    log "Skipping past wave: ${TYPE} ${WAVE_ID} (${TARGET_DT})"
    continue
  fi

  SECS=$(( TARGET_EPOCH - NOW_EPOCH ))
  log "Next wave: ${TYPE} ${WAVE_ID} at ${TARGET_DT} — sleeping ${SECS}s"
  sleep "$SECS"

  log "Firing wave: ${TYPE} ${WAVE_ID}"

  if [ "$TYPE" = "card" ]; then
    SCRIPT="broadcast-card-wave.js"
  else
    SCRIPT="broadcast-nowpayments-wave.js"
  fi

  docker run --rm --network pnptvapp_pnptvapp_net \
    -e POSTGRES_HOST=pg-pnptv \
    -e POSTGRES_PORT=5432 \
    -e POSTGRES_DB=pnptvbot \
    -e POSTGRES_USER=pnptvbot \
    -e POSTGRES_PASSWORD="${PG_PASS}" \
    -e BOT_TOKEN="${BOT_TOKEN}" \
    -e NOWPAYMENTS_API_KEY="${NP_KEY}" \
    -e NOWPAYMENTS_IPN_SECRET="${NP_IPN}" \
    -e NOWPAYMENTS_ENVIRONMENT="${NP_ENV}" \
    -e WEBAPP_URL="https://pnptv.app" \
    -e VAPID_PUBLIC_KEY="${VAPID_PUB}" \
    -e VAPID_PRIVATE_KEY="${VAPID_PRIV}" \
    -e VAPID_SUBJECT="${VAPID_SUB}" \
    -e WAVE_ID="${WAVE_ID}" \
    -v /opt/pnptvapp:/app \
    -w /app node:24-alpine \
    node "apps/backend/scripts/${SCRIPT}" \
    && log "Wave completed: ${TYPE} ${WAVE_ID}" \
    || log "Wave FAILED: ${TYPE} ${WAVE_ID} — continuing to next"

done

log "All 8 Tuesday waves completed. Orchestrator done."
