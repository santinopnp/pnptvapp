import React, { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { WalletLoginGate, WalletPayCard } from "@/components/payments/PayInWalletChips";
import { NpAppPickerSheet } from "@/components/payments/NowPaymentsWaitingPanel";

// ── Constants ──────────────────────────────────────────────────────────────────

const PLANS = {
  annual: { id: "yearly50",     price: 50.00,  rushBonus: 0    },
  lifetime: { id: "lifetime-pass", price: 99.99, rushBonus: 2000 },
} as const;
type PlanKey = keyof typeof PLANS;

const LANG_KEY = "pnptv:founders:lang";

function getInitialLang(): string {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s) return s;
  } catch { /* ignore */ }
  return typeof navigator !== "undefined"
    ? (navigator.language || "es")
    : "es";
}

// ── Strings ────────────────────────────────────────────────────────────────────

const T = {
  en: {
    badge:        "Founders Edition · Limited Access",
    headline:     "One payment.\nForever a member.",
    sub:          "No renewals. No expiry. Lifetime membership on PNPtv! — plus 18 months of full PRIME access included.",
    planAnnualLabel:   "PRIME Annual",
    planAnnualPrice:   "$50",
    planAnnualNote:    "per year · renews annually",
    planAnnualDesc:    "Full PRIME access for 12 months.",
    planLifetimeLabel: "Founders Lifetime",
    planLifetimePrice: "$99.99",
    planLifetimeNote:  "one-time · no subscription",
    planLifetimeDesc:  "18 mo PRIME + lifetime basic access + 2,000 Ru$h 💎.",
    mostPopular:       "Most Popular",
    bestValue:         "Best Value",
    benefits: [
      { icon: "⭐", title: "Full PRIME Access",      desc: "Exclusive content, streams, and creator channels — everything unlocked." },
      { icon: "⚡", title: "Instant Activation",    desc: "Your account upgrades the moment payment confirms on-chain or in your wallet." },
      { icon: "🛡",  title: "No Recurring Charges", desc: "Pay once (or yearly) and you're done. No surprises, ever." },
    ],
    payWallet:    "Pay with card or USDC",
    payCrypto:    "₿ Pay with BTC · ETH · USDT",
    successTitle: "You're a Founder 🖤",
    successBodyAnnual:   "Your PRIME access is now active for 12 months. See you inside PNPtv!",
    successBodyLifetime: "Your membership is now active. 18 months of PRIME access starts today. Thank you for being part of PNPtv! from the beginning.",
    successCta:   "Go to PNPtv!",
    legalNote:    "By completing payment you agree to PNPtv!'s Terms of Service.",
    toggleLang:   "ES",
  },
  es: {
    badge:        "Edición Founders · Acceso Limitado",
    headline:     "Un solo pago.\nMiembro para siempre.",
    sub:          "Sin renovaciones. Sin vencimiento. Membresía de por vida en PNPtv! — más 18 meses de acceso PRIME completo incluidos.",
    planAnnualLabel:   "PRIME Anual",
    planAnnualPrice:   "$50",
    planAnnualNote:    "por año · se renueva anualmente",
    planAnnualDesc:    "Acceso PRIME completo por 12 meses.",
    planLifetimeLabel: "Founders Lifetime",
    planLifetimePrice: "$99.99",
    planLifetimeNote:  "pago único · sin suscripción",
    planLifetimeDesc:  "18 meses PRIME + acceso básico de por vida + 2,000 Ru$h 💎.",
    mostPopular:       "Más Popular",
    bestValue:         "Mejor Valor",
    benefits: [
      { icon: "⭐", title: "Acceso PRIME completo",   desc: "Contenido exclusivo, streams y canales de creadores — todo desbloqueado." },
      { icon: "⚡", title: "Activación instantánea",  desc: "Tu cuenta se actualiza en el momento en que se confirma el pago." },
      { icon: "🛡",  title: "Sin cargos recurrentes", desc: "Pagás una vez (o anual) y listo. Sin sorpresas, jamás." },
    ],
    payWallet:    "Pagar con tarjeta o USDC",
    payCrypto:    "₿ Pagar con BTC · ETH · USDT",
    successTitle: "Eres Founder 🖤",
    successBodyAnnual:   "Tu acceso PRIME está activo por 12 meses. ¡Te esperamos dentro de PNPtv!",
    successBodyLifetime: "Tu membresía ya está activa. Los 18 meses de PRIME comienzan hoy. Gracias por ser parte de PNPtv! desde el principio.",
    successCta:   "Ir a PNPtv!",
    legalNote:    "Al completar el pago aceptas los Términos de Servicio de PNPtv!.",
    toggleLang:   "EN",
  },
} as const;

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FoundersPage() {
  const [lang, setLang]             = useState(getInitialLang);
  const [showCrypto, setShowCrypto] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("annual");

  const es      = lang.toLowerCase().startsWith("es");
  const t       = es ? T.es : T.en;
  const plan    = PLANS[selectedPlan];
  const isAnnual = selectedPlan === "annual";

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  const handleSuccess = useCallback(() => setSuccess(true), []);

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={styles.root}>
        <Helmet>
          <title>PNPtv! Founders</title>
        </Helmet>
        <div style={styles.successWrap}>
          <div style={styles.successIcon}>🖤</div>
          <h1 style={styles.successTitle}>{t.successTitle}</h1>
          <p style={styles.successBody}>{isAnnual ? t.successBodyAnnual : t.successBodyLifetime}</p>
          <a href="/" style={styles.successBtn}>{t.successCta}</a>
        </div>
      </div>
    );
  }

  // ── Main page ───────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      <Helmet>
        <title>PNPtv! Founders — Lifetime PRIME</title>
        <meta name="description" content={es
          ? "Acceso PRIME de por vida en PNPtv!. Un solo pago, sin renovaciones."
          : "Lifetime PRIME access on PNPtv!. One payment, no renewals."} />
      </Helmet>

      {/* ── Lang toggle ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setLang(es ? "en" : "es")}
        style={styles.langBtn}
      >
        {t.toggleLang}
      </button>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <header style={styles.hero}>
        {/* Ambient glow blobs */}
        <div style={styles.blob1} aria-hidden="true" />
        <div style={styles.blob2} aria-hidden="true" />

        <div style={styles.heroInner}>
          {/* Badge */}
          <div style={styles.badge}>{t.badge}</div>

          {/* Logo */}
          <p style={styles.logoLabel}>PNPtv!</p>

          {/* Headline */}
          <h1 style={styles.headline}>
            {t.headline.split("\n").map((line, i) => (
              <React.Fragment key={i}>
                {i === 1
                  ? <span style={styles.headlineAccent}>{line}</span>
                  : line}
                {i === 0 && <br />}
              </React.Fragment>
            ))}
          </h1>

          <p style={styles.sub}>{t.sub}</p>
        </div>
      </header>

      {/* ── Benefits ─────────────────────────────────────────────────────────── */}
      <section style={styles.benefitsSection}>
        <div style={styles.benefitsGrid}>
          {t.benefits.map((b) => (
            <div key={b.title} style={styles.benefitCard}>
              <span style={styles.benefitIcon}>{b.icon}</span>
              <div>
                <p style={styles.benefitTitle}>{b.title}</p>
                <p style={styles.benefitDesc}>{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Plan picker ──────────────────────────────────────────────────────── */}
      <section style={styles.planSection}>
        <div style={styles.planGrid}>
          {/* Annual card */}
          <button
            type="button"
            onClick={() => setSelectedPlan("annual")}
            style={{
              ...styles.planCard,
              ...(selectedPlan === "annual" ? styles.planCardSelected : {}),
            }}
          >
            <span style={styles.planBadge}>{t.mostPopular}</span>
            <p style={styles.planLabel}>{t.planAnnualLabel}</p>
            <p style={styles.planPrice}>{t.planAnnualPrice}</p>
            <p style={styles.planNote}>{t.planAnnualNote}</p>
            <p style={styles.planDesc}>{t.planAnnualDesc}</p>
          </button>

          {/* Lifetime card */}
          <button
            type="button"
            onClick={() => setSelectedPlan("lifetime")}
            style={{
              ...styles.planCard,
              ...(selectedPlan === "lifetime" ? styles.planCardSelected : {}),
            }}
          >
            <span style={{ ...styles.planBadge, ...styles.planBadgeGold }}>{t.bestValue}</span>
            <p style={styles.planLabel}>{t.planLifetimeLabel}</p>
            <p style={styles.planPrice}>{t.planLifetimePrice}</p>
            <p style={styles.planNote}>{t.planLifetimeNote}</p>
            <p style={styles.planDesc}>{t.planLifetimeDesc}</p>
          </button>
        </div>
      </section>

      {/* ── Payment ──────────────────────────────────────────────────────────── */}
      <section style={styles.paySection}>
        <div style={styles.payCard}>
          {/* Price recap */}
          <div style={styles.payRecap}>
            <span style={styles.payRecapLabel}>
              {isAnnual ? t.planAnnualLabel : t.planLifetimeLabel}
            </span>
            <span style={styles.payRecapPrice}>
              {isAnnual ? t.planAnnualPrice : t.planLifetimePrice}
            </span>
          </div>

          <WalletLoginGate lang={es ? "es" : "en"}>
            {/* Wallet / card */}
            <WalletPayCard
              surface="prime"
              amountUsd={plan.price}
              entitlementSpec={{ planId: plan.id }}
              lang={es ? "es" : "en"}
              label={t.payWallet}
              onSuccess={handleSuccess}
            />
          </WalletLoginGate>

          {/* Divider */}
          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>{es ? "o pagar con crypto" : "or pay with crypto"}</span>
            <div style={styles.dividerLine} />
          </div>

          {/* Crypto — no wallet login required */}
          <button
            type="button"
            onClick={() => setShowCrypto(true)}
            style={styles.cryptoBtn}
          >
            {t.payCrypto}
          </button>

          <p style={styles.legalNote}>{t.legalNote}</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer style={styles.footer}>
        <a href="/terms" style={styles.footerLink}>Terms</a>
        <span style={styles.footerDot}>·</span>
        <a href="/privacy" style={styles.footerLink}>Privacy</a>
        <span style={styles.footerDot}>·</span>
        <a href="/support" style={styles.footerLink}>Support</a>
      </footer>

      {/* ── Crypto sheet ─────────────────────────────────────────────────────── */}
      <NpAppPickerSheet
        isOpen={showCrypto}
        onClose={() => setShowCrypto(false)}
        planId={showCrypto ? plan.id : null}
        lang={lang}
        planLabel={`${isAnnual ? t.planAnnualLabel : t.planLifetimeLabel} · ${isAnnual ? t.planAnnualPrice : t.planLifetimePrice}`}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const AMBER  = "#E69138";
const AMBER2 = "rgba(230,145,56,0.15)";
const WHITE  = "#FFFFFF";
const DIM    = "rgba(255,255,255,0.50)";
const FAINT  = "rgba(255,255,255,0.08)";

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100dvh",
    background: "#090909",
    color: WHITE,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflowX: "hidden",
    position: "relative",
  },

  // Lang toggle
  langBtn: {
    position: "fixed",
    top: 14,
    right: 16,
    zIndex: 50,
    background: FAINT,
    border: "1px solid rgba(255,255,255,0.14)",
    color: DIM,
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.06em",
  },

  // Hero
  hero: {
    position: "relative",
    overflow: "hidden",
    paddingTop: 72,
    paddingBottom: 48,
    textAlign: "center",
  },
  blob1: {
    position: "absolute",
    top: -120,
    left: "50%",
    transform: "translateX(-50%)",
    width: 600,
    height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(230,145,56,0.12) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  blob2: {
    position: "absolute",
    bottom: -80,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(180,60,120,0.10) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  heroInner: {
    position: "relative",
    zIndex: 1,
    maxWidth: 480,
    margin: "0 auto",
    padding: "0 20px",
  },
  badge: {
    display: "inline-block",
    background: AMBER2,
    border: `1px solid rgba(230,145,56,0.35)`,
    color: AMBER,
    borderRadius: 99,
    padding: "4px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: 20,
  },
  logoLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: DIM,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 12,
    margin: "0 0 12px",
  },
  headline: {
    fontSize: "clamp(36px, 9vw, 52px)",
    fontWeight: 900,
    lineHeight: 1.12,
    letterSpacing: "-0.02em",
    margin: "0 0 18px",
    color: WHITE,
  },
  headlineAccent: {
    background: `linear-gradient(90deg, ${AMBER}, #f5c842)`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  sub: {
    fontSize: 15,
    lineHeight: 1.6,
    color: DIM,
    margin: "0 0 28px",
    maxWidth: 360,
    marginLeft: "auto",
    marginRight: "auto",
  },
  // Benefits
  benefitsSection: {
    padding: "0 16px 40px",
    maxWidth: 480,
    margin: "0 auto",
  },
  benefitsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  benefitCard: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    background: FAINT,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    padding: "14px 16px",
  },
  benefitIcon: {
    fontSize: 22,
    lineHeight: 1,
    flexShrink: 0,
    marginTop: 1,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: WHITE,
    margin: "0 0 3px",
  },
  benefitDesc: {
    fontSize: 12,
    color: DIM,
    lineHeight: 1.5,
    margin: 0,
  },

  // Plan picker
  planSection: {
    padding: "0 16px 24px",
    maxWidth: 480,
    margin: "0 auto",
  },
  planGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  planCard: {
    background: FAINT,
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: "14px 12px",
    textAlign: "left" as const,
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    position: "relative" as const,
  },
  planCardSelected: {
    border: `1px solid ${AMBER}`,
    background: AMBER2,
  },
  planBadge: {
    display: "inline-block",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.50)",
    background: "rgba(255,255,255,0.08)",
    borderRadius: 99,
    padding: "2px 8px",
    marginBottom: 4,
    alignSelf: "flex-start" as const,
  },
  planBadgeGold: {
    color: AMBER,
    background: AMBER2,
  },
  planLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: WHITE,
    margin: 0,
  },
  planPrice: {
    fontSize: 22,
    fontWeight: 900,
    color: WHITE,
    margin: "2px 0 0",
    letterSpacing: "-0.02em",
  },
  planNote: {
    fontSize: 10,
    color: DIM,
    margin: 0,
    fontWeight: 500,
  },
  planDesc: {
    fontSize: 11,
    color: "rgba(255,255,255,0.40)",
    margin: "6px 0 0",
    lineHeight: 1.4,
  },

  // Payment
  paySection: {
    padding: "0 16px 32px",
    maxWidth: 480,
    margin: "0 auto",
  },
  payCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 20,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  payRecap: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 0 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  payRecapLabel: {
    fontSize: 12,
    color: DIM,
    fontWeight: 600,
  },
  payRecapPrice: {
    fontSize: 16,
    fontWeight: 800,
    color: AMBER,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "rgba(255,255,255,0.08)",
  },
  dividerText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.30)",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  cryptoBtn: {
    width: "100%",
    padding: "13px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,183,0,0.35)",
    background: "rgba(255,183,0,0.08)",
    color: "rgba(255,183,0,0.90)",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 0.15s",
    letterSpacing: "0.01em",
  },
  legalNote: {
    fontSize: 10,
    color: "rgba(255,255,255,0.25)",
    lineHeight: 1.6,
    textAlign: "center",
    margin: 0,
  },

  // Footer
  footer: {
    padding: "16px 16px 40px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  footerLink: {
    fontSize: 11,
    color: "rgba(255,255,255,0.30)",
    textDecoration: "none",
  },
  footerDot: {
    fontSize: 11,
    color: "rgba(255,255,255,0.20)",
  },

  // Success
  successWrap: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
    textAlign: "center",
    gap: 16,
  },
  successIcon: {
    fontSize: 64,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 900,
    color: WHITE,
    margin: 0,
  },
  successBody: {
    fontSize: 15,
    color: DIM,
    lineHeight: 1.6,
    maxWidth: 340,
    margin: 0,
  },
  successBtn: {
    display: "inline-block",
    marginTop: 8,
    padding: "14px 32px",
    borderRadius: 14,
    background: `linear-gradient(135deg, ${AMBER}, #c97a1e)`,
    color: "#000",
    fontWeight: 800,
    fontSize: 15,
    textDecoration: "none",
    letterSpacing: "0.01em",
  },
};
