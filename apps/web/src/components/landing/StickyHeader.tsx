import React, { useEffect, useState } from "react";
import { LanguageSelector } from "@/components/LanguageSelector";

interface StickyHeaderProps {
  lang: "en" | "es" | string;
  onSignIn: () => void;
}

const copy = {
  en: {
    signIn: "Sign in",
    joinFree: "Join free",
    nav: [
      { label: "Home", href: "/" },
      { label: "Creators", href: "#creators" },
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Support", href: "/docs" },
    ],
  },
  es: {
    signIn: "Iniciar sesión",
    joinFree: "Únete gratis",
    nav: [
      { label: "Inicio", href: "/" },
      { label: "Creadores", href: "#creators" },
      { label: "Acerca", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Soporte", href: "/docs" },
    ],
  },
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
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14 lg:h-20 lg:px-8 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(8,8,8,0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
        boxShadow: scrolled ? "0 4px 32px rgba(0,0,0,0.4)" : "none",
      }}
    >
      {/* Logo */}
      <a
        href="/"
        aria-label="PNPtv! home"
        className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent rounded-lg flex-shrink-0"
      >
        <span
          className="text-sm lg:text-base font-bold text-white"
          style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
        >
          PNPtv!
        </span>
      </a>

      {/* Desktop nav — center */}
      <nav
        aria-label="Main navigation"
        className="hidden lg:flex items-center gap-6 absolute left-1/2 -translate-x-1/2"
      >
        {c.nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="text-xs font-semibold text-pnp-textSecondary hover:text-white transition-colors duration-150 tracking-wide uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent rounded"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
        <LanguageSelector />

        {/* Mobile: minimal ghost button */}
        <button
          type="button"
          onClick={onSignIn}
          className="lg:hidden flex items-center justify-center min-h-[44px] px-4 rounded-xl text-xs font-bold text-white border border-pnp-border hover:border-white/30 hover:bg-pnp-surfaceHover active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          {c.signIn}
        </button>

        {/* Desktop: gradient CTA button */}
        <button
          type="button"
          onClick={onSignIn}
          className="hidden lg:flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-xs font-bold text-white uppercase tracking-wide btn-gradient active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {c.joinFree}
        </button>
      </div>
    </header>
  );
}
