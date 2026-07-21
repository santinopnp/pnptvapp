# Secret Rotation Checklist
**Reason:** `.env` + `.env.production` were chmod 644 (world-readable) until June 22, 2026.
**Priority:** Rotate CRITICAL first — these control money, auth, and data access.

---

## CRITICAL — Rotate immediately

| Secret | Env Var | Where to rotate | Notes |
|---|---|---|---|
| Telegram Bot Token | `BOT_TOKEN` | @BotFather → /mybots → Revoke token | Rotating kills the bot until new token is deployed |
| PostgreSQL passwords | `PG_AUTH_PASSWORD`, `POSTGRES_PASSWORD`, all `PG_*_PASSWORD` | `ALTER USER` in psql + update .env | Do all DB passwords in one maintenance window |
| Redis password | `REDIS_PASSWORD` / `REDIS_PNPTV_PASSWORD` | redis.conf + update .env | Redis restart required |
| Session secret | `SESSION_SECRET` | Generate new: `openssl rand -hex 64` | Logs out ALL active users |
| JWT secret | `JWT_SECRET` | Generate new: `openssl rand -hex 64` | Invalidates all issued JWTs |
| Encryption key | `ENCRYPTION_KEY` | Generate new (same length) | Any data encrypted with old key must be re-encrypted first — check usage |
| BTCPay API key + webhook secret | `BTCPAY_API_KEY`, `BTCPAY_WEBHOOK_SECRET` | BTCPay admin → Account → API Keys | Webhook must be updated in BTCPay store settings too |
| NowPayments API + IPN secret | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_PUBLIC_KEY` | nowpayments.io dashboard | IPN secret change stops payment confirmations until redeployed |
| Hostinger API key | `HOSTINGER_API_KEY` | Hostinger panel → API tokens | Breaks email sending until redeployed |
| LiveKit API key + secret | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit Cloud dashboard | Breaks all video calls until redeployed |
| Authentik secret key | `AUTHENTIK_SECRET_KEY` | Authentik .env → restart | Invalidates all Authentik sessions |
| Authentik API token | `AUTHENTIK_API_TOKEN` | Authentik admin → Directory → Tokens | Used for user provisioning |

---

## HIGH — Rotate within 48 hours

| Secret | Env Var | Where to rotate |
|---|---|---|
| X/Twitter consumer keys + tokens | `TWITTER_CONSUMER_KEY/SECRET`, `TWITTER_ACCESS_TOKEN/SECRET`, `TWITTER_BEARER_TOKEN`, `WEBAPP_X_CLIENT_SECRET`, `SANTINO/LEX/GENERIC_CONSUMER_*` | developer.twitter.com → Projects & Apps → Keys and Tokens |
| Grok API key | `GROK_API_KEY` | console.x.ai |
| MeiliSearch master key | `MEILISEARCH_MASTER_KEY` | Restart MeiliSearch with new key — all search tokens invalidated |
| JaaS API key | `JAAS_API_KEY_ID` | 8x8 developer console — private key file also needs replacement |
| Canva client secret | `CANVA_CLIENT_SECRET` | Canva Developer Portal |
| Face API key + secret | `FACE_API_KEY`, `FACE_API_SECRET` | Face++ / Microsoft Face API dashboard |
| Stripe keys + webhook | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | dashboard.stripe.com → Developers → API keys |
| Restreamer RTMP token | `RESTREAMER_RTMP_TOKEN` | Restreamer admin panel |
| VAPID keys (push notifications) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Generate: `npx web-push generate-vapid-keys` — invalidates all push subscriptions (users must re-subscribe) |

---

## MEDIUM — Rotate within 1 week

| Secret | Env Var | Where to rotate |
|---|---|---|
| SMTP passwords | `PNPTV_SMTP_PASS`, `EASYBOTS_SMTP_PASS` | Hostinger Email → Manage → Change password |
| Calcom secrets | `CALCOM_ENCRYPTION_KEY`, `CALCOM_NEXTAUTH_SECRET`, `CALCOM_OIDC_CLIENT_SECRET`, `CALCOM_WEBHOOK_SECRET` | Calcom admin + OIDC app settings |
| Matrix registration secret | `MATRIX_REGISTRATION_SECRET` | Synapse config |
| Hoppscotch secrets | `HOPPSCOTCH_JWT_SECRET`, `HOPPSCOTCH_SESSION_SECRET`, `HOPPSCOTCH_DATA_ENCRYPTION_KEY` | Hoppscotch .env restart |
| Fider JWT secret | `FIDER_JWT_SECRET` | Fider restart |
| Broadcast secret | `BROADCAST_SECRET` | Internal — generate new |
| Agent shared secret | `AGENT_SHARED_SECRET` | Internal — generate new |
| Teaser secret | `TEASER_SECRET` | Internal — generate new |

---

## DO NOT ROTATE without a migration plan

| Secret | Env Var | Why |
|---|---|---|
| Email hash pepper | `MAIN_STAGE_EMAIL_HASH_PEPPER` | All guest email hashes in `main_stage_consents` used this pepper — rotating without re-hashing breaks consent lookups |
| DB encryption key (if data encrypted) | `ENCRYPTION_KEY` | Must decrypt all stored data with old key first, then re-encrypt with new key |
| VAPID keys | `VAPID_PUBLIC_KEY/PRIVATE_KEY` | All existing push subscriptions break — users must re-enable notifications |

---

## How to deploy after rotating

```bash
# 1. Update .env and/or .env.production with new values
# 2. Rebuild and redeploy bot container (bakes env into image)
cd /opt/pnptvapp && docker compose up -d --build pnptv-bot

# 3. Reload web container (bind-mounted, just restart)
docker compose restart pnptv-web

# 4. Reload npm-proxy to flush stale IP cache
docker exec npm-proxy nginx -s reload

# 5. Verify services are healthy
docker compose ps
```

---

## Quick secret generator

```bash
# 32-byte hex secret (for SESSION_SECRET, JWT_SECRET, etc.)
openssl rand -hex 32

# 64-byte hex secret (stronger)
openssl rand -hex 64

# Base64 secret (for some services)
openssl rand -base64 32
```

---

*Generated: 2026-07-21 | Trigger: .env world-readable until 2026-06-22*
