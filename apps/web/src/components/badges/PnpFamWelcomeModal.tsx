import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Crown } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  /** When true, dismissal does NOT persist to the backend (preview mode). */
  previewOnly?: boolean;
}

/**
 * PNP Fam welcome modal — one-time celebratory overlay when a fam member
 * lands on the app for the first time after being flagged. Auto-mounted by
 * <Layout> when `profile.pnptvFamWelcomePending === true`, or by the
 * `?preview=pnp-fam-welcome` query param for canary review.
 *
 * On "Enter": POSTs to /api/pnp-fam/welcome-dismiss (unless previewOnly),
 * then unmounts. The backend endpoint is idempotent and race-safe.
 */
export function PnpFamWelcomeModal({ open, onClose, previewOnly = false }: Props) {
  const t = useI18n();
  const [busy, setBusy] = useState(false);

  // Lock body scroll while the modal is visible.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Fixed set of embers — memo so positions/durations don't reshuffle on rerender.
  const embers = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const left = Math.random() * 100;
        const drift = (Math.random() - 0.5) * 120;
        const size = 4 + Math.random() * 8;
        const duration = 6 + Math.random() * 6;
        const delay = Math.random() * 6;
        return { i, left, drift, size, duration, delay };
      }),
    []
  );

  const handleEnter = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!previewOnly) {
        await fetch("/api/pnp-fam/welcome-dismiss", {
          method: "POST",
          credentials: "include",
        });
      }
    } catch (_) {
      // Non-fatal — user still gets to close the modal.
    } finally {
      setBusy(false);
      onClose();
    }
  };

  if (!open) return null;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pnp-fam-welcome-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-6"
    >
      {/* Layered animated background */}
      <div className="pnptv-fam-welcome-bg absolute inset-0 overflow-hidden">
        {embers.map((e) => (
          <span
            key={e.i}
            className="pnptv-fam-welcome-ember"
            style={
              {
                left: `${e.left}%`,
                width: e.size,
                height: e.size,
                animationDuration: `${e.duration}s`,
                animationDelay: `${e.delay}s`,
                "--drift": `${e.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-md w-full text-center flex flex-col items-center">
        {/* Crown */}
        <div className="pnptv-fam-welcome-crown mb-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #ffb27a 0%, #f7c9a7 50%, #ffe8d6 100%)",
              boxShadow: "0 8px 40px rgba(180,110,80,0.6), inset 0 0 0 2px rgba(255,255,255,0.4)",
              color: "#2a0f08",
            }}
          >
            <Crown size={52} strokeWidth={2.2} />
          </div>
        </div>

        {/* Eyebrow */}
        <p
          className="pnptv-fam-welcome-fade-up text-sm uppercase tracking-[0.28em] mb-1"
          style={{ animationDelay: "0.35s", color: "rgba(255,232,214,0.85)" }}
        >
          {t.profile.pnpFamWelcome.eyebrow}
        </p>

        {/* Wordmark */}
        <h1
          id="pnp-fam-welcome-title"
          className="pnptv-fam-welcome-fade-up text-5xl font-black mb-6"
          style={{
            animationDelay: "0.5s",
            background: "linear-gradient(135deg, #ffe8d6 0%, #ffb27a 50%, #f7c9a7 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.01em",
          }}
        >
          {t.profile.pnpFamWelcome.wordmark}
        </h1>

        {/* Body */}
        <p
          className="pnptv-fam-welcome-fade-up text-base leading-relaxed max-w-sm mx-auto mb-6"
          style={{ animationDelay: "0.75s", color: "rgba(255,240,225,0.92)" }}
        >
          {t.profile.pnpFamWelcome.body}
        </p>

        {/* Signature */}
        <p
          className="pnptv-fam-welcome-fade-up text-sm italic mb-10 whitespace-pre-line"
          style={{ animationDelay: "1s", color: "rgba(255,215,180,0.75)" }}
        >
          {t.profile.pnpFamWelcome.signature}
        </p>

        {/* Enter button */}
        <button
          type="button"
          onClick={handleEnter}
          disabled={busy}
          className="pnptv-fam-welcome-fade-up px-10 py-3.5 rounded-full text-base font-bold transition-transform hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{
            animationDelay: "1.25s",
            background: "linear-gradient(135deg, #ffb27a 0%, #f7c9a7 50%, #ffe8d6 100%)",
            color: "#2a0f08",
            boxShadow: "0 8px 24px rgba(180,110,80,0.45), inset 0 0 0 1px rgba(255,255,255,0.5)",
          }}
        >
          {t.profile.pnpFamWelcome.enter}
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default PnpFamWelcomeModal;
