import React, { useState } from "react";
import { StepDots } from "@pnptv/ui-kit";
import { WALLETS, type WalletKey } from "@/lib/cryptoWallets";

// ── Crypto Onboarding Wizard ─────────────────────────────────────────────────
// A gated 3-step "New to crypto? Start here" flow for first-timers: pick a
// wallet → install it + get verified → fund it + connect to PNPtv. Distinct
// from PayWithCryptoWizard (which is the actual payment checkout) — this is
// pure education, reusing the WALLETS data CryptoGuide.tsx already defines.

interface SetupStep {
  title: string;
  body: string;
}

const SETUP_STEPS: Record<WalletKey, { en: SetupStep[]; es: SetupStep[] }> = {
  binance: {
    en: [
      { title: 'Create an account with your email', body: "Takes about 2 minutes — no crypto experience needed." },
      { title: "Verify your identity", body: "Some countries require ID verification for exchanges — this is standard and required by law." },
      { title: "Add a payment method", body: "Link a debit card or bank transfer." },
      { title: "You're ready to buy", body: "Your crypto sits in your Binance account, ready to send or spend directly — no separate wallet needed." },
    ],
    es: [
      { title: "Crea una cuenta con tu correo", body: "Toma unos 2 minutos — no necesitas experiencia previa." },
      { title: "Verifica tu identidad", body: "Algunos países exigen verificación de identidad en los exchanges — es estándar y requerido por ley." },
      { title: "Agrega un método de pago", body: "Vincula una tarjeta débito o transferencia bancaria." },
      { title: "Listo para comprar", body: "Tu cripto queda en tu cuenta de Binance, lista para enviar o gastar directamente — sin wallet aparte." },
    ],
  },
  metamask: {
    en: [
      { title: 'Open the app and tap "Create a new wallet"', body: "No email or ID needed — MetaMask is self-custody." },
      { title: "Create a password", body: "This unlocks MetaMask on this device only." },
      { title: "Reveal and save your Secret Recovery Phrase", body: "Write the 12 words on paper, in order. Never type them into any website — no one legit will ever ask." },
      { title: "Confirm the phrase", body: "Fill in the missing words to verify your backup. Pin the extension/app for easy access." },
    ],
    es: [
      { title: 'Abre la app y toca "Crear una nueva wallet"', body: "No necesitas correo ni ID — MetaMask es autocustodia." },
      { title: "Crea una contraseña", body: "Esto desbloquea MetaMask solo en este dispositivo." },
      { title: "Revela y guarda tu Frase de Recuperación Secreta", body: "Escribe las 12 palabras en papel, en orden. Nunca las escribas en ningún sitio web — nadie legítimo te la pedirá." },
      { title: "Confirma la frase", body: "Completa las palabras faltantes para verificar tu respaldo." },
    ],
  },
  dash: {
    en: [
      { title: 'Open the app and tap "Create a new wallet"', body: "No email or ID needed — self-custody, built for Dash." },
      { title: "Choose a PIN", body: "This locks the app on your phone." },
      { title: "Back up your Recovery Phrase", body: "Write the 12 words on paper, in order. Never screenshot or share them." },
      { title: "Confirm the phrase", body: "Verify your backup is correct. Done — your wallet is ready." },
    ],
    es: [
      { title: 'Abre la app y toca "Crear una nueva wallet"', body: "No necesitas correo ni ID — autocustodia, hecha para Dash." },
      { title: "Elige un PIN", body: "Esto bloquea la app en tu teléfono." },
      { title: "Respalda tu Frase de Recuperación", body: "Escribe las 12 palabras en papel, en orden. Nunca las tomes en captura ni las compartas." },
      { title: "Confirma la frase", body: "Verifica que tu respaldo sea correcto. Listo — tu wallet está lista." },
    ],
  },
};

const WALLET_TAGS: Record<WalletKey, { en: string; es: string }> = {
  binance: { en: "Best for beginners", es: "Mejor para principiantes" },
  metamask: { en: "Best for web / DeFi", es: "Mejor para web / DeFi" },
  dash: { en: "Best for Dash only", es: "Solo para Dash" },
};

const WALLET_DESC: Record<WalletKey, { en: string; es: string }> = {
  binance: {
    en: "The world's largest exchange — buy crypto with a card and send directly from the same app. No separate wallet needed.",
    es: "El exchange más grande del mundo — compra cripto con tarjeta y envía directamente desde la misma app. Sin wallet aparte.",
  },
  metamask: {
    en: "The standard browser/mobile wallet for Ethereum-family chains. Best if you'll connect to websites or already hold USDT.",
    es: "La wallet estándar para cadenas tipo Ethereum. Ideal si te conectarás a sitios web o ya tienes USDT.",
  },
  dash: {
    en: "The official Dash wallet — lightweight, simple, built specifically for Dash payments.",
    es: "La wallet oficial de Dash — ligera, simple, hecha específicamente para pagos con Dash.",
  },
};

export function CryptoOnboardingWizard({ lang }: { lang: "en" | "es" }) {
  const es = lang === "es";
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [walletKey, setWalletKey] = useState<WalletKey | null>(null);

  const wallet = walletKey ? WALLETS[walletKey] : null;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "#161616", border: "1px solid #2A2A2A" }}
    >
      <p className="text-[10px] font-bold tracking-[.12em]" style={{ color: "#D4007A" }}>
        {es ? "CONFIGURACIÓN CRIPTO" : "CRYPTO SETUP"}
      </p>
      <h2 className="text-xl font-bold text-white mt-1">
        {es ? "¿Nuevo en cripto? Empieza aquí" : "New to crypto? Start here"}
      </h2>
      <p className="text-xs text-pnp-textSecondary mt-1">
        {es ? `Paso ${step} de 3` : `Step ${step} of 3`}
      </p>

      <div className="h-[5px] rounded-full overflow-hidden mt-3" style={{ background: "#1E1E1E" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${(step / 3) * 100}%`, background: "linear-gradient(90deg,#D4007A,#7B61FF)" }}
        />
      </div>
      <div className="mt-2.5">
        <StepDots total={3} current={step} onStepClick={(n) => { if (n === 1 || wallet) setStep(n as 1 | 2 | 3); }} />
      </div>

      {/* Step 1: pick a wallet */}
      {step === 1 && (
        <div className="mt-5">
          <h3 className="text-base font-bold text-white">
            {es ? "Descarga tu wallet preferida" : "Download your preferred wallet"}
          </h3>
          <p className="text-xs text-pnp-textSecondary mt-1.5 leading-relaxed">
            {es
              ? "Una wallet es donde vive tu cripto. Elige la que se ajuste a cómo la vas a usar — toca una para continuar."
              : "A wallet is where your crypto lives. Pick the one that fits how you'll use it — tap one to continue."}
          </p>
          <div className="flex flex-col gap-2 mt-3.5">
            {(Object.keys(WALLETS) as WalletKey[]).map((key) => {
              const w = WALLETS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setWalletKey(key); setStep(2); }}
                  className="flex items-start gap-3 text-left rounded-[14px] p-3.5 transition-colors"
                  style={{ border: "1px solid #2A2A2A", background: "#161616" }}
                >
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ background: `${w.color}22` }}
                  >
                    {w.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{w.name}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[8px] font-bold tracking-[.06em]"
                        style={{ background: "rgba(94,209,196,.14)", border: "1px solid rgba(94,209,196,.45)", color: "#5ED1C4" }}
                      >
                        {es ? WALLET_TAGS[key].es : WALLET_TAGS[key].en}
                      </span>
                    </div>
                    <p className="text-[11px] text-pnp-textSecondary mt-1 leading-relaxed">
                      {es ? WALLET_DESC[key].es : WALLET_DESC[key].en}
                    </p>
                  </div>
                  <span className="text-pnp-textSecondary mt-3 flex-shrink-0">→</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3.5 rounded-r-lg px-3 py-2.5" style={{ borderLeft: "2px solid #FFB454", background: "rgba(255,180,84,.07)" }}>
            <p className="text-[11px] font-bold" style={{ color: "#FFB454" }}>TIP</p>
            <p className="text-[11px] mt-1 leading-relaxed text-pnp-textSecondary">
              {es
                ? "Las tres son gratis. Siempre puedes agregar otra wallet después — tu cripto no queda atada a una sola app."
                : "All three are free. You can always add another wallet later — your crypto isn't locked to one app."}
            </p>
          </div>
        </div>
      )}

      {/* Step 2: install + verify */}
      {step === 2 && wallet && walletKey && (
        <div className="mt-5">
          <div className="flex items-center gap-3 rounded-[14px] p-3.5" style={{ border: "1px solid #2A2A2A", background: "#161616" }}>
            <div
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ background: `${wallet.color}22` }}
            >
              {wallet.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{wallet.name}</p>
              <p className="text-[11px] text-pnp-textSecondary mt-0.5">
                {es ? "Buena elección — ahora instálala:" : "Great choice — now install it:"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-3.5">
            <a
              href={wallet.ios}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl p-3.5"
              style={{ border: "1px solid #2A2A2A", background: "#161616" }}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-white">
                  {es ? "Descargar para iOS" : "Download for iOS"}
                </span>
                <span className="block text-[10px] text-pnp-textSecondary mt-0.5">App Store</span>
              </span>
              <span className="text-[11px] text-pnp-textSecondary">↗</span>
            </a>
            <a
              href={wallet.android}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl p-3.5"
              style={{ border: "1px solid #2A2A2A", background: "#161616" }}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-white">
                  {es ? "Descargar para Android" : "Download for Android"}
                </span>
                <span className="block text-[10px] text-pnp-textSecondary mt-0.5">Google Play</span>
              </span>
              <span className="text-[11px] text-pnp-textSecondary">↗</span>
            </a>
          </div>

          <div className="mt-3.5 rounded-r-lg px-3 py-2.5" style={{ borderLeft: "2px solid #FFB454", background: "rgba(255,180,84,.07)" }}>
            <p className="text-[11px] font-bold" style={{ color: "#FFB454" }}>TIP</p>
            <p className="text-[11px] mt-1 leading-relaxed text-pnp-textSecondary">
              {es
                ? "Descarga solo desde los enlaces oficiales de la tienda — nunca desde un link que alguien te mande por chat."
                : "Only download from the official store links — never from a link someone sends you in chat."}
            </p>
          </div>

          <h3 className="text-[15px] font-bold text-white mt-5">
            {es ? "Luego abre tu cuenta y verifícate" : "Then open your account & get verified"}
          </h3>
          <p className="text-xs text-pnp-textSecondary mt-1.5 leading-relaxed">
            {es ? "Una vez instalada, abre la app y sigue estos pasos:" : "Once installed, open the app and follow these steps:"}
          </p>
          <div className="flex flex-col gap-2 mt-3">
            {(es ? SETUP_STEPS[walletKey].es : SETUP_STEPS[walletKey].en).map((s, i) => (
              <div key={i} className="flex gap-3 rounded-xl p-3.5" style={{ border: "1px solid #2A2A2A", background: "#161616" }}>
                <div
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
                >
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-white leading-tight">{s.title}</p>
                  <p className="text-[11px] text-pnp-textSecondary mt-1 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3.5 rounded-r-lg px-3 py-2.5" style={{ borderLeft: "2px solid #EF4444", background: "rgba(239,68,68,.07)" }}>
            <p className="text-[11px] font-bold" style={{ color: "#EF4444" }}>
              {es ? "IMPORTANTE" : "IMPORTANT"}
            </p>
            <p className="text-[11px] mt-1 leading-relaxed text-pnp-textSecondary">
              {es
                ? "Tu Frase Secreta = tu dinero. El equipo de PNPtv NUNCA te la pedirá. Quien lo haga es un estafador."
                : "Your Secret Phrase = your money. PNPtv staff will NEVER ask for it. Anyone who does is a scammer."}
            </p>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => { setWalletKey(null); setStep(1); }}
              className="flex-1 py-3 rounded-lg text-sm font-semibold text-white"
              style={{ border: "1px solid rgba(255,255,255,.15)", background: "#161616" }}
            >
              {es ? "← Otra wallet" : "← Other wallet"}
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-[2] py-3 rounded-lg text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
            >
              {es ? "Ya verifiqué — Siguiente →" : "I'm verified — Next →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: fund + connect */}
      {step === 3 && (
        <div className="mt-5">
          <div className="rounded-[14px] p-4.5" style={{ border: "1px solid rgba(94,209,196,.35)", background: "rgba(94,209,196,.06)" }}>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(94,209,196,.15)" }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5ED1C4" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-white mt-3.5">
              {es ? "¡Todo listo! Ahora financia tu wallet" : "You're set up! Now fund your wallet"}
            </h3>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              {es
                ? "Con tu wallet verificada, agrega algo de cripto para poder suscribirte, dar propina y desbloquear contenido en PNPtv."
                : "With your wallet verified, add some crypto so you can subscribe, tip and unlock content on PNPtv."}
            </p>
          </div>

          <div className="flex flex-col gap-2 mt-3.5">
            {[
              {
                title: es ? "Compra cripto en tu wallet" : "Buy crypto in your wallet",
                body: es
                  ? 'Toca "Comprar" y paga con tarjeta o banco. Recomendamos USDT o USDC (stablecoins — 1 = $1) para que el precio no cambie.'
                  : 'Tap "Buy" and pay with card or bank. We recommend USDT or USDC (stablecoins — 1 = $1) so prices don\'t move on you.',
              },
              {
                title: es ? "Conecta tu wallet a PNPtv" : "Connect your wallet to PNPtv",
                body: es
                  ? "Ve a Configuración → Pagos → Conectar wallet y aprueba la conexión en tu app de wallet."
                  : "Go to Settings → Payments → Connect wallet and approve the connection in your wallet app.",
              },
              {
                title: es ? "Empieza a gastar" : "Start spending",
                body: es
                  ? "Suscríbete a creadores, da propina en Main Stage, reserva llamadas y desbloquea contenido exclusivo — todo pagado desde tu wallet."
                  : "Subscribe to creators, tip in Main Stage, book calls and unlock exclusive content — all paid from your wallet.",
              },
            ].map((s, i) => (
              <div key={i} className="flex gap-3 rounded-xl p-3.5" style={{ border: "1px solid #2A2A2A", background: "#161616" }}>
                <div
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
                >
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-white leading-tight">{s.title}</p>
                  <p className="text-[11px] text-pnp-textSecondary mt-1 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3.5 rounded-r-lg px-3 py-2.5" style={{ borderLeft: "2px solid #FFB454", background: "rgba(255,180,84,.07)" }}>
            <p className="text-[11px] font-bold" style={{ color: "#FFB454" }}>TIP</p>
            <p className="text-[11px] mt-1 leading-relaxed text-pnp-textSecondary">
              {es
                ? "Empieza con poco — $20–30 son suficientes para probar. Puedes recargar cuando quieras."
                : "Start small — $20–30 is plenty to try things out. You can top up anytime."}
            </p>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 py-3 rounded-lg text-sm font-semibold text-white"
              style={{ border: "1px solid rgba(255,255,255,.15)", background: "#161616" }}
            >
              {es ? "← Atrás" : "← Back"}
            </button>
            <a
              href="/subscribe"
              className="flex-[2] py-3 rounded-lg text-sm font-bold text-center"
              style={{ background: "linear-gradient(90deg,#2DD4BF,#22D3EE)", color: "#04252b" }}
            >
              {es ? "Listo — llévame a la app" : "Done — take me to the app"}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
