import React, { useState, useRef, useEffect } from "react";
import { NowPaymentsOrder } from "@/hooks/useNowPayments";


interface NowPaymentsWaitingPanelProps {
  order: NowPaymentsOrder;
  isSuccess: boolean;
  isConfirming?: boolean;
  onCancel: () => void;
  lang: string;
  wrapperClassName?: string;
  payCurrency?: string | null;
}

// ── App picker guide — collapsed by default, replaces raw coin instructions ───

export const PANEL_APPS = [
  { id: 'revolut',  label: 'Revolut',  geo: 'EU',     emoji: '🟣', bg: 'rgba(91,106,208,0.22)',  border: 'rgba(91,106,208,0.55)'  },
  { id: 'cashapp',  label: 'Cash App', geo: 'US/UK',  emoji: '💚', bg: 'rgba(0,214,79,0.15)',    border: 'rgba(0,214,79,0.50)'    },
  { id: 'paypal',   label: 'PayPal',   geo: 'Global', emoji: '🔵', bg: 'rgba(0,48,135,0.40)',    border: 'rgba(0,112,255,0.50)'   },
  { id: 'venmo',    label: 'Venmo',    geo: 'US',     emoji: '🔵', bg: 'rgba(0,140,255,0.22)',   border: 'rgba(0,140,255,0.50)'   },
  { id: 'n26',      label: 'N26',      geo: 'EU',     emoji: '⚫', bg: 'rgba(80,80,80,0.30)',    border: 'rgba(120,120,120,0.50)' },
  { id: 'binance',  label: 'Binance',  geo: 'Global', emoji: '🟡', bg: 'rgba(240,185,11,0.15)',  border: 'rgba(240,185,11,0.45)'  },
  { id: 'coinbase', label: 'Coinbase', geo: 'Global', emoji: '🔵', bg: 'rgba(0,82,255,0.22)',    border: 'rgba(0,82,255,0.50)'    },
] as const;

export const PANEL_STEPS_EN: Record<string, string[]> = {
  revolut:  ["Open Revolut → search 'Bitcoin' in the top search bar", "Tap Bitcoin (BTC) → tap 'Send'", "Tap 'Send to crypto address'", "Paste the address shown above (or scan the QR)", "Enter the exact amount shown → Confirm"],
  cashapp:  ["Open Cash App → tap the Bitcoin tab (₿) at the bottom", "Tap 'Send Bitcoin'", "Paste the address shown above (or scan the QR)", "Enter the exact amount shown → Confirm"],
  paypal:   ["Open PayPal → tap 'Crypto'", "Tap 'Bitcoin (BTC)'", "Tap 'Transfer' → 'External wallet'", "Paste the address shown above (or scan the QR)", "Enter the exact amount → Review → Send"],
  venmo:    ["Open Venmo → tap 'Crypto' in the bottom menu", "Tap 'Bitcoin (BTC)'", "Tap 'Transfer out' → 'External wallet'", "Paste the address shown above (or scan the QR)", "Enter the exact amount → Confirm"],
  n26:      ["Open N26 → tap 'Crypto' in the bottom menu", "Tap 'Bitcoin (BTC)'", "Tap 'Send' → 'External address'", "Paste the address shown above (or scan the QR)", "Enter the exact amount → Confirm"],
  binance:  ["Open Binance → tap 'Wallets' → 'Spot'", "Find Bitcoin (BTC) → tap 'Send'", "⚠️ Select network: Bitcoin (BTC) — do NOT pick BNB or other networks", "Paste the address shown above (or scan the QR)", "Enter the exact amount → Confirm"],
  coinbase: ["Open Coinbase → tap 'Assets' → find 'Bitcoin'", "Tap 'Send'", "Paste the address shown above (or scan the QR)", "Enter the exact amount → Continue → Send now"],
};

export const PANEL_STEPS_ES: Record<string, string[]> = {
  revolut:  ["Abre Revolut → busca 'Bitcoin' en la barra de búsqueda", "Toca Bitcoin (BTC) → toca 'Enviar'", "Toca 'Enviar a dirección cripto'", "Pega la dirección de arriba (o escanea el QR)", "Ingresa el monto exacto → Confirma"],
  cashapp:  ["Abre Cash App → toca la pestaña Bitcoin (₿) abajo", "Toca 'Enviar Bitcoin'", "Pega la dirección de arriba (o escanea el QR)", "Ingresa el monto exacto → Confirma"],
  paypal:   ["Abre PayPal → toca 'Criptomonedas'", "Toca 'Bitcoin (BTC)'", "Toca 'Transferir' → 'Billetera externa'", "Pega la dirección de arriba (o escanea el QR)", "Ingresa el monto exacto → Revisar → Enviar"],
  venmo:    ["Abre Venmo → toca 'Cripto' en el menú inferior", "Toca 'Bitcoin (BTC)'", "Toca 'Transferir' → 'Billetera externa'", "Pega la dirección de arriba (o escanea el QR)", "Ingresa el monto exacto → Confirma"],
  n26:      ["Abre N26 → toca 'Cripto' en el menú inferior", "Toca 'Bitcoin (BTC)'", "Toca 'Enviar' → 'Dirección externa'", "Pega la dirección de arriba (o escanea el QR)", "Ingresa el monto exacto → Confirma"],
  binance:  ["Abre Binance → toca 'Billeteras' → 'Spot'", "Busca Bitcoin (BTC) → toca 'Enviar'", "⚠️ Elige la red: Bitcoin (BTC) — NO elijas BNB ni otra red", "Pega la dirección de arriba (o escanea el QR)", "Ingresa el monto exacto → Confirma"],
  coinbase: ["Abre Coinbase → toca 'Activos' → busca 'Bitcoin'", "Toca 'Enviar'", "Pega la dirección de arriba (o escanea el QR)", "Ingresa el monto exacto → Continuar → Enviar ahora"],
};

function AppGuidePanel({ es }: { es: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const steps = selectedApp ? (es ? PANEL_STEPS_ES : PANEL_STEPS_EN)[selectedApp] ?? [] : [];
  const appLabel = PANEL_APPS.find(a => a.id === selectedApp)?.label ?? '';

  return (
    <div className="mt-2 rounded-xl border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-[11px] font-semibold text-pnp-textSecondary">
          {es ? "¿No tienes wallet? Paga desde tu app →" : "No wallet? Pay from your app →"}
        </span>
        <svg className={`w-3.5 h-3.5 text-pnp-textSecondary flex-shrink-0 ml-2 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-4 border-t border-white/10 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-[10px] text-pnp-textSecondary/70 mb-2.5 leading-relaxed">
            {es
              ? "Elige tu app y te damos los pasos exactos para pagar con Bitcoin desde ella:"
              : "Pick your app and we'll show you the exact steps to pay with Bitcoin from it:"}
          </p>

          {/* App grid */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {PANEL_APPS.map(app => {
              const isSel = selectedApp === app.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setSelectedApp(isSel ? null : app.id)}
                  className="flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-xl border transition active:scale-[0.95]"
                  style={isSel
                    ? { background: app.bg, borderColor: app.border }
                    : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }
                  }
                >
                  <span className="text-[16px] leading-none">{app.emoji}</span>
                  <span className="text-[9px] font-semibold text-white/80 text-center leading-tight">{app.label}</span>
                  <span className="text-[7.5px] text-white/30 leading-none">{app.geo}</span>
                </button>
              );
            })}
          </div>

          {/* Steps for selected app */}
          {selectedApp && steps.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <p className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-2">
                {es ? `Pasos en ${appLabel}` : `Steps in ${appLabel}`}
              </p>
              <ol className="space-y-1.5 mb-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-white/55 mt-0.5">{i + 1}</span>
                    <span className="text-[11px] text-white/75 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="text-[10px] text-white/30 leading-relaxed">
                {es
                  ? "⚡ El pago se detecta automáticamente — no necesitas hacer nada más."
                  : "⚡ Payment is detected automatically — nothing else needed."}
              </p>
            </div>
          )}

          <a href="/crypto-guide"
            className="block text-center text-[10px] font-semibold text-pnp-textSecondary/50 hover:text-pnp-textSecondary transition-colors underline decoration-dotted mt-3">
            {es ? "Guía completa →" : "Full crypto guide →"}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Exported pre-checkout app picker sheet ────────────────────────────────────
// Shows BEFORE the NP popup opens so users pick their familiar app first.
// Usage: open on "₿ Pay with crypto" click; onLaunch fires the NP popup.
export function NpAppPickerSheet({
  isOpen,
  onClose,
  onLaunch,
  launching,
  lang,
  planLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: () => void;
  launching: boolean;
  lang: string;
  planLabel?: string;
}) {
  const es = (lang || 'es').startsWith('es');
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const steps = selectedApp && selectedApp !== 'other'
    ? (es ? PANEL_STEPS_ES : PANEL_STEPS_EN)[selectedApp] ?? []
    : [];
  const appLabel = PANEL_APPS.find(a => a.id === selectedApp)?.label ?? '';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <div
        className="relative w-full rounded-t-2xl p-5 space-y-4"
        style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto -mt-1 mb-1" />

        <div className="text-center">
          <p className="text-base font-black text-white">
            {es ? '₿ Pagar con apps populares' : '₿ Pay with popular apps'}
          </p>
          {planLabel && (
            <p className="text-xs text-white/40 mt-0.5">{planLabel}</p>
          )}
        </div>

        <p className="text-[11px] text-white/50 text-center -mt-1">
          {es
            ? 'Elige tu app y te mostramos los pasos exactos:'
            : 'Pick your app and we\'ll show you the exact steps:'}
        </p>

        {/* App grid */}
        <div className="grid grid-cols-4 gap-2">
          {PANEL_APPS.map(app => {
            const isSel = selectedApp === app.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedApp(isSel ? null : app.id)}
                className="flex flex-col items-center gap-1 py-3 px-1 rounded-xl border transition active:scale-[0.95]"
                style={isSel
                  ? { background: app.bg, borderColor: app.border }
                  : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)' }
                }
              >
                <span className="text-[20px] leading-none">{app.emoji}</span>
                <span className="text-[10px] font-semibold text-white/80 text-center leading-tight">{app.label}</span>
                <span className="text-[8px] text-white/30 leading-none">{app.geo}</span>
              </button>
            );
          })}
          {/* Other / no app */}
          <button
            type="button"
            onClick={() => setSelectedApp(selectedApp === 'other' ? null : 'other')}
            className="flex flex-col items-center gap-1 py-3 px-1 rounded-xl border transition active:scale-[0.95]"
            style={selectedApp === 'other'
              ? { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.30)' }
              : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)' }
            }
          >
            <span className="text-[20px] leading-none">🔗</span>
            <span className="text-[10px] font-semibold text-white/80 text-center leading-tight">{es ? 'Otra' : 'Other'}</span>
            <span className="text-[8px] text-white/30 leading-none">–</span>
          </button>
        </div>

        {/* Step instructions */}
        {selectedApp && steps.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="text-[10px] font-semibold text-white/45 uppercase tracking-wide mb-2">
              {es ? `Pasos en ${appLabel}` : `Steps in ${appLabel}`}
            </p>
            <ol className="space-y-1.5">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-white/55 mt-0.5">{i + 1}</span>
                  <span className="text-[11px] text-white/75 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* CTA */}
        <button
          type="button"
          disabled={launching}
          onClick={onLaunch}
          className="w-full py-3.5 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.97] disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,#ff3377,#ff9933)' }}
        >
          {launching
            ? (es ? 'Abriendo…' : 'Opening…')
            : (es ? '₿ Abrir pago' : '₿ Open payment')}
        </button>

        <p className="text-[10px] text-white/30 text-center -mt-1">
          {es
            ? 'Se abrirá una ventana de pago — completa el pago y tu plan se activa solo.'
            : 'A payment window will open — complete the payment and your plan activates automatically.'}
        </p>
      </div>
    </div>
  );
}

export const NowPaymentsWaitingPanel: React.FC<NowPaymentsWaitingPanelProps> = ({
  order,
  isSuccess,
  isConfirming = false,
  onCancel,
  lang,
  wrapperClassName = "",
  payCurrency = null,
}) => {
  const es = lang === "es";
  const isTg = typeof window !== 'undefined' && !!window.Telegram?.WebApp?.initData;
  const isBsc = payCurrency === "usdtbsc" || payCurrency === "usdcbsc";
  const isSolana = payCurrency === "usdcsol";

  const widgetContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = widgetContainerRef.current;
    if (!container || isSuccess) return;
    container.innerHTML = '';
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://nowpayments.io/embeds/payment-widget.js';
    script.setAttribute('data-nowpayments-url', order.invoiceUrl);
    container.appendChild(script);
    return () => { if (container) container.innerHTML = ''; };
  }, [order.invoiceUrl, isSuccess]);

  if (isSuccess) {
    return (
      <div className={`flex flex-col items-center gap-3 py-6 px-4 rounded-xl border border-green-500/40 bg-green-500/5 animate-in fade-in zoom-in duration-300 ${wrapperClassName}`}>
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-green-400">{es ? "¡Pago confirmado!" : "Payment confirmed!"}</p>
        <p className="text-xs text-pnp-textSecondary">{es ? "Tu suscripción ya está activa." : "Your subscription is now active."}</p>
      </div>
    );
  }

  const metaMaskUrl = `https://metamask.app.link/dapp/${order.invoiceUrl.replace(/^https?:\/\//, '')}`;

  return (
    <div className={`rounded-xl border border-green-500/40 bg-green-500/5 p-3 animate-in fade-in slide-in-from-top-1 duration-250 ${wrapperClassName}`}>
      {/* Status dot */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${isConfirming ? "bg-yellow-500" : "bg-green-500"}`} />
        <span className="text-sm font-medium text-pnp-textPrimary">
          {isConfirming
            ? (es ? "Pago detectado" : "Payment detected")
            : (es ? "Esperando pago" : "Waiting for payment")}
        </span>
        <span className="ml-auto text-[10px] text-pnp-textSecondary/60 flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse inline-block ${isConfirming ? "bg-yellow-400" : "bg-green-400"}`} />
          {isConfirming
            ? (es ? "Esperando confirmación de red…" : "Waiting for network confirmation…")
            : (es ? "Auto-verificando…" : "Auto-checking…")}
        </span>
      </div>

      {/* Confirming notice */}
      {isConfirming && (
        <div className="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-500/8 px-3 py-2 text-[11px] text-yellow-300/90 leading-relaxed">
          {es
            ? "Tu pago fue detectado y está siendo confirmado por la red. Esto puede tardar de 1 a 30 minutos dependiendo de la moneda. No cierres esta página."
            : "Your payment was detected and is being confirmed by the network. This can take 1–30 minutes depending on the coin. Don't close this page."}
        </div>
      )}

      {/* BSC wallet shortcuts — MetaMask + other (no Binance: no usable deep-link) */}
      {isBsc && (
        <>
          <p className="text-[10px] text-pnp-textSecondary/70 mb-2">
            {es ? "Abre directamente en tu billetera:" : "Open directly in your wallet:"}
          </p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <a
              href={metaMaskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border border-orange-500/30 bg-orange-500/8 hover:bg-orange-500/15 transition-colors active:scale-[0.97]"
            >
              <span className="text-xl leading-none">🦊</span>
              <span className="text-[10px] font-bold text-orange-300">MetaMask</span>
            </a>
            <a
              href={order.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-colors active:scale-[0.97]"
            >
              <span className="text-xl leading-none">🌐</span>
              <span className="text-[10px] font-bold text-pnp-textSecondary">{es ? "Otra billetera" : "Other wallet"}</span>
            </a>
          </div>
        </>
      )}

      {/* Solana: open invoice directly (no Binance deep-link exists for SOL) */}
      {isSolana && (
        <a
          href={order.invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm text-white mb-3 transition-all active:scale-[0.98] bg-pnp-accent hover:opacity-90"
        >
          <span>🌐</span>
          {es ? "Abrir enlace de pago" : "Open payment link"}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      )}

      {!isConfirming && !isTg && (
        <div
          ref={widgetContainerRef}
          className="w-full mb-3 [&_a]:flex [&_a]:w-full [&_a]:items-center [&_a]:justify-center [&_a]:gap-2 [&_a]:py-3 [&_a]:rounded-xl [&_a]:font-bold [&_a]:text-sm [&_a]:text-white [&_a]:bg-pnp-accent [&_a]:hover:opacity-90 [&_a]:transition-opacity [&_a]:no-underline [&_img]:hidden"
        />
      )}
      {!isConfirming && isTg && (
        <button
          type="button"
          onClick={() => window.Telegram!.WebApp.openLink(order.invoiceUrl)}
          className="w-full flex items-center justify-center gap-2 py-3 mb-3 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] bg-pnp-accent hover:bg-pnp-accentHover"
        >
          {es ? "Abrir pago" : "Open Payment"}
        </button>
      )}

      {/* MoonPay delay notice */}
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 mb-2 text-[10px] text-pnp-textSecondary/70 leading-relaxed space-y-1">
        <p>
          {es
            ? "⚠️ Si pagaste con MoonPay, la entrega puede tardar hasta 24 h. Tu suscripción se activará automáticamente cuando llegue el pago."
            : "⚠️ If you paid via MoonPay, delivery can take up to 24 h. Your subscription activates automatically once the payment arrives."}
        </p>
        <p>
          {es
            ? "💡 Para evitar esperas, usa crypto que ya tengas en Binance, Coinbase, Kraken u otra billetera — el pago llega en minutos."
            : "💡 To avoid waiting, send crypto you already own from Binance, Coinbase, Kraken, or any wallet — payment arrives in minutes."}
        </p>
      </div>

      {/* Fallback direct link — shown when confirming or as secondary option */}
      <div className="flex gap-2 mb-2">
        <a
          href={order.invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 rounded-lg text-center text-[11px] text-pnp-textSecondary border border-white/10 bg-white/5 hover:text-pnp-textPrimary transition-colors"
        >
          {es ? "Abrir enlace directamente →" : "Open link directly →"}
        </a>
      </div>

      {/* App guide — collapsed by default */}
      <AppGuidePanel es={es} />

      <button
        onClick={onCancel}
        className="w-full text-[10px] text-pnp-textSecondary/50 hover:text-pnp-textSecondary transition-colors py-1 mt-2"
      >
        {es ? "Cancelar y elegir otro plan" : "Cancel — choose a different plan"}
      </button>
    </div>
  );
};
