import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { WalletPayCard } from "@/components/payments/PayInWalletChips";
import { NpAppPickerSheet } from "@/components/payments/NowPaymentsWaitingPanel";
import CountdownTimer from "@/components/CountdownTimer";

const CAMPAIGN_ID = "mondays_spundays";
const PLAN_ID = "mondays_spundays_promo_20";
const PRICE_USD = 20;

// One-time-only offer — this exact deal (2 months PRIME + PRIME Channel for
// $20) will not repeat. Hard deadline, not a rolling 24h-from-visit window,
// so it matches the single broadcast fired by
// scripts/broadcast-mondays-spundays.js. Keep in sync with LAUNCH_AT/
// EXPIRES_AT in that script and in services/queueService.js.
const EXPIRES_AT = "2026-09-30T04:00:00Z";

export default function RedeemMondaysSpundays() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const t = useI18n();
  const es = t.lang === "es";
  const [paid, setPaid] = useState(false);
  const [expired, setExpired] = useState(() => Date.now() >= new Date(EXPIRES_AT).getTime());
  const [walletOpen, setWalletOpen] = useState(false);
  const [npOpen, setNpOpen] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/webapp/mondays-spundays/track-visit", {
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

  const title = es
    ? "Mondays Spundays · 2 meses PRIME + PRIME Channel por $20"
    : "Mondays Spundays · 2 months PRIME + PRIME Channel for $20";
  const kicker = es ? "Oferta única — nunca vuelve" : "One-time offer — never returns";
  const headline = es ? "2 meses de PNPtv + PRIME Channel por $20" : "2 months of PNPtv + PRIME Channel for $20";
  const sub = es
    ? "Esta oferta se lanza una sola vez. Cuando el conteo llegue a cero, no vuelve — ni el próximo lunes, ni nunca."
    : "This offer only launches once. When the countdown hits zero, it's gone — not next Monday, not ever.";
  const perks = es
    ? ["2 meses de PRIME completo", "Acceso al PRIME Channel incluido", "Shows, hangouts, streams y comunidad", "Oferta única — no se repite"]
    : ["2 months of full PRIME", "PRIME Channel access included", "Shows, hangouts, streams & community", "One-time offer — never repeats"];
  const successMsg = es ? "¡Estás dentro! Redirigiendo a Home…" : "You're in! Redirecting to Home…";
  const planLabel = es ? `Mondays Spundays · $${PRICE_USD} · 2 meses PRIME` : `Mondays Spundays · $${PRICE_USD} · 2 months PRIME`;

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
            <span className="text-sm text-white/70">{es ? "· 2 meses PRIME + PRIME Channel" : "· 2 months PRIME + PRIME Channel"}</span>
          </div>

          {!paid && (
            <CountdownTimer
              expiresAt={EXPIRES_AT}
              onExpire={() => setExpired(true)}
              lang={es ? "es" : "en"}
              className="mt-5"
            />
          )}
        </div>

        <div className="mt-5">
          {paid ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
              <p className="text-lg font-bold text-emerald-300">✓ {successMsg}</p>
            </div>
          ) : expired ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-sm text-white/60">
                {es ? "Esta oferta única ya terminó y no se repite." : "This one-time offer has ended and will not repeat."}
              </p>
            </div>
          ) : (
            <>
              {/* Pay button pair — mirrors /subscribe pattern.
                  Left (emerald, primary): opens inline WalletPayCard (Privy USDC on Base + card + Apple Pay).
                  Right (amber, secondary): opens NpAppPickerSheet (any-crypto popup). */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWalletOpen((v) => !v)}
                  className={`flex-1 py-3 rounded-lg font-bold text-xs text-white transition-all leading-tight ${walletOpen ? "bg-gradient-to-r from-emerald-400 to-emerald-500 ring-2 ring-emerald-300" : "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"}`}
                >
                  {es ? "💳 Tarjeta · Apple Pay · Wallet" : "💳 Card · Apple Pay · Wallet"}
                </button>
                <button
                  type="button"
                  onClick={() => setNpOpen(true)}
                  className="flex-1 py-3 rounded-lg font-bold text-xs transition-all leading-tight"
                  style={{
                    border: "1.5px solid rgba(255,183,0,0.50)",
                    background: "rgba(255,183,0,0.08)",
                    color: "rgba(255,183,0,0.85)",
                  }}
                >
                  <span className="block">₿ {es ? "Apps y wallets" : "Apps & wallets"}</span>
                  <span className="block text-[9px] font-normal opacity-70 mt-0.5">BTC · ETH · USDC · USDT · etc.</span>
                </button>
              </div>

              {walletOpen && (
                <div className="mt-3">
                  <WalletPayCard
                    surface="prime"
                    amountUsd={PRICE_USD}
                    entitlementSpec={{ planId: PLAN_ID }}
                    metadata={{
                      campaign_id: CAMPAIGN_ID,
                      source: "redeem_mondays",
                      landed_at: new Date().toISOString(),
                    }}
                    label={es ? `Pagá $${PRICE_USD} · 2 meses PRIME` : `Pay $${PRICE_USD} · 2 months PRIME`}
                    lang={es ? "es" : "en"}
                    onSuccess={() => {
                      setPayError(null);
                      setPaid(true);
                    }}
                    onError={(err) => {
                      const msg = err instanceof Error ? err.message : String(err);
                      setPayError(msg);
                    }}
                    compact
                  />
                </div>
              )}
              {payError && (
                <p className="mt-2 text-xs text-red-300">{payError}</p>
              )}
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-white/40">
          {es
            ? "Promoción por invitación. No aparece en la página de planes."
            : "Invite-only promo. Not listed on the plans page."}
        </p>
        {!user && (
          <p className="mt-4 text-center text-xs text-white/60">
            {es ? "Iniciá sesión para reclamar tu oferta." : "Sign in to claim your offer."}
          </p>
        )}
      </div>

      <NpAppPickerSheet
        isOpen={npOpen}
        onClose={() => setNpOpen(false)}
        planId={PLAN_ID}
        lang={es ? "es" : "en"}
        planLabel={planLabel}
        onSuccess={() => setPaid(true)}
      />
    </div>
  );
}

export { CAMPAIGN_ID, PLAN_ID };
