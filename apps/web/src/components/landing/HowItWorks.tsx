import React from "react";

interface HowItWorksProps {
  lang: "en" | "es" | string;
}

const copy = {
  en: {
    eyebrow: "//features",
    heading: "Built different",
    features: [
      {
        icon: "live",
        num: "01",
        title: "Live 24/7",
        body: "Watch or join live rooms any time. The Main Stage never sleeps — real performers, real chat, real connections.",
      },
      {
        icon: "verified",
        num: "02",
        title: "Real creators",
        body: "Verified queer creators from LATAM and beyond. Identity-checked, community-calibrated, no bots in the mix.",
      },
      {
        icon: "community",
        num: "03",
        title: "Your community",
        body: "DMs, tips, hangouts, private calls. A space where the vocabulary of your life is never censored.",
      },
    ],
  },
  es: {
    eyebrow: "//funciones",
    heading: "Hecho diferente",
    features: [
      {
        icon: "live",
        num: "01",
        title: "En vivo 24/7",
        body: "Mira o únete a rooms en vivo cuando quieras. El Main Stage nunca duerme — performers reales, chat real, conexiones reales.",
      },
      {
        icon: "verified",
        num: "02",
        title: "Creadores reales",
        body: "Creadores queer verificados de LATAM y más. Verificados de identidad, calibrados por la comunidad, sin bots.",
      },
      {
        icon: "community",
        num: "03",
        title: "Tu comunidad",
        body: "DMs, propinas, hangouts, llamadas privadas. Un espacio donde el vocabulario de tu vida nunca es censurado.",
      },
    ],
  },
};

function pick(lang: string) {
  return lang === "es" ? copy.es : copy.en;
}

function LiveIcon({ size }: { size: "sm" | "lg" }) {
  const cls = size === "lg" ? "w-16 h-16" : "w-8 h-8";
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function VerifiedIcon({ size }: { size: "sm" | "lg" }) {
  const cls = size === "lg" ? "w-16 h-16" : "w-8 h-8";
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  );
}

function CommunityIcon({ size }: { size: "sm" | "lg" }) {
  const cls = size === "lg" ? "w-16 h-16" : "w-8 h-8";
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    </svg>
  );
}

const iconColors: Record<string, string> = {
  live: "#D4007A",
  verified: "#7B61FF",
  community: "#E69138",
};

const iconBg: Record<string, string> = {
  live: "rgba(212,0,122,0.12)",
  verified: "rgba(123,97,255,0.12)",
  community: "rgba(230,145,56,0.12)",
};

const iconBorder: Record<string, string> = {
  live: "rgba(212,0,122,0.25)",
  verified: "rgba(123,97,255,0.25)",
  community: "rgba(230,145,56,0.25)",
};

const connectorGradient = "linear-gradient(90deg, #D4007A, #7B61FF, #E69138)";

function renderIcon(type: string, size: "sm" | "lg") {
  if (type === "live") return <LiveIcon size={size} />;
  if (type === "verified") return <VerifiedIcon size={size} />;
  return <CommunityIcon size={size} />;
}

export function HowItWorks({ lang }: HowItWorksProps) {
  const c = pick(lang);

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="w-full px-4 py-16 sm:px-6 lg:px-8"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0A15 100%)" }}
    >
      <div className="max-w-4xl xl:max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 xl:mb-20">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.3em] mb-3"
            style={{ fontFamily: "'Roboto Mono', monospace", color: "#D4007A" }}
          >
            {c.eyebrow}
          </p>
          <h2
            id="how-it-works-heading"
            className="text-2xl sm:text-3xl font-bold text-white"
            style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
          >
            {c.heading}
          </h2>
        </div>

        {/* ── XL+ TIMELINE layout ── */}
        <div className="hidden xl:block">
          {/* Connector line sits behind the milestone circles */}
          <div className="relative flex items-start justify-between gap-0">
            {/* Gradient line spanning full width, vertically centered with circles */}
            <div
              aria-hidden="true"
              className="absolute top-[64px] left-[12%] right-[12%] h-[2px]"
              style={{ background: connectorGradient, opacity: 0.35 }}
            />

            {c.features.map((feature, i) => (
              <TimelineMilestone key={feature.icon} feature={feature} index={i} total={c.features.length} />
            ))}
          </div>
        </div>

        {/* ── Below xl: original grid layout (untouched) ── */}
        <div className="xl:hidden grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {c.features.map((feature) => (
            <FeatureColumn key={feature.icon} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

interface TimelineMilestoneProps {
  feature: { icon: string; num: string; title: string; body: string };
  index: number;
  total: number;
}

function TimelineMilestone({ feature }: TimelineMilestoneProps) {
  const color = iconColors[feature.icon];
  const bg = iconBg[feature.icon];
  const border = iconBorder[feature.icon];

  return (
    <div className="relative flex-1 flex flex-col items-center text-center gap-4 px-6">
      {/* Mono milestone number above circle */}
      <p
        className="text-5xl font-bold leading-none mb-2"
        style={{
          fontFamily: "'Roboto Mono', monospace",
          color,
          opacity: 0.25,
          letterSpacing: "-0.05em",
        }}
        aria-hidden="true"
      >
        {feature.num}
      </p>

      {/* Large icon sphere — 128px */}
      <div
        className="w-32 h-32 rounded-full flex items-center justify-center flex-shrink-0 relative z-10"
        style={{
          background: bg,
          border: `1.5px solid ${border}`,
          color,
          boxShadow: `0 0 40px ${color}20, 0 0 0 8px #0A0A0F`,
        }}
      >
        {renderIcon(feature.icon, "lg")}
      </div>

      {/* Text below icon */}
      <div className="space-y-2 mt-2">
        <h3
          className="text-lg font-bold text-white"
          style={{ fontFamily: "'Roboto Mono', monospace" }}
        >
          {feature.title}
        </h3>
        <p className="text-sm text-pnp-textSecondary leading-relaxed max-w-xs mx-auto">
          {feature.body}
        </p>
      </div>
    </div>
  );
}

interface FeatureColumnProps {
  feature: {
    icon: string;
    num: string;
    title: string;
    body: string;
  };
}

function FeatureColumn({ feature }: FeatureColumnProps) {
  const color = iconColors[feature.icon];
  const bg = iconBg[feature.icon];
  const border = iconBorder[feature.icon];

  return (
    <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-4">
      {/* Icon container */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ background: bg, border: `1px solid ${border}`, color }}
      >
        {renderIcon(feature.icon, "sm")}
      </div>

      <div className="space-y-2">
        <h3
          className="text-base font-bold text-white"
          style={{ fontFamily: "'Roboto Mono', monospace" }}
        >
          {feature.title}
        </h3>
        <p className="text-sm text-pnp-textSecondary leading-relaxed">
          {feature.body}
        </p>
      </div>

      {/* Accent line */}
      <div
        className="hidden sm:block h-px w-12 mt-auto"
        style={{ background: color, opacity: 0.4 }}
        aria-hidden="true"
      />
    </div>
  );
}
