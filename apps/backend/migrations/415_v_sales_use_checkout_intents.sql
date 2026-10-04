-- Migration 415: rebuild v_sales on checkout_intents (authoritative wallet source).
--
-- Reason: migration 414's v_sales read wallet revenue from token_ledger. That
-- misses the prime surface — prime wallet purchases DON'T write a
-- token_ledger row (only membership + rush + content do). Last 2 days: 3
-- prime payments ($139.97) were invisible to admin dashboards.
--
-- Fix: use checkout_intents (status='confirmed') as the wallet-revenue source
-- — walletCheckoutService only flips status to 'confirmed' AFTER the on-chain
-- tx verifies, so every row here is a real USDC/ETH transfer to our wallet.
--
-- Also exposes `absorbed` column: TRUE when grant_result.entitlement_id points
-- at an entitlement that was NOT newly-created by THIS intent (same user had
-- a matching active grant from a prior payment or trial — e.g. Spunhoe intent
-- 378 absorbed into a lifetime pnp-member from the 09-24 trial). Dashboards
-- can surface absorbed=TRUE as "customer paid but received no new value".
--
-- Removed from the view: token_ledger-based rows. Reasons:
--   • purchase (Ru$h packs, dust_convert) — already in checkout_intents
--   • membership_purchase — already in checkout_intents (wallet subs)
--   • call_book, content_purchase — Ru$h spends, not new USD inflow (would
--     double-count the original Ru$h purchase)
--
-- Idempotent (DROP then CREATE).

DROP VIEW IF EXISTS v_sales;

CREATE VIEW v_sales AS
WITH raw AS (
  -- 1. payments (completed, non-wallet mostly — NowPayments + legacy wallet)
  SELECT
    'payments'::text                                  AS src_tbl,
    p.id::text                                        AS src_pk,
    p.user_id::text                                   AS user_id,
    p.amount::numeric                                 AS amount_usd,
    COALESCE(p.currency, 'USD')                       AS currency,
    p.provider::text                                  AS provider,
    'membership'::text                                AS surface_hint,
    COALESCE(p.plan_name, p.plan_id, 'payment')::text AS product,
    FALSE                                             AS absorbed,
    COALESCE(p.completed_at, p.created_at)            AS at
  FROM payments p
  WHERE p.status = 'completed'

  UNION ALL

  -- 2. payment_history — rows not already in `payments` (NowPayments mirror
  -- that would otherwise double-count).
  SELECT
    'payment_history',
    ph.id::text,
    ph.user_id::text,
    ph.amount::numeric,
    COALESCE(ph.currency, 'USD'),
    ph.payment_method::text,
    'membership',
    COALESCE(ph.plan_name, ph.product, ph.plan_id, 'payment')::text,
    FALSE,
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

  -- 3. checkout_intents (confirmed) — authoritative wallet source. Covers
  -- prime / membership / rush / creator_sub / call / donation / crystal /
  -- channel_pass. Every row = verified on-chain transfer.
  SELECT
    'checkout_intents',
    ci.id::text,
    ci.user_id::text,
    ci.amount_usd::numeric,
    'USD',
    ci.provider::text,
    COALESCE(ci.surface, 'wallet'),
    COALESCE(
      ci.surface || CASE
        WHEN (ci.entitlement_spec->>'packageId') IS NOT NULL THEN '_' || (ci.entitlement_spec->>'packageId')
        WHEN (ci.entitlement_spec->>'add_on_id') IS NOT NULL THEN '_' || (ci.entitlement_spec->>'add_on_id')
        ELSE ''
      END,
      'wallet'
    ),
    -- absorbed: grant_result points at an entitlement whose source is NOT
    -- this intent. For rush/call surfaces entitlement_id is null → not
    -- absorbed. Membership + prime are the surfaces where absorption matters.
    (
      ci.surface IN ('membership','prime','creator_sub')
      AND (ci.grant_result->>'entitlement_id') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_entitlements ue
         WHERE ue.id::text = (ci.grant_result->>'entitlement_id')
           AND (
             ue.source_payment_id IS DISTINCT FROM ('checkout_intent:' || ci.id::text)
             OR ue.granted_at < ci.confirmed_at - INTERVAL '1 minute'
           )
      )
    ) AS absorbed,
    ci.confirmed_at
  FROM checkout_intents ci
  WHERE ci.status = 'confirmed'
    AND ci.confirmed_at IS NOT NULL

  UNION ALL

  -- 4. booking_payments (paid) — direct NowPayments call-booking checkouts.
  SELECT
    'booking_payments',
    bp.id::text,
    (SELECT bk.user_id::text FROM bookings bk WHERE bk.id = bp.booking_id),
    (bp.amount_cents::numeric / 100),
    COALESCE(bp.currency, 'USD'),
    bp.provider::text,
    'call',
    'call_booking' || COALESCE(' — ' || bp.booking_id::text, ''),
    FALSE,
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
  surface_hint     AS surface,
  product,
  product          AS plan_name,       -- legacy alias
  absorbed,
  'completed'::text AS status,         -- normalize
  at,
  at               AS payment_date     -- legacy alias
FROM raw;

COMMENT ON VIEW v_sales IS
  'Unified revenue read-view. Primary source: checkout_intents (confirmed) for every wallet-USDC/ETH purchase (prime/membership/rush/creator_sub/call/donation). Also unions payments (non-wallet NowPayments), payment_history (deduped), booking_payments (direct call bookings). Exposes absorbed=TRUE for intents that paid but delivered no new entitlement (customer paid for something they already had). Zoho Books is the external source of truth.';
