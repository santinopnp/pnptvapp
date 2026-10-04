import React, { useState, useRef, useEffect, useCallback } from "react";
import { NowPaymentsOrder } from "@/hooks/useNowPayments";
import { prepareOnchainSubscription, getUsdcSubscriptionStatus } from "@/lib/api";


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

// ── Asset picker — the 4 coins we invoice for. Users abandon ~99% of invoices
// when the only option is BTC (we were hardcoding 'btc'); surfacing the asset
// they actually hold cuts that drop-off dramatically.
// `wire` values must appear in ALLOWED_PAY_CURRENCIES_PREPARE on the backend
// (routes.js:14810). `appGuides` toggles whether the per-wallet-app step list
// (Revolut/CashApp/Venmo/…) is shown — those apps only support BTC send-out,
// so we skip the guide block for the other assets and show a generic hint.
export const NP_ASSETS = [
  { wire: 'btc',        label: 'Bitcoin',   ticker: 'BTC',  emoji: '₿', color: '#f7931a', appGuides: true  },
  { wire: 'usdttrc20',  label: 'USDT',      ticker: 'USDT (TRC-20)', emoji: '₮', color: '#26a17b', appGuides: false },
  { wire: 'eth',        label: 'Ethereum',  ticker: 'ETH',  emoji: 'Ξ', color: '#627eea', appGuides: false },
  { wire: 'ltc',        label: 'Litecoin',  ticker: 'LTC',  emoji: 'Ł', color: '#345d9d', appGuides: false },
] as const;
type NpAssetWire = typeof NP_ASSETS[number]['wire'];

const LAST_ASSET_KEY = 'pnpapp:np:lastAsset';
function readLastAsset(): NpAssetWire | null {
  try {
    const v = localStorage.getItem(LAST_ASSET_KEY);
    return NP_ASSETS.some(a => a.wire === v) ? (v as NpAssetWire) : null;
  } catch { return null; }
}
function writeLastAsset(wire: NpAssetWire) {
  try { localStorage.setItem(LAST_ASSET_KEY, wire); } catch { /* storage partitioned on iOS Safari */ }
}

// ── App picker sheet — creates a NowPayments invoice then opens window.open() popup.
// NowPayments blocks iframe embedding, so we must use popup (feedback_nowpayments_iframe_blocked).
// onLaunch / launching props kept for backward compat but are ignored.
const APP_OPEN_LINKS: Record<string, string> = {
  revolut:  'https://revolut.com/app',
  cashapp:  'https://cash.app',
  paypal:   'https://paypal.com/myaccount/crypto',
  venmo:    'https://venmo.com',
  n26:      'https://app.n26.com',
  binance:  'https://app.binance.com',
  coinbase: 'https://coinbase.com',
};

export function NpAppPickerSheet({
  isOpen,
  onClose,
  planId,
  lang,
  planLabel,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  planId: string | null;
  lang: string;
  planLabel?: string;
  onSuccess?: (orderId: string) => void;
  onLaunch?: () => void;
  launching?: boolean;
}) {
  const es = (lang || 'es').startsWith('es');

  type Phase = 'picking' | 'loading' | 'ready' | 'success' | 'error';
  const [phase, setPhase] = useState<Phase>('picking');
  const [chosenAsset, setChosenAsset] = useState<NpAssetWire | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [payAddress, setPayAddress] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const chosenMeta = chosenAsset ? NP_ASSETS.find(a => a.wire === chosenAsset) : null;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPhase('picking');
      setChosenAsset(null);
      setInvoiceError(null);
      setPayAddress(null);
      setPayAmount(null);
      setOrderId(null);
      setCopied(false);
      setSelectedApp(null);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [isOpen]);

  const createInvoice = useCallback(async (asset: NpAssetWire) => {
    if (!planId) return;
    setChosenAsset(asset);
    writeLastAsset(asset);
    setPhase('loading');
    setInvoiceError(null);
    setPayAddress(null);
    setPayAmount(null);
    try {
      const res = await prepareOnchainSubscription(planId, asset);
      if (!res.success || !res.payAddress || !res.orderId) {
        throw new Error(res.error || (es ? 'No se pudo crear el pago.' : 'Could not create payment.'));
      }
      setOrderId(res.orderId);
      setPayAddress(res.payAddress);
      setPayAmount(res.payAmount ?? null);
      setPhase('ready');

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getUsdcSubscriptionStatus(res.orderId as string);
          if (status.completed) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setPhase('success');
            onSuccess?.(res.orderId as string);
            setTimeout(() => { onClose(); }, 2500);
          } else if (status.failed) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            setInvoiceError(es ? 'El pago falló. Intenta de nuevo.' : 'Payment failed. Please try again.');
            setPhase('error');
          }
        } catch { /* swallow poll errors */ }
      }, 8000);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : (es ? 'Error al crear el pago.' : 'Could not create payment.'));
      setPhase('error');
    }
  }, [planId, es, onSuccess, onClose]);

  // Auto-select on open if user has a remembered asset preference. We STILL
  // force a tap on the picker tile (don't call createInvoice() silently) so a
  // mistaken-click doesn't burn an invoice — just highlight their preferred
  // tile and show a 1-tap "Confirm" button next to it. See the picker UI
  // below for how `rememberedAsset` is consumed.
  const rememberedAsset = isOpen ? readLastAsset() : null;

  const handleCopy = useCallback(() => {
    if (!payAddress) return;
    navigator.clipboard.writeText(payAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [payAddress]);

  if (!isOpen) return null;

  const steps = selectedApp ? (es ? PANEL_STEPS_ES : PANEL_STEPS_EN)[selectedApp] ?? [] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
      <div
        className="relative w-full rounded-t-2xl p-5 space-y-4"
        style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto -mt-1 mb-1" />

        <div className="flex items-center justify-between">
          <p className="text-base font-black text-white">
            {chosenMeta
              ? (es ? `${chosenMeta.emoji} Pagar con ${chosenMeta.label}` : `${chosenMeta.emoji} Pay with ${chosenMeta.label}`)
              : (es ? '🪙 Pagar con cripto' : '🪙 Pay with crypto')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {planLabel && <p className="text-xs text-white/40 -mt-2">{planLabel}</p>}

        {phase === 'picking' && (
          <>
            <p className="text-[12px] text-white/55 leading-snug">
              {es
                ? 'Elegí la cripto que ya tenés en tu billetera o exchange:'
                : 'Pick the crypto you already hold in your wallet or exchange:'}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {NP_ASSETS.map(a => {
                const isRemembered = rememberedAsset === a.wire;
                return (
                  <button
                    key={a.wire}
                    type="button"
                    onClick={() => createInvoice(a.wire)}
                    className="relative flex flex-col items-center gap-1 py-4 rounded-xl border transition active:scale-[0.97]"
                    style={{
                      background: `${a.color}14`,
                      borderColor: isRemembered ? a.color : `${a.color}55`,
                    }}
                  >
                    {isRemembered && (
                      <span className="absolute top-1.5 right-2 text-[9px] font-bold uppercase tracking-wider text-white/60">
                        {es ? 'último' : 'last'}
                      </span>
                    )}
                    <span className="text-2xl leading-none" style={{ color: a.color }}>{a.emoji}</span>
                    <span className="text-sm font-bold text-white">{a.label}</span>
                    <span className="text-[10px] text-white/45">{a.ticker}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-white/30 text-center leading-snug">
              {es
                ? 'No vemos tu billetera ni tus apps — generamos una dirección fresca por pago.'
                : "We never see your wallet or apps — a fresh address is generated per payment."}
            </p>
          </>
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <p className="text-sm text-white/50">
              {es ? 'Preparando tu pago…' : 'Preparing your payment…'}
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-4 text-center space-y-3">
            <p className="text-sm text-red-400">{invoiceError}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {chosenAsset && (
                <button
                  type="button"
                  onClick={() => { if (chosenAsset) createInvoice(chosenAsset); }}
                  className="px-4 py-2 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.97]"
                  style={{ background: 'linear-gradient(90deg, #ff3377, #ff9933)' }}
                >
                  {es ? 'Reintentar' : 'Try again'}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setPhase('picking'); setChosenAsset(null); setInvoiceError(null); }}
                className="px-4 py-2 rounded-xl font-semibold text-sm text-white/80 border border-white/15 bg-white/[0.04] transition-all active:scale-[0.97]"
              >
                {es ? 'Elegir otra cripto' : 'Pick different crypto'}
              </button>
            </div>
          </div>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center gap-3 py-8 animate-in fade-in zoom-in duration-300">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-green-400">
              {es ? '¡Pago confirmado!' : 'Payment confirmed!'}
            </p>
            <p className="text-xs text-white/50">
              {es ? 'Tu suscripción ya está activa.' : 'Your subscription is now active.'}
            </p>
          </div>
        )}

        {phase === 'ready' && payAddress && (
          <>
            {/* Address + amount block */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2.5">
              {payAmount && (
                <div className="text-center">
                  <p className="text-[10px] text-white/35 mb-0.5">
                    {es ? 'Monto exacto a enviar' : 'Exact amount to send'}
                  </p>
                  <p className="text-2xl font-black text-white">
                    {payAmount} <span style={{ color: chosenMeta?.color ?? '#f7931a' }}>{chosenMeta?.ticker ?? 'BTC'}</span>
                  </p>
                </div>
              )}
              <p className="text-[10px] text-white/35 text-center">
                {es ? 'Dirección de envío:' : 'Send to this address:'}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[10px] font-mono text-white/70 break-all leading-relaxed bg-black/40 rounded-lg px-2.5 py-2">
                  {payAddress}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-shrink-0 px-3 py-2 rounded-lg text-[10px] font-bold transition-all active:scale-[0.95]"
                  style={copied
                    ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }
                    : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)' }
                  }
                >
                  {copied ? (es ? '✓ Copiado' : '✓ Copied') : (es ? 'Copiar' : 'Copy')}
                </button>
              </div>
            </div>

            <p className="text-[10px] text-white/30 text-center">
              {es
                ? '⚡ Tu plan se activa solo cuando la red confirme el pago.'
                : '⚡ Plan activates automatically once the network confirms.'}
            </p>

            {/* App picker — only shown for BTC since the apps below (Revolut,
                Cash App, Venmo, N26, PayPal) only support Bitcoin send-out.
                For USDT/ETH/LTC we show a generic 2-line hint instead. */}
            {chosenMeta?.appGuides ? (
            <div>
              <p className="text-[11px] text-white/45 mb-2.5">
                {es ? 'Toca tu app para ver los pasos:' : 'Tap your app to see the steps:'}
              </p>
              <div className="flex flex-wrap gap-2">
                {PANEL_APPS.map(app => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setSelectedApp(selectedApp === app.id ? null : app.id)}
                    className="px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all active:scale-[0.95]"
                    style={selectedApp === app.id
                      ? { background: app.bg, borderColor: app.border, color: 'rgba(255,255,255,0.95)' }
                      : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.55)' }
                    }
                  >
                    {app.label}
                  </button>
                ))}
              </div>

              {selectedApp && steps.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 animate-in fade-in slide-in-from-top-1 duration-150">
                  <ol className="space-y-1.5 mb-3">
                    {steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-white/55 mt-0.5">{i + 1}</span>
                        <span className="text-[11px] text-white/75 leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <a
                    href={APP_OPEN_LINKS[selectedApp]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[11px] font-bold text-white no-underline transition-all active:scale-[0.97]"
                    style={{ background: PANEL_APPS.find(a => a.id === selectedApp)?.bg, border: `1px solid ${PANEL_APPS.find(a => a.id === selectedApp)?.border}` }}
                  >
                    {es ? `Abrir ${PANEL_APPS.find(a => a.id === selectedApp)?.label} →` : `Open ${PANEL_APPS.find(a => a.id === selectedApp)?.label} →`}
                  </a>
                </div>
              )}
            </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1.5">
                <p className="text-[11px] text-white/55 leading-relaxed">
                  {es
                    ? `En tu billetera o exchange (ej. Binance, Coinbase, Trust), elegí "Enviar", pegá la dirección de arriba e ingresá el monto exacto en ${chosenMeta?.ticker}.`
                    : `In your wallet or exchange (e.g. Binance, Coinbase, Trust), tap "Send", paste the address above, and enter the exact amount in ${chosenMeta?.ticker}.`}
                </p>
                {chosenAsset === 'usdttrc20' && (
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    {es
                      ? '⚠️ Elegí la red TRC-20 (TRON). Enviar USDT por ERC-20 o BEP-20 llega a otra dirección y se pierde.'
                      : '⚠️ Pick the TRC-20 (TRON) network. Sending USDT over ERC-20 or BEP-20 goes to a different address and is lost.'}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {phase !== 'success' && (
          <button
            type="button"
            onClick={onClose}
            className="w-full text-[10px] text-white/30 hover:text-white/60 transition-colors py-1"
          >
            {es ? 'Cancelar' : 'Cancel'}
          </button>
        )}
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
