import React, { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { acceptPolicyUpdate, getPolicyUpdateStatus } from "@/lib/api";

/**
 * Asks existing members to accept the updated Terms + Privacy Policy (safety
 * scanning). Face matching is deliberately NOT bundled here — it is a
 * separate, optional consent asked at upload time.
 */
export function PolicyUpdateModal() {
  const t = useI18n().safety;
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPolicyUpdateStatus()
      .then((s) => { if (!cancelled && s.needsUpdate) setOpen(true); })
      .catch(() => { /* non-blocking: retried on next load */ });
    return () => { cancelled = true; };
  }, []);

  if (!open) return null;

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      await acceptPolicyUpdate();
      setOpen(false);
    } catch {
      setError(t.policyUpdateError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-update-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto"
        style={{ background: "linear-gradient(160deg,#1a1a2e 0%,#0f0f1a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <p id="policy-update-title" className="text-sm font-bold text-white">{t.policyUpdateTitle}</p>
        <p className="text-xs" style={{ color: "#8E8E93" }}>{t.policyUpdateBody}</p>
        <p className="text-xs" style={{ color: "#8E8E93" }}>{t.policyUpdateFaceMatch}</p>
        <div className="flex gap-4 text-xs">
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#E69138" }}>{t.policyUpdateTerms}</a>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#E69138" }}>{t.policyUpdatePrivacy}</a>
        </div>
        <label className="flex items-start gap-2 text-xs text-white cursor-pointer">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
          <span>{t.policyUpdateCheckbox}</span>
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={accept}
          disabled={!checked || saving}
          className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
        >
          {saving ? t.policyUpdateSaving : t.policyUpdateAccept}
        </button>
      </div>
    </div>
  );
}
