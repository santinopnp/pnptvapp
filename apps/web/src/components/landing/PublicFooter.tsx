import React from "react";
import { LanguageSelector } from "@/components/LanguageSelector";

interface PublicFooterProps {
  lang: "en" | "es" | string;
}

const copy = {
  en: {
    tagline: "The queer PNP community.",
    heroTagline: "Live queer streaming — 24/7",
    joinFree: "Join free",
    columns: [
      {
        heading: "Brand",
        links: [
          { label: "About", href: "/about" },
          { label: "Careers", href: "/careers" },
          { label: "Blog", href: "/blog" },
          { label: "Press", href: "/press" },
          { label: "Partnerships", href: "/partnerships" },
        ],
      },
      {
        heading: "Community",
        links: [
          { label: "Nearby", href: "/nearby" },
          { label: "Explore", href: "/explore" },
          { label: "Creators", href: "#creators" },
          { label: "Help Center", href: "/docs" },
          { label: "Safety", href: "/safety" },
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
          { label: "dmca@pnptv.app", href: "mailto:dmca@pnptv.app" },
          { label: "Help Center", href: "/docs" },
          { label: "Safety", href: "/safety" },
        ],
      },
    ],
    copyright: "© 2026 PNPtv! · Adult content · 18+",
    adultNotice: "This site contains adult content. By continuing you confirm you are 18 years of age or older.",
    followUs: "Follow us",
  },
  es: {
    tagline: "La comunidad queer PNP.",
    heroTagline: "Streaming queer en vivo — 24/7",
    joinFree: "Únete gratis",
    columns: [
      {
        heading: "Marca",
        links: [
          { label: "Acerca de", href: "/about" },
          { label: "Empleos", href: "/careers" },
          { label: "Blog", href: "/blog" },
          { label: "Prensa", href: "/press" },
          { label: "Alianzas", href: "/partnerships" },
        ],
      },
      {
        heading: "Comunidad",
        links: [
          { label: "Personas cercanas", href: "/nearby" },
          { label: "Explorar", href: "/explore" },
          { label: "Creadores", href: "#creators" },
          { label: "Centro de ayuda", href: "/docs" },
          { label: "Seguridad", href: "/safety" },
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
          { label: "dmca@pnptv.app", href: "mailto:dmca@pnptv.app" },
          { label: "Centro de ayuda", href: "/docs" },
          { label: "Seguridad", href: "/safety" },
        ],
      },
    ],
    copyright: "© 2026 PNPtv! · Contenido adulto · 18+",
    adultNotice: "Este sitio contiene contenido para adultos. Al continuar confirmas que tienes 18 años o más.",
    followUs: "Síguenos",
  },
};

function pick(lang: string) {
  return lang === "es" ? copy.es : copy.en;
}

// Placeholder social icons (X/Twitter, Instagram, Telegram)
function XIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

const socialLinks = [
  { icon: <XIcon />, href: "#", label: "X / Twitter" },
  { icon: <InstagramIcon />, href: "#", label: "Instagram" },
  { icon: <TelegramIcon />, href: "#", label: "Telegram" },
];

export function PublicFooter({ lang }: PublicFooterProps) {
  const c = pick(lang);

  return (
    <footer
      aria-label="Site footer"
      className="w-full"
      style={{
        background: "#080808",
        borderTop: "1px solid #1E1E1E",
      }}
    >
      {/* ── LG+ brand hero row ── */}
      <div className="hidden lg:block px-8 xl:px-16 pt-14 pb-10 border-b border-pnp-border">
        <div className="max-w-7xl mx-auto flex items-end justify-between gap-8">
          {/* Left: big wordmark + tagline */}
          <div className="space-y-2">
            <p
              className="text-5xl xl:text-7xl font-bold text-white leading-none"
              style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
              aria-label="PNPtv!"
            >
              PNPtv!
            </p>
            <p
              className="text-sm text-pnp-textSecondary"
              style={{ fontFamily: "'Roboto Mono', monospace" }}
            >
              {c.heroTagline}
            </p>
          </div>

          {/* Right: language selector + join CTA */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <LanguageSelector />
            <a
              href="#auth"
              className="btn-gradient flex items-center justify-center gap-2 min-h-[44px] px-6 rounded-xl text-sm font-bold text-white uppercase tracking-wide transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {c.joinFree}
            </a>
          </div>
        </div>
      </div>

      {/* Main footer grid */}
      <div className="px-4 pt-12 pb-6 sm:px-6 lg:px-8 xl:px-16">
        <div className="max-w-5xl xl:max-w-7xl mx-auto">

          {/* Grid: mobile = 1-col, sm = 4-col, lg = 5-col (brand 2/5 + 3 cols 1/5 each) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-5 gap-8 mb-10">

            {/* Brand column — mobile + sm (lg+ replaced by hero row above) */}
            <div className="sm:col-span-1 lg:col-span-2 flex flex-col gap-4">
              <div className="space-y-1">
                {/* Wordmark — hidden on lg+ (shown in hero row) */}
                <p
                  className="lg:hidden text-lg font-bold text-white"
                  style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace" }}
                >
                  PNPtv!
                </p>
                <p className="text-xs text-pnp-textSecondary leading-relaxed">{c.tagline}</p>
              </div>

              {/* Language selector — mobile only (lg shows it in brand hero row) */}
              <div className="lg:hidden">
                <LanguageSelector />
              </div>

              {/* Social icons */}
              <div className="flex items-center gap-1 mt-2">
                <span
                  className="text-[10px] uppercase tracking-widest text-pnp-textSecondary mr-2"
                  style={{ fontFamily: "'Roboto Mono', monospace" }}
                >
                  {c.followUs}
                </span>
                {socialLinks.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-pnp-textSecondary hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
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

          {/* Divider + copyright */}
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
      </div>
    </footer>
  );
}
