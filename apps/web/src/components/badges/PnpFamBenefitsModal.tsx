import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Unlock, HandCoins, LayoutGrid, MessageSquareHeart, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface Props {
  open: boolean;
  onEnter: () => void;   // "Set up my feed" → opens customizer next
  onSkip: () => void;    // "Later" → dismisses without customizer
  previewOnly?: boolean;
}

/**
 * Second one-time modal in the PNP Fam onboarding sequence. Reveals what
 * being Fam unlocks + the creator-compensation trust clause.
 * Same visual language as PnpFamWelcomeModal (rose-gold shimmer + embers)
 * so the two land as chapters of one moment.
 */
export function PnpFamBenefitsModal({ open, onEnter, onSkip, previewOnly = false }: Props) {
  const t = useI18n();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const embers = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        i,
        left: Math.random() * 100,
        drift: (Math.random() - 0.5) * 120,
        size: 4 + Math.random() * 7,
        duration: 6 + Math.random() * 6,
        delay: Math.random() * 6,
      })),
    []
  );

  const dismiss = async (setup: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!previewOnly) {
        await fetch("/api/pnp-fam/benefits-dismiss", { method: "POST", credentials: "include" });
      }
    } catch (_) {
      // non-fatal
    } finally {
      setBusy(false);
      if (setup) onEnter();
      else onSkip();
    }
  };

  if (!open) return null;

  const benefits = [
    { Icon: Unlock,              title: t.profile.pnpFamBenefits.benefit1Title, body: t.profile.pnpFamBenefits.benefit1Body },
    { Icon: HandCoins,           title: t.profile.pnpFamBenefits.benefit2Title, body: t.profile.pnpFamBenefits.benefit2Body },
    { Icon: LayoutGrid,          title: t.profile.pnpFamBenefits.benefit3Title, body: t.profile.pnpFamBenefits.benefit3Body },
    { Icon: MessageSquareHeart,  title: t.profile.pnpFamBenefits.benefit4Title, body: t.profile.pnpFamBenefits.benefit4Body },
    { Icon: Sparkles,            title: t.profile.pnpFamBenefits.benefit5Title, body: t.profile.pnpFamBenefits.benefit5Body },
  ];

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pnp-fam-benefits-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-6 overflow-y-auto"
    >
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

      <div className="relative z-10 max-w-lg w-full text-center flex flex-col items-center py-8">
        {/* Header — small, since the body carries the payload */}
        <p className="pnptv-fam-welcome-fade-up text-xs uppercase tracking-[0.28em] mb-1" style={{ color: "rgba(255,232,214,0.85)" }}>
          {t.profile.pnpFamBenefits.eyebrow}{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #ffe8d6, #ffb27a)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontWeight: 800,
            }}
          >
            {t.profile.pnpFamBenefits.wordmarkA}
          </span>{" "}
          {t.profile.pnpFamBenefits.eyebrowB}
        </p>

        {/* Benefit cards */}
        <div className="mt-6 w-full flex flex-col gap-3">
          {benefits.map((b, i) => (
            <div
              key={i}
              id={i === 0 ? "pnp-fam-benefits-title" : undefined}
              className="pnptv-fam-welcome-fade-up flex items-start gap-3 text-left rounded-2xl p-3.5"
              style={{
                animationDelay: `${0.15 + i * 0.12}s`,
                background: "rgba(20,10,6,0.55)",
                border: "1px solid rgba(255,180,120,0.28)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: "linear-gradient(135deg, #ffb27a 0%, #f7c9a7 50%, #ffe8d6 100%)",
                  color: "#2a0f08",
                  boxShadow: "0 4px 12px rgba(180,110,80,0.35)",
                }}
              >
                <b.Icon size={20} strokeWidth={2.3} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold" style={{ color: "#ffe8d6" }}>{b.title}</div>
                <div className="text-[13px] leading-snug mt-0.5" style={{ color: "rgba(255,240,225,0.85)" }}>{b.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Consent clause */}
        <p
          className="pnptv-fam-welcome-fade-up text-[11px] italic mt-5 max-w-md leading-snug"
          style={{ animationDelay: "0.9s", color: "rgba(255,215,180,0.7)" }}
        >
          {t.profile.pnpFamBenefits.consentClause}
        </p>

        {/* Buttons */}
        <div className="pnptv-fam-welcome-fade-up mt-6 flex flex-col sm:flex-row gap-3" style={{ animationDelay: "1.05s" }}>
          <button
            type="button"
            onClick={() => dismiss(true)}
            disabled={busy}
            className="px-8 py-3 rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95 disabled:opacity-70 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{
              background: "linear-gradient(135deg, #ffb27a 0%, #f7c9a7 50%, #ffe8d6 100%)",
              color: "#2a0f08",
              boxShadow: "0 8px 24px rgba(180,110,80,0.45), inset 0 0 0 1px rgba(255,255,255,0.5)",
            }}
          >
            {t.profile.pnpFamBenefits.setupFeed}
          </button>
          <button
            type="button"
            onClick={() => dismiss(false)}
            disabled={busy}
            className="px-6 py-3 rounded-full text-sm font-semibold transition-transform hover:scale-105 active:scale-95 disabled:opacity-70 outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style={{
              background: "transparent",
              color: "rgba(255,240,225,0.85)",
              border: "1px solid rgba(255,180,120,0.35)",
            }}
          >
            {t.profile.pnpFamBenefits.later}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default PnpFamBenefitsModal;
