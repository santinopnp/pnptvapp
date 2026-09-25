#!/bin/bash
# week-orchestrator-20260923.sh
#
# Runs broadcast-promo-wave.js every 6 hours Wed Sep 23 – Sun Sep 27, 2026 (UTC).
# Promotes yearly50 ($50/yr) + lifetime100 ($99.99) with inline keyboard buttons.
# 19 waves total.
#
# Usage:
#   nohup bash /opt/pnptvapp/apps/backend/scripts/week-orchestrator-20260923.sh \
#     > /tmp/week-orchestrator-20260923.log 2>&1 &
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

log "Week orchestrator started. 19 waves queued."

# ── Wave schedule ─────────────────────────────────────────────────────────────
WAVES=(
  "$(date -d '2026-09-23 06:00:00 UTC' +%s) 20260923-0600"
  "$(date -d '2026-09-23 12:00:00 UTC' +%s) 20260923-1200"
  "$(date -d '2026-09-23 18:00:00 UTC' +%s) 20260923-1800"
  "$(date -d '2026-09-24 00:00:00 UTC' +%s) 20260924-0000"
  "$(date -d '2026-09-24 06:00:00 UTC' +%s) 20260924-0600"
  "$(date -d '2026-09-24 12:00:00 UTC' +%s) 20260924-1200"
  "$(date -d '2026-09-24 18:00:00 UTC' +%s) 20260924-1800"
  "$(date -d '2026-09-25 00:00:00 UTC' +%s) 20260925-0000"
  "$(date -d '2026-09-25 06:00:00 UTC' +%s) 20260925-0600"
  "$(date -d '2026-09-25 12:00:00 UTC' +%s) 20260925-1200"
  "$(date -d '2026-09-25 18:00:00 UTC' +%s) 20260925-1800"
  "$(date -d '2026-09-26 00:00:00 UTC' +%s) 20260926-0000"
  "$(date -d '2026-09-26 06:00:00 UTC' +%s) 20260926-0600"
  "$(date -d '2026-09-26 12:00:00 UTC' +%s) 20260926-1200"
  "$(date -d '2026-09-26 18:00:00 UTC' +%s) 20260926-1800"
  "$(date -d '2026-09-27 00:00:00 UTC' +%s) 20260927-0000"
  "$(date -d '2026-09-27 06:00:00 UTC' +%s) 20260927-0600"
  "$(date -d '2026-09-27 12:00:00 UTC' +%s) 20260927-1200"
  "$(date -d '2026-09-27 18:00:00 UTC' +%s) 20260927-1800"
)

for entry in "${WAVES[@]}"; do
  TARGET_EPOCH=$(echo "$entry" | awk '{print $1}')
  WAVE_ID=$(echo "$entry"      | awk '{print $2}')
  TARGET_DT=$(date -d "@${TARGET_EPOCH}" -u '+%Y-%m-%d %H:%M UTC')
  NOW_EPOCH=$(date +%s)

  if [ "$TARGET_EPOCH" -le "$NOW_EPOCH" ]; then
    log "Skipping past wave: ${WAVE_ID} (${TARGET_DT})"
    continue
  fi

  SECS=$(( TARGET_EPOCH - NOW_EPOCH ))
  log "Next wave: ${WAVE_ID} at ${TARGET_DT} — sleeping ${SECS}s"
  sleep "$SECS"

  log "Firing wave: ${WAVE_ID}"

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
    node "apps/backend/scripts/broadcast-promo-wave.js" \
    && log "Wave completed: ${WAVE_ID}" \
    || log "Wave FAILED: ${WAVE_ID} — continuing to next"

done

log "All 19 week waves completed. Orchestrator done."
