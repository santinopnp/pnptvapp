-- Migration 414: v_sales — unified read view of every revenue event.
--
-- Reason: before this view, "sales" was fragmented across `payments`,
-- `payment_history`, `token_ledger`, `booking_payments`, and inferred by
-- `user_entitlements`. Wallet (Privy USDC) purchases bypassed `payments`
-- entirely and only showed up in `token_ledger` via walletCheckoutService,
-- so admin dashboards undercounted by roughly 50%.
--
-- Zoho Books remains the external source of truth (walletCheckoutService._fulfill
-- always calls zohoBooks.logRevenue). This view is the local-DB mirror for
-- in-app admin queries that don't want to hit Zoho's rate limit.
--
-- Included:
--   • payments.status = 'completed'                           (NowPayments + legacy wallet_usdc)
--   • payment_history (always completed)                      (duplicates `payments` historically — included anyway for completeness)
--   • token_ledger.reason = 'membership_purchase'             (wallet subs + creator subs + renewals; priceUsd in metadata)
--   • token_ledger.reason = 'purchase' AND provider='wallet_usdc'  (Ru$h packs + dust_convert)
--   • token_ledger.reason = 'content_purchase'                (per-video rent/buy)
--   • token_ledger.reason = 'call_book'                       (call bookings — amount via bookings.price_cents)
--   • booking_payments.status = 'paid'                        (direct NowPayments call bookings)
--
-- Excluded:
--   • live_tip_send / live_tip_receive  — peer-to-peer, not platform revenue
--   • admin_grant / refund_credit / gift_* / earnings_conversion / withdraw_* — not revenue
--
-- Columns:
--   src_tbl       — origin table ('payments','payment_history','token_ledger','booking_payments')
--   src_pk        — primary key in origin table (text; join back if you need the raw row)
--   user_id       — buyer
--   amount_usd    — USD amount (numeric)
--   currency      — always 'USD' here (any non-USD payment is converted upstream)
--   provider      — 'nowpayments' / 'wallet_usdc' / 'wallet_rush' / ...
--   product       — human-readable SKU / plan name
--   status        — 'completed' / 'paid'  (view only returns successful revenue)
--   at            — authoritative timestamp (completed_at or created_at)
--
-- The view also exposes `payment_date`, `amount`, `payment_method` aliases so
-- legacy code (e.g. revenueReportService) can swap `FROM payment_history` →
-- `FROM v_sales` without any column renames.
--
-- Idempotent: `OR REPLACE` makes it safe to re-run. DROP first to allow
-- column list changes (CREATE OR REPLACE rejects adding/removing columns).

DROP VIEW IF EXISTS v_sales;

CREATE VIEW v_sales AS
WITH raw AS (
-- 1. payments (completed only)
SELECT
  'payments'::text                                   AS src_tbl,
  p.id::text                                         AS src_pk,
  p.user_id::text                                    AS user_id,
  p.amount::numeric                                  AS amount_usd,
  COALESCE(p.currency, 'USD')                        AS currency,
  p.provider::text                                   AS provider,
  COALESCE(p.plan_name, p.plan_id, 'payment')::text  AS product,
  'completed'::text                                  AS status,
  COALESCE(p.completed_at, p.created_at)             AS at
FROM payments p
WHERE p.status = 'completed'

UNION ALL

-- 2. payment_history — ONLY rows that aren't already in `payments`.
-- NowPayments writes both tables for the same transaction, so including both
-- would double-count. Historical pre-`payments` rows are the main survivors.
SELECT
  'payment_history',
  ph.id::text,
  ph.user_id::text,
  ph.amount::numeric,
  COALESCE(ph.currency, 'USD'),
  ph.payment_method::text,
  COALESCE(ph.plan_name, ph.product, ph.plan_id, 'payment')::text,
  COALESCE(ph.status, 'completed')::text,
  COALESCE(ph.payment_date, ph.processed_at)
FROM payment_history ph
WHERE COALESCE(ph.status, 'completed') = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM payments p
    WHERE p.status = 'completed'
      AND (
        (ph.provider_payment_id IS NOT NULL AND p.payment_id = ph.provider_payment_id)
        OR (p.payment_id = ph.payment_reference)
        OR (p.reference IS NOT NULL AND p.reference = ph.payment_reference)
      )
  )

UNION ALL

-- 3. token_ledger: membership_purchase (subs — wallet + creator subs + renewals)
SELECT
  'token_ledger',
  tl.id::text,
  tl.user_id::text,
  COALESCE((tl.metadata->>'priceUsd')::numeric, 0),
  'USD',
  COALESCE(tl.metadata->>'provider', 'wallet_usdc'),
  COALESCE(
    tl.metadata->>'planId',
    'creator_sub_' || COALESCE(tl.metadata->>'creatorId', 'unknown'),
    'membership'
  ),
  'completed',
  tl.created_at
FROM token_ledger tl
WHERE tl.reason = 'membership_purchase'
  AND COALESCE((tl.metadata->>'priceUsd')::numeric, 0) > 0

UNION ALL

-- 4. token_ledger: purchase (Ru$h packs + dust_convert via wallet)
-- Package USD prices: pkg_5=$5, pkg_10=$10, pkg_25=$25, pkg_50=$50, pkg_100=$100, pkg_500=$500.
-- dust_convert: amount = Ru$h awarded / 6 (base rate 6 Ru$h = $1).
SELECT
  'token_ledger',
  tl.id::text,
  tl.user_id::text,
  CASE tl.metadata->>'packageId'
    WHEN 'pkg_5'   THEN 5::numeric
    WHEN 'pkg_10'  THEN 10::numeric
    WHEN 'pkg_25'  THEN 25::numeric
    WHEN 'pkg_50'  THEN 50::numeric
    WHEN 'pkg_100' THEN 100::numeric
    WHEN 'pkg_500' THEN 500::numeric
    WHEN 'dust_convert' THEN ROUND((tl.delta_balance::numeric) / 6, 2)
    ELSE ROUND((tl.delta_balance::numeric) / 6, 2)
  END,
  'USD',
  COALESCE(tl.metadata->>'provider', 'wallet_usdc'),
  'rush_' || COALESCE(tl.metadata->>'packageId', 'custom'),
  'completed',
  tl.created_at
FROM token_ledger tl
WHERE tl.reason = 'purchase'
  AND COALESCE(tl.metadata->>'provider', '') = 'wallet_usdc'

UNION ALL

-- 5. token_ledger: content_purchase (per-video rent/buy)
SELECT
  'token_ledger',
  tl.id::text,
  tl.user_id::text,
  COALESCE((tl.metadata->>'priceUsd')::numeric, ROUND(ABS(tl.delta_balance)::numeric / 6, 2)),
  'USD',
  COALESCE(tl.metadata->>'provider', 'wallet_usdc'),
  'content_' || COALESCE(tl.metadata->>'videoId', tl.metadata->>'contentId', 'unknown'),
  'completed',
  tl.created_at
FROM token_ledger tl
WHERE tl.reason = 'content_purchase'

UNION ALL

-- 6. token_ledger: call_book (joined to bookings.price_cents for USD)
SELECT
  'token_ledger',
  tl.id::text,
  tl.user_id::text,
  COALESCE(b.price_cents::numeric / 100, ROUND(ABS(tl.delta_balance)::numeric / 6, 2)),
  'USD',
  'wallet_rush',
  'call_booking' || COALESCE(' — ' || b.id::text, ''),
  'completed',
  tl.created_at
FROM token_ledger tl
LEFT JOIN bookings b ON b.id::text = tl.source_id
WHERE tl.reason = 'call_book'

UNION ALL

-- 7. booking_payments (direct call-booking checkouts, status=paid)
SELECT
  'booking_payments',
  bp.id::text,
  (SELECT bk.user_id::text FROM bookings bk WHERE bk.id = bp.booking_id),
  (bp.amount_cents::numeric / 100),
  COALESCE(bp.currency, 'USD'),
  bp.provider::text,
  'call_booking' || COALESCE(' — ' || bp.booking_id::text, ''),
  'paid',
  COALESCE(bp.paid_at, bp.created_at)
FROM booking_payments bp
WHERE bp.status = 'paid'
)
SELECT
  src_tbl,
  src_pk,
  user_id,
  amount_usd,
  amount_usd       AS amount,          -- legacy alias
  currency,
  provider,
  provider         AS payment_method,  -- legacy alias
  product,
  product          AS plan_name,       -- legacy alias (collapsed from payment_history's split)
  'completed'::text AS status,         -- normalize ('paid' from booking_payments → 'completed')
  at,
  at               AS payment_date     -- legacy alias
FROM raw;

COMMENT ON VIEW v_sales IS
  'Unified revenue read-view: payments + payment_history + token_ledger (subs, Ru$h, content, calls) + booking_payments. Zoho Books is the external source of truth; this view is the local DB mirror. Exposes legacy aliases (payment_date, amount, payment_method) so FROM payment_history → FROM v_sales is a drop-in.';
