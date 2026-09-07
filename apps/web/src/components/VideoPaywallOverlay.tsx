/**
 * VideoPaywallOverlay — inline paywall rendered on top of the VideoPlayer when
 * a video requires a rent, buy, or Channel Pass purchase.
 *
 * Design: dark glass card centered over a blurred poster backdrop. Three action
 * buttons (Rent 48h, Buy, Channel Pass) are shown only when the corresponding
 * price is enabled. On 402 INSUFFICIENT_FUNDS the BuyTokensModal opens;
 * on success the parent is notified via `onGranted` so the player can reload.
 *
 * Copy: uses "Ru$h 💎" per platform convention (feedback_rush_not_tokens).
 * Payment brand names are never surfaced (feedback_payment_brand_names_hidden).
 */

import React, { useState, useCallback } from "react";
import { BuyTokensModal } from "@/components/BuyTokensModal";
import {
  purchaseVideoAccess,
  checkoutChannelPass,
  ApiError,
  type VideoAccessInfo,
} from "@/lib/api";

export interface VideoPaywallOverlayProps {
  videoId: string | number;
  access: VideoAccessInfo;
  poster?: string | null;
  /** Called after a successful purchase so the parent can reload the video source. */
  onGranted: () => void;
}

type PurchaseTarget = "rent" | "buy" | "channel_pass";

export function VideoPaywallOverlay({
  videoId,
  access,
  poster,
  onGranted,
}: VideoPaywallOverlayProps) {
  const { prices, creator } = access;

  const [loading, setLoading] = useState<PurchaseTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBuyRush, setShowBuyRush] = useState(false);
  // After the BuyTokensModal closes we re-attempt the purchase that triggered it.
  const pendingTargetRef = React.useRef<PurchaseTarget | null>(null);

  const attempt = useCallback(
    async (target: PurchaseTarget) => {
      setError(null);
      setLoading(target);
      try {
        if (target === "channel_pass") {
          await checkoutChannelPass(creator.id);
        } else {
          await purchaseVideoAccess(videoId, target);
        }
        setLoading(null);
        onGranted();
      } catch (err) {
        setLoading(null);
        if (err instanceof ApiError && err.status === 402) {
          // Insufficient Ru$h — open top-up modal then re-attempt on close.
          pendingTargetRef.current = target;
          setShowBuyRush(true);
          return;
        }
        const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setError(msg);
      }
    },
    [videoId, creator.id, onGranted]
  );

  const handleBuyRushClose = useCallback(() => {
    setShowBuyRush(false);
    const target = pendingTargetRef.current;
    pendingTargetRef.current = null;
    if (target) {
      // Give the modal a tick to unmount before re-attempting.
      setTimeout(() => attempt(target), 60);
    }
  }, [attempt]);

  const hasRent = prices?.rent_price_rush != null && prices.rent_price_rush > 0;
  const hasBuy = prices?.buy_price_rush != null && prices.buy_price_rush > 0;
  const hasPass = creator?.channel_pass_enabled && (creator?.channel_pass_price_usd ?? 0) > 0;

  const isAnyLoading = loading !== null;

  return (
    <>
      {/* Blurred poster backdrop */}
      <div className="absolute inset-0 z-20 overflow-hidden">
        {poster && (
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50"
          />
        )}
        <div className="absolute inset-0 bg-black/70" />

        {/* Centered paywall card */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-4"
            style={{
              background: "rgba(30,30,30,0.92)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Eyebrow */}
            <div className="text-center">
              <p className="text-xs text-pnp-textSecondary font-medium">
                @{creator.username} exclusive
              </p>
              <h3 className="mt-1 text-base font-bold text-white leading-snug">
                Unlock this video
              </h3>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2.5">
              {hasRent && (
                <PaywallButton
                  label={`Rent 48h · ${prices.rent_price_rush} Ru$h 💎`}
                  sublabel={prices.rent_price_usd != null ? `~$${prices.rent_price_usd}` : undefined}
                  loading={loading === "rent"}
                  disabled={isAnyLoading}
                  variant="primary"
                  onClick={() => attempt("rent")}
                />
              )}

              {hasBuy && (
                <PaywallButton
                  label={`Buy · ${prices.buy_price_rush} Ru$h 💎`}
                  sublabel={prices.buy_price_usd != null ? `~$${prices.buy_price_usd} · Yours forever` : "Yours forever"}
                  loading={loading === "buy"}
                  disabled={isAnyLoading}
                  variant="secondary"
                  onClick={() => attempt("buy")}
                />
              )}

              {hasPass && (
                <PaywallButton
                  label={`Channel Pass · $${creator.channel_pass_price_usd}/mo +fees`}
                  sublabel={`Unlock everything from @${creator.username} for 30 days`}
                  loading={loading === "channel_pass"}
                  disabled={isAnyLoading}
                  variant="tertiary"
                  onClick={() => attempt("channel_pass")}
                />
              )}
            </div>

            {/* Error message */}
            {error && (
              <p
                className="text-xs text-center rounded-lg px-3 py-2"
                style={{ background: "rgba(255,69,58,0.12)", color: "#FF453A" }}
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Buy Ru$h top-up modal — opens when 402 is returned */}
      <BuyTokensModal
        isOpen={showBuyRush}
        onClose={handleBuyRushClose}
      />
    </>
  );
}

// ── Sub-component: individual action button ────────────────────────────────

interface PaywallButtonProps {
  label: string;
  sublabel?: string;
  loading: boolean;
  disabled: boolean;
  variant: "primary" | "secondary" | "tertiary";
  onClick: () => void;
}

function PaywallButton({
  label,
  sublabel,
  loading,
  disabled,
  variant,
  onClick,
}: PaywallButtonProps) {
  const baseClasses =
    "w-full flex flex-col items-center justify-center gap-0.5 px-4 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-150 min-h-[52px] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: "linear-gradient(135deg, #D4007A, #E69138)",
    },
    secondary: {
      background: "rgba(212,0,122,0.15)",
      border: "1px solid rgba(212,0,122,0.35)",
    },
    tertiary: {
      background: "rgba(255,255,255,0.07)",
      border: "1px solid rgba(255,255,255,0.12)",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
      style={variantStyles[variant]}
    >
      {loading ? (
        <Spinner />
      ) : (
        <>
          <span>{label}</span>
          {sublabel && (
            <span
              className="text-xs font-normal"
              style={{ color: "rgba(255,255,255,0.60)" }}
            >
              {sublabel}
            </span>
          )}
        </>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin text-white"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
