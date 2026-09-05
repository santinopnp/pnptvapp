import React from "react";
import { LanguageSelector } from "@/components/LanguageSelector";

interface PublicFooterProps {
  lang: "en" | "es" | string;
}

const copy = {
  en: {
    tagline: "The queer PNP community.",
    columns: [
      {
        heading: "Community",
        links: [
          { label: "About", href: "/about" },
          { label: "Nearby", href: "/nearby" },
          { label: "Explore", href: "/explore" },
          { label: "Blog", href: "/blog" },
          { label: "Careers", href: "/careers" },
        ],
      },
      {
        heading: "Legal",
        links: [
          { label: "18 U.S.C. § 2257", href: "/2257" },
          { label: "DMCA", href: "/dmca" },
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Terms of Service", href: "/terms" },
          { label: "Compliance", href: "/compliance" },
        ],
      },
      {
        heading: "Contact",
        links: [
          { label: "support@pnptv.app", href: "mailto:support@pnptv.app" },
          { label: "Help Center", href: "/docs" },
          { label: "Safety", href: "/safety" },
        ],
      },
    ],
    copyright: "© 2026 PNPtv! · Adult content · 18+",
    adultNotice: "This site contains adult content. By continuing you confirm you are 18 years of age or older.",
  },
  es: {
    tagline: "La comunidad queer PNP.",
    columns: [
      {
        heading: "Comunidad",
        links: [
          { label: "Acerca de", href: "/about" },
          { label: "Personas cercanas", href: "/nearby" },
          { label: "Explorar", href: "/explore" },
          { label: "Blog", href: "/blog" },
          { label: "Empleos", href: "/careers" },
        ],
      },
      {
        heading: "Legal",
        links: [
          { label: "18 U.S.C. § 2257", href: "/2257" },
          { label: "DMCA", href: "/dmca" },
          { label: "Política de privacidad", href: "/privacy" },
          { label: "Términos de servicio", href: "/terms" },
          { label: "Cumplimiento", href: "/compliance" },
        ],
      },
      {
        heading: "Contacto",
        links: [
          { label: "support@pnptv.app", href: "mailto:support@pnptv.app" },
          { label: "Centro de ayuda", href: "/docs" },
          { label: "Seguridad", href: "/safety" },
        ],
      },
    ],
    copyright: "© 2026 PNPtv! · Contenido adulto · 18+",
    adultNotice: "Este sitio contiene contenido para adultos. Al continuar confirmas que tienes 18 años o más.",
  },
};

function pick(lang: string) {
  return lang === "es" ? copy.es : copy.en;
}

export function PublicFooter({ lang }: PublicFooterProps) {
  const c = pick(lang);

  return (
    <footer
      aria-label="Site footer"
      className="w-full px-4 pt-12 pb-6 sm:px-6 lg:px-8"
      style={{
        background: "#080808",
        borderTop: "1px solid #1E1E1E",
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Top grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 mb-10">
          {/* Brand column */}
          <div className="sm:col-span-1 flex flex-col gap-4">
            <div className="space-y-1">
              <p
                className="text-lg font-bold text-white"
                style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
              >
                PNPtv!
              </p>
              <p className="text-xs text-pnp-textSecondary leading-relaxed">{c.tagline}</p>
            </div>
            <LanguageSelector />
          </div>

          {/* Link columns */}
          {c.columns.map((col) => (
            <div key={col.heading} className="space-y-3">
              <h3
                className="text-[10px] font-bold uppercase tracking-[0.25em] text-white"
                style={{ fontFamily: "'Roboto Mono', monospace" }}
              >
                {col.heading}
              </h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-xs text-pnp-textSecondary hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent rounded"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-pnp-border pt-6 space-y-3">
          {/* Adult notice */}
          <p className="text-[10px] text-pnp-textSecondary/50 text-center leading-relaxed max-w-lg mx-auto">
            {c.adultNotice}
          </p>
          {/* Copyright */}
          <p
            className="text-[11px] text-pnp-textSecondary/40 text-center"
            style={{ fontFamily: "'Roboto Mono', monospace" }}
          >
            {c.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}
