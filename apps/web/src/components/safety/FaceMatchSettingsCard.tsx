import React, { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getFaceMatchConsent, grantFaceMatchConsent, withdrawFaceMatchConsent } from "@/lib/api";

/** Privacy settings card: give or withdraw the optional face matching consent. */
export function FaceMatchSettingsCard() {
  const t = useI18n().safety;
  const [consented, setConsented] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFaceMatchConsent()
      .then((s) => { if (!cancelled) setConsented(s.consented); })
      .catch(() => { if (!cancelled) setConsented(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async (next: boolean) => {
    if (!next && !window.confirm(t.faceMatchTurnOffConfirm)) return;
    setSaving(true);
    setError(null);
    try {
      const s = next ? await grantFaceMatchConsent() : await withdrawFaceMatchConsent();
      setConsented(s.consented);
      setChecked(false);
    } catch {
      setError(t.faceMatchSaveError);
    } finally {
      setSaving(false);
    }
  };

  if (consented === null) return null;

  return (
    <div className="glass-card-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">{t.faceMatchSettingsTitle}</h2>
        <span className="text-[10px] text-white/40">{t.faceMatchOptionalTag}</span>
      </div>
      <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
        {consented ? t.faceMatchSettingsOn : t.faceMatchSettingsOff}
      </p>

      {!consented && (
        <label className="flex items-start gap-2 text-xs text-white/80 cursor-pointer mb-3">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
          <span>{t.faceMatchCheckbox}</span>
        </label>
      )}

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <button
        onClick={() => save(!consented)}
        disabled={saving || (!consented && !checked)}
        className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40"
        style={consented
          ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }
          : { background: "linear-gradient(135deg,#D4007A,#E69138)" }}
      >
        {saving ? "…" : consented ? t.faceMatchTurnOff : t.faceMatchTurnOn}
      </button>
    </div>
  );
}
