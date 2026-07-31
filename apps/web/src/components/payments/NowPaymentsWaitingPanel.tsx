import React, { useState, useRef, useEffect, useCallback } from "react";
import { NowPaymentsOrder } from "@/hooks/useNowPayments";
import { WALLETS } from "@/lib/cryptoWallets";

interface NowPaymentsWaitingPanelProps {
  order: NowPaymentsOrder;
  isSuccess: boolean;
  isConfirming?: boolean;
  onCancel: () => void;
  lang: string;
  wrapperClassName?: string;
  payCurrency?: string | null;
  productKind?: "subscription" | "tokens" | "call";
}

// ── NowPayments widget loader ──────────────────────────────────────────────────
// Opens the NowPayments widget (script-based, not iframe) with the invoice ID.
// Falls back to a centered popup if the widget script fails to load or doesn't
// expose the expected API.
function openWithNowPaymentsWidget(invoiceId: string, fallbackUrl: string) {
  const w = window as any;
  const tryOpen = () => {
    if (w.NOWPayments?.openPaymentWidget) {
      w.NOWPayments.openPaymentWidget({ iid: invoiceId });
      return true;
    }
    return false;
  };

  if (tryOpen()) return;

  if (!document.querySelector('script[src*="nowpayments.io/payment-widget"]')) {
    const s = document.createElement("script");
    s.src = "https://nowpayments.io/payment-widget/js/widget.js";
    s.onload = () => { if (!tryOpen()) openPopup(fallbackUrl); };
    s.onerror = () => openPopup(fallbackUrl);
    document.head.appendChild(s);
  } else {
    openPopup(fallbackUrl);
  }
}

function openPopup(url: string) {
  const w = 520, h = 720;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  window.open(url, "nowpayments_checkout", `width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`);
}

// ── Wallet icon SVGs (also re-used inline in BuyTokensModal / BookCallModal
// as a "compatible wallets" strip so users see MetaMask/Trust upfront) ────────
export const MetaMaskIcon = () => (
  <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M34.33 4L21.5 13.27l2.44-5.77L34.33 4z" fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5.66 4l12.72 9.36-2.32-5.86L5.66 4zM29.87 27.36l-3.42 5.24 7.32 2.01 2.1-7.14-6-.11zM4.16 27.47l2.09 7.14 7.32-2.01-3.42-5.24-6-.09v.2z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13.23 17.9l-2.04 3.08 7.27.33-.25-7.82-4.98 4.41zM26.77 17.9l-5.04-4.5-.17 7.91 7.27-.33-2.06-3.08zM13.57 32.6l4.37-2.13-3.77-2.94-.6 5.07zM22.06 30.47l4.37 2.13-.6-5.07-3.77 2.94z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M26.43 32.6l-4.37-2.13.35 2.85-.04 1.22 4.06-1.94zM13.57 32.6l4.05 1.94-.03-1.22.34-2.85-4.36 2.13z" fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M17.7 25.6l-3.63-1.07 2.56-1.17 1.07 2.24zM22.3 25.6l1.07-2.24 2.57 1.17-3.64 1.07z" fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13.57 32.6l.62-5.24-4.21.12 3.59 5.12zM25.81 27.36l.62 5.24 3.59-5.12-4.21-.12zM28.83 20.98l-7.27.33.68 3.76 1.06-2.24 2.57 1.17 2.96-3.02zM14.07 24.54l2.57-1.17 1.06 2.24.68-3.76-7.27-.33 2.96 3.02z" fill="#CD6116" stroke="#CD6116" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M11.17 20.98l3.05 5.95-.1-2.93-2.95-3.02zM25.88 23.98l-.1 2.93 3.05-5.93-2.95 3zM18.43 21.31l-.68 3.76.85 4.38.19-5.78-.36-2.36zM21.57 21.31l-.35 2.35.18 5.79.85-4.38-.68-3.76z" fill="#E4751F" stroke="#E4751F" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22.3 25.6l-.85 4.38.61.42 3.77-2.94.1-2.93L22.3 25.6zM14.07 24.54l.1 2.93 3.77 2.94.61-.42-.85-4.38-3.63 1.07-.1-.14z" fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22.39 34.54l.04-1.22-.32-.28H17.9l-.31.28.03 1.22-4.05-1.94 1.42 1.16 2.87 1.99h4.29l2.88-1.99 1.42-1.16-4.06 1.94z" fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22.06 30.47l-.61-.42h-2.9l-.61.42-.34 2.85.31-.28h4.21l.32.28-.38-2.85z" fill="#161616" stroke="#161616" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M34.89 13.74l1.09-5.25L34.33 4 22.06 12.97l4.71 3.98 6.66 1.94 1.47-1.72-.64-.46 1.02-.93-.79-.61 1.02-.78-.62-.65zM4.02 8.49l1.09 5.25-.7.5 1.03.77-.8.61 1.02.93-.64.46 1.47 1.72 6.66-1.94 4.71-3.98L5.66 4 4.02 8.49z" fill="#763D16" stroke="#763D16" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M33.43 18.89l-6.66-1.94 2.06 3.08-3.05 5.93 4.02-.05h6l-2.37-7.02zM13.23 16.95l-6.66 1.94-2.35 7.02h5.99l4.01.05-3.05-5.93 2.06-3.08zM21.55 21.31l.42-7.34 1.92-5.18h-7.78l1.92 5.18.42 7.34.16 2.36.01 5.78h2.9l.01-5.78.22-2.36z" fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const TrustWalletIcon = () => (
  <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="#0500FF"/>
    <path d="M20 7C20 7 10 11.5 10 20C10 26.627 14.477 32.184 20 34C25.523 32.184 30 26.627 30 20C30 11.5 20 7 20 7Z" fill="white"/>
    <path d="M20 11.5C20 11.5 13 15.1 13 21.2C13 25.748 16.134 29.578 20 31C23.866 29.578 27 25.748 27 21.2C27 15.1 20 11.5 20 11.5Z" fill="#0500FF"/>
    <path d="M17.5 21L19.5 23L23 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const WalletConnectIcon = () => (
  <svg viewBox="0 0 40 40" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="#3B99FC"/>
    <path d="M12.5 17.2C16.6 13.1 23.4 13.1 27.5 17.2L28 17.7C28.2 17.9 28.2 18.2 28 18.4L26.3 20.1C26.2 20.2 26 20.2 25.9 20.1L25.2 19.4C22.4 16.6 17.6 16.6 14.8 19.4L14.1 20.1C14 20.2 13.8 20.2 13.7 20.1L12 18.4C11.8 18.2 11.8 17.9 12 17.7L12.5 17.2ZM30.8 20.5L32.3 22C32.5 22.2 32.5 22.5 32.3 22.7L25.4 29.6C25.2 29.8 24.9 29.8 24.7 29.6L20 24.9L15.3 29.6C15.1 29.8 14.8 29.8 14.6 29.6L7.7 22.7C7.5 22.5 7.5 22.2 7.7 22L9.2 20.5C9.4 20.3 9.7 20.3 9.9 20.5L14.6 25.2C14.8 25.4 15.1 25.4 15.3 25.2L20 20.5L24.7 25.2C24.9 25.4 25.2 25.4 25.4 25.2L30.1 20.5C30.3 20.3 30.6 20.3 30.8 20.5Z" fill="white"/>
  </svg>
);

function isEvmChain(payCurrency: string | null | undefined): boolean {
  if (!payCurrency) return false;
  return ["usdtbsc", "usdcbsc", "eth", "usdterc20", "usdcerc20", "bnbbsc"].includes(payCurrency);
}

function isTronChain(payCurrency: string | null | undefined): boolean {
  return payCurrency === "usdttrc20" || payCurrency === "usdctrc20";
}

export const NowPaymentsWaitingPanel: React.FC<NowPaymentsWaitingPanelProps> = ({
  order,
  isSuccess,
  isConfirming = false,
  onCancel,
  lang,
  wrapperClassName = "",
  payCurrency = null,
  productKind = "subscription",
}) => {
  const es = lang === "es";
  const isTg = typeof window !== "undefined" && !!window.Telegram?.WebApp?.initData;
  const [walletChosen, setWalletChosen] = useState(false);

  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    if (isSuccess) {
      popupRef.current?.close();
      popupRef.current = null;
    }
  }, [isSuccess]);

  const metaMaskUrl = `https://metamask.app.link/dapp/${order.invoiceUrl.replace(/^https?:\/\//, "")}`;
  const trustWalletUrl = `https://link.trustwallet.com/open_url?coin_id=${isTronChain(payCurrency) ? 195 : 60}&url=${encodeURIComponent(order.invoiceUrl)}`;

  const handleOtherWallets = useCallback(() => {
    setWalletChosen(true);
    if (order.nowpaymentsInvoiceId) {
      openWithNowPaymentsWidget(order.nowpaymentsInvoiceId, order.invoiceUrl);
    } else if (isTg) {
      window.Telegram!.WebApp.openLink(order.invoiceUrl);
    } else {
      openPopup(order.invoiceUrl);
    }
  }, [order, isTg]);

  if (isSuccess) {
    return (
      <div className={`flex flex-col items-center gap-3 py-6 px-4 rounded-xl border border-green-500/40 bg-green-500/5 animate-in fade-in zoom-in duration-300 ${wrapperClassName}`}>
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-green-400">{es ? "¡Pago confirmado!" : "Payment confirmed!"}</p>
        <p className="text-xs text-pnp-textSecondary">
          {productKind === "tokens"
            ? (es ? "Tus tokens ya están en tu cuenta." : "Your tokens are in your account.")
            : productKind === "call"
            ? (es ? "Tu llamada está confirmada." : "Your call is booked.")
            : (es ? "Tu suscripción ya está activa." : "Your subscription is now active.")}
        </p>
      </div>
    );
  }

  const showWalletButtons = isEvmChain(payCurrency) || isTronChain(payCurrency);

  return (
    <div className={`rounded-xl border border-green-500/30 bg-[#0d1f0d] p-4 animate-in fade-in slide-in-from-top-1 duration-250 ${wrapperClassName}`}>

      {/* Status row */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${isConfirming ? "bg-yellow-400" : "bg-green-400"}`} />
        <span className="text-sm font-semibold text-white">
          {isConfirming
            ? (es ? "Pago detectado — confirmando en red…" : "Payment detected — confirming on-chain…")
            : (es ? "Esperando tu pago" : "Waiting for your payment")}
        </span>
        <span className="ml-auto text-[10px] text-green-400/60 font-mono">{es ? "auto-verificando" : "auto-checking"}</span>
      </div>

      {isConfirming && (
        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/8 px-3 py-2 text-[11px] text-yellow-300/90 leading-relaxed">
          {es
            ? "Tu pago fue detectado y está siendo confirmado por la red (1–30 min según la moneda). No cierres esta página."
            : "Your payment was detected and is being confirmed by the network (1–30 min depending on the coin). Don't close this page."}
        </div>
      )}

      {/* Wallet picker — shown before any wallet is chosen */}
      {!walletChosen && showWalletButtons && !isConfirming && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-pnp-textSecondary mb-2.5">
            {es ? "Abre directamente en tu wallet:" : "Open directly in your wallet:"}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <a
              href={metaMaskUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setWalletChosen(true)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-orange-500/30 bg-orange-500/8 hover:bg-orange-500/15 transition-all active:scale-[0.97]"
            >
              <MetaMaskIcon />
              <span className="text-[10px] font-bold text-orange-300">MetaMask</span>
            </a>
            <a
              href={trustWalletUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setWalletChosen(true)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-blue-500/30 bg-blue-600/10 hover:bg-blue-600/20 transition-all active:scale-[0.97]"
            >
              <TrustWalletIcon />
              <span className="text-[10px] font-bold text-blue-300">Trust Wallet</span>
            </a>
            <button
              type="button"
              onClick={handleOtherWallets}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-[#3B99FC]/30 bg-[#3B99FC]/8 hover:bg-[#3B99FC]/15 transition-all active:scale-[0.97]"
            >
              <WalletConnectIcon />
              <span className="text-[10px] font-bold text-[#5BA8FC]">{es ? "Otras" : "Other"}</span>
            </button>
          </div>
          <p className="text-[9px] text-pnp-textSecondary/50 mt-2 text-center">
            {es ? 'No tienes wallet? Usa el botón "Otras" para pagar directamente.' : 'No wallet app? Tap "Other" to pay directly.'}
          </p>
        </div>
      )}

      {/* After wallet chosen: show "open again" link + status */}
      {walletChosen && !isConfirming && (
        <button
          type="button"
          onClick={handleOtherWallets}
          className="w-full flex items-center justify-center gap-2 py-3 mb-3 rounded-xl font-bold text-sm text-white bg-pnp-accent hover:bg-pnp-accentHover transition-all active:scale-[0.98]"
        >
          {es ? "Volver a abrir pago" : "Open payment again"}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      )}

      {/* Non-EVM (BTC, SOL, etc.) — direct open button */}
      {!showWalletButtons && !isConfirming && (
        <button
          type="button"
          onClick={handleOtherWallets}
          className="w-full flex items-center justify-center gap-2 py-3 mb-3 rounded-xl font-bold text-sm text-white bg-pnp-accent hover:bg-pnp-accentHover transition-all active:scale-[0.98]"
        >
          {es ? "Abrir pago" : "Open Payment"}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      )}

      {/* Timing note */}
      <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 mt-1 text-[10px] text-pnp-textSecondary/70 leading-relaxed">
        {es
          ? "Tu acceso se activa automáticamente en cuanto el pago es detectado. Pagos con tarjeta (MoonPay) pueden tardar hasta 24 h."
          : "Your access activates automatically once the payment is detected. Card payments via MoonPay can take up to 24 h."}
      </div>

      {/* Guide link — surfaces the network-picker education right before the user sends funds */}
      <a
        href="/crypto-guide"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 w-full py-2 mt-2 rounded-lg border border-amber-400/25 bg-amber-400/5 hover:bg-amber-400/10 text-[11px] font-semibold text-amber-300 transition-colors"
      >
        <span aria-hidden>⚠</span>
        <span>
          {es
            ? "¿No sabes qué red elegir? Guía de 30 seg →"
            : "Not sure which network? 30-sec guide →"}
        </span>
      </a>

      <button
        onClick={onCancel}
        className="w-full text-[10px] text-pnp-textSecondary/50 hover:text-pnp-textSecondary transition-colors py-1.5 mt-2"
      >
        {es ? "Cancelar y elegir otro plan" : "Cancel — choose a different plan"}
      </button>
    </div>
  );
};
