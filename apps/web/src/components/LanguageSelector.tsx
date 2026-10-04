import React, { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, setGuestLang, type Lang } from "@/lib/i18n";
import { updateLanguage } from "@/lib/api";

const LANG_OPTIONS: { code: Lang; flag: string; label: string }[] = [
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
  { code: "th", flag: "🇹🇭", label: "ไทย" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "vi", flag: "🇻🇳", label: "Tiếng Việt" },
  { code: "id", flag: "🇮🇩", label: "Indonesia" },
  { code: "ar", flag: "🇸🇦", label: "العربية" },
  { code: "zhTW", flag: "🇹🇼", label: "中文（繁）" },
];

interface LanguageSelectorProps {
  /** "topbar" opens dropdown downward, "sidebar" opens upward */
  position?: "topbar" | "sidebar";
  /** "chip" renders a smaller flag-only trigger suited for mobile topbar */
  variant?: "default" | "chip";
}

export function LanguageSelector({ position = "topbar", variant = "default" }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, setUserLanguage } = useAuth();
  const { lang: currentLang } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = useCallback(async (code: Lang) => {
    setOpen(false);
    setGuestLang(code);
    // Remember the user chose explicitly so the one-time native-lang nudge
    // doesn't fire on a later session.
    try { localStorage.setItem("pnptv_lang_prompted", "1"); } catch { /* ignore */ }
    if (isAuthenticated) {
      // Update local user state immediately so the whole app re-renders in the
      // new language without a page reload. Persist to the backend in the
      // background — a failed save is non-fatal, the UI already reflects it.
      setUserLanguage(code);
      try { await updateLanguage(code); } catch { /* silent */ }
    }
  }, [isAuthenticated, setUserLanguage]);

  const currentFlag = LANG_OPTIONS.find((l) => l.code === currentLang)?.flag || "🌐";

  const triggerClasses = variant === "chip"
    ? "w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors hover:bg-white/10"
    : "w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors hover:bg-white/10";

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={triggerClasses}
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
        aria-label="Change language"
        aria-expanded={open}
      >
        <span className={variant === "chip" ? "text-xs leading-none" : "text-sm leading-none"}>{currentFlag}</span>
      </button>

      {open && (
        <div
          className={`absolute z-50 rounded-xl py-1.5 max-h-72 overflow-y-auto scrollbar-hide ${
            position === "sidebar"
              ? "bottom-10 left-0"
              : "right-0 top-10"
          }`}
          style={{
            background: "var(--pnp-surface, #1C1C1E)",
            border: "1px solid rgba(255,255,255,0.12)",
            minWidth: "160px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {LANG_OPTIONS.map((l) => (
            <button
              key={l.code}
              onClick={() => handleSelect(l.code)}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-sm transition-colors hover:bg-white/5"
              style={{ color: l.code === currentLang ? "#D4007A" : "#ccc" }}
            >
              <span className="text-base">{l.flag}</span>
              <span className="truncate">{l.label}</span>
              {l.code === currentLang && (
                <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
