import React, { useEffect, useRef } from "react";

export interface PublicStats {
  members_plus: string;
  creators_plus: string;
  videos_plus: string;
  countries: number;
}

interface PublicHeroProps {
  lang: "en" | "es" | string;
  stats: PublicStats | null;
  statsLoading: boolean;
  onJoinFree: () => void;
  onExploreClick: () => void;
}

const copy = {
  en: {
    eyebrow: "18+ · Adult platform · Members only",
    headline: "Live queer streaming",
    headlineAccent: "24/7",
    sub: "Real people. Real hangouts. Own the party.",
    joinFree: "Join free",
    seeWhatsLive: "See what's live",
    statMembers: "members",
    statCreators: "creators",
    statLive: "24/7 live",
  },
  es: {
    eyebrow: "18+ · Plataforma adulta · Solo miembros",
    headline: "Streaming queer en vivo",
    headlineAccent: "24/7",
    sub: "Gente real. Encuentros reales. La fiesta es tuya.",
    joinFree: "Únete gratis",
    seeWhatsLive: "Ver en vivo",
    statMembers: "miembros",
    statCreators: "creadores",
    statLive: "en vivo 24/7",
  },
};

function pick(lang: string) {
  return (lang === "es" ? copy.es : copy.en);
}

function formatStat(val: string | undefined, suffix: string): string {
  if (!val) return `...+ ${suffix}`;
  return `${val}+ ${suffix}`;
}

export function PublicHero({ lang, stats, statsLoading, onJoinFree, onExploreClick }: PublicHeroProps) {
  const c = pick(lang);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);

  // Subtle parallax on mouse / device tilt
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth: w, innerHeight: h } = window;
      const dx = (e.clientX / w - 0.5) * 30;
      const dy = (e.clientY / h - 0.5) * 20;
      if (orb1Ref.current) {
        orb1Ref.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      if (orb2Ref.current) {
        orb2Ref.current.style.transform = `translate(${-dx * 0.7}px, ${-dy * 0.7}px)`;
      }
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <section
      aria-label="Hero"
      className="relative flex flex-col items-center justify-center min-h-[80vh] overflow-hidden px-4 py-16 text-center"
      style={{ background: "#0A0A0F" }}
    >
      {/* Radial ambient glow — bg canvas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 20% 40%, rgba(212,0,122,0.15) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 80% 60%, rgba(123,97,255,0.12) 0%, transparent 65%)",
        }}
      />

      {/* Floating orb 1 — magenta */}
      <div
        ref={orb1Ref}
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full transition-transform duration-700 ease-out"
        style={{
          width: 340,
          height: 340,
          top: "8%",
          left: "-8%",
          background: "radial-gradient(circle, rgba(212,0,122,0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      {/* Floating orb 2 — purple */}
      <div
        ref={orb2Ref}
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full transition-transform duration-700 ease-out"
        style={{
          width: 280,
          height: 280,
          bottom: "10%",
          right: "-6%",
          background: "radial-gradient(circle, rgba(123,97,255,0.15) 0%, transparent 70%)",
          filter: "blur(35px)",
        }}
      />

      {/* Subtle dot-grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">

        {/* Eyebrow */}
        <p
          className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.3em] px-3 py-1.5 rounded-full border"
          style={{
            color: "rgba(212,0,122,0.9)",
            borderColor: "rgba(212,0,122,0.25)",
            background: "rgba(212,0,122,0.07)",
            fontFamily: "'Roboto Mono', monospace",
          }}
        >
          {c.eyebrow}
        </p>

        {/* H1 */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
          style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
        >
          <span className="text-white">{c.headline}</span>
          <br />
          <span
            aria-label="24/7"
            className="text-gradient"
          >
            {c.headlineAccent}
          </span>
        </h1>

        {/* Subhead */}
        <p
          className="text-base sm:text-lg md:text-xl text-pnp-textSecondary max-w-md leading-relaxed"
          style={{ fontFamily: "'Roboto Mono', monospace" }}
        >
          {c.sub}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onJoinFree}
            className="btn-gradient flex items-center justify-center gap-2 min-h-[52px] px-8 rounded-xl text-sm font-bold text-white uppercase tracking-wide active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {c.joinFree}
          </button>

          <button
            type="button"
            onClick={onExploreClick}
            className="flex items-center justify-center gap-2 min-h-[52px] px-8 rounded-xl text-sm font-bold text-pnp-textSecondary uppercase tracking-wide border border-pnp-border hover:border-white/30 hover:text-white active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {c.seeWhatsLive}
          </button>
        </div>

        {/* Stat pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {statsLoading ? (
            <>
              <div className="h-8 w-28 rounded-full bg-pnp-surface animate-pulse" />
              <div className="h-8 w-28 rounded-full bg-pnp-surface animate-pulse" />
              <div className="h-8 w-24 rounded-full bg-pnp-surface animate-pulse" />
            </>
          ) : (
            <>
              <StatPill value={formatStat(stats?.members_plus, c.statMembers)} color="#D4007A" />
              <StatPill value={formatStat(stats?.creators_plus, c.statCreators)} color="#7B61FF" />
              <StatPill value={c.statLive} color="#E69138" live />
            </>
          )}
        </div>
      </div>

      {/* Scroll hint arrow */}
      <div
        aria-hidden="true"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-40"
      >
        <div className="w-px h-6 bg-pnp-textSecondary" />
        <svg className="w-4 h-4 text-pnp-textSecondary animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </section>
  );
}

interface StatPillProps {
  value: string;
  color: string;
  live?: boolean;
}

function StatPill({ value, color, live }: StatPillProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
      style={{
        background: `${color}12`,
        border: `1px solid ${color}30`,
        color,
        fontFamily: "'Roboto Mono', monospace",
      }}
    >
      {live && (
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      )}
      {value}
    </div>
  );
}
