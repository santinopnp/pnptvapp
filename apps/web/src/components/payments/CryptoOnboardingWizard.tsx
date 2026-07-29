import React, { useState } from "react";
import { WALLETS, type WalletKey } from "@/lib/cryptoWallets";

type Lang = "en" | "es";
const WALLET_KEYS: WalletKey[] = ["trust", "metamask"];

// ── Static copy tables ──────────────────────────────────────────────────────

const T = {
  eyebrow:   { en: "GETTING STARTED", es: "PARA EMPEZAR" },
  title:     { en: "Paying with crypto, made simple", es: "Paga con cripto, sin complicaciones" },

  // Screen 0 — intro + pick wallet
  cryptoIn3: { en: "Crypto in 3 lines", es: "Cripto en 3 líneas" },
  line1:     { en: "It's digital money you keep in a free 'wallet' app.", es: "Es dinero digital que guardas en una app 'wallet' gratuita." },
  line2:     { en: "Load it once, like a gift card — no bank, no card details shared.", es: "Cárgala una vez, como una tarjeta de regalo — sin banco, sin dar datos de tarjeta." },
  line3:     { en: "Setup takes ~2 minutes. After that, every payment is instant.", es: "La configuración toma ~2 minutos. Después, cada pago es instantáneo." },
  pick:      { en: "Pick a wallet", es: "Elige una wallet" },
  bothFree:  { en: "Both are free — you can't pick wrong.", es: "Las dos son gratis — no puedes equivocarte." },

  // Screen 1 — install
  installIt: { en: "Install it on your device:", es: "Instálala en tu dispositivo:" },
  iosTitle:  { en: "Download for iOS", es: "Descargar para iOS" },
  iosSub:    { en: "App Store", es: "App Store" },
  andTitle:  { en: "Download for Android", es: "Descargar para Android" },
  andSub:    { en: "Google Play", es: "Google Play" },
  chrTitle:  { en: "Add the Chrome extension", es: "Extensión para Chrome" },
  chrSub:    { en: "Chrome Web Store", es: "Chrome Web Store" },
  gtkLabel:  { en: "GOOD TO KNOW", es: "IMPORTANTE" },
  gtkBody:   { en: "Only use these links. Download links sent in chat are scams.", es: "Solo usa estos enlaces. Los links que te llegan por chat son estafas." },

  // Screens 2–5 — setup
  setupOf:   { en: "SETUP {n} OF 4", es: "CONFIGURACIÓN {n} DE 4" },
  keepSafe:  { en: "KEEP THIS SAFE", es: "GUÁRDALO BIEN" },
  keepSafeBody: { en: "Write the 12 words on paper. Never share them — PNPtv will never ask.", es: "Escribe las 12 palabras en papel. Nunca las compartas — PNPtv nunca las pedirá." },

  // Screen 6 — fund
  addMoney:  { en: "Add money", es: "Ponle dinero" },
  addMoneySub: { en: "Tap 'Buy' in your wallet and pay by card.", es: "Toca 'Comprar' en tu wallet y paga con tarjeta." },
  addMoneyBody: {
    en: "Choose ",
    es: "Elige ",
  },
  addMoneyBodyRest: {
    en: " — they're locked to the dollar, so your balance never moves on its own.",
    es: " — están atados al dólar, así tu saldo no se mueve solo.",
  },
  tipLabel:  { en: "TIP", es: "TIP" },
  tipBody:   { en: "Start with $20–30. You can always add more later.", es: "Empieza con $20–30. Siempre puedes agregar más después." },

  // Screen 7 — done
  ready:     { en: "You're ready", es: "¡Estás listo!" },
  readyBody: { en: "Spend it anywhere on PNPtv — no extra linking step.", es: "Úsalo en cualquier parte de PNPtv — sin paso extra." },
  linkSub:   { en: "Subscribe to a creator", es: "Suscríbete a un creador" },
  linkBuy:   { en: "Buy more tokens", es: "Compra más tokens" },
  linkBrowse:{ en: "Browse all creators", es: "Ver todos los creadores" },

  // Nav
  back:      { en: "← Back", es: "← Atrás" },
  next:      { en: "Next →", es: "Siguiente →" },
  doneApp:   { en: "Done — take me to the app", es: "Listo — llévame a la app" },
  finish:    { en: "Finish", es: "Finalizar" },

  // Step labels
  labels: {
    en: [
      "Step 1 of 7 — Pick a wallet",
      "Step 2 of 7 — Install",
      "Step 3 of 7 — Create wallet",
      "Step 4 of 7 — Lock it",
      "Step 5 of 7 — Back it up",
      "Step 6 of 7 — Confirm",
      "Step 7 of 7 — Add money",
      "All done",
    ],
    es: [
      "Paso 1 de 7 — Elige una wallet",
      "Paso 2 de 7 — Instalar",
      "Paso 3 de 7 — Crear la wallet",
      "Paso 4 de 7 — Bloquéala",
      "Paso 5 de 7 — Respáldala",
      "Paso 6 de 7 — Confirma",
      "Paso 7 de 7 — Ponle dinero",
      "Todo listo",
    ],
  },
};

const WALLET_TAG: Record<WalletKey, { en: string; es: string }> = {
  trust: { en: "PHONE", es: "TELÉFONO" },
  metamask: { en: "COMPUTER", es: "COMPUTADORA" },
};
const WALLET_ONELINE: Record<WalletKey, { en: string; es: string }> = {
  trust: { en: "Best if you use PNPtv on your phone.", es: "Mejor si usas PNPtv desde tu celular." },
  metamask: { en: "Best if you use PNPtv on a laptop.", es: "Mejor si usas PNPtv desde una laptop." },
};

interface SetupStep { title: string; body: string; }
const SETUP_STEPS: Record<WalletKey, Record<Lang, SetupStep[]>> = {
  trust: {
    en: [
      { title: 'Tap "Create a new wallet"', body: "No email, no ID — ready in under a minute." },
      { title: "Choose a passcode", body: "Like a lock-screen code. Keeps the app private on your phone." },
      { title: "Write down your 12 secret words", body: "Your only backup — write them on paper, keep them safe." },
      { title: "Confirm the words", body: "Tap them back in order. Done — your wallet is ready." },
    ],
    es: [
      { title: 'Toca "Crear una nueva wallet"', body: "Sin correo ni ID — lista en menos de un minuto." },
      { title: "Elige un código de acceso", body: "Como el código de pantalla. Mantiene la app privada en tu celular." },
      { title: "Escribe tus 12 palabras secretas", body: "Tu único respaldo — escríbelas en papel y guárdalas seguras." },
      { title: "Confirma las palabras", body: "Tócalas en orden. Listo — tu wallet está lista." },
    ],
  },
  metamask: {
    en: [
      { title: 'Click "Create a new wallet"', body: "No email, no ID — ready in under a minute." },
      { title: "Create a password", body: "Unlocks it on this computer only." },
      { title: "Write down your 12 secret words", body: "Your only backup — write them on paper, keep them safe." },
      { title: "Confirm the words", body: "Fill in the missing words, then pin the icon to your toolbar." },
    ],
    es: [
      { title: 'Haz clic en "Crear una nueva wallet"', body: "Sin correo ni ID — lista en menos de un minuto." },
      { title: "Crea una contraseña", body: "Solo desbloquea la app en esta computadora." },
      { title: "Escribe tus 12 palabras secretas", body: "Tu único respaldo — escríbelas en papel y guárdalas seguras." },
      { title: "Confirma las palabras", body: "Completa las palabras faltantes y fija el ícono en tu barra de herramientas." },
    ],
  },
};

// Screenshot slots — real images live at /crypto-guide-media/<slug>.png (add later).
const SCREENSHOT_HINTS: Record<string, { en: string; es: string; src: string }> = {
  "trust-1":  { en: "Trust Wallet — create wallet", es: "Trust Wallet — crear wallet", src: "/crypto-guide-media/tw-1.png" },
  "trust-2":  { en: "Trust Wallet — passcode",     es: "Trust Wallet — código de acceso", src: "/crypto-guide-media/tw-2.png" },
  "trust-3":  { en: "Trust Wallet — secret words", es: "Trust Wallet — palabras secretas", src: "/crypto-guide-media/tw-3.png" },
  "trust-4":  { en: "Trust Wallet — confirm words",es: "Trust Wallet — confirmar palabras", src: "/crypto-guide-media/tw-4.png" },
  "metamask-1": { en: "MetaMask — create wallet",   es: "MetaMask — crear wallet", src: "/crypto-guide-media/mm-1.png" },
  "metamask-2": { en: "MetaMask — password",        es: "MetaMask — contraseña", src: "/crypto-guide-media/mm-2.png" },
  "metamask-3": { en: "MetaMask — secret phrase",   es: "MetaMask — frase secreta", src: "/crypto-guide-media/mm-3.png" },
  "metamask-4": { en: "MetaMask — confirm phrase",  es: "MetaMask — confirmar frase", src: "/crypto-guide-media/mm-4.png" },
  "buy":      { en: "Wallet 'Buy' screen", es: "Pantalla 'Comprar' de la wallet", src: "/crypto-guide-media/buy.png" },
};

// ── Small building blocks (inline — no new files per project rule) ──────────

function ScreenshotSlot({ slotId, height, lang }: { slotId: string; height: number; lang: Lang }) {
  const hint = SCREENSHOT_HINTS[slotId];
  return (
    <div
      style={{
        marginTop: 14,
        height,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid #2A2A2A",
        background: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <img
        src={hint.src}
        alt={hint[lang]}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#6b6b70", pointerEvents: "none" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <span style={{ fontSize: 10, letterSpacing: ".05em", textAlign: "center", padding: "0 12px" }}>{hint[lang]}</span>
      </div>
    </div>
  );
}

function Callout({ variant, label, body }: { variant: "gold" | "red"; label: string; body: string }) {
  const color = variant === "gold" ? "#FFB454" : "#EF4444";
  const bg = variant === "gold" ? "rgba(255,180,84,.07)" : "rgba(239,68,68,.07)";
  return (
    <div style={{ marginTop: 12, borderLeft: `2px solid ${color}`, background: bg, borderRadius: "0 8px 8px 0", padding: "10px 12px" }}>
      <p style={{ margin: 0, fontSize: 11, color, fontWeight: 700 }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#c9c9cc", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function AppleGlyph() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8.79-.16 2.31-.9 3.66-.77 1.61.13 2.8.76 3.59 1.9-3.28 1.98-2.5 6.06.5 7.28-.61 1.58-1.39 3.14-2.83 3.76zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>; }
function AndroidGlyph() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="#22C55E"><path d="M3.6 1.8l10.9 10.2L3.6 22.2c-.37-.22-.6-.62-.6-1.1V2.9c0-.48.23-.88.6-1.1zm12.3 8.9l2.6 2.43-2.6 2.44-2.4-2.44 2.4-2.43zm1.4-1.3L6.1 1.5l8.5 7.95-1.4 1.35 4.1-1.4zm-9.2 13l11.2-7.9c.47.28.7.7.7 1.13 0 .43-.23.85-.7 1.12L8.1 22.4z"/></svg>; }
function ChromeGlyph() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth={2}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path strokeLinecap="round" d="M12 8.5h8.2M8.9 13.8L4.8 6.9m5.2 12.9l4.1-7"/></svg>; }

function StoreButton({ href, glyph, title, sub }: { href: string; glyph: React.ReactNode; title: string; sub: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #2A2A2A", background: "#161616", borderRadius: 12, padding: 14, textDecoration: "none" }}
    >
      <span style={{ flexShrink: 0 }}>{glyph}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#fff" }}>{title}</span>
        <span style={{ display: "block", fontSize: 10, color: "#A1A1A3", marginTop: 2 }}>{sub}</span>
      </span>
      <span style={{ fontSize: 11, color: "#6b6b70" }}>↗</span>
    </a>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function CryptoOnboardingWizard({ lang }: { lang: Lang }) {
  const es = lang === "es";
  // screen: 0 intro, 1 install, 2-5 setup (1..4), 6 fund, 7 done
  const [screen, setScreen] = useState(0);
  const [walletKey, setWalletKey] = useState<WalletKey>("trust");

  const wallet = WALLETS[walletKey];
  const setupIdx = screen - 2; // 0..3 during setup screens
  const label = T.labels[lang][screen];
  const progress = Math.round(((screen + 1) / 8) * 100);
  const showNav = screen >= 1;
  const isFund = screen === 6;
  const isDone = screen === 7;

  const goBack = () => setScreen((s) => Math.max(0, s - 1));
  const goNext = () => setScreen((s) => Math.min(7, s + 1));
  const pickWallet = (key: WalletKey) => { setWalletKey(key); setScreen(1); };

  const nextBg = isFund || isDone
    ? "linear-gradient(90deg, #2DD4BF, #22D3EE)"
    : "linear-gradient(135deg, #D4007A, #7B61FF)";
  const nextColor = isFund || isDone ? "#04252b" : "#fff";
  const nextLabel = isFund ? T.doneApp[lang] : isDone ? T.finish[lang] : T.next[lang];
  const nextHref = isDone ? "/subscribe" : isFund ? "/subscribe" : undefined;

  return (
    <div
      style={{
        background: "#161616",
        border: "1px solid #2A2A2A",
        borderRadius: 20,
        padding: 20,
        fontFamily: "'Roboto Mono', monospace",
      }}
    >
      {/* Header — eyebrow + title + step label + progress */}
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "#D4007A" }}>{T.eyebrow[lang]}</p>
      <h1 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{T.title[lang]}</h1>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#A1A1A3" }}>{label}</p>
      <div style={{ height: 5, borderRadius: 99, background: "#1E1E1E", marginTop: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #D4007A, #7B61FF)", transition: "width .3s", width: `${progress}%` }} />
      </div>

      {/* Screen 0 — intro + pick a wallet */}
      {screen === 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ border: "1px solid #2A2A2A", background: "#161616", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#fff" }}>{T.cryptoIn3[lang]}</p>
            {[T.line1[lang], T.line2[lang], T.line3[lang]].map((line, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "#5ED1C4", fontSize: 12 }}>✓</span>
                <p style={{ margin: 0, fontSize: 11, color: "#A1A1A3", lineHeight: 1.6 }}>{line}</p>
              </div>
            ))}
          </div>

          <h2 style={{ margin: "20px 0 0", fontSize: 16, fontWeight: 700, color: "#fff" }}>{T.pick[lang]}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {WALLET_KEYS.map((key) => {
              const w = WALLETS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickWallet(key)}
                  style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", border: "1px solid #2A2A2A", background: "#161616", borderRadius: 14, padding: 14, cursor: "pointer", fontFamily: "inherit", color: "#fff" }}
                >
                  <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: w.grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff" }}>{w.letter}</div>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{w.name}</span>
                    <span style={{ display: "block", fontSize: 11, color: "#A1A1A3", marginTop: 3, lineHeight: 1.5 }}>{WALLET_ONELINE[key][lang]}</span>
                  </span>
                  <span style={{ flexShrink: 0, padding: "2px 9px", borderRadius: 999, fontSize: 8, fontWeight: 700, letterSpacing: ".06em", background: "rgba(94,209,196,.14)", border: "1px solid rgba(94,209,196,.45)", color: "#5ED1C4" }}>{WALLET_TAG[key][lang]}</span>
                </button>
              );
            })}
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 11, color: "#6b6b70", lineHeight: 1.6 }}>{T.bothFree[lang]}</p>
        </div>
      )}

      {/* Screen 1 — install */}
      {screen === 1 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #2A2A2A", background: "#161616", borderRadius: 14, padding: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: wallet.grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff" }}>{wallet.letter}</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#fff" }}>{wallet.name}</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#A1A1A3" }}>{T.installIt[lang]}</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            <StoreButton href={wallet.ios}     glyph={<AppleGlyph />}   title={T.iosTitle[lang]} sub={T.iosSub[lang]} />
            <StoreButton href={wallet.android} glyph={<AndroidGlyph />} title={T.andTitle[lang]} sub={T.andSub[lang]} />
            {"chrome" in wallet && (
              <StoreButton href={(wallet as typeof WALLETS.metamask).chrome} glyph={<ChromeGlyph />} title={T.chrTitle[lang]} sub={T.chrSub[lang]} />
            )}
          </div>

          <Callout variant="gold" label={T.gtkLabel[lang]} body={T.gtkBody[lang]} />
        </div>
      )}

      {/* Screens 2–5 — setup */}
      {screen >= 2 && screen <= 5 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 99, background: "linear-gradient(135deg, #D4007A, #7B61FF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>{setupIdx + 1}</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: "#A1A1A3" }}>
                {wallet.name.toUpperCase()} — {T.setupOf[lang].replace("{n}", String(setupIdx + 1))}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.4 }}>{SETUP_STEPS[walletKey][lang][setupIdx].title}</p>
            </div>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "#A1A1A3", lineHeight: 1.7 }}>{SETUP_STEPS[walletKey][lang][setupIdx].body}</p>

          <ScreenshotSlot slotId={`${walletKey}-${setupIdx + 1}`} height={320} lang={lang} />

          {(setupIdx === 2 || setupIdx === 3) && (
            <Callout variant="red" label={T.keepSafe[lang]} body={T.keepSafeBody[lang]} />
          )}
        </div>
      )}

      {/* Screen 6 — fund */}
      {isFund && (
        <div style={{ marginTop: 20 }}>
          <div style={{ border: "1px solid rgba(94,209,196,.35)", background: "rgba(94,209,196,.06)", borderRadius: 14, padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: "rgba(94,209,196,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5ED1C4" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>{T.addMoney[lang]}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#A1A1A3", lineHeight: 1.5 }}>{T.addMoneySub[lang]}</p>
            </div>
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 11, color: "#A1A1A3", lineHeight: 1.7 }}>
            {T.addMoneyBody[lang]}
            <b style={{ color: "#fff" }}>USDT</b>
            {es ? " o " : " or "}
            <b style={{ color: "#fff" }}>USDC</b>
            {T.addMoneyBodyRest[lang]}
          </p>

          <ScreenshotSlot slotId="buy" height={280} lang={lang} />

          <Callout variant="gold" label={T.tipLabel[lang]} body={T.tipBody[lang]} />
        </div>
      )}

      {/* Screen 7 — done */}
      {isDone && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, padding: "44px 8px 0" }}>
          <div style={{ width: 64, height: 64, borderRadius: 99, background: "linear-gradient(90deg, #2DD4BF, #22D3EE)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#04252b" strokeWidth={2.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>{T.ready[lang]}</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#A1A1A3", lineHeight: 1.7, maxWidth: 280 }}>{T.readyBody[lang]}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", marginTop: 6 }}>
            {[
              { href: "/subscribe",   label: T.linkSub[lang] },
              { href: "/buy-tokens",  label: T.linkBuy[lang] },
              { href: "/creators",    label: T.linkBrowse[lang] },
            ].map((a) => (
              <a key={a.href} href={a.href}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, background: "#161616", border: "1px solid #2A2A2A", fontSize: 12, fontWeight: 600, color: "#FF4DA6", textDecoration: "none" }}
              >
                <span>{a.label}</span>
                <span>→</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Footer nav — screens 1–7 */}
      {showNav && (
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={goBack}
            style={{ flex: 1, padding: 13, borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "#161616", fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: "inherit", cursor: "pointer" }}
          >
            {T.back[lang]}
          </button>
          {nextHref ? (
            <a
              href={nextHref}
              style={{ flex: 2, padding: 13, borderRadius: 10, background: nextBg, fontSize: 13, fontWeight: 700, color: nextColor, fontFamily: "inherit", textAlign: "center", textDecoration: "none" }}
            >
              {nextLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={goNext}
              style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: nextBg, fontSize: 13, fontWeight: 700, color: nextColor, fontFamily: "inherit", cursor: "pointer" }}
            >
              {nextLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
