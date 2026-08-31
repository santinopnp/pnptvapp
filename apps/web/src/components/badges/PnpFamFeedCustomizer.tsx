import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Home, User, Heart, Radio, MessageCircle, Layers } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type ShortcutType = "hangout" | "creator" | "wellness" | "channel" | "main_stage" | "dm";

export interface Shortcut {
  type: ShortcutType;
  ref: string | null;
  label: string | null;
}

interface Props {
  open: boolean;
  initialShortcuts?: Shortcut[];
  onSave: (shortcuts: Shortcut[]) => Promise<void> | void;
  onSkip: () => void;
  previewOnly?: boolean;
}

const MAX = 3;

const TYPE_ICON: Record<ShortcutType, React.ComponentType<{ size?: number }>> = {
  hangout: Home,
  creator: User,
  wellness: Heart,
  main_stage: Radio,
  dm: MessageCircle,
  channel: Layers,
};

const STATIC_REFS: Record<ShortcutType, { ref: string; label: string } | null> = {
  hangout: null,
  creator: null,
  channel: null,
  dm: null,
  wellness: { ref: "/wellness", label: "Wellness Center" },
  main_stage: { ref: "/main-stage", label: "Main Stage" },
};

/**
 * One-time modal (part of the Fam onboarding sequence) that lets a member
 * pin up to 3 shortcuts to the top of their feed. Broader menu — any 3 from
 * hangout / creator / wellness / channel / main_stage / dm.
 *
 * For types with dynamic refs (hangout, creator, channel, dm) we show a
 * small free-text input for now. A picker with autocomplete comes in a
 * follow-up — for the founding 3 this is enough (they know their handles).
 */
export function PnpFamFeedCustomizer({ open, initialShortcuts = [], onSave, onSkip, previewOnly = false }: Props) {
  const t = useI18n();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(initialShortcuts);
  const [pickingType, setPickingType] = useState<ShortcutType | null>(null);
  const [refInput, setRefInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShortcuts(initialShortcuts);
    setPickingType(null);
    setRefInput("");
    setLabelInput("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addShortcut = useCallback(
    (type: ShortcutType) => {
      if (shortcuts.length >= MAX) return;
      const staticEntry = STATIC_REFS[type];
      if (staticEntry) {
        // Static types (wellness, main_stage) — one-tap add.
        if (shortcuts.some((s) => s.type === type)) return;
        setShortcuts((s) => [...s, { type, ref: staticEntry.ref, label: staticEntry.label }]);
        return;
      }
      setPickingType(type);
      setRefInput("");
      setLabelInput("");
    },
    [shortcuts]
  );

  const confirmDynamic = useCallback(() => {
    if (!pickingType) return;
    const ref = refInput.trim();
    const label = labelInput.trim() || ref;
    if (!ref) return;
    setShortcuts((s) => [...s, { type: pickingType, ref, label }]);
    setPickingType(null);
    setRefInput("");
    setLabelInput("");
  }, [pickingType, refInput, labelInput]);

  const removeAt = useCallback((idx: number) => {
    setShortcuts((s) => s.filter((_, i) => i !== idx));
  }, []);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(shortcuts);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const types: ShortcutType[] = ["hangout", "creator", "wellness", "channel", "main_stage", "dm"];
  const typeLabels = t.profile.pnpFamCustomizer.shortcutTypes;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pnp-fam-customizer-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-6"
      style={{ background: "rgba(20,10,6,0.85)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-3xl p-6 flex flex-col gap-4"
        style={{
          background: "linear-gradient(160deg, #1a0d06 0%, #2f1a10 100%)",
          border: "1px solid rgba(255,180,120,0.35)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,180,120,0.15) inset",
        }}
      >
        <div>
          <h2 id="pnp-fam-customizer-title" className="text-2xl font-black" style={{ color: "#ffe8d6" }}>
            {t.profile.pnpFamCustomizer.title}
          </h2>
          <p className="text-sm mt-1" style={{ color: "rgba(255,240,225,0.75)" }}>
            {t.profile.pnpFamCustomizer.subtitle}
          </p>
        </div>

        {/* Chosen shortcuts */}
        {shortcuts.length > 0 && (
          <ul className="flex flex-col gap-2">
            {shortcuts.map((s, i) => {
              const Icon = TYPE_ICON[s.type];
              return (
                <li
                  key={`${s.type}-${s.ref}-${i}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{
                    background: "rgba(255,180,120,0.10)",
                    border: "1px solid rgba(255,180,120,0.28)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #ffb27a, #ffe8d6)", color: "#2a0f08" }}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "#ffe8d6" }}>
                      {s.label || s.ref || typeLabels[s.type]}
                    </div>
                    <div className="text-[11px] opacity-70" style={{ color: "rgba(255,240,225,0.7)" }}>
                      {typeLabels[s.type]}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={t.profile.pnpFamCustomizer.remove}
                    className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                    style={{ color: "rgba(255,240,225,0.75)" }}
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Type picker (or dynamic-input state) */}
        {shortcuts.length < MAX && (
          <div>
            {pickingType ? (
              <div className="flex flex-col gap-2">
                <div className="text-xs uppercase tracking-wider" style={{ color: "rgba(255,232,214,0.8)" }}>
                  {typeLabels[pickingType]}
                </div>
                <input
                  type="text"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  placeholder={
                    pickingType === "creator" || pickingType === "dm"
                      ? "@username or /c/username"
                      : pickingType === "hangout"
                        ? "/hangout/… or hangout id"
                        : pickingType === "channel"
                          ? "channel id"
                          : t.profile.pnpFamCustomizer.searchPlaceholder
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    border: "1px solid rgba(255,180,120,0.35)",
                    color: "#ffe8d6",
                  }}
                  autoFocus
                />
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    border: "1px solid rgba(255,180,120,0.35)",
                    color: "#ffe8d6",
                  }}
                />
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={confirmDynamic}
                    disabled={!refInput.trim()}
                    className="flex-1 py-2 rounded-lg text-sm font-bold disabled:opacity-40"
                    style={{
                      background: "linear-gradient(135deg, #ffb27a, #ffe8d6)",
                      color: "#2a0f08",
                    }}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickingType(null)}
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ background: "transparent", color: "rgba(255,240,225,0.8)", border: "1px solid rgba(255,180,120,0.35)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-xs uppercase tracking-wider mb-2" style={{ color: "rgba(255,232,214,0.8)" }}>
                  {t.profile.pnpFamCustomizer.addShortcut}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {types.map((tp) => {
                    const Icon = TYPE_ICON[tp];
                    const already = shortcuts.some((s) => s.type === tp) && STATIC_REFS[tp];
                    return (
                      <button
                        key={tp}
                        type="button"
                        onClick={() => addShortcut(tp)}
                        disabled={!!already}
                        className="flex flex-col items-center gap-1 py-3 rounded-xl text-[11px] font-semibold transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-40"
                        style={{
                          background: "rgba(255,180,120,0.08)",
                          border: "1px solid rgba(255,180,120,0.28)",
                          color: "#ffe8d6",
                        }}
                      >
                        <Icon size={20} />
                        {typeLabels[tp]}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {shortcuts.length >= MAX && (
          <div className="text-[11px] italic text-center" style={{ color: "rgba(255,215,180,0.7)" }}>
            {t.profile.pnpFamCustomizer.maxReached}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex-1 py-3 rounded-full text-sm font-bold transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-70"
            style={{
              background: "linear-gradient(135deg, #ffb27a 0%, #f7c9a7 50%, #ffe8d6 100%)",
              color: "#2a0f08",
              boxShadow: "0 8px 24px rgba(180,110,80,0.45), inset 0 0 0 1px rgba(255,255,255,0.5)",
            }}
          >
            {t.profile.pnpFamCustomizer.save}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="px-5 py-3 rounded-full text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-95"
            style={{
              background: "transparent",
              color: "rgba(255,240,225,0.85)",
              border: "1px solid rgba(255,180,120,0.35)",
            }}
          >
            {t.profile.pnpFamCustomizer.skip}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PnpFamFeedCustomizer;
