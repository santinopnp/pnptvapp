import React, { useState } from "react";
import { StepDots } from "@pnptv/ui-kit";
import { WALLETS, type WalletKey } from "@/lib/cryptoWallets";

const WALLET_TAGS: Record<WalletKey, { en: string; es: string }> = {
  trust: { en: "Easiest on phone", es: "Más fácil en celular" },
  metamask: { en: "Easiest on computer", es: "Más fácil en computadora" },
};

const WALLET_DESC: Record<WalletKey, { en: string; es: string }> = {
  trust: {
    en: "A free app that acts like your digital money pouch. Best if you'll mostly use PNPtv from your phone.",
    es: "Una app gratuita que funciona como tu bolsa de dinero digital. Ideal si usarás PNPtv principalmente desde tu celular.",
  },
  metamask: {
    en: "A free browser add-on that works like a digital money pouch for your computer. Best if you'll use PNPtv from a laptop or desktop.",
    es: "Un complemento gratuito del navegador para tu computadora. Ideal si usarás PNPtv desde laptop o escritorio.",
  },
};

interface SetupStep { title: string; body: string; }

const SETUP_STEPS: Record<WalletKey, { en: SetupStep[]; es: SetupStep[] }> = {
  trust: {
    en: [
      { title: 'Open the app and tap "Create a new wallet"', body: "No email, no ID, no waiting — it's ready in under a minute." },
      { title: "Choose a passcode", body: "Like a lock-screen code — it keeps the app private on your phone." },
      { title: "Write down your 12 secret words", body: "This is your one-and-only backup — like the master key to a safe. Write it on paper and keep it somewhere safe. Never send it to anyone or type it into a website." },
      { title: "Confirm the words", body: "Tap them back in order just to make sure you copied them right. Done — your wallet is ready to use." },
    ],
    es: [
      { title: 'Abre la app y toca "Crear una nueva wallet"', body: "Sin correo, sin ID, sin esperas — lista en menos de un minuto." },
      { title: "Elige un código de acceso", body: "Como el código de pantalla — mantiene la app privada en tu celular." },
      { title: "Escribe tus 12 palabras secretas", body: "Este es tu único respaldo — como la llave maestra de una caja fuerte. Escríbelas en papel y guárdalas en un lugar seguro. Nunca se las envíes a nadie ni las escribas en un sitio web." },
      { title: "Confirma las palabras", body: "Tócalas en orden para verificar que las copiaste bien. Listo — tu wallet está lista para usar." },
    ],
  },
  metamask: {
    en: [
      { title: 'Open it and click "Create a new wallet"', body: "No email, no ID, no waiting — it's ready in under a minute." },
      { title: "Create a password", body: "Unlocks it on this computer only." },
      { title: "Write down your 12 secret words", body: "This is your one-and-only backup — like the master key to a safe. Write it on paper and keep it somewhere safe. No one legit will ever ask you for it." },
      { title: "Confirm the words", body: "Fill in a couple of the missing words to prove you copied them right. Then pin the icon to your browser toolbar so it's easy to find." },
    ],
    es: [
      { title: 'Ábrelo y haz clic en "Crear una nueva wallet"', body: "Sin correo, sin ID, sin esperas — lista en menos de un minuto." },
      { title: "Crea una contraseña", body: "Solo desbloquea MetaMask en esta computadora." },
      { title: "Escribe tus 12 palabras secretas", body: "Este es tu único respaldo — como la llave maestra de una caja fuerte. Escríbelas en papel y guárdalas en un lugar seguro. Nadie legítimo te las pedirá jamás." },
      { title: "Confirma las palabras", body: "Completa algunas palabras faltantes para verificar que las copiaste bien. Luego fija el ícono en tu barra del navegador para tenerlo siempre a mano." },
    ],
  },
};

const WalletIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
  </svg>
);

export function CryptoOnboardingWizard({ lang }: { lang: "en" | "es" }) {
  const es = lang === "es";
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [walletKey, setWalletKey] = useState<WalletKey | null>(null);

  const wallet = walletKey ? WALLETS[walletKey] : null;

  return (
    <div className="rounded-2xl p-5" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
      <p className="text-[10px] font-bold tracking-[.12em]" style={{ color: "#D4007A" }}>
        {es ? "CONFIGURACIÓN CRIPTO" : "CRYPTO SETUP"}
      </p>
      <h2 className="text-xl font-bold text-white mt-1">
        {es ? "Paga con cripto, sin complicaciones" : "Paying with crypto, made simple"}
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

      {/* Step 1: how it works + pick a wallet */}
      {step === 1 && (
        <div className="mt-5">
          <div className="rounded-[14px] p-4" style={{ border: "1px solid #2A2A2A", background: "#161616" }}>
            <p className="text-[13px] font-bold text-white">
              {es ? "Cómo funciona, en palabras simples" : "How this works, in plain English"}
            </p>
            <p className="text-[11px] mt-2 leading-relaxed text-pnp-textSecondary">
              {es
                ? 'La cripto es dinero digital. En vez de una cuenta bancaria, lo guardas en una app llamada "wallet" en tu celular o computadora. La cargas una vez (como una tarjeta de regalo) y desde entonces puedes pagar en PNPtv al instante, sin dar tu tarjeta ni datos bancarios.'
                : 'Crypto is just digital money. Instead of a bank account, you keep it in an app called a "wallet" on your phone or computer. You add money to it once (like loading a gift card), and from then on you can pay for anything on PNPtv instantly, without giving out your card or bank details.'}
            </p>
            <p className="text-[11px] mt-2.5 leading-relaxed text-pnp-textSecondary">
              {es
                ? "Por qué lo usamos: los pagos llegan directo, no se pueden revertir ni bloquear como a veces pasa con tarjetas, y no hay banco en el medio que ralentice o rechace el cobro."
                : "Why we use it: payments go through directly, they can't be reversed or frozen the way card payments sometimes are, and there's no bank in the middle slowing things down or blocking the charge."}
            </p>
            <p className="text-[11px] mt-2.5 leading-relaxed text-pnp-textSecondary">
              <span className="text-white font-bold">{es ? "Cuánto tarda: " : "How long it takes: "}</span>
              {es
                ? "configurar tu wallet toma unos 2 minutos. Agregar dinero suele tardar algunos minutos, a veces hasta una hora si pagas con transferencia bancaria. Después de eso, cada pago en PNPtv es instantáneo."
                : "setting up your wallet takes about 2 minutes. Adding money to it usually takes a few minutes, sometimes up to an hour if you pay by bank transfer. After that, every payment on PNPtv is instant."}
            </p>
          </div>

          <h2 className="text-base font-bold text-white mt-5">
            {es ? "Paso 1: Consigue una app de wallet" : "Step 1: Get a wallet app"}
          </h2>
          <p className="text-xs text-pnp-textSecondary mt-1.5 leading-relaxed">
            {es
              ? "Es como instalar una app de banco — sin cuenta bancaria ni papeleo. Elige una para continuar:"
              : "Think of this like installing a banking app — except no bank account or paperwork needed. Pick one below to continue:"}
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
                    className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: w.grad }}
                  >
                    <WalletIcon />
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
                ? "Las dos son gratuitas. Siempre puedes agregar otra wallet después — tu cripto no queda atada a una sola app."
                : "Both are free. You can always add another wallet later — your crypto isn't locked to one app."}
            </p>
          </div>
        </div>
      )}

      {/* Step 2: install + set up */}
      {step === 2 && wallet && walletKey && (
        <div className="mt-5">
          <div className="flex items-center gap-3 rounded-[14px] p-3.5" style={{ border: "1px solid #2A2A2A", background: "#161616" }}>
            <div
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold text-white"
              style={{ background: wallet.grad }}
            >
              {wallet.letter}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{wallet.name}</p>
              <p className="text-[11px] text-pnp-textSecondary mt-0.5">
                {es ? "Buena elección — instalémosla en tu dispositivo:" : "Good pick — let's install it on your device:"}
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
            {"chrome" in wallet && (
              <a
                href={(wallet as typeof WALLETS.metamask).chrome}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl p-3.5"
                style={{ border: "1px solid #2A2A2A", background: "#161616" }}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-white">
                    {es ? "Extensión para Chrome" : "Chrome Extension"}
                  </span>
                  <span className="block text-[10px] text-pnp-textSecondary mt-0.5">Chrome Web Store</span>
                </span>
                <span className="text-[11px] text-pnp-textSecondary">↗</span>
              </a>
            )}
          </div>

          <h2 className="text-[15px] font-bold text-white mt-5">
            {es ? "Paso 2: Configura tu wallet" : "Step 2: Set up your wallet"}
          </h2>
          <p className="text-xs text-pnp-textSecondary mt-1.5 leading-relaxed">
            {es
              ? "Toma unos 2 minutos y no necesitas ID ni papeleo — solo sigue estos pasos después de instalarla:"
              : "This takes about 2 minutes and there's no ID or paperwork — just follow these steps once it's installed:"}
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
              {es ? "Listo — Siguiente →" : "Done — Next →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: fund + spend */}
      {step === 3 && (
        <div className="mt-5">
          <div className="rounded-[14px] p-4" style={{ border: "1px solid rgba(94,209,196,.35)", background: "rgba(94,209,196,.06)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(94,209,196,.15)" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5ED1C4" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-white mt-3.5">
              {es ? "¡Listo! Ahora ponle dinero a tu wallet" : "You're set up! Now fund your wallet"}
            </h3>
            <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
              {es
                ? "Tu wallet es como un sobre vacío ahora mismo. Ponle un poco de dinero y estarás listo para pagar a los creadores en PNPtv."
                : "Your wallet is like an empty envelope right now. Put a little money in it and you're ready to pay creators on PNPtv."}
            </p>
          </div>

          <div className="flex flex-col gap-2 mt-3.5">
            <div className="flex gap-3 rounded-xl p-3.5" style={{ border: "1px solid #2A2A2A", background: "#161616" }}>
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}>1</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-white leading-tight">
                  {es ? 'Toca "Comprar" en tu wallet' : 'Tap "Buy" in your wallet app'}
                </p>
                <p className="text-[11px] text-pnp-textSecondary mt-1 leading-relaxed">
                  {es
                    ? 'Paga como cuando compras en línea — tarjeta débito, crédito o transferencia bancaria. Elige "USDT" o "USDC" cuando te pregunte qué moneda — esas siguen el dólar 1 a 1, así que tu saldo nunca sube ni baja solo.'
                    : 'Pay the same way you\'d shop online — debit card, credit card, or bank transfer. Choose "USDT" or "USDC" when it asks which coin — those track the US dollar 1-to-1, so your balance never goes up or down on its own.'}
                </p>
                <p className="text-[11px] text-pnp-textSecondary mt-1.5 leading-relaxed">
                  {es
                    ? "Para montos pequeños (menos de ~$150), la mayoría de los proveedores te permiten comprar solo con tarjeta — sin necesidad de ID. Si uno te pide verificar identidad, prueba con otro proveedor de la lista."
                    : "For small amounts (under about $150), most providers let you buy with just a card — no ID needed. If one asks you to verify your identity, just pick a different provider from the list."}
                </p>
                <p className="text-[11px] text-pnp-textSecondary mt-1.5 leading-relaxed">
                  <span className="text-white font-bold">{es ? "Tiempo: " : "Timing: "}</span>
                  {es
                    ? "los pagos con tarjeta llegan en minutos. Las transferencias bancarias pueden tardar hasta una hora."
                    : "card payments land in your wallet in a few minutes. Bank transfers can take up to an hour."}
                </p>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl p-3.5" style={{ border: "1px solid #2A2A2A", background: "#161616" }}>
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}>2</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-white leading-tight">
                  {es ? "Ya estás listo para pagar en PNPtv" : "You're ready to pay on PNPtv"}
                </p>
                <p className="text-[11px] text-pnp-textSecondary mt-1 leading-relaxed">
                  {es
                    ? "Ya está — no hay paso extra de vinculación. Una vez que los tokens están en tu wallet, paga directamente desde la página donde estés, en cualquier parte de la app:"
                    : "That's it — no extra linking step. Once the tokens are in your wallet, just pay right from the page you're on, anywhere in the app:"}
                </p>
                <div className="flex flex-col gap-1.5 mt-2.5">
                  <a href="/subscribe" className="flex items-center justify-between px-3 py-2.5 rounded-[10px] text-xs font-semibold" style={{ background: "#111", border: "1px solid #2A2A2A", color: "#FF4DA6", textDecoration: "none" }}>
                    <span>{es ? "Suscribirse a un creador" : "Subscribe to a creator"}</span>
                    <span>→</span>
                  </a>
                  <a href="/buy-tokens" className="flex items-center justify-between px-3 py-2.5 rounded-[10px] text-xs font-semibold" style={{ background: "#111", border: "1px solid #2A2A2A", color: "#FF4DA6", textDecoration: "none" }}>
                    <span>{es ? "Comprar más tokens" : "Buy more tokens"}</span>
                    <span>→</span>
                  </a>
                  <a href="/creators" className="flex items-center justify-between px-3 py-2.5 rounded-[10px] text-xs font-semibold" style={{ background: "#111", border: "1px solid #2A2A2A", color: "#FF4DA6", textDecoration: "none" }}>
                    <span>{es ? "Ver todos los creadores" : "Browse all creators"}</span>
                    <span>→</span>
                  </a>
                </div>
              </div>
            </div>
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
