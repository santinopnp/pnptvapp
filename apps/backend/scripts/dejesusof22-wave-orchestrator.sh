#!/usr/bin/env bash
# Fires waves 3-5 with 30 min between each, in isolated docker run containers.
# Wave 2 already fired manually (16:22 UTC) — this orchestrator picks up after.
# Run detached: `nohup bash /opt/pnptvapp/apps/backend/scripts/dejesusof22-wave-orchestrator.sh > /tmp/dejesusof22-orchestrator.log 2>&1 &`
set -u
ENV_FILE=/tmp/wave.env
LOG_DIR=/tmp
NET=pnptvapp_pnptvapp_net
IMG=pnptv-bot:latest

docker exec pnptv-bot printenv | grep -v -E '^(HOSTNAME|PATH|HOME|PWD|TERM|SHLVL|_)=' > "$ENV_FILE"

fire () {
  local wave="$1" push_flag="$2"
  local name="pnptv-wave${wave}"
  local script="apps/backend/scripts/broadcast-dejesusof22-wave${wave}-2026-09-04.js"
  docker rm -f "$name" 2>/dev/null || true
  echo "[$(date -Iseconds)] firing wave ${wave} (push=${push_flag:-on})"
  docker run --rm --name "$name" \
    --network "$NET" \
    --env-file "$ENV_FILE" \
    -v /opt/pnptvapp:/app -w /app \
    "$IMG" \
    node "$script" --live $push_flag > "$LOG_DIR/${name}.log" 2>&1
  echo "[$(date -Iseconds)] wave ${wave} finished"
}

sleep 1800 && fire 3 ""            # +30m  Prime Hour + push
sleep 1800 && fire 4 "--skip-push" # +60m  Late Shift
sleep 1800 && fire 5 ""            # +90m  Final Call + push
echo "[$(date -Iseconds)] all waves complete"
