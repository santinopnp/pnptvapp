import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
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
const EXPIRES_AT = "2026-10-06T14:00:00Z";

const CRYPTO_APP_LINKS = [
  { label: "Revolut", url: "https://www.revolut.com/ramp/" },
  { label: "Venmo", url: "https://venmo.com/about/crypto" },
  { label: "Cash App", url: "https://cash.app/bitcoin" },
  { label: "N26", url: "https://n26.com/en-eu/crypto" },
];

export default function RedeemMondaysSpundays() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const t = useI18n();
  const es = t.lang === "es";
  const [paid, setPaid] = useState(false);
  const [expired, setExpired] = useState(() => Date.now() >= new Date(EXPIRES_AT).getTime());
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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
              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                className="w-full rounded-2xl py-3.5 text-center font-black text-black transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(90deg, #FBBF24, #F59E0B)" }}
              >
                {es ? `Pagar $${PRICE_USD} · 2 meses PRIME` : `Pay $${PRICE_USD} · 2 months PRIME`}
              </button>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                <p className="text-[11px] font-semibold text-white/70">
                  {es
                    ? "¿Usas Revolut, Cash App, Venmo o N26? Copia la dirección crypto que te damos al pagar, complétalo desde tu app siguiendo sus instrucciones, y tu plan se activa automáticamente:"
                    : "Using Revolut, Cash App, Venmo, or N26? Copy the crypto address we give you at checkout, complete it from your app following its instructions, and your plan activates automatically:"}
                </p>
                <ul className="mt-2 space-y-1">
                  {CRYPTO_APP_LINKS.map((app) => (
                    <li key={app.label}>
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-amber-300 underline decoration-dotted hover:text-amber-200"
                      >
                        {app.label} → {app.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
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
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        planId={PLAN_ID}
        lang={es ? "es" : "en"}
        planLabel={es ? `Mondays Spundays · $${PRICE_USD} · 2 meses PRIME` : `Mondays Spundays · $${PRICE_USD} · 2 months PRIME`}
        onSuccess={() => setPaid(true)}
      />
    </div>
  );
}

export { CAMPAIGN_ID, PLAN_ID };
