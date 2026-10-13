#!/bin/bash
# Daily flash sale — lifetime100 at $50 for 1 hour
# Runs at 1 AM UTC (8 PM Colombia) via cron
set -e

export PATH="/usr/bin:/usr/local/bin:/root/.nvm/versions/node/v24.13.0/bin:$PATH"
LOG="/opt/pnptvapp/logs/daily-flash.log"

echo "[$(date)] ═ flash sale START ═" >> "$LOG"

# 1. DB price → $50
docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c "
  UPDATE plans SET price = 50.00, display_name = 'Lifetime at \$50 — Flash Sale', updated_at = NOW()
  WHERE id = 'lifetime100'
  RETURNING id, price;
" >> "$LOG" 2>&1

# 2. Flush Redis plans cache
docker exec redis-pnptv redis-cli -a YLDnxNczPrRzLR3FEuA5CHhGAwHfB2sk2t43Jewd DEL "pnpapp:plans:all" >> "$LOG" 2>&1

# 3. Update hardcoded frontend price
sed -i 's/"lifetime100": { planId: "lifetime100", priceUsd: 100,/"lifetime100": { planId: "lifetime100", priceUsd: 50,/' /opt/pnptvapp/apps/web/src/pages/Lifetime100.tsx
sed -i 's/\$100/\$50/g' /opt/pnptvapp/apps/web/src/lib/i18n/lifetime100.ts

# 4. Rebuild + deploy frontend
cd /opt/pnptvapp/apps/web && npx vite build >> "$LOG" 2>&1
cd /opt/pnptvapp && docker compose up -d pnptv-web >> "$LOG" 2>&1
docker exec npm-proxy nginx -s reload >> "$LOG" 2>&1

echo "[$(date)] frontend rebuilt at \$50" >> "$LOG"

# 5. Fire broadcast in isolated container
docker exec pnptv-bot printenv > /tmp/pnptv-bot-env.txt
docker run --rm \
  --env-file /tmp/pnptv-bot-env.txt \
  --network pnptvapp_pnptvapp_net \
  -v /opt/pnptvapp/apps/backend/scripts/broadcast-lifetime-flash-daily.js:/app/apps/backend/scripts/broadcast-lifetime-flash-daily.js:ro \
  -v /opt/pnptvapp/public/uploads:/app/public/uploads \
  pnptv-bot:latest \
  node /app/apps/backend/scripts/broadcast-lifetime-flash-daily.js >> "$LOG" 2>&1

echo "[$(date)] ═ flash sale broadcast done ═" >> "$LOG"
