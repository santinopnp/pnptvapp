import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { WalletPayCard } from "@/components/payments/PayInWalletChips";

const CAMPAIGN_ID = "sunday_spun_days";
const PLAN_ID = "monthly-pass-promo-15";
const PRICE_USD = 15;
const DURATION_LABEL_EN = "30 days of PRIME";
const DURATION_LABEL_ES = "30 días de PRIME";

// Hardcoded landing for the recurring Sunday $15 → 1 month PRIME promo.
// Not linked from anywhere else in the app; audience arrives via DM/Telegram
// only. Uses the existing monthly-pass-promo-15 plan; the campaign_id in
// metadata unlocks the –8% USDC tolerance in walletCheckoutService for
// externally-funded checkouts where MoonPay/Meld skims the top.
export default function RedeemSundaySpunDays() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const t = useI18n();
  const es = t.lang === "es";
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/webapp/sunday-spun-days/track-visit", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!paid) return;
    refreshUser?.().catch(() => {});
    const to = setTimeout(() => navigate("/home"), 3200);
    return () => clearTimeout(to);
  }, [paid, navigate, refreshUser]);

  const title = es ? "Sunday Spun Days · 1 mes PRIME por $15" : "Sunday Spun Days · 1 month PRIME for $15";
  const kicker = es ? "Solo hoy — Domingo" : "Today only — Sunday";
  const headline = es ? "Un mes de PRIME por $15" : "One month of PRIME for $15";
  const sub = es
    ? "Acceso completo a shows exclusivos, hangouts, streams, y toda la comunidad. Pagás desde tu wallet en un tap."
    : "Full access to exclusive shows, hangouts, streams, and the whole community. One tap from your wallet.";
  const perks = es
    ? ["PRIME por 30 días", "Shows y contenido exclusivo", "Hangouts + Live", "Prioridad en soporte"]
    : ["30 days of PRIME", "Exclusive shows & content", "Hangouts + Live", "Priority support"];
  const successMsg = es
    ? "¡Estás dentro! Redirigiendo a Home…"
    : "You're in! Redirecting to Home…";

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>{title}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="mx-auto max-w-md px-4 py-8">
        <div
          className="relative overflow-hidden rounded-3xl border p-6"
          style={{
            borderColor: "rgba(251, 191, 36, 0.35)",
            background:
              "linear-gradient(160deg, rgba(251,191,36,0.15) 0%, rgba(217,70,239,0.12) 55%, rgba(0,0,0,0.9) 100%)",
          }}
        >
          <span
            className="inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest"
            style={{ background: "rgba(0,0,0,0.55)", color: "#FBBF24" }}
          >
            {kicker}
          </span>
          <h1 className="mt-3 text-3xl font-black leading-tight">{headline}</h1>
          <p className="mt-2 text-sm text-white/80">{sub}</p>

          <ul className="mt-5 space-y-1.5">
            {perks.map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm">
                <span aria-hidden className="text-amber-300">◆</span>
                <span className="text-white/90">{p}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-4xl font-black text-amber-300">${PRICE_USD}</span>
            <span className="text-sm text-white/70">
              {es ? `· ${DURATION_LABEL_ES}` : `· ${DURATION_LABEL_EN}`}
            </span>
          </div>
        </div>

        <div className="mt-5">
          {paid ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
              <p className="text-lg font-bold text-emerald-300">✓ {successMsg}</p>
            </div>
          ) : (
            <WalletPayCard
              surface="prime"
              amountUsd={PRICE_USD}
              entitlementSpec={{ planId: PLAN_ID }}
              metadata={{
                campaign_id: CAMPAIGN_ID,
                source: "redeem_ssd",
                landed_at: new Date().toISOString(),
              }}
              label={es ? `Pagá $${PRICE_USD} · 30 días PRIME` : `Pay $${PRICE_USD} · 30 days PRIME`}
              lang={es ? "es" : "en"}
              onSuccess={() => {
                setPayError(null);
                setPaid(true);
              }}
              onError={(err) => {
                const msg = err instanceof Error ? err.message : String(err);
                setPayError(msg);
              }}
            />
          )}
          {payError && (
            <p className="mt-2 text-xs text-red-300">{payError}</p>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-white/40">
          {es
            ? "Promoción por invitación. No aparece en la página de planes."
            : "Invite-only promo. Not listed on the plans page."}
        </p>
        {!user && (
          <p className="mt-4 text-center text-xs text-white/60">
            {es ? "Iniciá sesión para reclamar tu mes." : "Sign in to claim your month."}
          </p>
        )}
      </div>
    </div>
  );
}
