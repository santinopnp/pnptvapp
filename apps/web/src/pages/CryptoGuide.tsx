import { useEffect, useState } from "react";
import { usePrivy, useWallets, useAddFunds, useConnectWallet } from "@privy-io/react-auth";
import { getPreferredWallet, setPreferredWallet } from "@/components/payments/PayInWalletChips";

type Lang = "en" | "es";

const LANG_KEY = "pnptv:lang";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_CAIP2 = "eip155:8453" as const;

function getInitialLang(): Lang {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s === "en" || s === "es") return s;
  } catch { /* ignore */ }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const isEn = lang === "en";
  const base: React.CSSProperties = { background: "none", border: "none", padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 18, minHeight: 36, minWidth: 44 };
  return (
    <div style={{ display: "flex", background: "rgba(255,255,255,0.10)", borderRadius: 20, padding: 2 }}>
      <button onClick={() => onChange("en")} style={{ ...base, background: isEn ? "#fff" : "transparent", color: isEn ? "#120d14" : "#8E8E93" }}>EN</button>
      <button onClick={() => onChange("es")} style={{ ...base, background: !isEn ? "#fff" : "transparent", color: !isEn ? "#120d14" : "#8E8E93" }}>ES</button>
    </div>
  );
}

const T = {
  en: {
    pageTitle: "Set up your PNPtv Wallet — PNPtv!",
    hero: "Crypto that finally feels normal.",
    heroSub: "One built-in wallet, one balance, one tap. Top it up with your card, Apple Pay or Google Pay — then spend it anywhere on the app.",
    step1Eyebrow: "STEP 1",
    step1Title: "Your wallet is already created",
    step1Body: "When you sign in to PNPtv, we automatically create a private wallet just for you on the Base blockchain. No app to install, no seed phrases, no external wallet to link. It lives inside your account.",
    step1BadgeSignedIn: "✓ You're signed in — your wallet is ready.",
    step1BadgeSignIn: "Sign in first to see your wallet address.",
    step2Eyebrow: "STEP 2",
    step2Title: "Fund it with a card",
    step2Body: "Tap the button below to load USDC into your wallet. You can pay with a credit or debit card, Apple Pay, Google Pay, or bank transfer through our regulated partners (Stripe, MoonPay, Ramp). Money arrives as USDC on the Base network — the industry-standard stablecoin, 1 USDC = $1.",
    step2Button: "💳 Fund with card →",
    step2ButtonSignIn: "Sign in to fund your wallet",
    step2Fine: "Minimum $20. Most transactions settle in under 2 minutes. Fees vary by provider — you'll see the exact amount before confirming.",
    connectExternal: "Or connect Trust / MetaMask",
    connectExternalHint: "Already have crypto? Use your existing wallet instead.",
    connectErrorFallback: "Could not connect wallet. Please try again.",
    walletActiveLabel: "Paying from",
    step3Eyebrow: "STEP 3",
    step3Title: "Spend it anywhere",
    step3Body: "Once your wallet has a balance, every paid feature in PNPtv works with one tap. No re-entering payment info, no waiting for crypto confirmations, no separate wallet apps.",
    step3Features: [
      { emoji: "👑", label: "PRIME membership" },
      { emoji: "💎", label: "Ru$h tokens" },
      { emoji: "💸", label: "Tips to cammers" },
      { emoji: "📞", label: "Private video calls" },
      { emoji: "🔐", label: "Exclusive channels" },
      { emoji: "🎉", label: "Paid hangouts" },
    ],
    faqTitle: "Common questions",
    faqs: [
      { q: "Do I need a crypto wallet app like MetaMask?", a: "No. Your PNPtv wallet is built in. You don't need to install anything." },
      { q: "Is my money safe?", a: "Yes. Only you can sign transactions — PNPtv never has access to your funds. Everything runs on the Base blockchain (built by Coinbase), audited and used by millions." },
      { q: "Can I withdraw my USDC?", a: "Yes. You can send USDC out of your wallet to any Base-compatible address at any time. Copy your wallet address from the wallet menu (💎 icon in the top bar)." },
      { q: "What if my payment doesn't go through?", a: "Card funding almost never fails — but if it does, no money is charged. If you have USDC in your wallet but a purchase says 'insufficient balance', refresh the page — balances take up to 2 min to sync." },
      { q: "Which cards work?", a: "All major credit and debit cards (Visa, Mastercard, Amex, Discover), Apple Pay, Google Pay, and bank transfer through Stripe, MoonPay and Ramp. Non-US cards work too." },
    ],
    ctaTitle: "Ready?",
    ctaBody: "Fund your wallet now and start using PRIME, tipping cammers, and booking private calls in seconds.",
    ctaButton: "💳 Fund my wallet →",
    backHome: "← Back to PNPtv",
  },
  es: {
    pageTitle: "Configura tu Billetera PNPtv — PNPtv!",
    hero: "Cripto que por fin se siente normal.",
    heroSub: "Una sola billetera integrada, un saldo, un toque. Recárgala con tu tarjeta, Apple Pay o Google Pay — y úsala en toda la app.",
    step1Eyebrow: "PASO 1",
    step1Title: "Tu billetera ya está creada",
    step1Body: "Cuando inicias sesión en PNPtv, automáticamente creamos una billetera privada solo para ti en la red Base. Sin apps que instalar, sin frases semilla, sin billeteras externas que conectar. Vive dentro de tu cuenta.",
    step1BadgeSignedIn: "✓ Ya estás dentro — tu billetera está lista.",
    step1BadgeSignIn: "Inicia sesión primero para ver tu dirección de billetera.",
    step2Eyebrow: "PASO 2",
    step2Title: "Cárgala con tarjeta",
    step2Body: "Toca el botón de abajo para cargar USDC en tu billetera. Puedes pagar con tarjeta de crédito o débito, Apple Pay, Google Pay o transferencia bancaria a través de nuestros socios regulados (Stripe, MoonPay, Ramp). El dinero llega como USDC en la red Base — la stablecoin estándar, 1 USDC = $1.",
    step2Button: "💳 Cargar con tarjeta →",
    step2ButtonSignIn: "Inicia sesión para cargar tu billetera",
    step2Fine: "Mínimo $20. La mayoría de transacciones se procesan en menos de 2 minutos. Las comisiones varían según el proveedor — verás el monto exacto antes de confirmar.",
    connectExternal: "O conecta Trust / MetaMask",
    connectExternalHint: "¿Ya tienes cripto? Usa tu wallet existente en su lugar.",
    connectErrorFallback: "No se pudo conectar la wallet. Intenta de nuevo.",
    walletActiveLabel: "Pagando desde",
    step3Eyebrow: "PASO 3",
    step3Title: "Úsala en toda la app",
    step3Body: "Una vez que tu billetera tenga saldo, cada función paga en PNPtv funciona con un solo toque. Sin volver a ingresar datos de pago, sin esperar confirmaciones cripto, sin apps de wallet separadas.",
    step3Features: [
      { emoji: "👑", label: "Membresía PRIME" },
      { emoji: "💎", label: "Ru$h tokens" },
      { emoji: "💸", label: "Propinas a cammers" },
      { emoji: "📞", label: "Videollamadas privadas" },
      { emoji: "🔐", label: "Canales exclusivos" },
      { emoji: "🎉", label: "Hangouts pagos" },
    ],
    faqTitle: "Preguntas frecuentes",
    faqs: [
      { q: "¿Necesito una app de wallet como MetaMask?", a: "No. Tu billetera PNPtv está integrada. No necesitas instalar nada." },
      { q: "¿Mi dinero está seguro?", a: "Sí. Solo tú puedes firmar transacciones — PNPtv nunca tiene acceso a tus fondos. Todo corre en la red Base (construida por Coinbase), auditada y usada por millones." },
      { q: "¿Puedo retirar mi USDC?", a: "Sí. Puedes enviar USDC desde tu billetera a cualquier dirección compatible con Base en cualquier momento. Copia tu dirección desde el menú de billetera (ícono 💎 en la barra superior)." },
      { q: "¿Y si mi pago no pasa?", a: "El pago con tarjeta casi nunca falla — pero si falla, no se cobra dinero. Si tienes USDC en tu billetera pero una compra dice 'saldo insuficiente', refresca la página — los saldos tardan hasta 2 min en sincronizar." },
      { q: "¿Qué tarjetas funcionan?", a: "Todas las tarjetas de crédito y débito principales (Visa, Mastercard, Amex, Discover), Apple Pay, Google Pay y transferencia bancaria a través de Stripe, MoonPay y Ramp. También funcionan tarjetas fuera de EE.UU." },
    ],
    ctaTitle: "¿Listo?",
    ctaBody: "Carga tu billetera ahora y empieza a usar PRIME, dar propinas a cammers y agendar llamadas privadas en segundos.",
    ctaButton: "💳 Cargar mi billetera →",
    backHome: "← Volver a PNPtv",
  },
};

export default function CryptoGuide() {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { addFunds } = useAddFunds();
  const t = T[lang];
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      setConnectError(null);
      if (wallet?.address) {
        setPreferredWallet(wallet.address);
        setPreferredAddr(wallet.address);
      }
    },
    onError: (err) => {
      const msg = typeof err === "string" ? err : String(err);
      if (/exited|closed|cancel|reject/i.test(msg)) return;
      setConnectError(t.connectErrorFallback);
    },
  });
  // Preferred wallet: honor the choice made in the 💎 FAB / WalletHomeSheet so
  // card top-ups here fund the wallet the user is actually paying from.
  const [preferredAddr, setPreferredAddr] = useState<string | null>(() => getPreferredWallet());
  const preferredWallet = preferredAddr ? wallets.find((w) => w.address === preferredAddr) : null;
  const activeWallet = preferredWallet
    || wallets.find((w) => w.walletClientType === "privy")
    || wallets[0]
    || null;
  const isExternalActive = !!activeWallet && activeWallet.walletClientType !== "privy";

  useEffect(() => { document.title = t.pageTitle; }, [lang, t.pageTitle]);

  const handleLangChange = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  };

  const handleFund = async () => {
    if (!authenticated) { login(); return; }
    if (!activeWallet) { setFundError("Wallet not ready. Please refresh."); return; }
    setFundError(null); setFunding(true);
    try {
      await addFunds({
        destination: { address: activeWallet.address, chain: BASE_CAIP2, asset: USDC_BASE },
        fiat: { defaultAmount: "30" },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel|closed|reject/i.test(msg)) setFundError(msg);
    } finally { setFunding(false); }
  };

  const handleConnectExternal = () => {
    setConnectError(null);
    try { connectWallet(); } catch { /* swallow — onError handles UI */ }
  };

  const shortAddress = activeWallet?.address
    ? `${activeWallet.address.slice(0, 6)}…${activeWallet.address.slice(-4)}`
    : null;
  const activeWalletLabel = !activeWallet
    ? null
    : activeWallet.walletClientType === "privy"
      ? "PNPtv"
      : activeWallet.walletClientType === "metamask"
        ? "MetaMask"
        : activeWallet.walletClientType === "coinbase_wallet"
          ? "Coinbase"
          : activeWallet.walletClientType === "walletconnect"
            ? "WalletConnect"
            : "External";

  return (
    <div style={{ minHeight: "100dvh", background: "var(--pnp-background, #121212)", color: "#ffffff", overflowX: "hidden" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", maxWidth: 720, margin: "0 auto" }}>
        <a href="/"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 32, width: "auto" }} /></a>
        <LangToggle lang={lang} onChange={handleLangChange} />
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "8px 20px 96px" }}>
        <section style={{ padding: "24px 0 32px", textAlign: "center" }}>
          <div style={{ display: "inline-block", padding: "24px", borderRadius: 16, background: "linear-gradient(135deg, rgba(212,0,122,0.12), rgba(230,145,56,0.12), rgba(16,185,129,0.12))", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 12 }}>💳</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px", lineHeight: 1.15 }}>{t.hero}</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", margin: 0, lineHeight: 1.5, maxWidth: 480 }}>{t.heroSub}</p>
          </div>
        </section>

        <section style={{ marginBottom: 24, padding: 20, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#34d399", margin: 0 }}>{t.step1Eyebrow}</p>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "6px 0 10px" }}>{t.step1Title}</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.55, margin: "0 0 16px" }}>{t.step1Body}</p>
          {authenticated && activeWallet ? (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.35)", color: "#6ee7b7", fontSize: 13, fontWeight: 600 }}>
              {t.step1BadgeSignedIn}
              {isExternalActive && activeWalletLabel && (
                <span style={{ fontSize: 11, marginLeft: 8, padding: "1px 6px", borderRadius: 6, background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.35)" }}>{activeWalletLabel}</span>
              )}
              {shortAddress && <span style={{ fontFamily: "monospace", opacity: 0.75, marginLeft: 8 }}>{shortAddress}</span>}
            </div>
          ) : (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
              {t.step1BadgeSignIn}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 24, padding: 20, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#f9a8d4", margin: 0 }}>{t.step2Eyebrow}</p>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "6px 0 10px" }}>{t.step2Title}</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.55, margin: "0 0 16px" }}>{t.step2Body}</p>
          <button
            type="button"
            onClick={handleFund}
            disabled={funding}
            style={{
              minHeight: 52, width: "100%", padding: "0 24px", borderRadius: 12, border: "none",
              fontSize: 16, fontWeight: 700, color: "#fff",
              background: "linear-gradient(135deg, #D4007A, #E69138)",
              cursor: funding ? "wait" : "pointer",
              opacity: funding ? 0.6 : 1,
            }}
          >
            {authenticated ? t.step2Button : t.step2ButtonSignIn}
          </button>
          {fundError && (
            <p style={{ fontSize: 12, color: "#fca5a5", marginTop: 10, textAlign: "center" }}>{fundError}</p>
          )}

          {/* Alt path — bring your own wallet. Same handshake used by the FAB
              and Onboarding step 7 so a user landing on this guide with Trust
              already installed can skip the card onramp. */}
          <button
            type="button"
            onClick={handleConnectExternal}
            style={{
              marginTop: 10, minHeight: 44, width: "100%", padding: "0 24px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.85)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            🔗 {t.connectExternal}
          </button>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5, textAlign: "center" }}>{t.connectExternalHint}</p>
          {connectError && (
            <p style={{ fontSize: 11, color: "#fca5a5", marginTop: 8, textAlign: "center" }}>{connectError}</p>
          )}

          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 12, lineHeight: 1.5 }}>{t.step2Fine}</p>
        </section>

        <section style={{ marginBottom: 24, padding: 20, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#a990ff", margin: 0 }}>{t.step3Eyebrow}</p>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "6px 0 10px" }}>{t.step3Title}</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.55, margin: "0 0 16px" }}>{t.step3Body}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {t.step3Features.map((f) => (
              <div
                key={f.label}
                style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10 }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{f.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px", padding: "0 4px" }}>{t.faqTitle}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {t.faqs.map((f) => (
              <details
                key={f.q}
                style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, listStyle: "none", color: "rgba(255,255,255,0.92)" }}>{f.q}</summary>
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section style={{ padding: 20, borderRadius: 16, background: "linear-gradient(135deg, rgba(212,0,122,0.14), rgba(230,145,56,0.14))", border: "1px solid rgba(212,0,122,0.30)", textAlign: "center" }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>{t.ctaTitle}</h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", margin: "0 0 16px", lineHeight: 1.5 }}>{t.ctaBody}</p>
          <button
            type="button"
            onClick={handleFund}
            disabled={funding}
            style={{
              minHeight: 48, padding: "0 24px", borderRadius: 12, border: "none",
              fontSize: 15, fontWeight: 700, color: "#fff",
              background: "linear-gradient(135deg, #D4007A, #E69138)",
              cursor: funding ? "wait" : "pointer",
              opacity: funding ? 0.6 : 1,
            }}
          >
            {authenticated ? t.ctaButton : t.step2ButtonSignIn}
          </button>
          <p style={{ marginTop: 16 }}>
            <a href="/" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>{t.backHome}</a>
          </p>
        </section>
      </main>
    </div>
  );
}
