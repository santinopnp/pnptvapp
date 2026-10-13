#!/bin/bash
# Auto-restore lifetime100 price to $100 after flash sale
set -e

# 1. Restore DB price
docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c "
  UPDATE plans SET price = 100.00, display_name = 'LIFETIME100', updated_at = NOW()
  WHERE id = 'lifetime100'
  RETURNING id, price;
"

# 2. Flush Redis plans cache
docker exec redis-pnptv redis-cli -a YLDnxNczPrRzLR3FEuA5CHhGAwHfB2sk2t43Jewd DEL "pnpapp:plans:all"

# 3. Restore frontend hardcoded price
sed -i 's/"lifetime100": { planId: "lifetime100", priceUsd: 50,/"lifetime100": { planId: "lifetime100", priceUsd: 100,/' /opt/pnptvapp/apps/web/src/pages/Lifetime100.tsx
sed -i 's/$50/$100/g' /opt/pnptvapp/apps/web/src/lib/i18n/lifetime100.ts

# 4. Rebuild + redeploy frontend
cd /opt/pnptvapp && npm install --silent 2>/dev/null
cd /opt/pnptvapp/apps/web && npx vite build >> /opt/pnptvapp/logs/restore-flash50.log 2>&1
cd /opt/pnptvapp && docker compose up -d pnptv-web >> /opt/pnptvapp/logs/restore-flash50.log 2>&1
docker exec npm-proxy nginx -s reload >> /opt/pnptvapp/logs/restore-flash50.log 2>&1

echo "[$(date)] lifetime100 fully restored to \$100"
