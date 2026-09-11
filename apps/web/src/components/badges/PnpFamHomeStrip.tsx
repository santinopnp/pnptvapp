import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home as HomeIcon, User, Heart, Radio, MessageCircle, Layers, Settings, Sparkles, Gift } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { CRYSTAL_UI_ENABLED, getProfile } from "@/lib/api";
import { PnpFamFeedCustomizer, type Shortcut, type ShortcutType } from "./PnpFamFeedCustomizer";

const TYPE_ICON: Record<ShortcutType, React.ElementType> = {
  hangout: HomeIcon,
  creator: User,
  wellness: Heart,
  main_stage: Radio,
  dm: MessageCircle,
  channel: Layers,
};

/**
 * Fam-only home-page strip that sits above the feed:
 *   • Shortcuts row (up to 3 pinned tiles).
 *   • Fam ⇄ Standard feed toggle (persisted, never re-prompted).
 *   • Crystal Creator upsell card ("Support a Crystal Creator this month").
 *
 * Renders NOTHING for non-fam users. Standard-mode shows only the toggle
 * (a small chip that reads "Fam feed" and re-enables the strip).
 *
 * Fires CRM events (feed_toggle, shortcut_click, crystal_upsell_view/click,
 * customizer_saved) via /api/pnp-fam/event.
 */
export function PnpFamHomeStrip() {
  const { isAuthenticated, isLoading } = useAuth();
  const t = useI18n();
  const navigate = useNavigate();

  const [isFam, setIsFam] = useState(false);
  const [mode, setMode] = useState<"fam" | "standard">("fam");
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [upsellDismissed, setUpsellDismissed] = useState(false);
  const [topCreator, setTopCreator] = useState<{ username: string; firstName?: string | null; photoUrl?: string | null } | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    let cancelled = false;
    getProfile()
      .then((res) => {
        if (cancelled) return;
        const p = res?.profile as
          | (typeof res.profile & { pnptvFamFeedLayout?: { mode: "fam" | "standard"; shortcuts: Shortcut[] } })
          | undefined;
        if (!p?.pnptvFam) return;
        setIsFam(true);
        const layout = p.pnptvFamFeedLayout || { mode: "fam", shortcuts: [] };
        setMode(layout.mode);
        setShortcuts(Array.isArray(layout.shortcuts) ? layout.shortcuts.slice(0, 3) : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading]);

  // Fetch a Crystal Creator for the upsell card (first Crystal Creator in the fam list, fallback).
  useEffect(() => {
    if (!CRYSTAL_UI_ENABLED) return;
    if (!isFam || mode !== "fam") return;
    let cancelled = false;
    fetch("/api/creators?filter=crystal&limit=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const c = Array.isArray(json?.creators) ? json.creators[0] : null;
        if (c) {
          setTopCreator({ username: c.username, firstName: c.first_name, photoUrl: c.photo_url });
          logEvent("crystal_upsell_view", { creator: c.username });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFam, mode]);

  const logEvent = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    fetch("/api/pnp-fam/event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    }).catch(() => {});
  }, []);

  const saveLayout = useCallback(
    async (next: { mode: "fam" | "standard"; shortcuts: Shortcut[] }) => {
      setMode(next.mode);
      setShortcuts(next.shortcuts);
      await fetch("/api/pnp-fam/layout", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }).catch(() => {});
    },
    []
  );

  const handleToggle = useCallback(() => {
    const next: "fam" | "standard" = mode === "fam" ? "standard" : "fam";
    logEvent("feed_toggle", { to: next });
    saveLayout({ mode: next, shortcuts });
  }, [mode, shortcuts, logEvent, saveLayout]);

  const handleShortcutClick = useCallback(
    (s: Shortcut) => {
      logEvent("shortcut_click", { type: s.type, ref: s.ref });
      if (!s.ref) return;
      // Simple routing per shortcut type — refs are stored as either raw
      // ids or full paths depending on the type.
      let path = s.ref;
      if (s.type === "creator") {
        const u = s.ref.replace(/^@/, "").replace(/^\/c\//, "");
        path = `/c/${u}`;
      } else if (s.type === "hangout" && !s.ref.startsWith("/")) {
        path = `/hangout/${s.ref}`;
      } else if (s.type === "channel" && !s.ref.startsWith("/")) {
        path = `/channel/${s.ref}`;
      } else if (s.type === "dm" && !s.ref.startsWith("/")) {
        const u = s.ref.replace(/^@/, "");
        path = `/dm/${u}`;
      }
      navigate(path);
    },
    [navigate, logEvent]
  );

  const handleGiftCrystal = useCallback(() => {
    if (!topCreator) return;
    logEvent("crystal_upsell_click", { creator: topCreator.username });
    navigate(`/c/${topCreator.username}?action=gift-crystal`);
  }, [topCreator, navigate, logEvent]);

  const handleCustomizerSave = useCallback(
    async (next: Shortcut[]) => {
      await saveLayout({ mode: "fam", shortcuts: next });
      setCustomizerOpen(false);
    },
    [saveLayout]
  );

  const initials = useMemo(() => {
    if (!topCreator) return "";
    return (topCreator.firstName || topCreator.username || "?").trim().charAt(0).toUpperCase();
  }, [topCreator]);

  if (!isFam) return null;

  // Standard mode — just a small "return to Fam feed" chip.
  if (mode === "standard") {
    return (
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-transform hover:scale-[1.03] active:scale-95"
          style={{
            background: "linear-gradient(135deg, rgba(255,180,120,0.15), rgba(255,232,214,0.10))",
            border: "1px solid rgba(255,180,120,0.35)",
            color: "#ffe8d6",
          }}
        >
          <Sparkles size={12} />
          {t.profile.pnpFamFeedToggle.famMode}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-3">
      {/* Toggle + customize row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
            style={{
              background: "linear-gradient(135deg, #ffb27a, #ffe8d6)",
              color: "#2a0f08",
              boxShadow: "0 2px 8px rgba(180,110,80,0.35)",
            }}
          >
            <Sparkles size={10} strokeWidth={2.4} />
            {t.profile.pnpFamFeedToggle.famMode}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCustomizerOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold hover:bg-white/10 transition-colors"
            style={{ color: "rgba(255,240,225,0.85)", border: "1px solid rgba(255,180,120,0.35)" }}
          >
            <Settings size={11} />
            {t.profile.pnpFamFeedToggle.customize}
          </button>
          <button
            type="button"
            onClick={handleToggle}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold hover:bg-white/10 transition-colors"
            style={{ color: "rgba(255,240,225,0.7)" }}
          >
            {t.profile.pnpFamFeedToggle.standardMode}
          </button>
        </div>
      </div>

      {/* Shortcuts row */}
      {shortcuts.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest mb-1.5 opacity-70" style={{ color: "#ffe8d6" }}>
            {t.profile.pnpFamFeedToggle.shortcutsHeader}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {shortcuts.map((s, i) => {
              const Icon = TYPE_ICON[s.type];
              return (
                <button
                  key={`${s.type}-${s.ref}-${i}`}
                  type="button"
                  onClick={() => handleShortcutClick(s)}
                  className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl transition-transform hover:scale-[1.03] active:scale-95"
                  style={{
                    background: "rgba(255,180,120,0.10)",
                    border: "1px solid rgba(255,180,120,0.28)",
                    color: "#ffe8d6",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #ffb27a, #ffe8d6)", color: "#2a0f08" }}
                  >
                    <Icon size={16} />
                  </div>
                  <span className="text-[11px] font-semibold truncate max-w-full px-2">
                    {s.label || s.ref}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Crystal Creator upsell — never asks fam to buy for themselves, only
          to fund a creator they care about. */}
      {CRYSTAL_UI_ENABLED && topCreator && !upsellDismissed && (
        <div
          className="rounded-2xl p-3 flex items-start gap-3"
          style={{
            background: "linear-gradient(160deg, rgba(60,26,77,0.55), rgba(20,10,30,0.75))",
            border: "1px solid rgba(216,185,255,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div className="shrink-0">
            {topCreator.photoUrl ? (
              <img
                src={topCreator.photoUrl}
                alt=""
                className="w-11 h-11 rounded-full object-cover"
                style={{ boxShadow: "0 0 0 2px rgba(216,185,255,0.6)" }}
              />
            ) : (
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-black text-white"
                style={{ background: "linear-gradient(135deg, #6b4c7f, #3c1a4d)" }}
              >
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold" style={{ color: "#f5f0ff" }}>
              {t.profile.pnpFamUpsell.supportTitle}
            </div>
            <div className="text-[12px] mt-0.5 leading-snug" style={{ color: "rgba(245,240,255,0.85)" }}>
              {t.profile.pnpFamUpsell.supportBody}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleGiftCrystal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-transform hover:scale-[1.03] active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #d8b9ff, #6b4c7f)",
                  color: "#0a0612",
                  boxShadow: "0 2px 8px rgba(60,26,77,0.5)",
                }}
              >
                <Gift size={12} />
                {t.profile.pnpFamUpsell.giftCrystalTo.replace(
                  "{name}",
                  "@" + topCreator.username
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUpsellDismissed(true);
                  logEvent("crystal_upsell_click", { action: "dismiss" });
                }}
                className="text-xs font-semibold px-2 py-1 rounded-full hover:bg-white/10 transition-colors"
                style={{ color: "rgba(245,240,255,0.7)" }}
              >
                {t.profile.pnpFamUpsell.dismiss}
              </button>
            </div>
          </div>
        </div>
      )}

      <PnpFamFeedCustomizer
        open={customizerOpen}
        initialShortcuts={shortcuts}
        onSave={handleCustomizerSave}
        onSkip={() => setCustomizerOpen(false)}
      />
    </div>
  );
}

export default PnpFamHomeStrip;
