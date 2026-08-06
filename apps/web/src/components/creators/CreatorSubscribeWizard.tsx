/**
 * CreatorSubscribeWizard — the single, canonical inline checkout for
 * per-creator subscriptions.
 *
 * Used from: creator profile pill, feed post CTA banner, channel-detail
 * paywall, DM upsell. All these entry points feed the same NowPayments flow
 * (crypto grid + tokens) so the UX is identical everywhere.
 *
 * A creator subscription unlocks: creator profile paid posts, canonical paid
 * channel, private hangout, and unlimited DMs with that creator.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  NP_COINS_SUBSCRIBE,
  getCreatorSubscriptionPreview,
  getCreatorSubscriptionStatus,
  getWalletBalance,
  payCreatorSubWithTokens,
} from "@/lib/api";
import { useNowPayments } from "@/hooks/useNowPayments";
import { NowPaymentsWaitingPanel } from "@/components/payments/NowPaymentsWaitingPanel";
import { TrustWalletIcon, MetaMaskIcon } from "@/components/payments/PayInWalletChips";

export interface CreatorSubscribeWizardProps {
  creatorId: string;
  /** Display name only (used in copy). */
  creatorName?: string | null;
  /** Monthly price in USD. Passed by parent so the parent can render its own price label without a second network hit. */
  priceUsd: number;
  /** Optional handle for the "@handle" copy. */
  username?: string | null;
  /** UI language. */
  lang?: "en" | "es";
  /** Called when the subscription is confirmed (tokens instant OR crypto confirmed). */
  onSuccess: () => void;
  /** Called when the user closes the wizard without paying. */
  onClose?: () => void;
  /** Compact styling (feed banner). Defaults to full-width panel. */
  compact?: boolean;
  /** SessionStorage key used to persist the pending order across refreshes. Defaults to per-creator. */
  storageKey?: string;
  /** Where to return after checkout (deep-link back). */
  returnUrl?: string;
  /** Channel access type — controls whether the launch-offer banner is shown. */
  accessType?: "free" | "prime" | "subscription" | "paid";
}

const BENEFITS_EN = [
  "Full creator profile & paid posts",
  "Private subscribers-only channel",
  "Private hangout (chat with the creator)",
  "Direct DM access with the creator",
];
const BENEFITS_ES = [
  "Perfil completo y posts de pago",
  "Canal privado solo para suscriptores",
  "Hangout privado (chat con el creador)",
  "DM directo con el creador",
];

export default function CreatorSubscribeWizard({
  creatorId,
  creatorName,
  priceUsd,
  username,
  lang = "en",
  onSuccess,
  onClose,
  compact = false,
  storageKey,
  returnUrl,
  accessType = "subscription",
}: CreatorSubscribeWizardProps) {
  const key = storageKey || `pnp_creator_sub_${creatorId}`;

  // NowPayments hook — handles order create + poll + resume from storage.
  // Its onSuccess fires when the poller sees `completed`.
  const {
    order,
    isSuccess: paymentSuccess,
    isConfirming,
    startPayment,
    cancelOrder,
    error: npError,
    setError: setNpError,
  } = useNowPayments({
    storageKey: key,
    returnUrl,
    onSuccess: () => onSuccess(),
  });

  const [loading, setLoading] = useState<"crypto" | "tokens" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [showAllCoins, setShowAllCoins] = useState(false);
  // Compliance hold: creator hasn't uploaded 4-min exclusive minimum yet.
  const [complianceHeld, setComplianceHeld] = useState(false);
  const inFlight = useRef(false);

  // Step 0: confirmation before showing payment options.
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<{ exclusivePhotoCount: number; exclusiveVideoCount: number; exclusiveTotalCount: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  // Fetch exclusive content counts for the confirmation step.
  useEffect(() => {
    let cancelled = false;
    getCreatorSubscriptionPreview(creatorId)
      .then((r) => { if (!cancelled && r.success) setPreview(r); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [creatorId]);

  // Fetch token balance once for the tokens button.
  useEffect(() => {
    let cancelled = false;
    getWalletBalance().then((r) => {
      if (!cancelled && r.success) setTokenBalance(r.balance);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const tokenCost = Math.round(priceUsd * 6);
  const displayName = creatorName || (username ? `@${username}` : "creator");

  const combinedError = error || npError;

  const handleTokens = useCallback(async () => {
    if (inFlight.current) return;
    if (tokenBalance !== null && tokenBalance < tokenCost) {
      setError(lang === "es"
        ? `Ru$h insuficiente. Necesitas ${tokenCost.toLocaleString()} Ru$h — tienes ${tokenBalance.toLocaleString()} Ru$h.`
        : `Not enough Ru$h. Need ${tokenCost.toLocaleString()} Ru$h — you have ${tokenBalance.toLocaleString()} Ru$h.`);
      return;
    }
    inFlight.current = true;
    setLoading("tokens");
    setError(null);
    setNpError(null);
    try {
      const result = await payCreatorSubWithTokens(creatorId);
      if (!result.success) {
        if (result.code === "MEMBER_REQUIRED") {
          setError(lang === "es"
            ? "Necesitas una membresía Basic para suscribirte a un creador."
            : "You need a Basic membership to subscribe to a creator.");
        } else if (result.code === "INSUFFICIENT_TOKENS") {
          setError(lang === "es"
            ? `Ru$h insuficiente. Necesitas ${result.required?.toLocaleString()} F — tienes ${result.current?.toLocaleString()} F.`
            : `Not enough Ru$h. Need ${result.required?.toLocaleString()} F — you have ${result.current?.toLocaleString()} F.`);
        } else {
          setError(result.error || (lang === "es" ? "No se pudo activar la suscripción." : "Could not activate subscription."));
        }
        return;
      }
      if (result.newBalance !== undefined) setTokenBalance(result.newBalance);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === "es" ? "Error al pagar con Ru$h." : "Ru$h payment failed."));
    } finally {
      setLoading(null);
      inFlight.current = false;
    }
  }, [creatorId, tokenBalance, tokenCost, onSuccess, lang, setNpError]);

  const handleCrypto = useCallback(async (payCurrency: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading("crypto");
    setError(null);
    setNpError(null);
    try {
      const res = await startPayment(
        "creator_monthly",
        undefined,
        creatorId,
        false, // one-shot 30-day pass — /prepare handles creator_monthly; /subscribe rejects it
        payCurrency,
      );
      if (!res.success) {
        setError(res.error || (lang === "es" ? "No se pudo iniciar el pago." : "Failed to start payment."));
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "";
      const cryptoErrors: Record<string, { en: string; es: string }> = {
        MEMBER_REQUIRED: {
          en: "You need a Basic membership to subscribe with crypto.",
          es: "Necesitas una membresía Basic para suscribirte con crypto.",
        },
        CREATOR_LOCKED: {
          en: "This creator isn't accepting subscriptions right now.",
          es: "Este creador no está aceptando suscripciones por el momento.",
        },
        SUBSCRIPTIONS_PAUSED: {
          en: "This creator has paused new memberships.",
          es: "Este creador pausó sus suscripciones temporalmente.",
        },
      };
      const map = cryptoErrors[msg];
      setError(map ? map[lang] : (msg || (lang === "es" ? "Algo salió mal. Intenta de nuevo." : "Something went wrong. Try again.")));
    } finally {
      setLoading(null);
      inFlight.current = false;
    }
  }, [creatorId, startPayment, lang, setNpError]);

  const handleVerify = useCallback(async () => {
    setLoading("verify");
    setError(null);
    try {
      const s = await getCreatorSubscriptionStatus(creatorId);
      if (s.subscribed) {
        setComplianceHeld(!!s.complianceHeld);
        onSuccess();
      } else {
        setError(lang === "es"
          ? "Tu pago aún no se ha confirmado. Espera un momento e intenta de nuevo."
          : "Payment not confirmed yet. Wait a moment and try again.");
      }
    } catch {
      setError(lang === "es" ? "No se pudo verificar." : "Could not verify.");
    } finally {
      setLoading(null);
    }
  }, [creatorId, onSuccess, lang]);

  // When the NowPayments poller flips paymentSuccess=true, refetch status to
  // detect compliance-held state (creator hasn't uploaded the 4-min minimum).
  // Without this the wizard would show "Subscription active" while every
  // downstream gate returns "no access", which is the exact bug this fixes.
  useEffect(() => {
    if (!paymentSuccess) return;
    let cancelled = false;
    getCreatorSubscriptionStatus(creatorId)
      .then((s) => { if (!cancelled) setComplianceHeld(!!s.complianceHeld); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [paymentSuccess, creatorId]);

  // ── Step 0: confirmation with price + exclusive content preview ─────────
  if (!confirmed) {
    const hasContent = preview && preview.exclusiveTotalCount > 0;
    return (
      <div
        className={`rounded-2xl ${compact ? "p-3" : "p-4"} space-y-3`}
        style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid var(--pnp-border, #2a2a2a)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {lang === "es" ? "Suscripción a" : "Subscribing to"}
            </p>
            <p className="text-sm font-bold text-white truncate">{displayName}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-bold text-white leading-none">${priceUsd.toFixed(0)}</p>
            <p className="text-[10px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>/mes · 30 días</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-white/50 hover:text-white text-xs shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {/* Exclusive content counts */}
        {!previewLoading && preview && (
          <div className="flex gap-2">
            <div
              className="flex-1 rounded-xl py-2.5 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-base font-bold text-white leading-none">{preview.exclusivePhotoCount}</p>
              <p className="text-[9px] mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                {lang === "es" ? "fotos exclusivas" : "exclusive photos"}
              </p>
            </div>
            <div
              className="flex-1 rounded-xl py-2.5 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <p className="text-base font-bold text-white leading-none">{preview.exclusiveVideoCount}</p>
              <p className="text-[9px] mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                {lang === "es" ? "videos exclusivos" : "exclusive videos"}
              </p>
            </div>
          </div>
        )}

        {!previewLoading && !hasContent && (
          <p className="text-[10px] text-center" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {lang === "es"
              ? "Este creador está construyendo su contenido exclusivo. ¡Sé el primero en suscribirte!"
              : "This creator is building their exclusive content. Be the first to subscribe!"}
          </p>
        )}

        {/* Benefits */}
        <ul className="space-y-0.5">
          {(lang === "es" ? BENEFITS_ES : BENEFITS_EN).map((b) => (
            <li key={b} className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              <span style={{ color: "#34C759" }}>✓</span>
              {b}
            </li>
          ))}
        </ul>

        {(accessType === "paid" || accessType === "subscription") && (
          <div
            className="rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: "rgba(230,145,56,0.12)", border: "1px solid rgba(230,145,56,0.3)" }}
          >
            <span className="text-base leading-none flex-shrink-0" aria-hidden="true">🔥</span>
            <p className="text-[11px] leading-relaxed" style={{ color: "#E69138" }}>
              Oferta de lanzamiento: al suscribirte accedes a TODO el contenido exclusivo del creador — canal + perfil, incluidos en un solo pago
            </p>
          </div>
        )}

        <button
          onClick={() => setConfirmed(true)}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #D4007A, #a0005e)" }}
        >
          {lang === "es" ? "Confirmar y elegir pago" : "Confirm & choose payment"}
        </button>

        <p className="text-[10px] text-center" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {lang === "es" ? "Sin renovación automática." : "No auto-renewal."}
        </p>
      </div>
    );
  }

  // ── Success view (tokens or crypto confirmed) ────────────────────────────
  if (paymentSuccess) {
    if (complianceHeld) {
      return (
        <div
          className={`rounded-2xl ${compact ? "p-4" : "p-5"} text-center space-y-2`}
          style={{ background: "rgba(255,159,10,0.14)", border: "1px solid rgba(255,159,10,0.3)", color: "#FF9F0A" }}
        >
          <p className="text-sm font-bold">
            {lang === "es" ? "Pago recibido — en espera" : "Payment received — on hold"}
          </p>
          <p className="text-xs opacity-90">
            {lang === "es"
              ? `Tu suscripción se activará automáticamente cuando ${displayName} suba el contenido exclusivo mínimo requerido. No necesitas hacer nada más — te avisaremos.`
              : `Your subscription will activate automatically once ${displayName} uploads the required minimum exclusive content. Nothing more to do — we'll notify you.`}
          </p>
        </div>
      );
    }
    return (
      <div
        className={`rounded-2xl ${compact ? "p-4" : "p-5"} text-center space-y-2`}
        style={{ background: "rgba(52,199,89,0.14)", border: "1px solid rgba(52,199,89,0.3)", color: "#34C759" }}
      >
        <p className="text-sm font-bold">✓ {lang === "es" ? "Suscripción activa" : "Subscription active"}</p>
        <p className="text-xs opacity-80">
          {lang === "es"
            ? `Ya tienes acceso completo a ${displayName}: perfil, canal, hangout privado y DMs.`
            : `You now have full access to ${displayName}: profile, channel, private hangout, and DMs.`}
        </p>
      </div>
    );
  }

  // ── Waiting for crypto confirmation ──────────────────────────────────────
  if (order) {
    return (
      <div className="space-y-2">
        <NowPaymentsWaitingPanel
          order={order}
          isSuccess={paymentSuccess}
          isConfirming={isConfirming}
          onCancel={cancelOrder}
          lang={lang}
          payCurrency={order.payCurrency}
          productKind="subscription"
        />
        <button
          onClick={handleVerify}
          disabled={loading === "verify"}
          className="w-full py-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--pnp-accent, #D4007A)" }}
        >
          {loading === "verify"
            ? (lang === "es" ? "Verificando…" : "Verifying…")
            : (lang === "es" ? "Ya pagué — verificar" : "I paid — verify now")}
        </button>
      </div>
    );
  }

  // ── Coin picker + tokens button ──────────────────────────────────────────
  return (
    <div
      className={`rounded-2xl ${compact ? "p-3" : "p-4"} space-y-3`}
      style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid var(--pnp-border, #2a2a2a)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">
            {lang === "es" ? "Suscríbete a" : "Subscribe to"} {displayName} · ${priceUsd.toFixed(0)}/mo
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {(lang === "es" ? BENEFITS_ES : BENEFITS_EN).map((b) => (
              <li key={b} className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                <span style={{ color: "#34C759" }}>✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-white/50 hover:text-white text-xs shrink-0"
          >
            ✕
          </button>
        )}
      </div>

      {combinedError && (
        <div
          className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
          style={{ color: "#FF6B6B", background: "rgba(239,68,68,0.1)" }}
        >
          <span aria-hidden>⚠</span>
          <span>{combinedError}</span>
        </div>
      )}

      {tokenBalance !== null && tokenBalance > 0 && (
        <button
          onClick={handleTokens}
          disabled={loading !== null}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #D4007A, #a0005e)" }}
        >
          {loading === "tokens"
            ? "…"
            : (
              <>
                <span>🎫</span>
                <span>{lang === "es" ? "Pagar con Ru$h 💎" : "Pay with Ru$h 💎"} · {tokenCost.toLocaleString()} Ru$h</span>
                <span className="text-[10px] opacity-70">({tokenBalance.toLocaleString()} Ru$h)</span>
              </>
            )}
        </button>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-semibold" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {lang === "es" ? "O paga con crypto — bajas comisiones" : "Or pay with crypto — low fees"}
          </p>
          <a
            href="/crypto-guide"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] font-semibold text-amber-300 hover:text-amber-200 underline decoration-dotted underline-offset-2"
          >
            {lang === "es" ? "¿Qué red? →" : "Which network? →"}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {NP_COINS_SUBSCRIBE.map((coin) => (
            <button
              key={coin.code}
              disabled={loading !== null}
              onClick={() => handleCrypto(coin.code)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 transition-colors text-left"
            >
              <span className="text-base font-bold leading-none" style={{ color: coin.color }}>{coin.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">{coin.label}</span>
                  {"recommended" in coin && coin.recommended && (
                    <span className="text-[7px] font-bold px-1 py-px rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 leading-none">★</span>
                  )}
                </div>
                <span className="text-[9px] leading-none" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{coin.network}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-2 text-center flex items-center justify-center gap-1.5 flex-wrap">
          <span className="text-[10px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {lang === "es" ? "Abre en:" : "Open in:"}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/90 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
            <MetaMaskIcon size={14} /> MetaMask
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-md border border-blue-500/30">
            <TrustWalletIcon size={14} /> Trust Wallet
          </span>
        </div>
      </div>

      <p className="text-[10px] text-center" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
        {lang === "es"
          ? "Acceso por 30 días. Sin renovación automática."
          : "30-day access. No auto-renewal."}
      </p>

      {/* Hide the "show all coins" toggle until we wire NP_COINS full grid. Placeholder for phase 2. */}
      {false && (
        <button
          onClick={() => setShowAllCoins(true)}
          className="text-[10px] underline decoration-dotted"
          style={{ color: "var(--pnp-accent, #D4007A)" }}
        >
          {lang === "es" ? "Ver todas las monedas" : "See all coins"}
        </button>
      )}
    </div>
  );
}
