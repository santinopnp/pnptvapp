import React, { useState, useRef, useEffect, useCallback } from "react";
import { NowPaymentsOrder } from "@/hooks/useNowPayments";
import { PayInWalletChips, MetaMaskIcon, TrustWalletIcon, WalletConnectIcon } from "./PayInWalletChips";
import { useAuth } from "@/hooks/useAuth";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, parseEther, toHex } from "viem";
import { base } from "viem/chains";

const BASE_CHAIN_ID_HEX = "0x2105";

declare global {
  interface Window {
    ethereum?: any;
  }
}

// Re-export for any legacy consumer that imports the icons from this module.
export { MetaMaskIcon, TrustWalletIcon, WalletConnectIcon };

interface NowPaymentsWaitingPanelProps {
  order: NowPaymentsOrder;
  isSuccess: boolean;
  isConfirming?: boolean;
  isPartiallyPaid?: boolean;
  onCancel: () => void;
  lang: string;
  wrapperClassName?: string;
  payCurrency?: string | null;
  productKind?: "subscription" | "tokens" | "call";
  /**
   * "hosted" (default) — legacy NowPayments hosted-checkout popup + deep-link
   * chip strip. Used by Subscribe / Lifetime / BuyTokens / BookCall.
   * "onchain" — MetaMask Embedded Wallets flow: connect wallet → link to
   * account → sign a native Arbitrum ETH transfer to the invoice address.
   * Used by Donate first while the flow bakes; will roll out to the others
   * once validated. Requires order.payAddress + order.payAmount.
   */
  mode?: "hosted" | "onchain";
}

function openPopup(url: string) {
  const w = 520, h = 720;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  window.open(url, "nowpayments_checkout", `width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Onchain checkout branch — dual path:
//   • If window.ethereum detected → native "Pay with MetaMask" (no SDK)
//   • Otherwise → auto-connect via Web3Auth email OTP (embedded wallet)
// Both converge on the same "Sign & pay" button pre-loaded with the
// NowPayments payAddress + payAmount for Arbitrum One.
// ─────────────────────────────────────────────────────────────────────────────
const OnchainCheckoutBranch: React.FC<{
  order: NowPaymentsOrder;
  isConfirming: boolean;
  lang: string;
}> = ({ order, isConfirming, lang }) => {
  const es = lang === "es";
  const { user } = useAuth();
  const hasInjected = typeof window !== "undefined" && !!window.ethereum;
  const payAddress = order.payAddress || "";
  const payAmount = order.payAmount || "0";

  const [txStatus, setTxStatus] = useState<"idle" | "connecting" | "signing" | "broadcasted" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ─── Path A: native MetaMask via window.ethereum (no Web3Auth) ────────────
  const payWithMetaMask = useCallback(async () => {
    if (!window.ethereum || !payAddress || !payAmount) return;
    setTxStatus("connecting");
    setErrorMsg(null);
    try {
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts?.[0]) throw new Error(es ? "MetaMask no devolvió cuenta" : "MetaMask returned no account");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_CHAIN_ID_HEX }],
        });
      } catch (switchErr: any) {
        if (switchErr?.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: BASE_CHAIN_ID_HEX,
              chainName: "Base",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://mainnet.base.org"],
              blockExplorerUrls: ["https://basescan.org"],
            }],
          });
        } else {
          throw switchErr;
        }
      }
      setTxStatus("signing");
      const valueHex = toHex(parseEther(payAmount));
      const hash: string = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: accounts[0], to: payAddress, value: valueHex }],
      });
      setTxHash(hash);
      setTxStatus("broadcasted");
    } catch (err: any) {
      setTxStatus("error");
      setErrorMsg(err?.shortMessage || err?.message || (es ? "Falló la transacción" : "Transaction failed"));
    }
  }, [payAddress, payAmount, es]);

  if (hasInjected) {
    return (
      <NativeMetaMaskCard
        order={order}
        isConfirming={isConfirming}
        lang={lang}
        txStatus={txStatus}
        txHash={txHash}
        errorMsg={errorMsg}
        onPay={payWithMetaMask}
      />
    );
  }

  // ─── Path B: Privy embedded wallet ───────────────────────────────────────
  return (
    <PrivyEmbeddedBranch
      order={order}
      isConfirming={isConfirming}
      lang={lang}
    />
  );
};

// ─── Path A component: pure window.ethereum flow ──────────────────────────
const NativeMetaMaskCard: React.FC<{
  order: NowPaymentsOrder;
  isConfirming: boolean;
  lang: string;
  txStatus: "idle" | "connecting" | "signing" | "broadcasted" | "error";
  txHash: string | null;
  errorMsg: string | null;
  onPay: () => void;
}> = ({ order, isConfirming, lang, txStatus, txHash, errorMsg, onPay }) => {
  const es = lang === "es";
  return (
    <div className="rounded-xl border border-green-500/30 bg-[#0d1f0d] p-4 animate-in fade-in slide-in-from-top-1 duration-250">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 animate-pulse ${
          isConfirming || txStatus === "broadcasted" ? "bg-yellow-400" : "bg-green-400"
        }`} />
        <span className="text-sm font-semibold text-white">
          {isConfirming ? (es ? "Confirmando en red…" : "Confirming on-chain…") :
           txStatus === "broadcasted" ? (es ? "Tx enviada — esperando confirmación" : "Tx sent — awaiting confirmation") :
           (es ? "Listo para pagar con MetaMask" : "Ready to pay with MetaMask")}
        </span>
      </div>

      <div className="rounded-lg bg-white/[0.04] px-3 py-3 mb-3 border border-white/10">
        <p className="text-[10px] text-pnp-textSecondary uppercase tracking-wider mb-1">
          {es ? "Monto a pagar" : "Amount to pay"}
        </p>
        <p className="text-lg font-bold text-white font-mono">
          {order.payAmount} <span className="text-sm text-pnp-textSecondary">ETH</span>
        </p>
        <p className="text-[9px] text-pnp-textSecondary/60 mt-1">
          ≈ ${order.usdAmount} USD · Arbitrum One
        </p>
      </div>

      {txStatus !== "broadcasted" && (
        <button
          type="button"
          onClick={onPay}
          disabled={txStatus === "connecting" || txStatus === "signing"}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-orange-500 hover:bg-orange-400 transition-all active:scale-[0.98] disabled:opacity-60"
        >
          <MetaMaskIcon size={20} />
          {txStatus === "connecting" ? (es ? "Conectando…" : "Connecting…") :
           txStatus === "signing" ? (es ? "Confirma en MetaMask…" : "Confirm in MetaMask…") :
           (es ? "Pagar con MetaMask" : "Pay with MetaMask")}
        </button>
      )}

      {txStatus === "broadcasted" && txHash && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/8 px-3 py-3 text-[11px] text-yellow-200/90 leading-relaxed">
          <p className="mb-1">{es ? "Transacción enviada. Se confirma en 5–15 seg." : "Transaction sent. Confirms in 5–15 sec."}</p>
          <a href={`https://arbiscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] underline text-yellow-300">
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </a>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2 mt-2 text-[11px] text-red-300">
          {errorMsg}
        </div>
      )}
    </div>
  );
};

// ─── Path B component: Privy embedded wallet for users without MetaMask ───
const PrivyEmbeddedBranch: React.FC<{
  order: NowPaymentsOrder;
  isConfirming: boolean;
  lang: string;
}> = ({ order, isConfirming, lang }) => {
  const es = lang === "es";
  const { ready, authenticated, login, user: privyUser } = usePrivy();
  const { wallets } = useWallets();

  const [txStatus, setTxStatus] = useState<"idle" | "signing" | "broadcasted" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const walletAddress: string | null = embeddedWallet?.address || wallets?.[0]?.address || null;

  const handleSignAndPay = useCallback(async () => {
    if (!walletAddress || !order.payAddress || !order.payAmount) {
      setErrorMsg("Missing wallet or invoice details");
      return;
    }
    setTxStatus("signing");
    setErrorMsg(null);
    try {
      const provider = await embeddedWallet?.getEthereumProvider();
      if (!provider) throw new Error("Privy wallet provider unavailable");
      const client = createWalletClient({
        account: walletAddress as `0x${string}`,
        chain: base,
        transport: custom(provider as any),
      });
      const hash = await client.sendTransaction({
        account: walletAddress as `0x${string}`,
        chain: base,
        to: order.payAddress as `0x${string}`,
        value: parseEther(String(order.payAmount)),
      });
      setTxHash(hash);
      setTxStatus("broadcasted");
    } catch (err: any) {
      setTxStatus("error");
      setErrorMsg(err?.shortMessage || err?.message || "Transaction failed");
    }
  }, [walletAddress, order.payAddress, order.payAmount, embeddedWallet]);

  if (!ready || (!authenticated && !walletAddress)) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0d1f0d] p-5 animate-in fade-in duration-250">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
          <span className="text-sm font-semibold text-white">
            {es ? "Preparando tu wallet…" : "Setting up your wallet…"}
          </span>
        </div>
        <p className="text-[11px] text-pnp-textSecondary leading-relaxed">
          {es
            ? "Te vamos a enviar un código de 6 dígitos a tu email para crear tu wallet."
            : "We'll email you a 6-digit code to create your wallet."}
        </p>
        {!authenticated && ready && (
          <button
            type="button"
            onClick={login}
            className="mt-3 w-full py-2.5 rounded-xl text-sm font-bold text-white bg-[#6A55FF] hover:bg-[#7B66FF] transition-all active:scale-[0.98]"
          >
            {es ? "Conectar wallet" : "Connect wallet"}
          </button>
        )}
        {errorMsg && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2 text-[11px] text-red-300">
            {errorMsg}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-green-500/30 bg-[#0d1f0d] p-4 animate-in fade-in slide-in-from-top-1 duration-250">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isConfirming || txStatus === "broadcasted" ? "bg-yellow-400 animate-pulse" : "bg-green-400"
        }`} />
        <span className="text-sm font-semibold text-white truncate">
          {isConfirming ? (es ? "Confirmando en red…" : "Confirming on-chain…") :
           txStatus === "broadcasted" ? (es ? "Tx enviada — esperando confirmación" : "Tx sent — awaiting confirmation") :
           (es ? "Wallet lista" : "Wallet ready")}
        </span>
      </div>

      {privyUser?.email?.address && (
        <p className="text-[10px] text-pnp-textSecondary/70 mb-1 truncate">
          {es ? "Cuenta:" : "Account:"} {privyUser.email.address}
        </p>
      )}
      {walletAddress && (
        <p className="text-[10px] font-mono text-pnp-textSecondary/60 mb-3 truncate">
          {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
        </p>
      )}

      {order.payAmount && order.payAddress && txStatus === "idle" && (
        <>
          <div className="rounded-lg bg-white/[0.04] px-3 py-3 mb-3 border border-white/10">
            <p className="text-[10px] text-pnp-textSecondary uppercase tracking-wider mb-1">
              {es ? "Monto a pagar" : "Amount to pay"}
            </p>
            <p className="text-lg font-bold text-white font-mono">
              {order.payAmount} <span className="text-sm text-pnp-textSecondary">ETH</span>
            </p>
            <p className="text-[9px] text-pnp-textSecondary/60 mt-1">
              ≈ ${order.usdAmount} USD · Base
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignAndPay}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white bg-green-500 hover:bg-green-400 transition-all active:scale-[0.98]"
          >
            {es ? "Firmar y pagar" : "Sign & pay"}
          </button>
        </>
      )}

      {txStatus === "signing" && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/8 px-3 py-3 text-[11px] text-blue-200/90 leading-relaxed text-center">
          {es ? "Confirma la transacción en tu wallet…" : "Approve the transaction in your wallet…"}
        </div>
      )}

      {txStatus === "broadcasted" && txHash && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/8 px-3 py-3 text-[11px] text-yellow-200/90 leading-relaxed">
          <p className="mb-1">{es ? "Transacción enviada. Se confirma en 5–15 seg." : "Transaction sent. Confirms in 5–15 sec."}</p>
          <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] underline text-yellow-300">
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </a>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2 mt-2 text-[11px] text-red-300">
          {errorMsg}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main panel — dispatches to onchain branch or hosted (legacy) branch
// ─────────────────────────────────────────────────────────────────────────────
export const NowPaymentsWaitingPanel: React.FC<NowPaymentsWaitingPanelProps> = ({
  order,
  isSuccess,
  isConfirming = false,
  isPartiallyPaid = false,
  onCancel,
  lang,
  wrapperClassName = "",
  payCurrency = null,
  productKind = "subscription",
  mode = "hosted",
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
            ? (es ? "Tu Ru$h ya está en tu cuenta." : "Your Ru$h is in your account.")
            : productKind === "call"
            ? (es ? "Tu llamada está confirmada." : "Your call is booked.")
            : (es ? "Tu suscripción ya está activa." : "Your subscription is now active.")}
        </p>
      </div>
    );
  }

  // Onchain mode — MetaMask Embedded Wallets flow
  if (mode === "onchain") {
    return (
      <div className={wrapperClassName}>
        <OnchainCheckoutBranch order={order} isConfirming={isConfirming} lang={lang} />
        <button
          onClick={onCancel}
          className="w-full text-[10px] text-pnp-textSecondary/50 hover:text-pnp-textSecondary transition-colors py-1.5 mt-2"
        >
          {es ? "Cancelar" : "Cancel"}
        </button>
      </div>
    );
  }

  // Legacy hosted-checkout flow (Subscribe, Lifetime, BuyTokens, BookCall)
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

      {isPartiallyPaid && !isConfirming && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/8 px-3 py-3">
          <p className="text-[12px] font-semibold text-amber-300 mb-1">
            {es ? "⚠ Pago incompleto recibido" : "⚠ Partial payment received"}
          </p>
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            {es
              ? "Recibimos menos del monto esperado (probablemente comisiones de red). Si el monto es ≥95%, lo acreditamos automáticamente en el próximo ciclo del reconciliador (≤15 min). Si no, envía el resto al mismo address."
              : "We received less than the expected amount (likely network fees). If it's ≥95%, we'll auto-credit it in the next reconciler cycle (≤15 min). Otherwise, send the remainder to the same address."}
          </p>
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
