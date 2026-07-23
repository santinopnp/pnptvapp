-- Daily USD->COP exchange rate cache (Banrep TRM).
-- Populated by creatorPayoutService.getUsdCopRate() with a 24h TTL so we
-- don't hit datos.gov.co on every admin ledger render.

CREATE TABLE IF NOT EXISTS usd_cop_rate_cache (
  rate_date   DATE PRIMARY KEY,
  rate_cop    NUMERIC(10,2) NOT NULL,
  source      TEXT NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE usd_cop_rate_cache IS
  'Daily TRM (USD->COP) cache. Source values: banrep_datosgov, banrep_official, manual_fallback.';
