import { useMemo, useState } from "react";
import { TipRushRail } from "@/components/payments/TipRushRail";
import { useAuth } from "@/hooks/useAuth";

// Santino's canonical user ID — mirrors SANTINO_USER_ID in
// apps/backend/config/monetizationConfig.js. Recipient for the temporary
// Main Stage tip button.
const SANTINO_USER_ID = "8599671840";

// Feature window: enabled only until 2026-08-10 05:00 UTC
// (≈ end of Aug 9 for the platform's operating timezone).
const EXPIRES_AT_MS = Date.UTC(2026, 7, 10, 5, 0, 0);

interface Props {
  isParticipant: boolean;
}

/**
 * Floating "Tip Santino 💎" trigger for the Main Stage. Opens a compact
 * TipRushRail overlay (30/60/90/120/150 Ru$h) locked to Santino as the
 * recipient. Auto-hides after the launch window closes and hides for
 * Santino himself (no self-tips) and for anonymous viewers.
 *
 * Zero-balance + no-wallet walkthroughs are inherited from TipRushRail.
 */
export function TipSantinoTrigger({ isParticipant }: Props) {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();

  const isSantino = useMemo(
    () =>
      String(user?.dbId || user?.id || "") === SANTINO_USER_ID ||
      String(user?.telegramId || "") === SANTINO_USER_ID,
    [user?.dbId, user?.id, user?.telegramId]
  );

  // Feature window closed → render nothing.
  if (Date.now() > EXPIRES_AT_MS) return null;
  if (!isAuthenticated) return null;
  if (isSantino) return null;
  if (!isParticipant) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send Ru$h to Santino"
        className="fixed z-40 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-white shadow-lg transition-transform active:scale-95"
        style={{
          right: "calc(0.75rem + env(safe-area-inset-right, 0px))",
          bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
          background: "linear-gradient(135deg, #D4007A, #E69138)",
          boxShadow: "0 6px 20px rgba(212,0,122,0.45)",
        }}
      >
        <span aria-hidden>💎</span>
        <span>Tip Santino</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Send Ru$h to Santino"
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{
              background: "var(--pnp-surface, #1C1C1E)",
              border: "1px solid rgba(212,0,122,0.30)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-semibold text-white">
                Send Ru$h to Santino 💎
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-white/50 hover:text-white text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <TipRushRail
              creatorId={SANTINO_USER_ID}
              creatorName="Santino"
              mode="ledger"
              variant="full"
              showMessage
              showBalance
              onSuccess={() => {
                setTimeout(() => setOpen(false), 1600);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default TipSantinoTrigger;
