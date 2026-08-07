# Debug Prompt: PNP Channels & Exclusive Creator Content

## Context

PNP Channels is the VOD/content layer of the PNPtv! platform. Creators publish video content inside **creator_channels** with one of four access models (`free`, `prime`, `paid`, `subscription`). Separately, creator **social_posts** can be marked `is_exclusive=true` or `content_tier='prime'`, gating them behind PRIME membership. Both surfaces share the same entitlement engine (`entitlementAccessService.js`) but have distinct storage and delivery paths.

This prompt covers:
- PNP Channels browse, detail, and video playback (`creator_channels` + `channel_videos`)
- Exclusive posts / exclusive video files (`social_posts.is_exclusive`, `/uploads/posts/vid-*`)
- The access-gate decision tree (`hasResourceAccess`)
- Channel purchase flow (NowPayments → webhook → `grantEntitlementsForPlan`)
- Creator subscription gate (`creator-subscription` entitlement)
- Super-god and admin bypass paths

---

## Architecture Overview

```
Browser
  └─ GET /channels                    → Channels.tsx (browse grid)
  └─ GET /channels?id=<channelId>     → Channels.tsx (opens ChannelDetailView)
  └─ GET /api/webapp/channels         → routes.js:10119  (browse, softAuth)
  └─ GET /api/webapp/channels/:id     → routes.js:10499  (detail, softAuth)
  └─ GET /api/webapp/channels/:id/videos/:vid/stream
                                      → routes.js:10707  (stream, softAuth)
  └─ POST /api/webapp/channels/:id/purchase
                                      → routes.js:10404  (buy, requireSessionAuth)

  (exclusive social posts)
  └─ GET /uploads/posts/vid-*.mp4     → video guard middleware (routes.js:1049)
  └─ GET /api/webapp/social/feed      → socialPostService.getFeedFiltered()
  └─ GET /api/webapp/social/posts/:id → getPost() — mirrors same access logic
```

**Access decision (every gated request calls):**
```
hasResourceAccess(userId, 'channel'|'creator', resourceId)
  ↓
1. super-god bypass              → allowed: true, reason: 'super_god'
2. isBanned check                → allowed: false, reason: 'banned'
3. resource owner bypass         → allowed: true, reason: 'resource_owner'
4. scoped entitlement check:
   - channel-access entitlement  → allowed: true, reason: 'scoped_channel_access'
   - creator-subscription        → allowed: true, reason: 'creator_subscriber'
5. tier fallback by access_type:
   - free     → pnp-member OR prime required
   - prime    → prime entitlement required
   - paid     → member/prime + no scoped ent → PAYMENT_REQUIRED
   - subscription → member/prime + no scoped ent → CREATOR_SUBSCRIPTION_REQUIRED
```

**Exclusive post video guard (middleware, not entitlement service):**
```
GET /uploads/posts/vid-*
  ↓
1. Hotlink check (Referer must be pnptv.app/* or absent)
2. Redis rate-limit: videofetch:u:<id> or videofetch:ip:<ip>  (1500 req/hr)
3. videoMetaCache lookup (60s in-memory) → social_posts.is_exclusive + author_id
4. If not exclusive → next() (public)
5. If exclusive:
   - admin/superadmin role → pass
   - author of post → pass
   - validateTierFresh(userId) === 'prime' → pass
   - else → 403 "Active PRIME membership required"
```

---

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `apps/backend/services/entitlementAccessService.js` | `hasResourceAccess()`, `hasEntitlement()`, `isBanned()`, `isSuperGod()`, super-god toggle |
| `apps/backend/services/paymentService.js` | `grantEntitlementsForPlan()` — inserts `user_entitlements` rows, handles `channel_access` and `creator_subscription` |
| `apps/backend/services/channelVideoService.js` | Upload pipeline, GIF generation, promo post, publish workflow |
| `apps/backend/services/accessService.js` | `checkChannelAccess()` (used inside purchase route), `validateTierFresh()` (used by video guard) |
| `apps/backend/services/creatorService.js` | `subscribeToCreator()` — sole path for `creator-subscription` entitlement (plan_id=`creator_monthly`) |
| `apps/backend/bot/api/routes.js` | All channel routes (10119, 10404, 10499, 10707), video guard middleware (1049), NowPayments webhook (14168) |

### Frontend
| File | Purpose |
|------|---------|
| `apps/web/src/pages/Channels.tsx` | Full channels page: browse grid, `ChannelDetailView`, video player, purchase CTA |
| `apps/web/src/lib/api.ts` | `getChannels()`, `getChannelDetail()`, `browseCreatorChannels()`, `getChannelVideoStream()` |

### Routes — exact line numbers
| Endpoint | Line |
|----------|------|
| `GET /api/webapp/channels` (browse) | 10119 |
| `POST /api/webapp/channels/:id/purchase` | 10404 |
| `GET /api/webapp/channels/:id` (detail) | 10499 |
| `GET /api/webapp/channels/:id/videos/:vid/stream` | 10707 |
| NowPayments webhook → scoped grant dispatch | 14168 |
| Video guard middleware start | 1049 |

---

## Database Tables

```sql
-- Channel definitions
creator_channels (
  id, creator_id, name, slug, description, cover_image_url,
  access_type,        -- 'free' | 'prime' | 'paid' | 'subscription'
  price_usd,          -- set for access_type='paid'
  is_active,          -- soft-delete flag
  is_system,          -- true = PNPtv! PRIME channel (id=209)
  is_featured,
  hangout_group_id,   -- linked hangout auto-joined on channel purchase
  post_count, subscriber_count, view_count
)

-- Videos in a channel
channel_videos (
  id, channel_id, creator_id,
  title, description, tags[],
  directus_file_id,   -- Directus UUID (for chunked + CMS uploads)
  mux_playback_id,    -- Mux HLS (for Studio Express uploads)
  video_url,          -- legacy: /uploads/... local path
  thumbnail_url, gif_url,
  status,             -- 'processing' | 'published' | 'removed'
  promo_post_id,      -- social_post created at publish time
  view_count, duration_seconds
)

-- Entitlement grants (per-user access records)
user_entitlements (
  id, user_id,
  add_on_id,          -- 'channel-access' | 'creator-subscription' | 'pnp-member' | 'prime' | ...
  creator_id,         -- scoped entitlements: channel id (for channel-access) or creator user_id
  expires_at,         -- NULL = lifetime; future timestamp = expiring subscription
  source,             -- 'nowpayments' | 'rush_wallet' | 'admin' | ...
  payment_id,
  metadata jsonb
)

-- Add-on catalog (defines what entitlements exist)
add_ons (id, name, description, price_usd, duration_days, is_active)

-- Payment orders
dash_subscription_orders (
  id, user_id, plan_id,    -- plan_id='channel_access' for channel purchases
  btcpay_invoice_id,       -- reused as order_id (NowPayments orderId stored here)
  status,                  -- 'pending' | 'completed' | 'refunded'
  metadata jsonb,          -- {channelId, hangoutGroupId, channelName, nowpaymentsInvoiceId, invoiceUrl}
  usd_amount, email, completed_at
)

-- Exclusive post videos (social_posts with is_exclusive=true)
social_posts (
  id, user_id,
  media_url,              -- e.g. /uploads/posts/vid-abc123.mp4
  video_thumbnail_url,    -- e.g. /uploads/posts/thumb-vid-abc123.jpg
  is_exclusive,           -- true = prime-only
  content_tier,           -- 'prime' also gates (OR with is_exclusive in guard)
  channel_id              -- if linked to a creator_channels row
)

-- Video access audit log (90-day retention, deduped per viewer per 5min)
video_fetch_log (media_url, user_id, ip_address, fetched_at)
```

---

## Redis Key Patterns

```
# Entitlement cache (120s TTL)
user:entitlements:{userId}          → JSON array of {add_on_id, creator_id, expires_at}

# Scoped-entitlement tracker (for cache invalidation)
ent:scope:tracker:{userId}          → Redis Set of scoped cache keys written for this user

# Specific scoped key
ent:{userId}:{addOnId}:{creatorId}  → '1' (exists = entitled) or '0' (exists = not entitled)

# Ban cache (120s TTL)
ban:{userId}                        → '1' | '0'

# Super-god disabled flag
supergod:disabled:{userId}          → '1'

# Video fetch rate limit (rolling 1hr window)
videofetch:u:{userId}               → integer count
videofetch:ip:{ip}                  → integer count

# Video view dedup (5min NX)
videolog:{userId}:{/uploads/path}   → '1'

# User label cache (120s)
user:label:{userId}                 → tier string
```

---

## Payment → Entitlement Flow (channel_access)

```
1. POST /api/webapp/channels/:id/purchase
   - validates channel is access_type='paid' and price_usd > 0
   - calls checkChannelAccess() — 400 if already granted
   - calls NowPayments POST /v1/invoice
   - INSERTs dash_subscription_orders (plan_id='channel_access', status='pending')
     metadata: { channelId, hangoutGroupId, channelName, nowpaymentsInvoiceId }
   - returns { checkoutUrl } — frontend opens in popup window

2. User pays → NowPayments fires IPN to POST /api/webhooks/nowpayments

3. Webhook handler (routes.js:14168):
   - verifies signature (NOWPAYMENTS_IPN_SECRET)
   - loads order by btcpay_invoice_id = order_id
   - detects plan_id='channel_access' + metadata.channelId present
   - calls paymentService.grantEntitlementsForPlan(userId, 'channel_access', 'nowpayments', metadata, orderId)

4. grantEntitlementsForPlan (paymentService.js):
   - looks up add_ons WHERE id = 'channel-access'
   - INSERTs user_entitlements (add_on_id='channel-access', creator_id=metadata.channelId)
   - invalidates user:entitlements:{userId} cache
   - updates creator_channels.subscriber_count
   - auto-joins hangout_group_members if metadata.hangoutGroupId set
   - records 70/30 earnings split in creator_earnings

5. Cache invalidation fires → next hasResourceAccess call sees fresh grant
```

---

## Known Constraints & Gotchas

1. **PRIME channel is id=209** — `is_system=true`, `access_type='prime'`. Cannot be downgraded. Purchase route 400s with `PRIME_REQUIRED` if tried. Admin endpoints use id 209 — never 5.

2. **Video stream: 3 delivery paths** (checked in order at routes.js:10707):
   - `mux_playback_id` set → 302 redirect to `https://stream.mux.com/<id>.m3u8`
   - `directus_file_id` set → proxied through Directus internal URL with Range header passthrough
   - `video_url` starts with `/uploads/` → served from local disk with Range support
   If none match → 404 "Video has no playable source"

3. **Exclusive post videos (`/uploads/posts/vid-*`) use a DIFFERENT gate** than channel videos. They check `users.tier='prime'` (via `validateTierFresh`), not `hasResourceAccess`. Admin role OR post author always passes. PRIME entitlement is not checked — raw tier string is.

4. **Super-god IDs are hardcoded** in `entitlementAccessService.js` lines 14–17: `['8599671840', '7246621722', '8552451957']`. Toggle via `supergod:disabled:{userId}` Redis key. Super-god bypass only applies to `hasResourceAccess` — the exclusive video middleware checks role + tier, not the entitlement service.

5. **Entitlement cache TTL is 120s** — a user who just paid may still see 403 for up to 2 minutes if the cache isn't explicitly invalidated. `grantEntitlementsForPlan` always calls `del user:entitlements:{userId}` after inserting. If it doesn't (bug), the user waits 120s.

6. **`creator_monthly` (creator subscription) is NOT routed through `grantEntitlementsForPlan` directly** — it calls `creatorService.subscribeToCreator()` exclusively. Do not add `grantEntitlementsForPlan` calls for `creator_monthly` — it double-extends expiry.

7. **`checkChannelAccess` in the purchase route uses `accessService.checkChannelAccess()`** (not `entitlementAccessService.hasResourceAccess`). These are parallel implementations — a bug in one doesn't necessarily affect the other.

8. **`access_type='subscription'` channels** are gated by `creator-subscription` entitlement (scoped to `creator_id`). This is different from `access_type='paid'` which uses `channel-access` (scoped to `channel.id`). The `hasResourceAccess` check tries both paths for `subscription` type.

9. **Rate limiter on purchase endpoint**: `channelPurchaseLimiter` — 3 attempts per minute per user. Returns 429 with message "Too many purchase attempts."

10. **NowPayments popup (not iframe)** — `window.open()` is used client-side. `window.open()` blocked by browser = silent payment failure from user's perspective. The popup must be triggered synchronously inside a click handler.

11. **Directus STORAGE_LOCATIONS must include 'local'** — all 388 directus_files rows have `storage='local'`. Removing local from config = 500 on all channel video streams using `directus_file_id`.

---

## Diagnostic Commands

```bash
# Check a user's current entitlements (DB truth)
docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c "
  SELECT add_on_id, creator_id, expires_at, source, created_at
  FROM user_entitlements
  WHERE user_id = '<userId>'
  ORDER BY created_at DESC;"

# Check a user's cached entitlements (Redis)
docker exec redis-pnptv redis-cli GET "user:entitlements:<userId>"

# Invalidate entitlement cache for a user
docker exec redis-pnptv redis-cli DEL "user:entitlements:<userId>"

# Check if a user is banned
docker exec redis-pnptv redis-cli GET "ban:<userId>"
docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c "
  SELECT id, tier FROM users WHERE id = '<userId>';"

# Check pending channel_access orders (should complete within minutes)
docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c "
  SELECT id, user_id, plan_id, status, usd_amount, created_at, metadata->>'channelId', notes
  FROM dash_subscription_orders
  WHERE plan_id = 'channel_access' AND status = 'pending'
  ORDER BY created_at DESC LIMIT 20;"

# Check completed channel_access orders for a user
docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c "
  SELECT id, status, usd_amount, completed_at, metadata
  FROM dash_subscription_orders
  WHERE user_id = '<userId>' AND plan_id = 'channel_access'
  ORDER BY created_at DESC;"

# Check channel definition
docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c "
  SELECT id, name, access_type, price_usd, is_active, is_system, hangout_group_id, subscriber_count
  FROM creator_channels WHERE id = <channelId>;"

# List published videos in a channel
docker exec pg-pnptv psql -U pnptvbot -d pnptvbot -c "
  SELECT id, title, status, mux_playback_id, directus_file_id,
         (video_url IS NOT NULL) as has_local_url, created_at
  FROM channel_videos WHERE channel_id = <channelId> ORDER BY created_at DESC;"

# Check video fetch rate for a user (current window)
docker exec redis-pnptv redis-cli GET "videofetch:u:<userId>"

# Check backend logs for access denials
docker logs pnptv-bot --since 10m 2>&1 | grep -E "hasResourceAccess|PAYMENT_REQUIRED|PRIME_REQUIRED|Access denied|channel.*403"

# Check NowPayments IPN webhook logs
docker logs pnptv-bot --since 1h 2>&1 | grep -E "NOWPayments.*IPN|scoped.*grant|channel_access"
```

---

## Task

> **[INSERT BUG OR FEATURE DESCRIPTION HERE]**

### Relevant constraints for this task
- Only active payment provider: **NowPayments** (ePayco, BTCPay, Stripe all dead)
- Only modify existing files — never create new ones
- Services live only in `apps/backend/services/` — never `bot/services/`
- `creator_monthly` entitlement grant goes through `creatorService.subscribeToCreator()` only
- PRIME channel = id 209 (is_system=true) — never re-hardcode elsewhere
- Bot container requires `docker compose up -d --build pnptv-bot` to pick up backend changes
- Frontend requires `npx vite build` then `docker compose up -d pnptv-web`
- After either, run: `docker exec npm-proxy nginx -s reload`
