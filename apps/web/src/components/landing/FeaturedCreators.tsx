import React from "react";

interface CommunityShowcaseProps {
  lang: "en" | "es" | string;
  creatorCount: number | null;
  loading: boolean;
}

const modes = {
  en: [
    {
      icon: "stage" as const,
      title: "Main Stage",
      body: "Live group broadcasts open to the whole community. Watch performers in real time, chat, and send tips — any time of day.",
      color: "#D4007A",
      bg: "rgba(212,0,122,0.10)",
      border: "rgba(212,0,122,0.22)",
    },
    {
      icon: "hangout" as const,
      title: "Hangouts",
      body: "Private video rooms where PRIME members hang out with creators in smaller, more intimate groups.",
      color: "#7B61FF",
      bg: "rgba(123,97,255,0.10)",
      border: "rgba(123,97,255,0.22)",
    },
    {
      icon: "call" as const,
      title: "Private Calls",
      body: "Book a 1-on-1 video session directly with a creator. Your schedule, your vibe — no audience.",
      color: "#E69138",
      bg: "rgba(230,145,56,0.10)",
      border: "rgba(230,145,56,0.22)",
    },
    {
      icon: "vod" as const,
      title: "Videorama",
      body: "On-demand exclusive video library. Premium content from your favorite creators, available any time for PRIME members.",
      color: "#22D3EE",
      bg: "rgba(34,211,238,0.10)",
      border: "rgba(34,211,238,0.22)",
    },
  ],
  es: [
    {
      icon: "stage" as const,
      title: "Main Stage",
      body: "Transmisiones en grupo abiertas a toda la comunidad. Mira performers en tiempo real, chatea y manda propinas — a cualquier hora.",
      color: "#D4007A",
      bg: "rgba(212,0,122,0.10)",
      border: "rgba(212,0,122,0.22)",
    },
    {
      icon: "hangout" as const,
      title: "Hangouts",
      body: "Salas de video privadas donde los miembros PRIME conviven con creadores en grupos más pequeños e íntimos.",
      color: "#7B61FF",
      bg: "rgba(123,97,255,0.10)",
      border: "rgba(123,97,255,0.22)",
    },
    {
      icon: "call" as const,
      title: "Llamadas Privadas",
      body: "Reserva una sesión de video 1-a-1 directamente con un creador. Tu horario, tu vibra — sin audiencia.",
      color: "#E69138",
      bg: "rgba(230,145,56,0.10)",
      border: "rgba(230,145,56,0.22)",
    },
    {
      icon: "vod" as const,
      title: "Videorama",
      body: "Biblioteca de video exclusiva bajo demanda. Contenido premium de tus creadores favoritos, disponible cuando quieras para miembros PRIME.",
      color: "#22D3EE",
      bg: "rgba(34,211,238,0.10)",
      border: "rgba(34,211,238,0.22)",
    },
  ],
};

const copy = {
  en: {
    eyebrow: "//community",
    headingFn: (n: number | null) => (n ? `${n}+ creators` : "Our creators"),
    sub: "Verified queer creators from LATAM and beyond — connecting with you through multiple live formats.",
  },
  es: {
    eyebrow: "//comunidad",
    headingFn: (n: number | null) => (n ? `${n}+ creadores` : "Nuestros creadores"),
    sub: "Creadores queer verificados de LATAM y más — conectando contigo a través de múltiples formatos en vivo.",
  },
};

function pick(lang: string) {
  return lang === "es"
    ? { ...copy.es, modes: modes.es }
    : { ...copy.en, modes: modes.en };
}

function StageIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125V5.625m0 12.75H3.75M3.75 5.625a2.625 2.625 0 015.25 0v13.125m-5.25-13.125A2.625 2.625 0 006 3h12a2.625 2.625 0 012.625 2.625v.375M15 19.5v-3.75A2.25 2.25 0 0012.75 13.5h-1.5A2.25 2.25 0 009 15.75V19.5" />
    </svg>
  );
}

function HangoutIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function VodIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c0 .621.504 1.125 1.125 1.125h15A1.125 1.125 0 0020.625 8.25m-16.875 0A2.25 2.25 0 006 10.5v9m12-9a2.25 2.25 0 00-2.25 2.25v9" />
    </svg>
  );
}

function renderIcon(type: "stage" | "hangout" | "call" | "vod") {
  if (type === "stage") return <StageIcon />;
  if (type === "hangout") return <HangoutIcon />;
  if (type === "call") return <CallIcon />;
  return <VodIcon />;
}

function SkeletonPill() {
  return (
    <div className="h-8 w-24 rounded-full animate-pulse" style={{ background: "#1E1E1E" }} aria-hidden="true" />
  );
}

export const FeaturedCreators = React.forwardRef<HTMLElement, CommunityShowcaseProps>(
  function FeaturedCreators({ lang, creatorCount, loading }, ref) {
    const c = pick(lang);

    return (
      <section
        ref={ref}
        id="creators"
        aria-labelledby="community-modes-heading"
        className="w-full px-4 py-16 sm:px-6 lg:px-8"
        style={{ background: "#0A0A0F" }}
      >
        <div className="max-w-5xl xl:max-w-6xl mx-auto">

          {/* Section header */}
          <div className="text-center mb-12">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.3em] mb-3"
              style={{ fontFamily: "'Roboto Mono', monospace", color: "#7B61FF" }}
            >
              {c.eyebrow}
            </p>

            {/* Creator count pill or skeleton */}
            <div className="flex justify-center mb-4">
              {loading ? (
                <SkeletonPill />
              ) : (
                <span
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold"
                  style={{
                    background: "rgba(212,0,122,0.12)",
                    border: "1px solid rgba(212,0,122,0.3)",
                    color: "#D4007A",
                    fontFamily: "'Roboto Mono', monospace",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: "#D4007A" }}
                  />
                  {c.headingFn(creatorCount)}
                </span>
              )}
            </div>

            <h2
              id="community-modes-heading"
              className="text-2xl sm:text-3xl font-bold text-white mb-3"
              style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
            >
              {lang === "es" ? "Formatos de conexión" : "Ways to connect"}
            </h2>
            <p className="text-pnp-textSecondary text-sm sm:text-base max-w-lg mx-auto">
              {c.sub}
            </p>
          </div>

          {/* Mode cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {c.modes.map((mode) => (
              <div
                key={mode.icon}
                className="rounded-2xl p-5 flex flex-col gap-3"
                style={{
                  background: mode.bg,
                  border: `1px solid ${mode.border}`,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: mode.bg, border: `1px solid ${mode.border}`, color: mode.color }}
                >
                  {renderIcon(mode.icon)}
                </div>
                <h3
                  className="text-sm font-bold text-white"
                  style={{ fontFamily: "'Roboto Mono', monospace" }}
                >
                  {mode.title}
                </h3>
                <p className="text-xs text-pnp-textSecondary leading-relaxed">
                  {mode.body}
                </p>
                <div
                  className="h-px w-8 mt-auto"
                  style={{ background: mode.color, opacity: 0.4 }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }
);
