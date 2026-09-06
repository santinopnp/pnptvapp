import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTier } from "@/hooks/useTier";
import { useAuth } from "@/hooks/useAuth";
import { getRewardedAdConfig, getRewardedAdActive } from "@/lib/api";
import { trackAdEvent as trackClientEvent } from "@/components/AdSlot";

/**
 * "Watch 3 ads → 24h Prime" rewarded surface. Renders a compact card that
 * links to /subscribe (3-day Prime trial) OR, when the operator flips the
 * surface on via server-side EXO_VAST_URL_PRIME_TRIAL_24H, offers the ad-
 * rewarded 24h unlock flow.
 *
 * Full VAST-in-modal IMA integration is a follow-up. For MVP we surface the
 * upsell and route the click into the existing 3-day Prime trial flow —
 * still the strongest conversion path without any player work.
 */
export function PrimeRewardCard({ className }: { className?: string }) {
  const { isPrime, isAdmin, isFree } = useTier();
  const { isAuthenticated } = useAuth();
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [activeUntil, setActiveUntil] = useState<string | null>(null);

  useEffect(() => {
    if (isPrime || isAdmin) return;
    if (!isAuthenticated) return;
    // Check server-side rewarded config for the prime_trial_24h surface —
    // only render the "watch an ad" language if the surface is truly wired
    // (operator has an EXO_VAST_URL_PRIME_TRIAL_24H set + flag on).
    getRewardedAdConfig("prime_trial_24h").then((r) => {
      setSurfaceReady(r.success && r.enabled === true);
    }).catch(() => setSurfaceReady(false));
    getRewardedAdActive("prime_trial_24h").then((r) => {
      if (r.success && r.active && r.expires_at) setActiveUntil(r.expires_at);
    }).catch(() => {});
  }, [isPrime, isAdmin, isAuthenticated]);

  // Hide for Prime / admin (they already have full access) and for members
  // paying tier (Prime CTA is redundant — they upgrade a different way).
  if (isPrime || isAdmin) return null;
  if (!isFree && isAuthenticated) return null;

  // Currently active unlock — show time left instead of the CTA.
  if (activeUntil) {
    const secsLeft = Math.max(0, Math.floor((new Date(activeUntil).getTime() - Date.now()) / 1000));
    const hoursLeft = Math.floor(secsLeft / 3600);
    return (
      <div
        className={`rounded-2xl p-4 text-white ${className ?? ""}`}
        style={{
          background: "linear-gradient(160deg, #14091F 0%, #24102E 100%)",
          border: "1px solid rgba(212,0,122,0.3)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">★</span>
          <div className="flex-1">
            <div className="text-sm font-bold">PRIME activo</div>
            <div className="text-[11px] text-white/60">Termina en {hoursLeft}h — disfrutalo</div>
          </div>
        </div>
      </div>
    );
  }

  const heading = surfaceReady
    ? "Mirá 3 ads → 24h de PRIME free"
    : "Empezá 3 días de PRIME free";
  const subheading = surfaceReady
    ? "Sin cargo. Sin tarjeta. Solo 3 ads cortos."
    : "Cero ads. Todo desbloqueado. Sin tarjeta si cancelás en 3 días.";
  const ctaText = surfaceReady ? "Ver primer ad" : "Empezar trial";
  const ctaHref = surfaceReady
    ? "/subscribe?ref=prime-reward-card&plan=trial"  // TODO(fase-5): real VAST-in-modal flow
    : "/subscribe?ref=prime-reward-card&plan=trial";

  return (
    <div
      className={`rounded-2xl p-4 text-white ${className ?? ""}`}
      style={{
        background: "linear-gradient(160deg, #14091F 0%, #24102E 100%)",
        border: "1px solid rgba(212,0,122,0.30)",
      }}
      ref={(el) => {
        if (el && !el.dataset.tracked) {
          el.dataset.tracked = "1";
          trackClientEvent("prime_reward_card", "upgrade_shown", { surface: surfaceReady ? "rewarded" : "trial" });
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-lg font-black"
          style={{ background: "linear-gradient(135deg, #D4007A, #FF6B9D)", color: "#fff" }}
          aria-hidden="true"
        >★</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold leading-snug">{heading}</div>
          <div className="text-[11px] text-white/60 mt-0.5 leading-relaxed">{subheading}</div>
        </div>
      </div>
      <Link
        to={ctaHref}
        onClick={() => trackClientEvent("prime_reward_card", "upgrade_click", { surface: surfaceReady ? "rewarded" : "trial" })}
        className="mt-3 block w-full text-center py-2.5 rounded-xl text-xs font-bold transition-transform active:scale-[0.98]"
        style={{ background: "linear-gradient(90deg, #D4007A 0%, #FF6B9D 100%)", color: "#fff", boxShadow: "0 4px 14px rgba(212,0,122,0.25)" }}
      >
        {ctaText}
      </Link>
    </div>
  );
}

export default PrimeRewardCard;
