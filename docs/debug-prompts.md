# PNPtv Debug Prompts — Pre-Ship QA

One prompt per section. Paste into a fresh Claude session.
**Plan First rule applies to all sections — no fixing until Santino approves the punch list.**
**Staging first on every fix: `staging.pnptv.app` → sign-off → prod.**

---

## Section 1 — Payment & Wallet Flows (P0)

```
Debug the payment and wallet flows on PNPtv (production, https://pnptv.app).
The last 4 commits reworked Privy USDC on Base as the PRIMARY payment rail
everywhere, plus wallet stuck-state recovery UI. I need a pre-ship audit —
not a rewrite. Find bugs and inconsistencies; don't refactor.

## Context you need

**Rails currently in production:**
- Stripe (card) — some locations
- MoonPay (card) — most locations
- EfiPay — email-link only, never inline
- On-chain USDC/Base via Privy embedded wallet — primary crypto
- NowPayments — "any crypto" fallback, popup ONLY (never iframe)
- Retired: ePayco, BTCPay (don't re-list as options)

**Hard constraints:**
- User-facing copy NEVER names payment brands. Say "Pay with card" or
  "Pay with crypto" only. Coin names + Apple Pay OK.
- Wallet UI ALWAYS shows both USDC and ETH, even for external wallets.
- User-facing currency name is "Ru$h 💎"; "tokens" is DB/code only.
  Rate: 1 USD = 6 Ru$h base; package tiers add small bonus
  (pkg_50=315, pkg_100=660, pkg_500=3450).
- Tips are 100% to creator; non-tip revenue takes 30% platform fee.
  gifted_balance spendable ONLY on Santino + Lex live tips.
- Cashout: single Privy-wallet lane; min $50; weekly batch min $100;
  creators NEVER accrue gifted tokens.
- Base ETH gas top-up: empty Privy wallets get seeded from treasury EOA
  0x0676AAa087520bd578b524ED66B7b4B35698Aa4F before USDC/ETH purchases.
- DMs are for sales only — NEVER suggest DMing users about billing errors.

## Surfaces to audit

Frontend (apps/web/src):
- pages/Subscribe.tsx, pages/Channels.tsx (channel-pass, default tab = crypto)
- pages/Donate.tsx (tips), pages/Lifetime100.tsx
- pages/PrivateCall.tsx, pages/CallConfirmPage.tsx, pages/BookingConfirmation.tsx
- components/BuyTokensModal.tsx, components/CardPaymentModal.tsx
- components/WalletHomeSheet.tsx, components/WalletPayCard.tsx,
  components/WalletRecovery.tsx (Privy stuck-state UI)
- pages/ConfirmPayment.tsx, pages/MyAccess.tsx, pages/MySubscriptions.tsx

Backend (apps/backend/services/ — ONLY services dir):
- Privy / on-chain USDC handler
- Stripe webhook + intent creator
- MoonPay callback
- EfiPay email-link generator
- NowPayments invoice + webhook (plural path: /embeds/payment-widget?iid=…)
- tokenLedgerService (debit default = balance-only; gifted guard)
- Revenue logger (2-hookpoint model into Zoho Books)
- Gas top-up service (treasury EOA)

## What to check

1. Every payment entry point: does the CTA reach a working provider?
   Any dead-end when a provider is unavailable by country?
2. Privy USDC path: fresh wallet → gas top-up → onramp → auto-continue
   → entitlement granted. Where does it silently drop?
3. WalletRecovery: shows when Privy SDK is stuck, not just on timeout.
   No forever-spinner state.
4. Channel-pass: default tab is crypto (Privy) on ALL entry points.
5. NowPayments: every invocation opens via window.open popup, NEVER iframe.
   Popup close hook wired on success.
6. EfiPay: only sends email link, never renders inline.
7. Brand names: grep user-facing strings for MercadoPago, Nequi, PSE,
   Wompi, EfiPay, ePayco, NowPayments, MoonPay, BTCPay, Stripe —
   none should leak into UI copy.
8. Ru$h vs tokens: user-facing strings say "Ru$h 💎" not "tokens".
9. Wallet UI shows BOTH USDC + ETH balances, including for external wallets.
10. Tips: 100% to creator, Custom/Max amounts, no Crystal-only gate,
    gifted-balance guard on non-Santino/Lex targets.
11. Cashout: single Privy lane, $50 min enforced, no gifted cashout.
12. Revenue logger: fires on every rail with correct SKU + amount.
    No double-count between rush-to-usd and tip fee.
13. Book-a-call: member with call credit CAN book offline creator.
    Waitlist recordMiss fires on getBookingOptions.
14. Onboarding gate: endpoints called BEFORE age-verify use
    requireSessionAuthNoConsent, not requireSessionAuth.

## Deliverable

Punch list grouped by severity (P0 blocks ship, P1 should-fix, P2 nice-to-have).
For each bug: file:line | user symptom | root cause | suggested fix.
No fixes until Santino approves. Plan First rule applies.
```

---

## Section 2 — Onboarding & Auth Gate (P1)

```
Audit the onboarding and auth gate on PNPtv (https://pnptv.app).
Recent commits: unified min age at 18, fixed self-closing consent door,
raised boot splash watchdog to 15s. Find regressions and edge cases only.

## Surfaces to audit

Frontend (apps/web/src):
- pages/Onboarding.tsx — full multi-step flow
- pages/Join.tsx, pages/Welcome.tsx
- pages/AuthCallback.tsx — OAuth return
- pages/ResetPassword.tsx
- pages/LandingPage.tsx — entry for unauthenticated users
- pages/BlockedJurisdictionPage.tsx — geo-block handling
- The consent/age-gate component (wherever it lives — search for
  requireSessionAuth, consentGate, ageVerif)
- Boot splash / watchdog (commit 997c6526, 5ce1b5a0)

Backend (apps/backend/):
- bot/api/routes/routes.js — check which onboarding endpoints use
  requireSessionAuthNoConsent vs requireSessionAuth
- services/authService (session creation, Telegram auth)
- /api/telegram-auth endpoint — pg param type casting for nullable
  pnptvId ($2::text explicit cast)
- Session middleware: SESSION_TTL=86400, SESSION_SECRET in .env.production

## What to check

1. Fresh browser signup: Join → age verification (min 18) → terms consent
   → app landing. No loops, no 403 AGE_VERIFICATION_REQUIRED mid-flow.
2. Consent gate doesn't close on itself (commit c6a4e857 regression check).
3. Telegram Mini-App login: /api/telegram-auth returns a valid session.
   Nullable pnptvId cast to $2::text — no 500 on users without pnptvId.
4. OAuth callback (AuthCallback.tsx): session persists after redirect.
5. Boot splash: watchdog fires at 15s ONLY if assets are still loading
   (progress-aware). No false timeout on fast connections.
6. Blocked jurisdiction: correct page shown, no app content visible.
7. Returning user (cookie present): skips Join, lands on Home.
8. Reset password: full flow works end-to-end.
9. All endpoints in the onboarding path: none use requireSessionAuth
   before the user has completed age-verify + terms.
10. Telegram webhook secret_token is passed on setWebhook; bot doesn't
    silently 200-drop incoming messages.

## Deliverable

Punch list grouped by severity (P0/P1/P2).
For each bug: file:line | user symptom | root cause | suggested fix.
No fixes until Santino approves. Plan First rule applies.
Staging first: /opt/deploy-staging.sh <branch>.
```

---

## Section 3 — Live & Real-Time (P1)

```
Audit the live streaming and real-time features on PNPtv (https://pnptv.app).
LiveKit is the ONLY video-call provider — delete any Daily.co/Jitsi/JaaS
code on sight. Going-live notifications are DM/push/socket only (no email).

## Surfaces to audit

Frontend (apps/web/src):
- pages/Live.tsx — browse active streams
- pages/Stream.tsx — watch a stream
- pages/MainStage.tsx — Main Stage viewer
- pages/MainStageAdmin.tsx — admin controls (audio modes, spotlight lock)
- pages/MainStageGuestJoin.tsx — unauthenticated guest entry
- pages/PrivateCall.tsx, pages/CallRoom.tsx — LiveKit private call
- pages/Nearby.tsx — presence-driven user map
- pages/Chat.tsx, pages/DirectMessages.tsx — real-time messaging

Backend (apps/backend/):
- services/livestreamService (or equivalent) — going-live events
- services/liveKitService — room creation, token generation
- services/socketService — Socket.IO rooms, mainstage:* events
- services/presenceService — heartbeat, online sub-states
- bot/websocket/ — relay handlers
- Redis keys: mainstage:* (modes/media/volumes), presence heartbeat keys

## What to check

1. Main Stage: admin audio modes broadcast correctly via mainstage:* Redis
   keys + Socket.IO room "mainstage". Spotlight lock shows friendly error
   to non-admin. SoundCloud CSP header allows playback.
2. Main Stage gate config doesn't expire mid-session (commit bdee1ffc).
3. Guest join (unauthenticated): lands on MainStageGuestJoin, not auth wall.
4. Going-live notification: fires via DM/push/socket. No email sent.
   sendMemberEmailBlast is deleted — confirm it's not called anywhere.
5. LiveKit private call: creator package matching works. Dead-end fixed
   (commit 78a49693). Waitlist recordMiss fires on getBookingOptions.
6. Book-a-call: member with call credit can book OFFLINE creator
   (commit b749c463).
7. Nearby: online heartbeat drives map. Broadcasting + available-for-calls
   are sub-states of online — no bleed into Nearby without heartbeat.
   hangout_groups reconcile: only kicks, never adds; UNIQUE channel_id.
8. No non-LiveKit video call code exists (grep for daily.co, jitsi, jaas,
   getJaaSRoom, DailyIframe — all must be absent).
9. Socket.IO reconnection: client reconnects cleanly after server restart.
   No message duplication on reconnect.
10. Redis down scenario: presence degrades gracefully, no crash loop.

## Deliverable

Punch list grouped by severity (P0/P1/P2).
For each bug: file:line | user symptom | root cause | suggested fix.
No fixes until Santino approves. Plan First rule applies.
Staging first: /opt/deploy-staging.sh <branch>.
```

---

## Section 4 — Monetization Fase 4/5 — Ads & Upgrades (P2)

```
Audit the monetization system on PNPtv (https://pnptv.app).
Fase 4 (sidebar + PrimeRewardCard + A/B + admin dashboard) and
Fase 5 (VAST-in-modal + variant attribution + admin charts) shipped recently.
ExoClick framework with 16 zones also recently launched.

## Surfaces to audit

Frontend (apps/web/src):
- Ad zone components — sidebar, sticky-footer, VAST-in-modal
- PrimeRewardCard component
- Upgrade chip + upgrade modal
- Interstitial component
- Trial flow
- pages/admin/Monetization.tsx — admin dashboard + charts

Backend (apps/backend/):
- services/adService (or equivalent) — zone serving, contextual suppression
- services/monetizationService — A/B variant, attribution, intensity
- Redis key: pnpapp:ads:enabled (kill switch)
- BullMQ job in services/queueService.js: daily ads-health report → #ops-ads-monitor
- ExoClick API integration (token at /root/.exoclick-api-token,
  site 1111254, 16 zones)

## What to check

1. Kill switch: setting pnpapp:ads:enabled to false in Redis suppresses
   ALL ad zones immediately (no restart needed).
2. Sticky-footer: exposed to member tier users, NOT just free tier.
   Verify tier check is correct.
3. Contextual suppression: ads do NOT show during private calls, live stream
   view, or payment modals.
4. VAST-in-modal: plays correctly, doesn't block UI if VAST fails to load.
   Graceful fallback on VAST error.
5. A/B variant assignment: user gets consistent variant across sessions
   (not random on each page load).
6. Attribution: ad events (impression, click, completion) logged with
   correct variant label.
7. Admin Monetization dashboard: charts render with real data, not empty/erroring.
8. Daily ads-health BullMQ job: fires once per day (NOT also in cron.js —
   would fire 2x per tick). Check services/queueService.js is the only
   place it's scheduled.
9. Compliance footer: /2257, /dmca, dmca@pnptv.app visible on all pages.
   ExoClick zones don't load before footer is rendered.
10. Upgrade chip/modal/interstitial: dynamic intensity levels render
    correctly per user tier. Trial CTA works end-to-end.
11. PrimeRewardCard: shown to correct audience, reward claim flow completes.
12. ExoClick zones: all 16 wired, correct zone IDs per placement.
    No orphan zones from deleted placements.

## Deliverable

Punch list grouped by severity (P0/P1/P2).
For each bug: file:line | user symptom | root cause | suggested fix.
No fixes until Santino approves. Plan First rule applies.
Staging first: /opt/deploy-staging.sh <branch>.
```

---

## Section 5 — Admin Dashboards (P2)

```
Audit the admin panel on PNPtv (https://pnptv.app/admin/*).
Recent fix: /admin/creator-subscriptions and /admin/service-status were
500ing (commit 7e804e77). Smoke-test the full admin nav for regressions.

## Surfaces to audit

All pages under apps/web/src/pages/admin/:
- StatsOverview, AdminDemographics, Reports
- CreatorSubscriptions, CreatorApplications
- PaymentHealth, ManualActivations
- ContentModeration, Compliance2257
- Monetization (charts from Fase 5)
- ReferralAdmin, InviteLinks
- ExternalServices (Zoho, LiveKit, ExoClick health)
- Monitoring, HangoutModeration, HangoutTelegramHealth
- CallAnalytics, CallDiagnostics
- AccessMatrix, PlanManagement
- DuplicateAccounts, PnpFamCrm
- StreamManagement, MediaPacks, NearbyPlaces
- AdminNotifications, CanvaIntegration, Gamification
- PrimeChannel

Backend admin routes (apps/backend/bot/api/routes/ or equivalent):
- All /admin/* endpoints — auth guard present on each
- /admin/creator-subscriptions, /admin/service-status (recently fixed)

## What to check

1. Every admin page loads without 500 (hit each URL, check network tab).
2. /admin/creator-subscriptions and /admin/service-status specifically —
   verify the recent fix held.
3. Auth guard: /admin/* returns 403 for non-admin session.
   Verify no admin route uses requireSessionAuthNoConsent.
4. PaymentHealth: shows live status for all rails (Stripe, MoonPay,
   EfiPay, NowPayments, Privy). Dead rails (ePayco, BTCPay) not listed.
5. ManualActivations: hosted-link payment ops can be approved/rejected.
   Slack ping fires with op# on action.
6. Monetization charts: render with real data from Fase 5 attribution.
7. ExternalServices: Zoho Books/CRM/Campaigns/Desk, LiveKit, ExoClick,
   Cal.com — all show correct health status.
8. PnpFamCrm: PNPtv Fam members display correctly (is_pnptv_fam flag +
   DB trigger). Whale Pigs endpoint requires admin auth — internal term
   never visible in UI labels.
9. ContentModeration: actions (warn/suspend/reinstate) trigger correct
   DB updates (users.creator_status, suspended_until, reason) +
   Slack ping to #ext-<handle>.
   Note: auto-suspension cron is DISABLED — only human actions.
10. DuplicateAccounts: merge/flag actions complete without 500.
11. Compliance2257: list renders, document links work.
12. AdminNotifications: send test notification reaches target user.

## Deliverable

Punch list grouped by severity (P0/P1/P2).
For each bug: file:line | user symptom | root cause | suggested fix.
No fixes until Santino approves. Plan First rule applies.
Staging first: /opt/deploy-staging.sh <branch>.
```

---

## Section 6 — Infra & Ops Hygiene (P3)

```
Audit the infrastructure and ops hygiene on PNPtv.
Server: Hostinger VPS Ubuntu, IP 148.230.80.210.
Docker Compose stack. npm-proxy (Nginx Proxy Manager) fronts all domains.

## Context

- pnptv-bot bakes code into image (no bind-mount).
  Hotpatch: docker cp + docker restart, or compose up -d --build pnptv-bot.
- pnptv-web IS bind-mounted: vite build is enough for frontend changes.
  NEVER rm -rf apps/web/dist — delete contents only or bind-mount breaks.
- After rebuilding any container: docker exec npm-proxy nginx -s reload
  (flushes stale IP cache).
- NEVER scp/docker cp git nginx.conf over live prod without diffing first.
  Prod nginx is 34+ lines ahead of git (CSP, iframe, PDF ACL, IP-deny).
- Directus memory leak: leaks 260MB→3.6GB over 4h → /assets/* 503.
  Restart clears it. Workaround for deploys: compose up -d --no-deps <svc>.
- Orphaned npm-proxy upstreams (deleted containers) crash npm-proxy on
  reload. Known disabled orphan: 19.conf (databasus).
- Cal.com container is load-bearing (booking.pnptv.app + creator
  availability endpoint + webhook). Never propose stopping it.

## What to check

1. Directus memory: check current RSS with `docker stats cms-pnptv --no-stream`.
   If >2GB, flag for restart. Confirm restart cadence or propose fix.
2. npm-proxy orphaned configs: list all proxy_host/*.conf, identify any
   that point to non-existent containers. Document; don't auto-delete.
3. Nginx diff: diff infrastructure/configs/web/nginx.conf against live
   `docker exec npm-proxy cat /etc/nginx/conf.d/...` (or equivalent).
   List every prod-only line not in git. Flag anything security-relevant.
4. BullMQ vs cron.js duplication: for every job in services/queueService.js,
   confirm it does NOT also appear in scripts/cron.js. List any duplicates.
5. Broadcast scripts: confirm none are scheduled in host crontab
   (`crontab -l`). One-shot manual runs only.
6. Broadcast dedup: every broadcast script uses campaign-wide LIKE pattern
   (e.g. `'banxa-btc-dual-%'`), NOT `BATCH_ID + '%'`.
7. Broadcast execution: scripts use isolated `docker run` with explicit -e
   env vars from live bot, NOT `docker exec pnptv-bot`.
8. Broadcast email: scripts use emailService.send() via Hostinger SMTP,
   NEVER Resend (quota kills mid-broadcast).
9. SMTP: smtp.hostinger.com:587, support@pnptv.app + hello@easybots.store.
   Send a test email; confirm delivery.
10. Cal.com: booking.pnptv.app resolves. Creator availability endpoint
    responds. Webhook registered in Cal.com dashboard.
11. Staging environment: staging.pnptv.app loads with basic auth.
    Deploy script /opt/deploy-staging.sh main runs without error.
    pnptv-bot image rebuilds on deploy (compose file has build: context).
12. Container health: `docker compose ps` — all containers Up, no Restarting.

## Deliverable

Punch list grouped by severity (P0/P1/P2).
For each item: component | observed state | expected state | suggested action.
No changes until Santino approves. Plan First rule applies.
```

---

## Section 7 — Data Integrity (P3)

```
Audit data integrity on PNPtv.
DB: PostgreSQL in container pg-pnptv. Access:
  docker exec pg-pnptv psql -U pnptvbot -d pnptvbot

## Context

- User tier is authoritative in user_entitlements, NOT users.tier.
- Whale Pigs is internal-only — never in user-facing UI, URL, or API body.
- PNPtv Fam ⊆ Whale Pigs: is_pnptv_fam flag + DB trigger.
  Seeded: PADUDE69, DUKEOFDENSITY + pending ladsaplatefounder.
  Santino + Lex are OWNERS, NOT Fam.
- performers.status='active' grants private-call earnings independently
  of users.creator_status. Don't flag creator earnings by role=user/
  creator_status=none as bugs without checking performer path.
- Postgres timestamptz 'infinity' parses as JS Number Infinity (not string).
  Prefer SQL > NOW(); if JS, handle both Infinity and 'infinity'.
- Nullable SQL params: always cast explicitly (e.g. $2::text) or Postgres
  throws 42P08.
- Weekly payout batch min $100 / cashout min $50 / creators NEVER accrue
  gifted tokens (guard in tokenLedgerService).
- Zoho One: universal revenue logger fires on all rails into Books.
  JIT + nightly CRM sync. Campaigns double opt-in. Desk wired.

## What to check

1. User tier drift: query SELECT u.id, u.tier, ue.tier FROM users u
   LEFT JOIN user_entitlements ue ON ue.user_id = u.id WHERE u.tier != ue.tier
   LIMIT 20. Flag mismatches.

2. PNPtv Fam: SELECT u.username, u.is_pnptv_fam FROM users u WHERE
   u.is_pnptv_fam = true. Verify PADUDE69, DUKEOFDENSITY present.
   Verify Santino (platform id 8599671840) and Lex (8f5f4dd1-7bdb-4571-b026-
   e09d91113c91) NOT in fam. Verify ladsaplatefounder status.

3. Gifted token guard: SELECT u.username, tl.type, tl.amount FROM
   token_ledger tl JOIN users u ON u.id = tl.user_id WHERE
   tl.type = 'gifted' AND tl.amount > 0 LIMIT 20.
   Confirm gifted debits only target Santino or Lex as recipients.

4. Performers photo sync: SELECT p.id, p.photo_url, u.photo_file_id
   FROM performers p JOIN users u ON u.id = p.user_id
   WHERE p.photo_url IS DISTINCT FROM u.photo_file_id LIMIT 20.
   Trigger from commit db0092ff should keep these in sync.

5. Infinity timestamps: SELECT id, expires_at FROM user_entitlements
   WHERE expires_at = 'infinity'::timestamptz LIMIT 10.
   Confirm application code handles both JS Infinity and string 'infinity'.

6. Nullable param safety: search backend services for pg query calls where
   a param could be NULL and is NOT explicitly cast (::text, ::uuid, ::int).

7. Revenue logger: SELECT * FROM zoho_revenue_log ORDER BY created_at DESC
   LIMIT 20 (or equivalent table). Confirm entries from all rails present.
   No duplicate entries for the same transaction.

8. Cashout guards: SELECT u.username, w.balance, w.gifted_balance
   FROM wallets w JOIN users u ON u.id = w.user_id
   WHERE w.gifted_balance > 0 AND u.role != 'admin' LIMIT 20.
   Gifted balance should be 0 for non-admin non-Lex non-Santino users
   OR must have a guard preventing cashout.

9. Creator subscription integrity: SELECT cs.user_id, cs.creator_id,
   cs.status, cs.expires_at FROM creator_subscriptions cs
   WHERE cs.status = 'active' AND cs.expires_at < NOW() LIMIT 20.
   Expired active subs = cleanup job failure.

10. Referral integrity: SELECT r.code, COUNT(ru.id) as uses,
    r.max_uses FROM referral_codes r LEFT JOIN referral_uses ru
    ON ru.code_id = r.id GROUP BY r.id HAVING COUNT(ru.id) > r.max_uses.
    Over-used codes = guard failure.

## Deliverable

Punch list grouped by severity (P0/P1/P2).
For each item: query result | expected state | suggested fix.
No fixes until Santino approves. Plan First rule applies.
```

---

## Section 8 — Cross-Cutting: A11y, i18n, Security Headers (P3)

```
Audit cross-cutting concerns on PNPtv (https://pnptv.app):
accessibility, internationalisation, and security headers.

## Surfaces

Frontend (apps/web/src):
- pages/Home.tsx, pages/Subscribe.tsx, pages/Onboarding.tsx,
  pages/Live.tsx, pages/MainStage.tsx, pages/PrivateCall.tsx
- All broadcast/notification copy (EN + ES pairs required)
- Footer (compliance: /2257, /dmca, dmca@pnptv.app)

Backend / Nginx:
- CSP headers (nginx.conf in prod — don't overwrite with git version)
- CORS configuration
- Rate limiting (check for missing limiters on new endpoints added in
  recent monetization + payment commits)

## What to check

### Accessibility (a11y)
1. Run axe (browser extension or axe-core) on: Home, Subscribe,
   Onboarding, Live, MainStage. Commit 0621c166 added 423 form field ids —
   verify no new id-less fields were introduced by monetization Fase 4/5.
2. All interactive ad zone elements are keyboard-reachable and have
   aria-labels. VAST modal has a visible close button with aria-label.
3. Upgrade modal/interstitial: focus trap works. Escape key closes.
4. Images have alt text. Lazy-loaded images don't shift layout (CLS).

### Internationalisation
5. Main Stage broadcast copy exists in 30 languages (commit 32886597).
   Spot-check ES, EN, PT, FR render without broken characters.
6. All marketing/external copy (broadcasts, push, email, campaigns) is
   in English. Ops/internal Slack messages are in Spanish.
7. Creator-facing DMs sent AS a creator are individually written
   (not copy-pasted template). Platform-wide blasts may reuse copy.

### Security headers
8. CSP: SoundCloud is allowed (commit 432d60b0). ExoClick CDN domains
   allowed in script-src / frame-src. No overly broad unsafe-inline.
9. CORS: /api/* does NOT allow wildcard origin with credentials.
10. Rate limiting: new endpoints from Fase 4/5 (ad events, attribution,
    variant assignment) have rate limiters. Payment webhooks have
    idempotency keys, not just rate limits.
11. Auth guards: every new /api route from last 20 commits has either
    requireSessionAuth, requireSessionAuthNoConsent, or explicit public
    annotation. Grep for app.get/post/put/delete with no middleware.
12. No sensitive data in client-visible bundle: grep dist/ for
    API keys, tokens, secrets (PRIVY_, STRIPE_, EXOCLICK_).

## Deliverable

Punch list grouped by severity (P0/P1/P2).
For each bug: file:line | issue description | suggested fix.
No fixes until Santino approves. Plan First rule applies.
Staging first: /opt/deploy-staging.sh <branch>.
```
