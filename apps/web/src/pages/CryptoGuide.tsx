import { useEffect, useState } from "react";
import { usePrivy, useWallets, useAddFunds, useConnectWallet } from "@privy-io/react-auth";
import { getPreferredWallet, setPreferredWallet, WalletTypeIcon } from "@/components/payments/PayInWalletChips";

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
    pageTitle: "Crypto Wallet Guide — PNPtv!",
    hero: "Your PNPtv Wallet — complete guide.",
    heroSub: "Everything you need to know about your built-in crypto wallet, funded with USDC on Base.",

    tocTitle: "Jump to section",
    toc: [
      { id: "s1", label: "What is the PNPtv Wallet?" },
      { id: "s2", label: "How to Fund Your Wallet" },
      { id: "s3", label: "How to Pay on PNPtv" },
      { id: "s4", label: "Send to Another Wallet or Exchange" },
      { id: "s5", label: "Export Your Private Keys" },
      { id: "s6", label: "Withdraw to Bank / Exchange" },
      { id: "faq", label: "FAQ" },
    ],

    s1Eyebrow: "SECTION 1",
    s1Title: "What is the PNPtv! Wallet?",
    s1Body: "Every member automatically gets a non-custodial embedded crypto wallet, powered by Privy (privy.io). Here is what that means:",
    s1Points: [
      { heading: "PNPtv is the app, Privy is the infrastructure.", body: "PNPtv builds the experience. Privy provides the wallet technology. Neither PNPtv nor Privy owns your wallet." },
      { heading: "You are the only owner.", body: "Your wallet is controlled exclusively by your passkey or login credentials. No one at PNPtv can access, freeze, or move your funds." },
      { heading: "USDC on Base.", body: "Your wallet holds USDC — the industry-standard stablecoin — on the Base blockchain (built by Coinbase). 1 USDC = 1 USD. Always." },
      { heading: "No seed phrase needed.", body: "Your passkey IS your key. You don't need to write down a 12-word recovery phrase. You can export your private key any time (see Section 5)." },
      { heading: "Your wallet address.", body: "Your wallet address is visible in the 💎 widget (bottom-right of any page). This is a public identifier — safe to share for receiving USDC." },
    ],

    s2Eyebrow: "SECTION 2",
    s2Title: "How to Fund Your Wallet",
    s2OptionA: "Option A — Card, Apple Pay, or Google Pay",
    s2OptionABody: "The easiest way. Tap the button below, choose your amount, and pay with any major credit/debit card, Apple Pay, or Google Pay through our regulated partners (Stripe, MoonPay, Ramp). USDC arrives in your wallet in under 2 minutes.",
    s2Button: "💳 Fund with card →",
    s2ButtonSignIn: "Sign in to fund your wallet",
    s2Fine: "Minimum $20 for card onramp. Fees shown before confirming.",
    s2OptionB: "Option B — Send USDC from another wallet or exchange",
    s2OptionBSteps: [
      "Copy your wallet address from the 💎 icon (bottom-right of any page).",
      "Open your exchange (Coinbase, Kraken, Binance, OKX) or wallet (MetaMask, Trust).",
      "Send USDC on the Base network — NOT Ethereum mainnet, NOT Polygon.",
      "Funds arrive in 1–3 minutes. Minimum recommended: $5 USDC.",
    ],
    s2OptionBWarning: "USDC on Base only. Sending on the wrong network may result in permanent loss.",
    s2OptionC: "Option C — Connect an external wallet",
    s2OptionCBody: "Already have crypto in Trust Wallet or MetaMask? Connect it directly to PNPtv and pay from your existing wallet.",
    connectExternal: "🔗 Connect Trust / MetaMask",
    connectExternalHint: "Already have crypto? Use your existing wallet instead.",
    connectErrorFallback: "Could not connect wallet. Please try again.",
    walletActiveLabel: "Paying from",
    walletAddressLabel: "Your wallet address",

    s3Eyebrow: "SECTION 3",
    s3Title: "How to Pay on PNPtv",
    s3Body: "Once your wallet has a balance, every paid feature works with one tap. Tap 💎 at checkout → popup opens → confirm → done.",
    s3Features: [
      { emoji: "👑", label: "PRIME membership" },
      { emoji: "💎", label: "Ru$h 💎 tokens" },
      { emoji: "💸", label: "Tips to creators" },
      { emoji: "📞", label: "Private video calls" },
      { emoji: "🔐", label: "Exclusive channels" },
      { emoji: "🎉", label: "Paid hangouts" },
    ],
    s3Rush: "About Ru$h 💎",
    s3RushBody: "Ru$h is PNPtv's internal currency. 1 USD = 6 Ru$h. Zero fees. Ru$h cannot be withdrawn (it is not a public token yet) but it is perfect for tips and live stream moments. Your Ru$h never expire.",

    s4Eyebrow: "SECTION 4",
    s4Title: "How to Send to Another Wallet or Exchange",
    s4Steps: [
      { n: "1", text: "Open the 💎 wallet widget (bottom-right of any page)." },
      { n: "2", text: 'Tap "Send" or copy your wallet address to receive funds.' },
      { n: "3", text: 'To send OUT: tap Send, enter the recipient\'s Base network address, enter the amount in USDC, and confirm with your passkey.' },
      { n: "4", text: "Compatible exchanges: Coinbase, Kraken, Binance (Base network), OKX. Always select \"Base\" network when depositing to an exchange — NOT Ethereum." },
      { n: "5", text: "Gas fees: under $0.01 on Base. You need a small amount of ETH for gas. The 💎 widget shows your ETH balance. PNPtv auto-tops up gas for in-platform transactions." },
      { n: "6", text: "Transfers are irreversible. Double-check the address before confirming." },
    ],

    s5Eyebrow: "SECTION 5",
    s5Title: "How to Export Your Private Keys",
    s5Intro: "Your private key is the master password to your wallet. Anyone with it can access your funds. Export it to import your wallet into any compatible app.",
    s5Steps: [
      { n: "1", text: "Open Settings in PNPtv." },
      { n: "2", text: 'Tap "Wallet" → "Export Private Key" (or "Export Recovery Phrase").' },
      { n: "3", text: "Authenticate with your passkey." },
      { n: "4", text: "Your private key is displayed once — copy it and store it somewhere very safe (password manager, paper in a safe). NOT a screenshot. NOT email." },
      { n: "5", text: "With your private key you can import your wallet into MetaMask, Trust Wallet, or Coinbase Wallet." },
    ],
    s5Warning: "Never share your private key with anyone — including PNPtv support. We will NEVER ask for it.",

    s6Eyebrow: "SECTION 6",
    s6Title: "How to Withdraw to Bank / Exchange",
    s6OptionA: "Option A — Send USDC to an exchange, then sell",
    s6OptionABody: "Send USDC to Coinbase, Kraken, or another exchange (see Section 4), then sell USDC for your local currency and withdraw to your bank. This is the most common method.",
    s6OptionB: "Option B — Use a USDC offramp in the 💎 widget",
    s6OptionBBody: 'Tap the 💎 icon → "Withdraw" → select Ramp or MoonPay to convert USDC directly to local currency deposited to your bank or card.',

    faqTitle: "FAQ",
    faqs: [
      { q: "Do I need a crypto wallet app like MetaMask?", a: "No. Your PNPtv wallet is built in. You don't need to install anything." },
      { q: "Is my money safe?", a: "Yes. Only you can sign transactions — PNPtv never has access to your funds. Everything runs on the Base blockchain (built by Coinbase), audited and used by millions." },
      { q: "Does PNPtv own my wallet?", a: "No. Your wallet is powered by Privy (privy.io), a non-custodial infrastructure provider. PNPtv is the application using Privy's SDK. Neither PNPtv nor Privy can access, freeze, or seize your funds. Your passkey is the only key." },
      { q: "What happens to my wallet if I delete my PNPtv account?", a: "Your wallet exists on the blockchain independently. Your funds remain accessible via your exported private key. We strongly recommend exporting your key before deleting your account." },
      { q: "What network is the wallet on?", a: "Base (by Coinbase). Always select \"Base\" when sending or receiving — NOT Ethereum mainnet. Sending to the wrong network may result in permanent loss." },
      { q: "Can I use my wallet outside PNPtv?", a: "Yes. Export your private key (see Section 5) and import it into MetaMask, Trust Wallet, or Coinbase Wallet." },
      { q: "Can I withdraw my USDC?", a: "Yes. Send USDC out to any Base-compatible address (exchange or wallet) at any time. See Section 4." },
      { q: "What if my payment doesn't go through?", a: "Card funding almost never fails — but if it does, no money is charged. If you have USDC in your wallet but a purchase says 'insufficient balance', refresh the page — balances take up to 2 min to sync." },
      { q: "Which cards work?", a: "All major credit and debit cards (Visa, Mastercard, Amex, Discover), Apple Pay, Google Pay, and bank transfer through Stripe, MoonPay and Ramp. Non-US cards work too." },
    ],

    ctaTitle: "Ready?",
    ctaBody: "Fund your wallet now and start using PRIME, tipping creators, and booking private calls in seconds.",
    ctaButton: "💳 Fund my wallet →",
    backHome: "← Back to PNPtv",
  },

  es: {
    pageTitle: "Guía de Billetera Cripto — PNPtv!",
    hero: "Tu Billetera PNPtv — guía completa.",
    heroSub: "Todo lo que necesitas saber sobre tu billetera cripto integrada, cargada con USDC en la red Base.",

    tocTitle: "Ir a sección",
    toc: [
      { id: "s1", label: "¿Qué es la Billetera PNPtv?" },
      { id: "s2", label: "Cómo Cargar tu Billetera" },
      { id: "s3", label: "Cómo Pagar en PNPtv" },
      { id: "s4", label: "Enviar a Otra Wallet o Exchange" },
      { id: "s5", label: "Exportar tus Claves Privadas" },
      { id: "s6", label: "Retirar a Banco / Exchange" },
      { id: "faq", label: "Preguntas frecuentes" },
    ],

    s1Eyebrow: "SECCIÓN 1",
    s1Title: "¿Qué es la Billetera PNPtv!?",
    s1Body: "Cada miembro recibe automáticamente una billetera cripto no-custodial, impulsada por Privy (privy.io). Esto es lo que significa:",
    s1Points: [
      { heading: "PNPtv es la app, Privy es la infraestructura.", body: "PNPtv construye la experiencia. Privy provee la tecnología de billetera. Ni PNPtv ni Privy son dueños de tu billetera." },
      { heading: "Tú eres el único dueño.", body: "Tu billetera está controlada exclusivamente por tu passkey o credenciales de acceso. Nadie en PNPtv puede acceder, congelar o mover tus fondos." },
      { heading: "USDC en Base.", body: "Tu billetera tiene USDC — la stablecoin estándar — en la blockchain Base (creada por Coinbase). 1 USDC = 1 USD. Siempre." },
      { heading: "Sin frase semilla.", body: "Tu passkey ES tu llave. No necesitas anotar 12 palabras de recuperación. Puedes exportar tu clave privada en cualquier momento (ver Sección 5)." },
      { heading: "Tu dirección de billetera.", body: "Tu dirección de billetera es visible en el widget 💎 (abajo a la derecha en cualquier página). Es un identificador público — seguro de compartir para recibir USDC." },
    ],

    s2Eyebrow: "SECCIÓN 2",
    s2Title: "Cómo Cargar tu Billetera",
    s2OptionA: "Opción A — Tarjeta, Apple Pay o Google Pay",
    s2OptionABody: "La forma más sencilla. Toca el botón de abajo, elige tu monto y paga con cualquier tarjeta de crédito/débito, Apple Pay o Google Pay a través de nuestros socios regulados (Stripe, MoonPay, Ramp). El USDC llega a tu billetera en menos de 2 minutos.",
    s2Button: "💳 Cargar con tarjeta →",
    s2ButtonSignIn: "Inicia sesión para cargar tu billetera",
    s2Fine: "Mínimo $20 en onramp con tarjeta. Las comisiones se muestran antes de confirmar.",
    s2OptionB: "Opción B — Enviar USDC desde otra wallet o exchange",
    s2OptionBSteps: [
      "Copia tu dirección de billetera desde el ícono 💎 (abajo a la derecha en cualquier página).",
      "Abre tu exchange (Coinbase, Kraken, Binance, OKX) o wallet (MetaMask, Trust).",
      "Envía USDC en la red Base — NO en Ethereum mainnet, NO en Polygon.",
      "Los fondos llegan en 1–3 minutos. Mínimo recomendado: $5 USDC.",
    ],
    s2OptionBWarning: "Solo USDC en Base. Enviar en la red incorrecta puede resultar en pérdida permanente.",
    s2OptionC: "Opción C — Conecta una wallet externa",
    s2OptionCBody: "¿Ya tienes cripto en Trust Wallet o MetaMask? Conéctala directamente a PNPtv y paga desde tu wallet existente.",
    connectExternal: "🔗 Conectar Trust / MetaMask",
    connectExternalHint: "¿Ya tienes cripto? Usa tu wallet existente en su lugar.",
    connectErrorFallback: "No se pudo conectar la wallet. Intenta de nuevo.",
    walletActiveLabel: "Pagando desde",
    walletAddressLabel: "Tu dirección de billetera",

    s3Eyebrow: "SECCIÓN 3",
    s3Title: "Cómo Pagar en PNPtv",
    s3Body: "Una vez que tu billetera tenga saldo, cada función paga funciona con un solo toque. Toca 💎 al pagar → se abre el popup → confirma → listo.",
    s3Features: [
      { emoji: "👑", label: "Membresía PRIME" },
      { emoji: "💎", label: "Ru$h 💎 tokens" },
      { emoji: "💸", label: "Propinas a creadores" },
      { emoji: "📞", label: "Videollamadas privadas" },
      { emoji: "🔐", label: "Canales exclusivos" },
      { emoji: "🎉", label: "Hangouts pagos" },
    ],
    s3Rush: "Sobre Ru$h 💎",
    s3RushBody: "Ru$h es la moneda interna de PNPtv. 1 USD = 6 Ru$h. Sin comisiones. Los Ru$h no se pueden retirar (aún no es un token público) pero son perfectos para propinas y momentos en vivo. Tus Ru$h nunca vencen.",

    s4Eyebrow: "SECCIÓN 4",
    s4Title: "Enviar a Otra Wallet o Exchange",
    s4Steps: [
      { n: "1", text: "Abre el widget de billetera 💎 (abajo a la derecha en cualquier página)." },
      { n: "2", text: 'Toca "Enviar" o copia tu dirección de billetera para recibir fondos.' },
      { n: "3", text: 'Para enviar: toca Enviar, ingresa la dirección Base del destinatario, ingresa el monto en USDC y confirma con tu passkey.' },
      { n: "4", text: 'Exchanges compatibles: Coinbase, Kraken, Binance (red Base), OKX. Siempre selecciona "Base" al depositar en un exchange — NO Ethereum.' },
      { n: "5", text: "Comisiones de gas: menos de $0.01 en Base. Necesitas una pequeña cantidad de ETH para gas. El widget 💎 muestra tu saldo ETH. PNPtv carga gas automáticamente para transacciones en la plataforma." },
      { n: "6", text: "Las transferencias son irreversibles. Verifica la dirección antes de confirmar." },
    ],

    s5Eyebrow: "SECCIÓN 5",
    s5Title: "Cómo Exportar tus Claves Privadas",
    s5Intro: "Tu clave privada es la contraseña maestra de tu billetera. Cualquiera que la tenga puede acceder a tus fondos. Expórtala para importar tu billetera en cualquier app compatible.",
    s5Steps: [
      { n: "1", text: "Abre Configuración en PNPtv." },
      { n: "2", text: 'Toca "Billetera" → "Exportar Clave Privada" (o "Exportar Frase de Recuperación").' },
      { n: "3", text: "Autentícate con tu passkey." },
      { n: "4", text: "Tu clave privada se muestra una vez — cópiala y guárdala en un lugar muy seguro (gestor de contraseñas, papel en caja fuerte). NO una captura de pantalla. NO por email." },
      { n: "5", text: "Con tu clave privada puedes importar tu billetera en MetaMask, Trust Wallet o Coinbase Wallet." },
    ],
    s5Warning: "Nunca compartas tu clave privada con nadie — incluido el soporte de PNPtv. NUNCA te la pediremos.",

    s6Eyebrow: "SECCIÓN 6",
    s6Title: "Retirar a Banco / Exchange",
    s6OptionA: "Opción A — Envía USDC a un exchange y vende",
    s6OptionABody: "Envía USDC a Coinbase, Kraken u otro exchange (ver Sección 4), luego vende USDC por tu moneda local y retira a tu banco. Es el método más común.",
    s6OptionB: "Opción B — Usa un offramp de USDC en el widget 💎",
    s6OptionBBody: 'Toca el ícono 💎 → "Retirar" → selecciona Ramp o MoonPay para convertir USDC directamente a moneda local depositada en tu banco o tarjeta.',

    faqTitle: "Preguntas frecuentes",
    faqs: [
      { q: "¿Necesito una app de wallet como MetaMask?", a: "No. Tu billetera PNPtv está integrada. No necesitas instalar nada." },
      { q: "¿Mi dinero está seguro?", a: "Sí. Solo tú puedes firmar transacciones — PNPtv nunca tiene acceso a tus fondos. Todo corre en la red Base (construida por Coinbase), auditada y usada por millones." },
      { q: "¿PNPtv es dueño de mi billetera?", a: "No. Tu billetera está impulsada por Privy (privy.io), un proveedor de infraestructura no-custodial. PNPtv es la aplicación que usa el SDK de Privy. Ni PNPtv ni Privy pueden acceder, congelar o confiscar tus fondos. Tu passkey es la única llave." },
      { q: "¿Qué pasa con mi billetera si elimino mi cuenta PNPtv?", a: "Tu billetera existe en la blockchain de forma independiente. Tus fondos siguen siendo accesibles con tu clave privada exportada. Recomendamos exportar tu clave antes de eliminar tu cuenta." },
      { q: "¿En qué red está la billetera?", a: 'Base (de Coinbase). Siempre selecciona "Base" al enviar o recibir — NO Ethereum mainnet. Enviar a la red incorrecta puede resultar en pérdida permanente.' },
      { q: "¿Puedo usar mi billetera fuera de PNPtv?", a: "Sí. Exporta tu clave privada (ver Sección 5) e impórtala en MetaMask, Trust Wallet o Coinbase Wallet." },
      { q: "¿Puedo retirar mi USDC?", a: "Sí. Envía USDC a cualquier dirección compatible con Base (exchange o wallet) en cualquier momento. Ver Sección 4." },
      { q: "¿Y si mi pago no pasa?", a: "El pago con tarjeta casi nunca falla — pero si falla, no se cobra. Si tienes USDC pero dice 'saldo insuficiente', refresca la página — los saldos tardan hasta 2 min en sincronizar." },
      { q: "¿Qué tarjetas funcionan?", a: "Todas las tarjetas de crédito y débito principales (Visa, Mastercard, Amex, Discover), Apple Pay, Google Pay y transferencia bancaria a través de Stripe, MoonPay y Ramp. También funcionan tarjetas fuera de EE.UU." },
    ],

    ctaTitle: "¿Lista/o?",
    ctaBody: "Carga tu billetera ahora y empieza a usar PRIME, dar propinas a creadores y agendar llamadas privadas en segundos.",
    ctaButton: "💳 Cargar mi billetera →",
    backHome: "← Volver a PNPtv",
  },
};

const sCard: React.CSSProperties = { marginBottom: 24, padding: 20, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" };
const sEyebrow = (color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color, margin: 0 });
const sH2: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: "6px 0 10px" };
const sBody: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.55, margin: "0 0 16px" };
const sWarning: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", color: "#fca5a5", fontSize: 12, fontWeight: 600, lineHeight: 1.5 };
const sNote: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.35)", color: "#6ee7b7", fontSize: 12, fontWeight: 600, lineHeight: 1.5 };
const sStep = (n: string | number, text: string) => (
  <div key={n} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
    <div style={{ minWidth: 24, height: 24, borderRadius: "50%", background: "rgba(212,0,122,0.22)", border: "1px solid rgba(212,0,122,0.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#f472b6", flexShrink: 0, marginTop: 1 }}>{n}</div>
    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>{text}</span>
  </div>
);

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

  const fundBtn = (size: "lg" | "md" = "lg") => (
    <button
      type="button"
      onClick={handleFund}
      disabled={funding}
      style={{
        minHeight: size === "lg" ? 52 : 48, width: "100%", padding: "0 24px", borderRadius: 12, border: "none",
        fontSize: size === "lg" ? 16 : 15, fontWeight: 700, color: "#fff",
        background: "linear-gradient(135deg, #D4007A, #E69138)",
        cursor: funding ? "wait" : "pointer",
        opacity: funding ? 0.6 : 1,
      }}
    >
      {authenticated ? (size === "lg" ? t.s2Button : t.ctaButton) : t.s2ButtonSignIn}
    </button>
  );

  return (
    <div style={{ minHeight: "100dvh", background: "var(--pnp-background, #121212)", color: "#ffffff", overflowX: "hidden" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", maxWidth: 720, margin: "0 auto" }}>
        <a href="/"><img src="/logo-header.png" alt="PNPtv!" style={{ height: 32, width: "auto" }} /></a>
        <LangToggle lang={lang} onChange={handleLangChange} />
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "8px 20px 96px" }}>

        {/* Hero */}
        <section style={{ padding: "24px 0 32px", textAlign: "center" }}>
          <div style={{ display: "inline-block", padding: "24px", borderRadius: 16, background: "linear-gradient(135deg, rgba(212,0,122,0.12), rgba(230,145,56,0.12), rgba(16,185,129,0.12))", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 12 }}>💎</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px", lineHeight: 1.15 }}>{t.hero}</h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", margin: 0, lineHeight: 1.5, maxWidth: 480 }}>{t.heroSub}</p>
          </div>
        </section>

        {/* Table of Contents */}
        <section style={{ marginBottom: 28, padding: "16px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "0 0 10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t.tocTitle}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {t.toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                style={{ fontSize: 13, color: "rgba(212,0,122,0.90)", textDecoration: "none", padding: "4px 0", lineHeight: 1.4 }}
              >
                → {item.label}
              </a>
            ))}
          </div>
        </section>

        {/* Section 1 — What is the wallet */}
        <section id="s1" style={sCard}>
          <p style={sEyebrow("#34d399")}>{t.s1Eyebrow}</p>
          <h2 style={sH2}>{t.s1Title}</h2>
          <p style={sBody}>{t.s1Body}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {t.s1Points.map((pt) => (
              <div key={pt.heading} style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{pt.heading}</p>
                <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.62)", lineHeight: 1.5 }}>{pt.body}</p>
              </div>
            ))}
          </div>
          {authenticated && activeWallet && (
            <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.35)" }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#6ee7b7" }}>{t.walletAddressLabel}</p>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.75)", wordBreak: "break-all" }}>
                {activeWallet.address}
              </p>
              {isExternalActive && activeWalletLabel && (
                <span style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.35)", color: "#6ee7b7" }}>
                  <WalletTypeIcon clientType={activeWallet.walletClientType} size={11} />
                  {activeWalletLabel}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Section 2 — Fund */}
        <section id="s2" style={sCard}>
          <p style={sEyebrow("#f9a8d4")}>{t.s2Eyebrow}</p>
          <h2 style={sH2}>{t.s2Title}</h2>

          {/* Option A */}
          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: "0 0 6px" }}>{t.s2OptionA}</p>
          <p style={{ ...sBody, marginBottom: 12 }}>{t.s2OptionABody}</p>
          {fundBtn("lg")}
          {fundError && (
            <p style={{ fontSize: 12, color: "#fca5a5", marginTop: 10, textAlign: "center" }}>{fundError}</p>
          )}
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8, lineHeight: 1.5 }}>{t.s2Fine}</p>

          <div style={{ margin: "20px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }} />

          {/* Option B */}
          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: "0 0 10px" }}>{t.s2OptionB}</p>
          {t.s2OptionBSteps.map((step, i) => sStep(i + 1, step))}
          <div style={{ marginTop: 4, ...sWarning }}>{t.s2OptionBWarning}</div>

          {authenticated && activeWallet && shortAddress && (
            <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>{t.walletAddressLabel}</p>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.80)", wordBreak: "break-all" }}>{activeWallet.address}</p>
            </div>
          )}

          <div style={{ margin: "20px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }} />

          {/* Option C */}
          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: "0 0 6px" }}>{t.s2OptionC}</p>
          <p style={{ ...sBody, marginBottom: 12 }}>{t.s2OptionCBody}</p>
          <button
            type="button"
            onClick={handleConnectExternal}
            style={{
              minHeight: 44, width: "100%", padding: "0 24px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.85)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {t.connectExternal}
          </button>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5, textAlign: "center" }}>{t.connectExternalHint}</p>
          {connectError && (
            <p style={{ fontSize: 11, color: "#fca5a5", marginTop: 8, textAlign: "center" }}>{connectError}</p>
          )}
        </section>

        {/* Section 3 — Pay */}
        <section id="s3" style={sCard}>
          <p style={sEyebrow("#a990ff")}>{t.s3Eyebrow}</p>
          <h2 style={sH2}>{t.s3Title}</h2>
          <p style={sBody}>{t.s3Body}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
            {t.s3Features.map((f) => (
              <div
                key={f.label}
                style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10 }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{f.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(169,144,255,0.10)", border: "1px solid rgba(169,144,255,0.30)" }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#c4b5fd" }}>{t.s3Rush}</p>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.68)", lineHeight: 1.55 }}>{t.s3RushBody}</p>
          </div>
        </section>

        {/* Section 4 — Send */}
        <section id="s4" style={sCard}>
          <p style={sEyebrow("#fbbf24")}>{t.s4Eyebrow}</p>
          <h2 style={sH2}>{t.s4Title}</h2>
          <div style={{ marginTop: 4 }}>
            {t.s4Steps.map((s) => sStep(s.n, s.text))}
          </div>
        </section>

        {/* Section 5 — Export keys */}
        <section id="s5" style={sCard}>
          <p style={sEyebrow("#f87171")}>{t.s5Eyebrow}</p>
          <h2 style={sH2}>{t.s5Title}</h2>
          <p style={sBody}>{t.s5Intro}</p>
          <div style={{ marginBottom: 16 }}>
            {t.s5Steps.map((s) => sStep(s.n, s.text))}
          </div>
          <div style={sWarning}>{t.s5Warning}</div>
        </section>

        {/* Section 6 — Withdraw */}
        <section id="s6" style={sCard}>
          <p style={sEyebrow("#34d399")}>{t.s6Eyebrow}</p>
          <h2 style={sH2}>{t.s6Title}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.90)" }}>{t.s6OptionA}</p>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>{t.s6OptionABody}</p>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.90)" }}>{t.s6OptionB}</p>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>{t.s6OptionBBody}</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={{ marginBottom: 32 }}>
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

        {/* CTA */}
        <section style={{ padding: 20, borderRadius: 16, background: "linear-gradient(135deg, rgba(212,0,122,0.14), rgba(230,145,56,0.14))", border: "1px solid rgba(212,0,122,0.30)", textAlign: "center" }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>{t.ctaTitle}</h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", margin: "0 0 16px", lineHeight: 1.5 }}>{t.ctaBody}</p>
          {fundBtn("md")}
          {fundError && (
            <p style={{ fontSize: 12, color: "#fca5a5", marginTop: 10, textAlign: "center" }}>{fundError}</p>
          )}
          <p style={{ marginTop: 16 }}>
            <a href="/" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>{t.backHome}</a>
          </p>
        </section>
      </main>
    </div>
  );
}
