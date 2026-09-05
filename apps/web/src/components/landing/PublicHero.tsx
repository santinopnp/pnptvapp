import React, { useEffect, useRef, useState } from "react";
import { PublicCreator } from "./FeaturedCreators";

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
    liveEyebrow: "LIVE · 24/7",
    headline: "Live queer streaming",
    headlineAccent: "24/7",
    sub: "Real people. Real hangouts. Own the party.",
    joinFree: "Join free",
    seeWhatsLive: "See what's live",
    statMembers: "members",
    statCreators: "creators",
    statLive: "24/7 live",
    scrollHint: "Discover more",
    liveNow: "LIVE now",
  },
  es: {
    eyebrow: "18+ · Plataforma adulta · Solo miembros",
    liveEyebrow: "EN VIVO · 24/7",
    headline: "Streaming queer en vivo",
    headlineAccent: "24/7",
    sub: "Gente real. Encuentros reales. La fiesta es tuya.",
    joinFree: "Únete gratis",
    seeWhatsLive: "Ver en vivo",
    statMembers: "miembros",
    statCreators: "creadores",
    statLive: "en vivo 24/7",
    scrollHint: "Descubre más",
    liveNow: "EN VIVO",
  },
};

function pick(lang: string) {
  return lang === "es" ? copy.es : copy.en;
}

function formatStat(val: string | undefined, suffix: string): string {
  if (!val) return `...+ ${suffix}`;
  return `${val}+ ${suffix}`;
}

// Asymmetric rotation offsets for the hero collage
const collageSlots = [
  { top: "8%",  left: "10%", rotate: -6, size: 120, zIndex: 3, live: true },
  { top: "38%", left: "52%", rotate: 4,  size: 100, zIndex: 2, live: true },
  { top: "5%",  left: "55%", rotate: 2,  size: 88,  zIndex: 1, live: false },
  { top: "60%", left: "8%",  rotate: -3, size: 92,  zIndex: 2, live: false },
  { top: "62%", left: "54%", rotate: 5,  size: 80,  zIndex: 1, live: false },
];

interface HeroCollageProps {
  creators: PublicCreator[];
  lang: string;
  liveLabel: string;
}

function HeroCollage({ creators, lang: _lang, liveLabel }: HeroCollageProps) {
  const visible = creators.slice(0, 5);
  if (visible.length === 0) {
    // Skeleton placeholders
    return (
      <div className="relative w-full h-full min-h-[480px]" aria-hidden="true">
        {collageSlots.map((slot, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-pulse"
            style={{
              top: slot.top,
              left: slot.left,
              width: slot.size,
              height: slot.size,
              background: "#1E1E1E",
              zIndex: slot.zIndex,
              transform: `rotate(${slot.rotate}deg)`,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[480px]" aria-label="Featured creators collage">
      {/* Soft ambient glow behind the collage */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(212,0,122,0.1) 0%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />

      {visible.map((creator, i) => {
        const slot = collageSlots[i];
        const ringColor = creator.is_fam
          ? "linear-gradient(135deg, #FFB454, #E69138)"
          : "linear-gradient(135deg, #D4007A, #7B61FF)";
        const glowColor = creator.is_fam ? "rgba(230,145,56,0.35)" : "rgba(212,0,122,0.35)";

        return (
          <a
            key={creator.username}
            href={creator.profile_url || `/c/${creator.username}`}
            aria-label={`Visit ${creator.display_name}'s profile`}
            className="absolute group focus-visible:outline-none"
            style={{
              top: slot.top,
              left: slot.left,
              zIndex: slot.zIndex,
              transform: `rotate(${slot.rotate}deg)`,
              transition: "transform 0.25s ease, box-shadow 0.25s ease",
            }}
          >
            {/* Glow halo */}
            <div
              aria-hidden="true"
              className="absolute -inset-4 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                filter: "blur(16px)",
              }}
            />

            {/* Gradient ring shell */}
            <div
              className="rounded-full p-[3px] group-hover:scale-105 transition-transform duration-200"
              style={{ background: ringColor }}
            >
              <div
                className="rounded-full overflow-hidden"
                style={{
                  width: slot.size,
                  height: slot.size,
                  border: "2px solid #0A0A0F",
                  background: "#1E1E1E",
                }}
              >
                {creator.avatar_url ? (
                  <img
                    src={creator.avatar_url}
                    alt={`${creator.display_name}`}
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-2xl font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #D4007A33, #7B61FF33)" }}
                    aria-hidden="true"
                  >
                    {creator.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* LIVE badge on selected slots */}
            {slot.live && (
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white whitespace-nowrap"
                style={{
                  background: "rgba(212,0,122,0.9)",
                  backdropFilter: "blur(8px)",
                  fontFamily: "'Roboto Mono', monospace",
                  letterSpacing: "0.1em",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: "#fff",
                    animation: "pulseDot 1.5s ease-in-out infinite",
                  }}
                  aria-hidden="true"
                />
                {liveLabel}
              </div>
            )}
          </a>
        );
      })}

      {/* Pulse keyframe injected once */}
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}

export function PublicHero({ lang, stats, statsLoading, onJoinFree, onExploreClick }: PublicHeroProps) {
  const c = pick(lang);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const [heroCreators, setHeroCreators] = useState<PublicCreator[]>([]);
  const isDesktop = useRef(false);

  // Detect desktop for parallax and collage fetch
  useEffect(() => {
    isDesktop.current = window.matchMedia("(min-width: 1024px)").matches;
  }, []);

  // Fetch creators for hero collage (desktop only — lazy, non-blocking)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/featured-creators")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          const list: PublicCreator[] = data?.creators ?? data ?? [];
          setHeroCreators(list.slice(0, 5));
        }
      })
      .catch(() => {/* silently degrade */});
    return () => { cancelled = true; };
  }, []);

  // Subtle parallax — only on lg+ (mouse presence implies pointer device)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    if (!mq.matches) return;

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
      className="relative flex flex-col items-center justify-center min-h-[80vh] lg:min-h-screen overflow-hidden px-4 py-16 text-center lg:text-left lg:py-0"
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

      {/* Floating orb 1 — magenta (lg+ parallax target) */}
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
      {/* Floating orb 2 — purple (lg+ parallax target) */}
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

      {/* ── DESKTOP LAYOUT: 12-col grid ── */}
      <div className="hidden lg:grid lg:grid-cols-12 lg:items-center w-full max-w-7xl mx-auto relative z-10 lg:px-8 xl:px-12 lg:min-h-screen">

        {/* Left col — 7/12 */}
        <div className="lg:col-span-7 flex flex-col gap-6 lg:pr-8 xl:pr-16">

          {/* Mono eyebrow — "LIVE · 24/7" with pulsing dot */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
              style={{
                color: "rgba(255,69,58,0.9)",
                borderColor: "rgba(255,69,58,0.3)",
                background: "rgba(255,69,58,0.07)",
                fontFamily: "'Roboto Mono', monospace",
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: "#FF453A",
                  boxShadow: "0 0 8px #FF453A",
                  animation: "pulseDotRed 1.4s ease-in-out infinite",
                }}
                aria-hidden="true"
              />
              <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
                {c.liveEyebrow}
              </span>
            </div>
          </div>

          {/* 18+ eyebrow pill */}
          <p
            className="text-[10px] font-bold uppercase tracking-[0.3em] px-3 py-1.5 rounded-full border self-start"
            style={{
              color: "rgba(212,0,122,0.9)",
              borderColor: "rgba(212,0,122,0.25)",
              background: "rgba(212,0,122,0.07)",
              fontFamily: "'Roboto Mono', monospace",
            }}
          >
            {c.eyebrow}
          </p>

          {/* H1 — bigger on lg+ */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold leading-[1.02] tracking-tight"
            style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
          >
            <span className="text-white">{c.headline}</span>
            <br />
            <span aria-label="24/7" className="text-gradient">
              {c.headlineAccent}
            </span>
          </h1>

          {/* Subhead */}
          <p
            className="text-base sm:text-lg lg:text-xl text-pnp-textSecondary max-w-lg leading-relaxed"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            {c.sub}
          </p>

          {/* CTAs */}
          <div className="flex flex-row gap-3">
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
          <div className="flex flex-wrap items-center gap-2">
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

        {/* Right col — 5/12: floating creator collage */}
        <div className="lg:col-span-5 relative h-[480px] xl:h-[560px]">
          <HeroCollage creators={heroCreators} lang={lang} liveLabel={c.liveNow} />
        </div>
      </div>

      {/* ── MOBILE LAYOUT: centered stack (unchanged) ── */}
      <div className="lg:hidden relative z-10 flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">

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
          className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight"
          style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
        >
          <span className="text-white">{c.headline}</span>
          <br />
          <span aria-label="24/7" className="text-gradient">
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

      {/* Scroll hint — desktop only */}
      <div
        aria-hidden="true"
        className="hidden lg:flex absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center gap-1.5 opacity-40"
        style={{ fontFamily: "'Roboto Mono', monospace" }}
      >
        <span className="text-[9px] uppercase tracking-[0.3em] text-pnp-textSecondary">
          {c.scrollHint}
        </span>
        <div className="w-px h-6 bg-pnp-textSecondary" />
        <svg className="w-4 h-4 text-pnp-textSecondary animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Mobile scroll hint */}
      <div
        aria-hidden="true"
        className="lg:hidden absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-40"
      >
        <div className="w-px h-6 bg-pnp-textSecondary" />
        <svg className="w-4 h-4 text-pnp-textSecondary animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Global keyframes for pulse dots */}
      <style>{`
        @keyframes pulseDotRed {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px #FF453A; }
          50% { opacity: 0.4; box-shadow: 0 0 4px #FF453A; }
        }
      `}</style>
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
