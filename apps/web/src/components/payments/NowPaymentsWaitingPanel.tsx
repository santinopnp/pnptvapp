import React, { useState, useRef, useEffect, useCallback } from "react";
import { NowPaymentsOrder } from "@/hooks/useNowPayments";
import { PayInWalletChips, MetaMaskIcon, TrustWalletIcon, WalletConnectIcon } from "./PayInWalletChips";

// Re-export for any legacy consumer that imports the icons from this module.
export { MetaMaskIcon, TrustWalletIcon, WalletConnectIcon };

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

function openPopup(url: string) {
  const w = 520, h = 720;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  window.open(url, "nowpayments_checkout", `width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`);
}

// Wallet icon SVGs live in ./PayInWalletChips — re-exported at the top of this
// file for backward compat with any consumer still importing them from here.

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

  const handleOtherWallets = useCallback(() => {
    setWalletChosen(true);
    if (isTg) {
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

      {/* Wallet picker — direct app deep-linking for Trust Wallet & MetaMask */}
      {!isConfirming && (
        <div className="mb-3" onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("a[href], button")) {
            setWalletChosen(true);
          }
        }}>
          <PayInWalletChips
            invoiceUrl={order.invoiceUrl}
            payCurrency={payCurrency}
            lang={lang}
            onOtherWallets={handleOtherWallets}
          />
        </div>
      )}

      {/* NowPayments checkout must be opened in a popup — the widget cannot be
          iframed (third-party cookie block + HTTP-downgrade redirect break it
          in Safari/iOS). See feedback_nowpayments_iframe_blocked. */}

      {/* After wallet chosen fallback: link to open checkout directly */}
      {walletChosen && !isConfirming && (
        <button
          type="button"
          onClick={handleOtherWallets}
          className="w-full flex items-center justify-center gap-2 py-3 mb-3 rounded-xl font-bold text-sm text-white bg-pnp-accent hover:bg-pnp-accentHover transition-all active:scale-[0.98]"
        >
          {es ? "Abrir ventana de pago externa" : "Open external payment window"}
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
