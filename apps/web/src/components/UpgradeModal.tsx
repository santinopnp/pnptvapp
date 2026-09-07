import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trackAdEvent } from "@/components/AdSlot";

interface Props {
  /** Slot id that triggered the modal (used for attribution). */
  slot: string;
  /** 'popunder_replacement' — offered on the click that would open a popunder.
   *  'interstitial' — offered after N impressions in a session. */
  mode: "popunder_replacement" | "interstitial";
  /** Called on dismiss. For popunder_replacement, the AdSlot falls back to
   *  the actual popunder if the user explicitly says "no thanks". */
  onDismiss: (reason: "closed" | "fallback_popunder") => void;
}

/**
 * Full-screen upsell shown INSTEAD of a popunder or after N impressions.
 * Copy leads with desire (feedback_marketing_copy_desire_first): "keep the
 * experience clean" rather than "your card was declined". Two CTAs:
 * primary = subscribe (monthly), secondary = see all plans. No payment brand
 * names in copy (feedback_payment_brand_names_hidden).
 */
export function UpgradeModal({ slot, mode, onDismiss }: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    trackAdEvent(slot, "upgrade_shown", { surface: mode });
    // Lock body scroll while modal is up
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [slot, mode]);

  const goToPrime = () => {
    trackAdEvent(slot, "upgrade_click", { surface: mode, plan: "monthly" });
    navigate(`/subscribe?ref=upgrade-${mode}-${encodeURIComponent(slot)}&plan=monthly`);
  };
  const goToMonthly = () => {
    trackAdEvent(slot, "upgrade_click", { surface: mode, plan: "plans" });
    navigate(`/subscribe?ref=upgrade-${mode}-${encodeURIComponent(slot)}`);
  };
  const dismissSoft = () => onDismiss("closed");
  const dismissFallback = () => onDismiss("fallback_popunder");

  const isPopunderReplacement = mode === "popunder_replacement";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
      style={{ background: "rgba(6, 4, 12, 0.88)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-3xl p-6 text-white shadow-2xl"
        style={{
          background: "linear-gradient(160deg, #14091F 0%, #24102E 45%, #0F0817 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <button
          type="button"
          onClick={dismissSoft}
          aria-label="Cerrar"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          ✕
        </button>

        <div className="text-center space-y-3 mt-2">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase"
            style={{ background: "linear-gradient(90deg, #D4007A, #FF6B9D)", color: "#fff" }}
          >
            ★ PRIME
          </div>
          <h2 id="upgrade-modal-title" className="text-2xl font-bold leading-tight">
            Miralo todo sin cortes
          </h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Cero ads. Todo el contenido PRIME. Todas las funciones desbloqueadas. Desde $15/mes, cancelá cuando quieras.
          </p>
        </div>

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={goToPrime}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-transform active:scale-[0.98]"
            style={{ background: "linear-gradient(90deg, #D4007A 0%, #FF6B9D 100%)", boxShadow: "0 6px 24px rgba(212,0,122,0.35)" }}
          >
            Suscribirme a PRIME
          </button>
          <button
            type="button"
            onClick={goToMonthly}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white/90 transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            Ver todos los planes
          </button>
        </div>

        <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-white/40">
          {isPopunderReplacement ? (
            <>
              <button
                type="button"
                onClick={dismissFallback}
                className="underline hover:text-white/70 transition-colors"
              >
                No, gracias
              </button>
              <span>·</span>
            </>
          ) : null}
          <button
            type="button"
            onClick={dismissSoft}
            className="underline hover:text-white/70 transition-colors"
          >
            Recordarme mañana
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpgradeModal;
