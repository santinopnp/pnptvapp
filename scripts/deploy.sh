#!/bin/bash
# PNPtv Docker Compose Deployment Script
# Run this ON THE PRODUCTION SERVER (/opt/pnptvapp) to deploy updates.
#
# Replaces the old deploy-pm2.sh, which assumed a bare pm2 process named
# "pnptv-bot" -- the actual production stack is Docker Compose. The backend
# runs as the "pnptv-bot" container (built from apps/backend/Dockerfile); the
# web and studio frontends are static builds served by nginx containers via
# volume-mounted dist/ directories (no container rebuild needed for those,
# just a fresh `npm run build`).

set -e  # Exit on error

echo "Starting PNPtv deployment..."

cd /opt/pnptvapp

echo "Pulling latest changes from git..."
git fetch origin
git pull origin main

echo "Rebuilding and restarting the backend (pnptv-bot container)..."
docker compose build pnptv-bot
docker compose up -d pnptv-bot

echo "Waiting for pnptv-bot health check..."
for i in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' pnptv-bot 2>/dev/null || echo "unknown")
  if [ "$status" = "healthy" ]; then
    echo "pnptv-bot is healthy."
    break
  fi
  sleep 2
done

echo "Building web frontend (apps/web/dist, served directly by pnptv-web nginx)..."
(cd apps/web && npm install && npm run build)

echo "Building studio frontend (apps/studio/dist, served directly by pnptv-studio nginx)..."
(cd apps/studio && npm install && npm run build)

echo ""
echo "Deployment complete."
echo ""
docker ps --filter "name=pnptv-bot" --filter "name=pnptv-web" --filter "name=pnptv-studio" --format 'table {{.Names}}\t{{.Status}}'
echo ""
echo "Check backend logs with: docker logs -f pnptv-bot"
