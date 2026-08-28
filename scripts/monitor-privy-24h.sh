#!/usr/bin/env bash
# monitor-privy-24h.sh
# One-shot 24h checkpoint on Privy wallet-payment fixes shipped 2026-08-28.
# Runs the 3 validation queries, formats a summary, posts to Slack.
# Scheduled via systemd-run --on-calendar (not a recurring cron).

set -euo pipefail

# Load only the two env vars we need — sourcing the whole .env.production
# fails because some values contain shell metacharacters (>, <, &).
_get_env() { grep -E "^$1=" /opt/pnptvapp/.env.production | head -1 | cut -d= -f2- | tr -d '\r'; }
SLACK_BOT_TOKEN=$(_get_env SLACK_BOT_TOKEN)
# Hardcoded — bot is a member of slack_ops_payments_channel and this is a
# payment health check. SLACK_TESTER_CHANNELS (C0BMVEF43U4) is not a channel
# the bot has access to.
CHANNEL="C0BMZK1AWAH"
LOG=/opt/pnptvapp/logs/monitor-privy-24h.log
mkdir -p "$(dirname "$LOG")"

psql() { docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -tA -F$'\t' "$@"; }

# 1. Top error codes (Privy wallet client-errors)
ERRORS=$(psql -c "
  SELECT error_code, COUNT(*) AS n
    FROM payment_errors
   WHERE provider='privy_wallet' AND created_at > NOW() - INTERVAL '24 hours'
   GROUP BY error_code ORDER BY n DESC LIMIT 5;")

# 2. Wallet USDC checkout funnel (24h)
FUNNEL=$(psql -c "
  SELECT
    COUNT(*) FILTER (WHERE status='confirmed')    AS confirmed,
    COUNT(*) FILTER (WHERE status='expired')      AS expired,
    COUNT(*) FILTER (WHERE status='pending')      AS pending,
    COUNT(*) FILTER (WHERE status='grant_failed') AS grant_failed,
    COUNT(*)                                      AS total
  FROM checkout_intents
  WHERE provider='wallet_usdc' AND created_at > NOW() - INTERVAL '24 hours';")

# 3. Reconciler-driven confirms (created > 2 min before confirmed)
RECON=$(psql -c "
  SELECT COUNT(*)
    FROM checkout_intents
   WHERE status='confirmed' AND provider='wallet_usdc'
     AND confirmed_at > NOW() - INTERVAL '24 hours'
     AND created_at < confirmed_at - INTERVAL '2 minutes';")

# Parse funnel row: confirmed \t expired \t pending \t grant_failed \t total
IFS=$'\t' read -r F_CONF F_EXP F_PEND F_GRANTF F_TOTAL <<<"$FUNNEL"
F_CONF=${F_CONF:-0}; F_EXP=${F_EXP:-0}; F_PEND=${F_PEND:-0}
F_GRANTF=${F_GRANTF:-0}; F_TOTAL=${F_TOTAL:-0}
RECON_N=${RECON:-0}

# Flags for attention
FLAGS=()
[ "$F_GRANTF" -gt 5 ] && FLAGS+=("grant_failed=$F_GRANTF (>5)")

TOP3=""
LINE_NO=0
HIGH_ERR_FLAG=""
while IFS=$'\t' read -r code n; do
  [ -z "$code" ] && continue
  LINE_NO=$((LINE_NO+1))
  [ "$LINE_NO" -le 3 ] && TOP3+="  • \`$code\` — $n"$'\n'
  [ "$n" -gt 20 ] && HIGH_ERR_FLAG+="$code=$n "
done <<<"$ERRORS"
[ -n "$HIGH_ERR_FLAG" ] && FLAGS+=("high error volume: $HIGH_ERR_FLAG")
[ -z "$TOP3" ] && TOP3="  _(no privy_wallet errors captured in last 24h)_"$'\n'

# Success rate for headline
SUCCESS_PCT="—"
if [ "$F_TOTAL" -gt 0 ]; then
  SUCCESS_PCT=$(awk -v c="$F_CONF" -v t="$F_TOTAL" 'BEGIN { printf "%.1f%%", (c/t)*100 }')
fi

STATUS_ICON=":white_check_mark:"
if [ "${#FLAGS[@]}" -gt 0 ]; then STATUS_ICON=":warning:"; fi

MSG=$(cat <<EOF
$STATUS_ICON *Privy wallet 24h checkpoint* (Commit A shipped 2026-08-28)

*Funnel (last 24h, provider=wallet_usdc, N=$F_TOTAL)*
  • confirmed: *$F_CONF* ($SUCCESS_PCT)
  • expired: $F_EXP
  • pending: $F_PEND
  • grant_failed: $F_GRANTF
  • reconciler-driven confirms: *$RECON_N* (orphan tx caught by scheduler)

*Top client errors (payment_errors, provider=privy_wallet)*
$TOP3
EOF
)

if [ "${#FLAGS[@]}" -gt 0 ]; then
  MSG+=$'\n''*:warning: Needs attention*'$'\n'
  for f in "${FLAGS[@]}"; do MSG+="  • $f"$'\n'; done
fi

MSG+=$'\n''_Baseline before fixes (30d): 4.1% confirm rate, 186/194 expired without broadcast._'

# Post to Slack
if [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -n "$CHANNEL" ]; then
  RESP=$(curl -sS -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data "$(jq -n --arg ch "$CHANNEL" --arg t "$MSG" '{channel:$ch, text:$t, mrkdwn:true}')")
  OK=$(echo "$RESP" | jq -r '.ok // false')
  echo "[$(date -u +%FT%TZ)] slack_ok=$OK ch=$CHANNEL flags=${#FLAGS[@]} confirmed=$F_CONF/$F_TOTAL recon=$RECON_N" | tee -a "$LOG"
  echo "$RESP" >> "$LOG"
else
  echo "[$(date -u +%FT%TZ)] SLACK CREDS MISSING — printing to log only" | tee -a "$LOG"
  echo "$MSG" | tee -a "$LOG"
fi
