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
  getCreatorSubscriptionPreview,
  getCreatorSubscriptionStatus,
  getWalletBalance,
  payCreatorSubWithTokens,
} from "@/lib/api";
import { WalletPayCard } from "@/components/payments/PayInWalletChips";

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
  // NowPayments retired 2026-08-09 — creator subscription flows exclusively
  // through WalletPayCard (USDC on Base). storageKey / returnUrl no longer
  // used; kept in props for backwards compatibility.
  void storageKey;
  void returnUrl;

  const [loading, setLoading] = useState<"tokens" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
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

  const combinedError = error;

  const handleTokens = useCallback(async () => {
    if (inFlight.current) return;
    // Remove the client-side pre-check — the backend is the source of truth
    // on what's spendable (gifted is allowed for santinofurioso first-month
    // subs only, but the frontend can't know that reliably). Let the server
    // decide and surface a precise error message with the gifted breakdown.
    inFlight.current = true;
    setLoading("tokens");
    setError(null);
    try {
      const result = await payCreatorSubWithTokens(creatorId);
      if (!result.success) {
        if (result.code === "MEMBER_REQUIRED") {
          setError(lang === "es"
            ? "Necesitas una membresía Basic para suscribirte a un creador."
            : "You need a Basic membership to subscribe to a creator.");
        } else if (result.code === "INSUFFICIENT_TOKENS") {
          if (result.giftedLocked && (result.gifted ?? 0) > 0) {
            setError(lang === "es"
              ? `Tienes ${(result.gifted ?? 0).toLocaleString()} Ru$h de regalo, pero solo se puede usar en propinas a Santino o tu primer mes con @santinofurioso. Compra más Ru$h para suscribirte aquí.`
              : `You have ${(result.gifted ?? 0).toLocaleString()} gifted Ru$h, but it's only spendable on Santino live tips or your first month with @santinofurioso. Buy more Ru$h to subscribe here.`);
          } else {
            setError(lang === "es"
              ? `Ru$h insuficiente. Necesitas ${result.required?.toLocaleString()} — tienes ${(result.current ?? 0).toLocaleString()}.`
              : `Not enough Ru$h. Need ${result.required?.toLocaleString()} — you have ${(result.current ?? 0).toLocaleString()}.`);
          }
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
  }, [creatorId, onSuccess, lang]);

  // handleVerify + paymentSuccess side-effect retired 2026-08-09 — wallet
  // checkout is synchronous so the WalletPayCard onSuccess callback is
  // authoritative; there is no separate crypto-poll to wait on.
  void getCreatorSubscriptionStatus;
  void setComplianceHeld;

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

  // Success is delegated to onSuccess() from the WalletPayCard / tokens
  // callback — no separate success view here anymore. The parent surface
  // (feed banner / paywall / DM upsell) is responsible for hiding the wizard.

  // ── Wallet + tokens payment options ──────────────────────────────────────
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

      {/* Wallet USDC rail — only renders when the user has a Privy wallet.
          Fires the creator_sub surface with the creator_id + 30-day duration
          so backend grants a `creator-subscription` entitlement scoped to
          this creator on confirmation. Creator earnings are credited via
          walletCheckoutService._fulfillEntitlement's grant path. */}
      <WalletPayCard
        surface="creator_sub"
        amountUsd={priceUsd}
        entitlementSpec={{ creator_id: creatorId }}
        metadata={{ creatorName: displayName, creatorUsername: username || null }}
        label={lang === "es" ? `Pagar $${priceUsd.toFixed(2)} · Suscripción` : `Pay $${priceUsd.toFixed(2)} · Subscription`}
        lang={lang}
        onSuccess={() => onSuccess?.()}
      />

      {/* NP crypto picker retired 2026-08-09 — Wallet is now the only crypto
          path. Fund the wallet with card / Apple Pay / Google Pay via Privy
          inside WalletPayCard above. */}

      <p className="text-[10px] text-center" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
        {lang === "es"
          ? "Acceso por 30 días. Sin renovación automática."
          : "30-day access. No auto-renewal."}
      </p>
    </div>
  );
}
