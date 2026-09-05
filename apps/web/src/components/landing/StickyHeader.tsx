import React, { useEffect, useState } from "react";
import { LanguageSelector } from "@/components/LanguageSelector";

interface StickyHeaderProps {
  lang: "en" | "es" | string;
  onSignIn: () => void;
}

const copy = {
  en: { signIn: "Sign in" },
  es: { signIn: "Iniciar sesión" },
};

function pick(lang: string) {
  return lang === "es" ? copy.es : copy.en;
}

export function StickyHeader({ lang, onSignIn }: StickyHeaderProps) {
  const c = pick(lang);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(8,8,8,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
      }}
    >
      {/* Logo */}
      <a
        href="/"
        aria-label="PNPtv! home"
        className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent rounded-lg"
      >
        <span
          className="text-sm font-bold text-white"
          style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
        >
          PNPtv!
        </span>
      </a>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <LanguageSelector />
        <button
          type="button"
          onClick={onSignIn}
          className="flex items-center justify-center min-h-[44px] px-4 rounded-xl text-xs font-bold text-white border border-pnp-border hover:border-white/30 hover:bg-pnp-surfaceHover active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          {c.signIn}
        </button>
      </div>
    </header>
  );
}
