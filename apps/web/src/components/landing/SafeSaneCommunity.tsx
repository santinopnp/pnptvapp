import React from "react";

interface SafeSaneCommunityProps {
  lang: "en" | "es" | string;
}

const copy = {
  en: {
    heading: "Safe, sane, and consensual — always",
    body1:
      "PNPtv operates on a Duty of Care model. Community guidelines, identity verification, and human moderation are infrastructure — not an afterthought.",
    body2:
      "We believe in harm reduction, informed consent, and the right to make your own choices. No auto-bans for community language. Real people review every report.",
    links: [
      { label: "18 U.S.C. § 2257", href: "/2257" },
      { label: "DMCA", href: "/dmca" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "About", href: "/about" },
      { label: "Compliance", href: "/compliance" },
    ],
    badge: "Adult content · 18+ only · No minors",
  },
  es: {
    heading: "Seguro, sensato y consensuado — siempre",
    body1:
      "PNPtv opera bajo un modelo de Deber de Cuidado. Las normas de la comunidad, la verificación de identidad y la moderación humana son infraestructura, no un accesorio.",
    body2:
      "Creemos en la reducción de daños, el consentimiento informado y el derecho a tomar tus propias decisiones. Sin auto-bans por lenguaje comunitario. Personas reales revisan cada reporte.",
    links: [
      { label: "18 U.S.C. § 2257", href: "/2257" },
      { label: "DMCA", href: "/dmca" },
      { label: "Privacidad", href: "/privacy" },
      { label: "Términos", href: "/terms" },
      { label: "Acerca de", href: "/about" },
      { label: "Cumplimiento", href: "/compliance" },
    ],
    badge: "Contenido adulto · Solo mayores de 18 · Sin menores",
  },
};

function pick(lang: string) {
  return lang === "es" ? copy.es : copy.en;
}

export function SafeSaneCommunity({ lang }: SafeSaneCommunityProps) {
  const c = pick(lang);

  return (
    <section
      aria-labelledby="safe-community-heading"
      className="w-full px-4 py-14 sm:px-6 lg:px-8"
      style={{
        background: "linear-gradient(180deg, #0F0A15 0%, #0A0A0F 100%)",
        borderTop: "1px solid #1E1E1E",
      }}
    >
      <div className="max-w-3xl mx-auto text-center space-y-5">
        {/* Shield icon */}
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mx-auto"
          style={{ background: "rgba(212,0,122,0.1)", border: "1px solid rgba(212,0,122,0.2)" }}
          aria-hidden="true"
        >
          <svg
            className="w-7 h-7"
            style={{ color: "#D4007A" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        <h2
          id="safe-community-heading"
          className="text-xl sm:text-2xl font-bold text-white leading-snug"
          style={{ fontFamily: "'Roboto Mono', monospace" }}
        >
          {c.heading}
        </h2>

        <div className="space-y-3 text-sm text-pnp-textSecondary leading-relaxed max-w-xl mx-auto">
          <p>{c.body1}</p>
          <p>{c.body2}</p>
        </div>

        {/* 18+ badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
          style={{
            background: "rgba(255,69,58,0.08)",
            border: "1px solid rgba(255,69,58,0.2)",
            color: "#FF453A",
            fontFamily: "'Roboto Mono', monospace",
          }}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {c.badge}
        </div>

        {/* Compliance links */}
        <nav aria-label="Compliance and legal links">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {c.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-xs text-pnp-textSecondary hover:text-white underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent rounded"
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </section>
  );
}
