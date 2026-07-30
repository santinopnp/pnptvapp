import React, { useEffect, useRef, useState } from "react";
import { getCryptoGuideStatus, saveCryptoGuideProgress, completeCryptoGuide } from "@/lib/api";
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
  "trust-5":  { en: "Trust Wallet — buy USDT/USDC", es: "Trust Wallet — comprar USDT/USDC", src: "/crypto-guide-media/tw-5.png" },
  "metamask-5": { en: "MetaMask — buy USDT/USDC",   es: "MetaMask — comprar USDT/USDC", src: "/crypto-guide-media/mm-5.png" },
  "buy":      { en: "Wallet 'Buy' screen", es: "Pantalla 'Comprar' de la wallet", src: "/crypto-guide-media/buy.png" },
};

// ── Small building blocks (inline — no new files per project rule) ──────────

// Sample 12-word BIP39-style seed for mocks. Not a real seed — obviously fake
// (repeated common words) so a user can't accidentally treat it as their own.
const MOCK_SEED = ["ocean","apple","forest","piano","river","spark","tiger","cloud","stone","voyage","melody","bright"];

// Trust Wallet mock — portrait phone frame, TW brand blue (#0500FF).
function TrustWalletMock({ step, lang }: { step: 1 | 2 | 3 | 4 | 5; lang: Lang }) {
  const es = lang === "es";
  const bezel: React.CSSProperties = {
    width: 200, height: 400, borderRadius: 32, background: "#0F111C",
    padding: 6, boxShadow: "0 10px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.05)", position: "relative",
  };
  const screen: React.CSSProperties = {
    width: "100%", height: "100%", borderRadius: 26, background: "#fff", color: "#0F111C",
    overflow: "hidden", display: "flex", flexDirection: "column", position: "relative",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };
  const statusBar = (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 14px 2px", fontSize: 9, color: "#0F111C", fontWeight: 600 }}>
      <span>9:41</span>
      <span>•••</span>
    </div>
  );
  const homeIndicator = (
    <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", width: 60, height: 3, borderRadius: 2, background: "rgba(15,17,28,.35)" }} />
  );
  const twLogo = (
    <svg width="34" height="34" viewBox="0 0 40 40" fill="none">
      <path d="M20 3l14 5v10c0 8-6 15-14 19-8-4-14-11-14-19V8l14-5z" fill="#0500FF"/>
      <path d="M20 10.5v18c-5-3-9-7.5-9-13V13l9-2.5z" fill="#48A9FF"/>
    </svg>
  );

  return (
    <div style={bezel}>
      <div style={screen}>
        {statusBar}
        {step === 1 && (
          <>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", gap: 10 }}>
              {twLogo}
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0F111C" }}>Trust Wallet</p>
              <p style={{ margin: 0, fontSize: 9, color: "#6b6b70", textAlign: "center", lineHeight: 1.4 }}>
                {es ? "La billetera cripto más confiable del mundo" : "The world's most trusted crypto wallet"}
              </p>
            </div>
            <div style={{ padding: "0 14px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
              <button style={{ padding: "10px 0", borderRadius: 999, border: "none", background: "#0500FF", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                {es ? "Crear una nueva wallet" : "Create a new wallet"}
              </button>
              <button style={{ padding: "10px 0", borderRadius: 999, border: "1px solid #E5E7EB", background: "#fff", color: "#0500FF", fontSize: 11, fontWeight: 700 }}>
                {es ? "Ya tengo una wallet" : "I already have a wallet"}
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 20px 0", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(5,0,255,.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0500FF" strokeWidth={2}>
                <rect x="4" y="10" width="16" height="11" rx="2"/><path strokeLinecap="round" d="M8 10V7a4 4 0 118 0v3"/>
              </svg>
            </div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{es ? "Crea un código" : "Create passcode"}</p>
            <p style={{ margin: 0, fontSize: 9, color: "#6b6b70", textAlign: "center", lineHeight: 1.4 }}>
              {es ? "Se usará para desbloquear la app" : "Used to unlock the app"}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 999, background: i <= 4 ? "#0500FF" : "transparent", border: "1.5px solid #0500FF" }} />
              ))}
            </div>
            <div style={{ marginTop: "auto", width: "100%", background: "#F4F5F7", padding: "10px 0", borderRadius: "12px 12px 0 0", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, textAlign: "center", fontSize: 13, fontWeight: 600, color: "#0F111C" }}>
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((n, i) => (
                <div key={i} style={{ padding: "6px 0" }}>{n}</div>
              ))}
            </div>
          </div>
        )}
        {step === 3 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px 14px 16px", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>{es ? "Tu frase de recuperación" : "Your Recovery Phrase"}</p>
            <p style={{ margin: 0, fontSize: 8, color: "#6b6b70", lineHeight: 1.4 }}>
              {es ? "Escríbela en papel. Nunca la compartas." : "Write it on paper. Never share it."}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 4 }}>
              {MOCK_SEED.map((w, i) => (
                <div key={i} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "5px 8px", fontSize: 9, display: "flex", gap: 5 }}>
                  <span style={{ color: "#9AA0A6", minWidth: 12 }}>{i + 1}.</span>
                  <span style={{ fontWeight: 600, color: "#0F111C" }}>{w}</span>
                </div>
              ))}
            </div>
            <button style={{ marginTop: "auto", padding: "9px 0", borderRadius: 999, border: "none", background: "#0500FF", color: "#fff", fontSize: 11, fontWeight: 700 }}>
              {es ? "Continuar" : "Continue"}
            </button>
          </div>
        )}
        {step === 4 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px 14px 16px", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>{es ? "Verifica tu frase" : "Verify your phrase"}</p>
            <p style={{ margin: 0, fontSize: 8, color: "#6b6b70" }}>
              {es ? "Toca las palabras en orden" : "Tap the words in order"}
            </p>
            <div style={{ border: "1px dashed #0500FF", borderRadius: 10, padding: 8, minHeight: 60, display: "flex", flexWrap: "wrap", gap: 4, alignContent: "flex-start", background: "rgba(5,0,255,.03)" }}>
              {["ocean","apple","forest"].map((w, i) => (
                <span key={i} style={{ background: "#0500FF", color: "#fff", padding: "3px 8px", borderRadius: 999, fontSize: 9, fontWeight: 600 }}>{i + 1}. {w}</span>
              ))}
              <span style={{ padding: "3px 8px", border: "1px dashed #9AA0A6", borderRadius: 999, fontSize: 9, color: "#9AA0A6" }}>4.</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {["piano","river","spark","tiger","cloud","stone","voyage","melody","bright"].map((w, i) => (
                <span key={i} style={{ background: "#F4F5F7", padding: "3px 8px", borderRadius: 999, fontSize: 9, fontWeight: 600, color: "#0F111C" }}>{w}</span>
              ))}
            </div>
          </div>
        )}
        {step === 5 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px 14px 16px", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{es ? "Comprar" : "Buy"}</span>
              <span style={{ fontSize: 12, color: "#6b6b70" }}>✕</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
              <div style={{ flex: 1, padding: "5px 0", background: "#0500FF", color: "#fff", borderRadius: 6, textAlign: "center", fontSize: 9, fontWeight: 700 }}>USDT</div>
              <div style={{ flex: 1, padding: "5px 0", background: "#F4F5F7", color: "#6b6b70", borderRadius: 6, textAlign: "center", fontSize: 9, fontWeight: 600 }}>USDC</div>
              <div style={{ flex: 1, padding: "5px 0", background: "#F4F5F7", color: "#6b6b70", borderRadius: 6, textAlign: "center", fontSize: 9, fontWeight: 600 }}>BTC</div>
            </div>
            <div style={{ background: "#F4F5F7", borderRadius: 10, padding: "12px 10px", textAlign: "center", marginTop: 6 }}>
              <p style={{ margin: 0, fontSize: 9, color: "#6b6b70", fontWeight: 600 }}>{es ? "Pagas" : "You pay"}</p>
              <p style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 800, color: "#0F111C" }}>$25<span style={{ fontSize: 11, color: "#9AA0A6", marginLeft: 3 }}>USD</span></p>
              <p style={{ margin: "3px 0 0", fontSize: 8, color: "#9AA0A6" }}>≈ 25.02 USDT</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", fontSize: 8, color: "#6b6b70" }}>
              <span>{es ? "Pago con" : "Pay with"}</span>
              <span style={{ color: "#0F111C", fontWeight: 600 }}>💳 •••• 4242</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px 4px", fontSize: 8, color: "#6b6b70" }}>
              <span>{es ? "Proveedor" : "Provider"}</span>
              <span style={{ color: "#0F111C", fontWeight: 600 }}>MoonPay</span>
            </div>
            <button style={{ marginTop: "auto", padding: "9px 0", borderRadius: 999, border: "none", background: "#0500FF", color: "#fff", fontSize: 11, fontWeight: 700 }}>
              {es ? "Comprar USDT" : "Buy USDT"}
            </button>
          </div>
        )}
        {homeIndicator}
      </div>
    </div>
  );
}

// MetaMask mock — desktop browser window, MM orange (#F6851B) accents.
function MetaMaskMock({ step, lang }: { step: 1 | 2 | 3 | 4 | 5; lang: Lang }) {
  const es = lang === "es";
  const window: React.CSSProperties = {
    width: 340, borderRadius: 10, background: "#fff", overflow: "hidden",
    boxShadow: "0 10px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#24292F",
  };
  const chrome = (
    <div style={{ background: "#E9EBED", padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #D0D7DE" }}>
      <div style={{ display: "flex", gap: 5 }}>
        {["#FF5F57","#FEBC2E","#28C840"].map((c) => (
          <div key={c} style={{ width: 8, height: 8, borderRadius: 999, background: c }} />
        ))}
      </div>
      <div style={{ flex: 1, background: "#fff", borderRadius: 5, padding: "3px 8px", fontSize: 9, color: "#57606A", display: "flex", alignItems: "center", gap: 5 }}>
        <span>🔒</span><span>chrome-extension://metamask/home.html</span>
      </div>
    </div>
  );
  const fox = (
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
      <path d="M52 8L34 20l3-8 15-4z" fill="#E17726"/>
      <path d="M8 8l18 12-3-8L8 8z" fill="#E27625"/>
      <path d="M44 42l-5 8 11 3 3-11-9 0z" fill="#E27625"/>
      <path d="M4 42l3 11 11-3-5-8-9 0z" fill="#E27625"/>
      <path d="M18 26l-3 5 11 1-.5-11L18 26z" fill="#F6851B"/>
      <path d="M42 26l-8-5-.5 11 11-1-2.5-5z" fill="#F6851B"/>
      <path d="M18 50l7-3-6-5-1 8z" fill="#E27625"/>
      <path d="M35 47l7 3-1-8-6 5z" fill="#E27625"/>
      <path d="M42 50l-7-3 .5 5 0 2 6.5-4z" fill="#D5BFB2"/>
      <path d="M18 50l6.5 4 0-2 .5-5-7 3z" fill="#D5BFB2"/>
      <path d="M25 43l-6-2 4-2 2 4zm10 0l2-4 4 2-6 2z" fill="#233447"/>
    </svg>
  );

  return (
    <div style={window}>
      {chrome}
      <div style={{ padding: 16, minHeight: 300, display: "flex", flexDirection: "column" }}>
        {step === 1 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}>
            {fox}
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{es ? "Bienvenido a MetaMask" : "Welcome to MetaMask"}</p>
            <p style={{ margin: 0, fontSize: 10, color: "#57606A", maxWidth: 240, lineHeight: 1.5 }}>
              {es ? "Confía en tus operaciones — la wallet líder para DeFi y Web3." : "Trusted by millions — the leading self-custody wallet for Web3."}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", marginTop: 10 }}>
              <button style={{ padding: "9px 0", borderRadius: 6, border: "none", background: "#F6851B", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                {es ? "Crear una nueva wallet" : "Create a new wallet"}
              </button>
              <button style={{ padding: "9px 0", borderRadius: 6, border: "1px solid #F6851B", background: "#fff", color: "#F6851B", fontSize: 11, fontWeight: 700 }}>
                {es ? "Importar una wallet existente" : "Import an existing wallet"}
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{es ? "Crea tu contraseña" : "Create password"}</p>
            <p style={{ margin: 0, fontSize: 10, color: "#57606A", lineHeight: 1.5 }}>
              {es ? "Esta contraseña desbloqueará MetaMask solo en este dispositivo." : "This password will unlock MetaMask only on this device."}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: "#24292F" }}>{es ? "Nueva contraseña" : "New password"}</span>
              <div style={{ border: "1px solid #D0D7DE", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#24292F", letterSpacing: 2, background: "#F6F8FA" }}>••••••••••</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: "#24292F" }}>{es ? "Confirmar contraseña" : "Confirm password"}</span>
              <div style={{ border: "1px solid #D0D7DE", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#24292F", letterSpacing: 2, background: "#F6F8FA" }}>••••••••••</div>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 9, color: "#57606A", marginTop: 4 }}>
              <span style={{ width: 12, height: 12, border: "1.5px solid #F6851B", borderRadius: 3, background: "#F6851B", color: "#fff", fontSize: 8, textAlign: "center", lineHeight: "9px", flexShrink: 0 }}>✓</span>
              <span>{es ? "Entiendo que MetaMask no puede recuperar esta contraseña." : "I understand that MetaMask cannot recover this password."}</span>
            </label>
            <button style={{ padding: "9px 0", borderRadius: 6, border: "none", background: "#F6851B", color: "#fff", fontSize: 11, fontWeight: 700, marginTop: 6 }}>
              {es ? "Crear contraseña" : "Create password"}
            </button>
          </div>
        )}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{es ? "Tu frase secreta" : "Secret Recovery Phrase"}</p>
            <p style={{ margin: 0, fontSize: 10, color: "#57606A", lineHeight: 1.5 }}>
              {es ? "12 palabras que restauran tu cuenta. Guárdalas en papel — nadie de MetaMask te las pedirá jamás." : "12 words that restore your account. Save on paper — no MetaMask staff will ever ask for them."}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginTop: 4 }}>
              {MOCK_SEED.map((w, i) => (
                <div key={i} style={{ border: "1px solid #D0D7DE", borderRadius: 5, padding: "6px 8px", fontSize: 10, display: "flex", gap: 5, background: "#F6F8FA" }}>
                  <span style={{ color: "#8B949E", minWidth: 12 }}>{i + 1}.</span>
                  <span style={{ fontWeight: 600 }}>{w}</span>
                </div>
              ))}
            </div>
            <button style={{ padding: "9px 0", borderRadius: 6, border: "none", background: "#F6851B", color: "#fff", fontSize: 11, fontWeight: 700, marginTop: 8 }}>
              {es ? "Ya lo escribí" : "I wrote it down"}
            </button>
          </div>
        )}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{es ? "Confirma tu frase secreta" : "Confirm Secret Recovery Phrase"}</p>
            <p style={{ margin: 0, fontSize: 10, color: "#57606A", lineHeight: 1.5 }}>
              {es ? "Completa las palabras que faltan." : "Fill in the missing words."}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginTop: 4 }}>
              {MOCK_SEED.map((w, i) => {
                const isBlank = i === 2 || i === 6 || i === 10;
                return (
                  <div key={i} style={{ border: isBlank ? "1.5px solid #F6851B" : "1px solid #D0D7DE", borderRadius: 5, padding: "6px 8px", fontSize: 10, display: "flex", gap: 5, background: isBlank ? "#FFF7EE" : "#F6F8FA" }}>
                    <span style={{ color: "#8B949E", minWidth: 12 }}>{i + 1}.</span>
                    <span style={{ fontWeight: 600, color: isBlank ? "#F6851B" : "#24292F" }}>{isBlank ? "____" : w}</span>
                  </div>
                );
              })}
            </div>
            <button style={{ padding: "9px 0", borderRadius: 6, border: "none", background: "#F6851B", color: "#fff", fontSize: 11, fontWeight: 700, marginTop: 8 }}>
              {es ? "Confirmar" : "Confirm"}
            </button>
          </div>
        )}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{es ? "Comprar cripto" : "Buy crypto"}</p>
              <span style={{ fontSize: 12, color: "#57606A" }}>✕</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <div style={{ flex: 1, padding: "6px 0", background: "#F6851B", color: "#fff", borderRadius: 5, textAlign: "center", fontSize: 10, fontWeight: 700 }}>USDT</div>
              <div style={{ flex: 1, padding: "6px 0", background: "#F6F8FA", color: "#57606A", borderRadius: 5, textAlign: "center", fontSize: 10, fontWeight: 600, border: "1px solid #D0D7DE" }}>USDC</div>
              <div style={{ flex: 1, padding: "6px 0", background: "#F6F8FA", color: "#57606A", borderRadius: 5, textAlign: "center", fontSize: 10, fontWeight: 600, border: "1px solid #D0D7DE" }}>ETH</div>
            </div>
            <div style={{ background: "#F6F8FA", border: "1px solid #D0D7DE", borderRadius: 8, padding: "12px 12px", textAlign: "center", marginTop: 4 }}>
              <p style={{ margin: 0, fontSize: 10, color: "#57606A", fontWeight: 600 }}>{es ? "Pagas" : "You pay"}</p>
              <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: "#24292F" }}>$25<span style={{ fontSize: 11, color: "#8B949E", marginLeft: 3 }}>USD</span></p>
              <p style={{ margin: "3px 0 0", fontSize: 9, color: "#8B949E" }}>≈ 25.02 USDT</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#57606A", padding: "0 4px" }}>
              <span>{es ? "Proveedor" : "Provider"}</span>
              <span style={{ color: "#24292F", fontWeight: 600 }}>MoonPay · Transak</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#57606A", padding: "0 4px" }}>
              <span>{es ? "Método" : "Method"}</span>
              <span style={{ color: "#24292F", fontWeight: 600 }}>💳 {es ? "Tarjeta" : "Card"}</span>
            </div>
            <button style={{ padding: "9px 0", borderRadius: 6, border: "none", background: "#F6851B", color: "#fff", fontSize: 11, fontWeight: 700, marginTop: 4 }}>
              {es ? "Continuar" : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenshotSlot({ slotId, height, lang }: { slotId: string; height: number; lang: Lang }) {
  const hint = SCREENSHOT_HINTS[slotId];
  // In-JSX wallet mocks — replaces the missing PNG placeholders for the 8
  // wallet-onboarding slots. Other slots (e.g. "buy") still use the image
  // fallback pattern below.
  const twMatch = slotId.match(/^trust-([1-5])$/);
  const mmMatch = slotId.match(/^metamask-([1-5])$/);
  if (twMatch || mmMatch) {
    const step = Number(twMatch?.[1] || mmMatch?.[1]) as 1 | 2 | 3 | 4 | 5;
    return (
      <div style={{ marginTop: 14, height, borderRadius: 14, overflow: "hidden", border: "1px solid #2A2A2A", background: "radial-gradient(circle at 50% 30%, #1a1a1f 0%, #0a0a0d 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
        {twMatch ? <TrustWalletMock step={step} lang={lang} /> : <MetaMaskMock step={step} lang={lang} />}
      </div>
    );
  }
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
  const [rewarded, setRewarded] = useState<boolean | null>(null);
  const initialLoadedRef = useRef(false);
  const completeFiredRef = useRef(false);

  const wallet = WALLETS[walletKey];
  const setupIdx = screen - 2; // 0..3 during setup screens
  const label = T.labels[lang][screen];
  const progress = Math.round(((screen + 1) / 8) * 100);
  const showNav = screen >= 1;
  const isFund = screen === 6;
  const isDone = screen === 7;

  // Resume: fetch server-side progress on mount. Only jumps forward — never
  // back — so we don't yank a user out of an in-progress screen.
  useEffect(() => {
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    getCryptoGuideStatus().then((s) => {
      const svc = Number(s.progressStep || 0);
      if (svc > 0 && svc < 7) setScreen((cur) => (svc > cur ? svc : cur));
    }).catch(() => {});
  }, []);

  // Persist progress to server as the user moves through the flow.
  useEffect(() => {
    if (!initialLoadedRef.current || screen === 0) return;
    saveCryptoGuideProgress(screen).catch(() => {});
  }, [screen]);

  // Fire completion (+100 tokens once) when the user lands on the final screen.
  useEffect(() => {
    if (screen !== 7 || completeFiredRef.current) return;
    completeFiredRef.current = true;
    completeCryptoGuide().then((r) => {
      setRewarded(!!r.rewarded);
    }).catch(() => {});
  }, [screen]);

  const goBack = () => setScreen((s) => Math.max(0, s - 1));
  const goNext = () => setScreen((s) => Math.min(7, s + 1));
  const pickWallet = (key: WalletKey) => { setWalletKey(key); setScreen(1); };
  const skipToDone = () => setScreen(7);

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

          <button
            type="button"
            onClick={skipToDone}
            style={{ marginTop: 14, width: "100%", padding: "10px 0", borderRadius: 10, border: "1px dashed #2A2A2A", background: "transparent", fontSize: 11, fontWeight: 600, color: "#A1A1A3", cursor: "pointer", fontFamily: "inherit" }}
          >
            {es ? "Ya tengo una wallet — saltar →" : "I already have a wallet — skip →"}
          </button>
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

          <ScreenshotSlot slotId={`${walletKey}-5`} height={280} lang={lang} />

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
          {rewarded && (
            <div style={{ padding: "8px 14px", borderRadius: 999, background: "linear-gradient(90deg, #F59E0B, #D4007A)", color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>🎁</span>
              <span>{es ? "+100 tokens agregados a tu wallet" : "+100 tokens added to your wallet"}</span>
            </div>
          )}
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
