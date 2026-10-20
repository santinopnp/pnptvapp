/**
 * CreatorSubscribeWizard — the single, canonical inline checkout for
 * per-creator subscriptions.
 *
 * Used from: creator profile pill, feed post CTA banner, channel-detail
 * paywall, DM upsell. All these entry points use the same Privy checkout
 * (WalletPayCard), so the UX is identical everywhere. Ru$h is tips-only.
 *
 * A creator subscription unlocks: creator profile paid posts, canonical paid
 * channel, private hangout, and unlimited DMs with that creator.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  getCreatorSubscriptionPreview,
  getCreatorSubscriptionStatus,
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

  const t = useI18n();

  const [loading, setLoading] = useState<"tokens" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
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


  const displayName = creatorName || (username ? `@${username}` : "creator");

  const combinedError = error;


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
              {t.subscribe.creatorLaunchOffer}
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
