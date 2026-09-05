import React from "react";

export interface PublicCreator {
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  followers_count: number;
  is_verified: boolean;
  is_fam: boolean;
  profile_url: string;
}

interface FeaturedCreatorsProps {
  lang: "en" | "es" | string;
  creators: PublicCreator[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const copy = {
  en: {
    heading: "Featured creators",
    sub: "Verified queer creators building community right now.",
    followers: "followers",
    error: "Couldn't load creators.",
    retry: "Try again",
    empty: "",
    viewProfile: "View profile →",
  },
  es: {
    heading: "Creadores destacados",
    sub: "Creadores queer verificados construyendo comunidad ahora mismo.",
    followers: "seguidores",
    error: "No se pudieron cargar los creadores.",
    retry: "Intentar de nuevo",
    empty: "",
    viewProfile: "Ver perfil →",
  },
};

function pick(lang: string) {
  return lang === "es" ? copy.es : copy.en;
}

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export const FeaturedCreators = React.forwardRef<HTMLElement, FeaturedCreatorsProps>(
  function FeaturedCreators({ lang, creators, loading, error, onRetry }, ref) {
  const c = pick(lang);

  // Don't render section at all if loaded successfully but zero creators
  if (!loading && !error && creators.length === 0) return null;

  return (
    <section
      ref={ref}
      id="creators"
      aria-labelledby="featured-creators-heading"
      className="w-full px-4 py-16 sm:px-6 lg:px-8"
      style={{ background: "#0A0A0F" }}
    >
      {/* Desktop: max-w bumped to 7xl on xl+ */}
      <div className="max-w-5xl xl:max-w-7xl mx-auto">

        {/* Section header — sticky on lg+ (left-anchored) */}
        <div className="text-center lg:text-left mb-10 lg:sticky lg:top-24 lg:self-start">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.3em] mb-3"
            style={{
              fontFamily: "'Roboto Mono', monospace",
              color: "#7B61FF",
            }}
          >
            //community
          </p>
          <h2
            id="featured-creators-heading"
            className="text-2xl sm:text-3xl font-bold text-white mb-3"
            style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
          >
            {c.heading}
          </h2>
          <p className="text-pnp-textSecondary text-sm sm:text-base max-w-lg mx-auto lg:mx-0">{c.sub}</p>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <svg className="w-8 h-8 text-pnp-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-pnp-textSecondary text-sm">{c.error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white border border-pnp-border hover:border-white/30 hover:bg-pnp-surfaceHover transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
            >
              {c.retry}
            </button>
          </div>
        )}

        {/* Loading skeleton grid */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                aria-hidden="true"
                className="rounded-2xl p-4 flex flex-col items-center gap-3 animate-pulse"
                style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}
              >
                <div className="w-20 h-20 rounded-full bg-pnp-surfaceHover" />
                <div className="space-y-2 w-full">
                  <div className="h-3 rounded bg-pnp-surfaceHover w-3/4 mx-auto" />
                  <div className="h-2.5 rounded bg-pnp-surfaceHover w-1/2 mx-auto" />
                  <div className="h-2 rounded bg-pnp-surfaceHover w-full" />
                  <div className="h-2 rounded bg-pnp-surfaceHover w-4/5 mx-auto" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Creator grid — mosaic on xl+, standard 4-col on lg, 2/3-col below */}
        {!loading && !error && creators.length > 0 && (
          <>
            {/* ── XL+ mosaic grid ── */}
            <div className="hidden xl:grid xl:grid-cols-4 gap-4 auto-rows-auto">
              {creators.map((creator, i) => (
                <CreatorCard
                  key={creator.username}
                  creator={creator}
                  followersLabel={c.followers}
                  viewProfileLabel={c.viewProfile}
                  hero={i === 0}
                />
              ))}
            </div>

            {/* ── Below xl: standard grid (untouched) ── */}
            <div className="xl:hidden grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {creators.map((creator) => (
                <CreatorCard
                  key={creator.username}
                  creator={creator}
                  followersLabel={c.followers}
                  viewProfileLabel={c.viewProfile}
                  hero={false}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
});

interface CreatorCardProps {
  creator: PublicCreator;
  followersLabel: string;
  viewProfileLabel: string;
  hero: boolean;
}

function CreatorCard({ creator, followersLabel, viewProfileLabel, hero }: CreatorCardProps) {
  const ringColor = creator.is_fam
    ? "linear-gradient(135deg, #FFB454, #E69138)"
    : "linear-gradient(135deg, #D4007A, #7B61FF)";

  const ringColorHover = creator.is_fam
    ? "linear-gradient(135deg, #FFC97A, #F5A340)"
    : "linear-gradient(135deg, #FF1A94, #9B7FFF)";

  return (
    <a
      href={creator.profile_url || `/c/${creator.username}`}
      className={[
        "group relative rounded-2xl flex flex-col items-center gap-3 transition-all duration-200",
        "hover:-translate-y-1 hover:scale-[1.02]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background",
        // xl hero card: 2x2 span, more padding, larger layout
        hero ? "xl:col-span-2 xl:row-span-2 xl:p-8 p-4" : "p-4",
      ].join(" ")}
      style={{
        background: "#1A1A1A",
        border: "1px solid #2A2A2A",
        textDecoration: "none",
      }}
      aria-label={`Visit ${creator.display_name}'s profile`}
    >
      {/* Avatar with gradient ring — larger in hero mode */}
      <div
        className={[
          "relative flex-shrink-0 p-[2px] rounded-full transition-all duration-200",
          "group-hover:[--ring-bg:var(--ring-hover)]",
        ].join(" ")}
        style={{
          background: ringColor,
          boxShadow: "0 0 0 2px #0A0A0F",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = ringColorHover; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ringColor; }}
      >
        <div
          className={[
            "rounded-full overflow-hidden bg-pnp-surface",
            hero ? "w-20 h-20 sm:w-24 sm:h-24 xl:w-64 xl:h-64" : "w-20 h-20 sm:w-24 sm:h-24",
          ].join(" ")}
          style={{ border: "2px solid #0A0A0F" }}
        >
          {creator.avatar_url ? (
            <img
              src={creator.avatar_url}
              alt={`${creator.display_name}'s avatar`}
              className="w-full h-full object-cover"
              loading="lazy"
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

        {/* Live indicator dot */}
        <div
          aria-hidden="true"
          className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-pnp-background"
          style={{ background: creator.is_fam ? "#E69138" : "#D4007A" }}
        />
      </div>

      {/* Name + badges */}
      <div className="w-full text-center space-y-0.5 min-w-0">
        <div className="flex items-center justify-center gap-1 flex-wrap">
          <span
            className={["font-bold text-white leading-tight truncate max-w-full", hero ? "xl:text-xl text-xs sm:text-sm" : "text-xs sm:text-sm"].join(" ")}
            title={creator.display_name}
          >
            {creator.display_name}
          </span>
          {creator.is_verified && (
            <svg
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: creator.is_fam ? "#E69138" : "#60A5FA" }}
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-label={creator.is_fam ? "PNPtv Fam" : "Verified creator"}
            >
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          )}
        </div>

        <p
          className="text-[10px] sm:text-xs"
          style={{ color: "#A1A1A3", fontFamily: "'Roboto Mono', monospace" }}
        >
          @{creator.username}
        </p>

        <p
          className="text-[10px] font-semibold"
          style={{ color: creator.is_fam ? "#E69138" : "#D4007A", fontFamily: "'Roboto Mono', monospace" }}
        >
          {formatFollowers(creator.followers_count)} {followersLabel}
        </p>
      </div>

      {/* Bio — hero shows more lines on xl */}
      {creator.bio && (
        <p
          className={["text-pnp-textSecondary text-center leading-relaxed w-full min-w-0", hero ? "text-[10px] sm:text-xs xl:text-sm xl:line-clamp-4 line-clamp-2" : "text-[10px] sm:text-xs line-clamp-2"].join(" ")}
          title={creator.bio}
        >
          {creator.bio}
        </p>
      )}

      {/* "View profile →" — slides in from right on xl hover */}
      <span
        className={[
          "text-xs font-semibold transition-all duration-200 mt-auto",
          hero ? "xl:opacity-0 xl:translate-x-2 xl:group-hover:opacity-100 xl:group-hover:translate-x-0 opacity-0 hidden xl:block" : "hidden",
        ].join(" ")}
        style={{ color: creator.is_fam ? "#E69138" : "#D4007A", fontFamily: "'Roboto Mono', monospace" }}
        aria-hidden="true"
      >
        {viewProfileLabel}
      </span>
    </a>
  );
}
