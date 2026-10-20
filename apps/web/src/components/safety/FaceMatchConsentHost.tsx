import React, { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { grantFaceMatchConsent } from "@/lib/api";
import { installApiResponseEvents, onFaceMatchConsentRequired } from "@/lib/apiResponseEvents";

/**
 * Shows the optional face matching prompt whenever the backend blocks a
 * photo/video upload or go-live for lack of consent. "Not now" just closes
 * it — declining never penalises the member.
 */
export function FaceMatchConsentHost() {
  const t = useI18n().safety;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    installApiResponseEvents();
    return onFaceMatchConsentRequired(() => {
      setAllowed(false);
      setError(null);
      setOpen(true);
    });
  }, []);

  if (!open) return null;

  const allow = async () => {
    setSaving(true);
    setError(null);
    try {
      await grantFaceMatchConsent();
      setAllowed(true);
    } catch {
      setError(t.faceMatchSaveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="face-match-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 space-y-3"
        style={{ background: "linear-gradient(160deg,#1a1a2e 0%,#0f0f1a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <p id="face-match-title" className="text-sm font-bold text-white">{t.faceMatchPromptTitle}</p>

        {allowed ? (
          <>
            <p className="text-xs" style={{ color: "#8E8E93" }}>{t.faceMatchAllowed}</p>
            <button
              onClick={() => setOpen(false)}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
            >
              OK
            </button>
          </>
        ) : (
          <>
            <p className="text-xs" style={{ color: "#8E8E93" }}>{t.faceMatchPromptBody}</p>
            <p className="text-xs" style={{ color: "#8E8E93" }}>{t.faceMatchPromptOptional}</p>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="block text-xs underline" style={{ color: "#E69138" }}>
              {t.faceMatchReadPolicy}
            </a>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="space-y-2 pt-1">
              <button
                onClick={allow}
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
              >
                {saving ? "…" : t.faceMatchAllow}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white/80"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {t.faceMatchNotNow}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
