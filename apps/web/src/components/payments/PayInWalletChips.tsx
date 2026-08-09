import React from "react";

// Wallet icon SVGs live here so both the NowPaymentsWaitingPanel and
// BookCallModal chip strip can share them without a circular import.

export const MetaMaskIcon = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 40 40" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
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

export const TrustWalletIcon = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 40 40" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="#0500FF"/>
    <path d="M20 7C20 7 10 11.5 10 20C10 26.627 14.477 32.184 20 34C25.523 32.184 30 26.627 30 20C30 11.5 20 7 20 7Z" fill="white"/>
    <path d="M20 11.5C20 11.5 13 15.1 13 21.2C13 25.748 16.134 29.578 20 31C23.866 29.578 27 25.748 27 21.2C27 15.1 20 11.5 20 11.5Z" fill="#0500FF"/>
    <path d="M17.5 21L19.5 23L23 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const WalletConnectIcon = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 40 40" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="#3B99FC"/>
    <path d="M12.5 17.2C16.6 13.1 23.4 13.1 27.5 17.2L28 17.7C28.2 17.9 28.2 18.2 28 18.4L26.3 20.1C26.2 20.2 26 20.2 25.9 20.1L25.2 19.4C22.4 16.6 17.6 16.6 14.8 19.4L14.1 20.1C14 20.2 13.8 20.2 13.7 20.1L12 18.4C11.8 18.2 11.8 17.9 12 17.7L12.5 17.2ZM30.8 20.5L32.3 22C32.5 22.2 32.5 22.5 32.3 22.7L25.4 29.6C25.2 29.8 24.9 29.8 24.7 29.6L20 24.9L15.3 29.6C15.1 29.8 14.8 29.8 14.6 29.6L7.7 22.7C7.5 22.5 7.5 22.2 7.7 22L9.2 20.5C9.4 20.3 9.7 20.3 9.9 20.5L14.6 25.2C14.8 25.4 15.1 25.4 15.3 25.2L20 20.5L24.7 25.2C24.9 25.4 25.2 25.4 25.4 25.2L30.1 20.5C30.3 20.3 30.6 20.3 30.8 20.5Z" fill="white"/>
  </svg>
);

// SLIP-44 coin IDs — hint to Trust Wallet which coin's browser to open the URL in.
const TW_COIN_ID: Record<string, number> = {
  btc: 0,
  ltc: 2,
  doge: 3,
  eth: 60, usdterc20: 60, usdcerc20: 60,
  bnbbsc: 60, usdtbsc: 60, usdcbsc: 60, bnb: 714,
  trx: 195, usdttrc20: 195, usdctrc20: 195,
  sol: 501, usdcsol: 501,
  matic: 966, usdtmatic: 966,
  etharb: 60, usdtarb: 60,
  ton: 607,
  xrp: 144,
};

// MetaMask holds only EVM assets — hide the chip for BTC/LTC/DOGE/SOL/etc.
const EVM_CURRENCIES = new Set([
  "eth", "usdterc20", "usdcerc20",
  "bnbbsc", "usdtbsc", "usdcbsc", "bnb",
  "matic", "usdtmatic",
  "etharb", "usdtarb",
]);

export function trustWalletDeepLink(invoiceUrl: string, payCurrency?: string | null): string {
  const coinId = TW_COIN_ID[(payCurrency || "").toLowerCase()] ?? 60;
  const match = invoiceUrl.match(/[?&]iid=([a-zA-Z0-9_-]+)/);
  const targetUrl = match ? `https://nowpayments.io/embeds/payment-widget?iid=${match[1]}` : invoiceUrl;
  return `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(targetUrl)}`;
}

export function metaMaskDeepLink(invoiceUrl: string): string {
  const match = invoiceUrl.match(/[?&]iid=([a-zA-Z0-9_-]+)/);
  const targetUrl = match ? `https://nowpayments.io/embeds/payment-widget?iid=${match[1]}` : invoiceUrl;
  return `https://metamask.app.link/dapp/${targetUrl.replace(/^https?:\/\//, "")}`;
}

export function isMetaMaskCompatible(payCurrency?: string | null): boolean {
  if (!payCurrency) return true; // unknown → show it; user can decide
  return EVM_CURRENCIES.has(payCurrency.toLowerCase());
}

interface PayInWalletChipsProps {
  invoiceUrl: string;
  payCurrency?: string | null;
  lang?: string;
  onOtherWallets?: () => void;
  showHeader?: boolean;
  className?: string;
}

/**
 * Three-icon wallet strip: MetaMask · Trust Wallet · Other (WalletConnect).
 * Renders MetaMask only for EVM chains. Trust Wallet is always shown since it
 * handles BTC / LTC / DOGE / SOL / EVM / Tron / etc. all in one app.
 */
export function PayInWalletChips({
  invoiceUrl,
  payCurrency = null,
  lang,
  onOtherWallets,
  showHeader = true,
  className = "",
}: PayInWalletChipsProps) {
  const es = lang === "es";
  const showMetaMask = isMetaMaskCompatible(payCurrency);
  const gridCols = showMetaMask ? "grid-cols-3" : "grid-cols-2";
  const tw = trustWalletDeepLink(invoiceUrl, payCurrency);
  const mm = metaMaskDeepLink(invoiceUrl);

  return (
    <div className={className}>
      {showHeader && (
        <p className="text-[11px] font-semibold text-pnp-textSecondary mb-2.5">
          {es ? "Abre directamente en tu wallet:" : "Open directly in your wallet:"}
        </p>
      )}
      <div className={`grid ${gridCols} gap-2`}>
        {showMetaMask && (
          <a
            href={mm}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-orange-500/30 bg-orange-500/8 hover:bg-orange-500/15 transition-all active:scale-[0.97]"
          >
            <MetaMaskIcon />
            <span className="text-[10px] font-bold text-orange-300">MetaMask</span>
          </a>
        )}
        <a
          href={tw}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-blue-500/30 bg-blue-600/10 hover:bg-blue-600/20 transition-all active:scale-[0.97]"
        >
          <TrustWalletIcon />
          <span className="text-[10px] font-bold text-blue-300">Trust Wallet</span>
        </a>
        <button
          type="button"
          onClick={onOtherWallets}
          className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-[#3B99FC]/30 bg-[#3B99FC]/8 hover:bg-[#3B99FC]/15 transition-all active:scale-[0.97]"
        >
          <WalletConnectIcon />
          <span className="text-[10px] font-bold text-[#5BA8FC]">{es ? "Otras" : "Other"}</span>
        </button>
      </div>
    </div>
  );
}

// ── WalletCheckoutHero ────────────────────────────────────────────────────
// Marketing pitch shown above any WalletPayCard entry point the first time
// a user encounters wallet checkout. Named `Hero` because it's the one and
// only value prop — "crypto that feels normal" — and every checkout surface
// should share the exact copy so the message compounds. Wrap in a dismissible
// container when needed; the component itself is stateless.
export function WalletCheckoutHero({ lang = "en", compact = false }: { lang?: "es" | "en"; compact?: boolean }) {
  const es = lang === "es";
  return (
    <div
      className={`rounded-xl border border-white/10 ${compact ? "p-3" : "p-4"}`}
      style={{
        background:
          "linear-gradient(135deg, rgba(212,0,122,0.10), rgba(230,145,56,0.10), rgba(16,185,129,0.10))",
      }}
    >
      <p className={`${compact ? "text-sm" : "text-base"} font-bold text-white leading-tight`}>
        {es ? "Cripto que por fin se siente normal." : "Crypto that finally feels normal."}
      </p>
      <p className={`${compact ? "text-[11px] mt-1" : "text-xs mt-1.5"} text-white/75 leading-snug`}>
        {es
          ? "Recarga tu Billetera PNPtv con tu tarjeta, Apple Pay o Google Pay en menos de un minuto — y úsala en toda la app. Un saldo, un toque."
          : "Top up your PNPtv Wallet with your card, Apple Pay or Google Pay in under a minute — then spend it anywhere on the app. One balance, one tap."}
      </p>
      <p className={`${compact ? "text-[10px] mt-1.5" : "text-[11px] mt-2"} text-white/55 leading-snug`}>
        {es
          ? "Úsalo para PRIME, Ru$h, propinas a cammers, videollamadas privadas, canales exclusivos, hangouts pagos y cada nueva función. Sin apps de wallet, sin frases semilla, sin QR raros."
          : "Use it for PRIME, Ru$h tokens, tips to cammers, private video calls, exclusive channels, paid hangouts, and every future paid feature. No wallet apps, no seed phrases, no weird QR codes."}
      </p>
    </div>
  );
}

// ── WalletPayCard ─────────────────────────────────────────────────────────
// Shared "Pay from your wallet" card used across every checkout surface that
// wants the wallet rail: Subscribe (membership + PRIME), CreatorSubscribeWizard,
// BookCallModal, and channel/hangout paywalls. Centralised so a UX change (or
// a bugfix in the sendTransaction path) only needs to happen once. Callers
// pass the surface + amountUsd + entitlementSpec; the component handles
// balance fetch, gas-sponsored USDC transfer via Privy, and backend verify.

import { useEffect as _useEffect, useState as _useState } from "react";
import { usePrivy, useWallets, useAddFunds } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits } from "viem";
import { base } from "viem/chains";

// CAIP-2 chain id for Base mainnet — required by Privy's useAddFunds destination
const _BASE_CAIP2 = "eip155:8453" as const;
import {
  initiateWalletCheckout,
  verifyWalletCheckoutTx,
  getWalletUsdcBalance,
  type WalletCheckoutSurface,
} from "@/lib/api";

const _USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const _USDC_ABI = [{
  name: "transfer", type: "function" as const,
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}];

export interface WalletPayCardProps {
  surface: WalletCheckoutSurface;
  amountUsd: number;
  entitlementSpec: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Copy label for the pay button, e.g. "Pay $9.99 · Basic" */
  label?: string;
  /** Called after Ru$h/entitlement credit lands. Receives the response so
      caller can navigate or toast as needed. */
  onSuccess?: (result: { intentId: number; rushCredited?: number; entitlementId?: number | null }) => void;
  onError?: (err: unknown) => void;
  lang?: "es" | "en";
  compact?: boolean;
}

export function WalletPayCard({
  surface, amountUsd, entitlementSpec, metadata,
  label, onSuccess, onError, lang = "en", compact = false,
}: WalletPayCardProps) {
  const es = lang === "es";
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { addFunds } = useAddFunds();
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0] || null;
  const [usdc, setUsdc] = _useState<number | null>(null);
  const [loading, setLoading] = _useState(false);
  const [paying, setPaying] = _useState(false);
  const [error, setError] = _useState<string | null>(null);
  const [success, setSuccess] = _useState(false);

  _useEffect(() => {
    if (!authenticated || !embeddedWallet) return;
    setLoading(true);
    getWalletUsdcBalance()
      .then((r) => setUsdc(r.hasWallet ? r.usdc : null))
      .catch(() => setUsdc(null))
      .finally(() => setLoading(false));
  }, [authenticated, embeddedWallet?.address]);

  if (!authenticated || !embeddedWallet) return null;

  const canAfford = usdc != null && usdc >= amountUsd;

  const handlePay = async () => {
    if (!embeddedWallet) return;
    setError(null); setPaying(true);
    try {
      // For tip/donation surfaces the server reads amountUsd from
      // entitlementSpec (client-picked amount, bounded server-side). For
      // sub/membership/PRIME/rush the server resolves canonical price and
      // ignores this field entirely. We still send it as top-level metadata
      // for legacy compatibility but it has no security impact.
      const specWithAmount = (surface === 'tip' || surface === 'donation')
        ? { ...entitlementSpec, amountUsd }
        : entitlementSpec;
      const intent = await initiateWalletCheckout({
        rail: "usdc", surface, amountUsd, entitlementSpec: specWithAmount, metadata,
      });
      if (!intent.receivingAddress || !intent.amountUsdc) throw new Error("intent_missing_fields");

      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: base, transport: custom(provider),
      });
      const data = encodeFunctionData({
        abi: _USDC_ABI, functionName: "transfer",
        args: [intent.receivingAddress as `0x${string}`, parseUnits(intent.amountUsdc.toFixed(6), 6)],
      });
      const txHash = await walletClient.sendTransaction({
        to: _USDC_BASE as `0x${string}`, data, value: 0n,
      });
      const verified = await verifyWalletCheckoutTx(intent.intentId, txHash);
      if (!verified.ok) throw new Error(verified.reason || "verify_failed");
      setSuccess(true);
      setUsdc((prev) => (prev == null ? prev : Math.max(0, prev - amountUsd)));
      onSuccess?.({
        intentId: intent.intentId,
        rushCredited: verified.rushCredited,
        entitlementId: verified.entitlementId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = /User rejected|user denied|cancel/i.test(msg)
        ? (es ? "Cancelaste la transacción." : "You cancelled the transaction.")
        : msg;
      setError(friendly);
      onError?.(err);
    } finally { setPaying(false); }
  };

  const handleFund = async () => {
    if (!embeddedWallet) return;
    setError(null);
    try {
      // useAddFunds (Privy v3) surfaces ALL enabled onramps including Stripe,
      // whereas the legacy useFundWallet excludes Stripe by design. destination
      // uses CAIP-2 chain id + USDC contract on Base so the funding UI lands
      // USDC directly (no ETH → USDC swap step).
      await addFunds({
        destination: {
          address: embeddedWallet.address,
          chain: _BASE_CAIP2,
          asset: _USDC_BASE,
        },
        fiat: {
          defaultAmount: Math.max(amountUsd, 20).toFixed(0),
        },
      });
      // Refresh balance after fund modal closes (settlement takes 1–2 min).
      getWalletUsdcBalance().then((r) => setUsdc(r.hasWallet ? r.usdc : null)).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|closed|reject/i.test(msg)) return;
      setError(es ? `No se pudo abrir el pago: ${msg}` : `Could not open payment: ${msg}`);
    }
  };

  return (
    <div
      className={`rounded-xl border border-emerald-400/40 bg-emerald-500/[0.06] p-3 ${compact ? "space-y-2" : "space-y-2.5"}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(52,211,153,0.15)" }}>
          <span className="text-lg leading-none">💳</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-pnp-textPrimary">
            {es ? "Pagar desde tu billetera" : "Pay from your wallet"}
          </p>
          <p className="text-[11px] text-pnp-textSecondary">
            {loading
              ? (es ? "Consultando saldo…" : "Checking balance…")
              : usdc == null
                ? (es ? "Sin saldo USDC" : "No USDC balance")
                : `${usdc.toFixed(2)} USDC · Base · gas gratis`}
          </p>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
          {error}
        </div>
      )}
      {success && (
        <div className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5">
          {es ? "¡Pago confirmado!" : "Payment confirmed!"}
        </div>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={!canAfford || paying || success}
        className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: canAfford && !paying ? "linear-gradient(135deg,#10b981,#059669)" : "#333" }}
      >
        {paying
          ? (es ? "Firmando…" : "Signing…")
          : (label || (es ? `Pagar $${amountUsd.toFixed(2)}` : `Pay $${amountUsd.toFixed(2)}`))}
      </button>

      {(!canAfford || usdc == null) && !loading && (
        <button
          type="button"
          onClick={handleFund}
          className="w-full py-2 rounded-lg text-xs font-bold text-white transition active:scale-[0.98]"
          style={{ background: "linear-gradient(90deg,#D4007A,#E69138)" }}
        >
          {es
            ? `Cargar billetera con tarjeta →`
            : `Fund wallet with card →`}
        </button>
      )}
    </div>
  );
}

// ── WalletHomeSheet ──────────────────────────────────────────────────────
// Full wallet UI opened from the floating 💎 FAB. Shows both currencies
// (USDC on Base + Ru$h token balance with gifted breakdown), the on-chain
// address (copy + Basescan link), and action buttons: Fund with card, Buy
// Ru$h (drills into BuyTokensModal), Send USDC (external send). Auto-refresh
// on open + on drill-in return. Lazy-loaded from Layout.tsx.

import { lazy as _lazy, Suspense as _Suspense } from "react";
import { getWalletBalance as _getWalletBalance } from "@/lib/api";
const _LazyBuyTokensModal = _lazy(() =>
  import("@/components/BuyTokensModal").then((m) => ({ default: m.BuyTokensModal }))
);

export function WalletHomeSheet({ onClose }: { onClose: () => void }) {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { addFunds } = useAddFunds();
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0] || null;
  const address = embeddedWallet?.address || null;

  const [usdc, setUsdc] = _useState<number | null>(null);
  const [rush, setRush] = _useState<{ regular: number; gifted: number } | null>(null);
  const [loading, setLoading] = _useState(true);
  const [copied, setCopied] = _useState(false);
  const [showBuyModal, setShowBuyModal] = _useState(false);
  const [error, setError] = _useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      getWalletUsdcBalance().catch(() => null),
      _getWalletBalance().catch(() => null),
    ]).then(([u, r]) => {
      if (u && u.hasWallet) setUsdc(u.usdc); else setUsdc(null);
      if (r && r.success) setRush({ regular: r.regularBalance || 0, gifted: r.giftedBalance || 0 });
    }).finally(() => setLoading(false));
  };
  _useEffect(() => { refresh(); }, [address]);
  _useEffect(() => {
    if (!showBuyModal) refresh();
  }, [showBuyModal]);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  const handleFund = async () => {
    if (!address) { setError("Connect or create your wallet first."); return; }
    setError(null);
    try {
      await addFunds({
        destination: { address, chain: _BASE_CAIP2, asset: _USDC_BASE },
        fiat: { defaultAmount: "30" },
      });
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|closed|reject/i.test(msg)) return;
      setError(`Payment provider error: ${msg}`);
    }
  };

  const openInBasescan = () => {
    if (address) window.open(`https://basescan.org/address/${address}`, "_blank", "noopener,noreferrer");
  };

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Wallet"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        style={{ background: "rgba(19,16,26,0.98)", border: "1px solid rgba(16,185,129,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xl">💎</span>
            <p className="text-base font-bold text-white">Wallet</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet"
            className="w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition flex items-center justify-center text-lg"
          >
            ×
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!authenticated || !embeddedWallet ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-4xl">👛</p>
              <p className="text-sm font-bold text-white">Create your wallet</p>
              <p className="text-[11px] text-white/60 leading-relaxed max-w-xs mx-auto">
                A free embedded wallet lets you receive USDC, tip creators, and buy Ru$h with card.
              </p>
              <button
                type="button"
                onClick={() => login()}
                className="mt-3 min-h-[44px] px-6 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
              >
                Create wallet
              </button>
            </div>
          ) : (
            <>
              {/* Balances */}
              <div className="grid grid-cols-2 gap-2">
                {/* USDC */}
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] p-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-[#2775ca] text-white text-[9px] font-bold flex items-center justify-center">$</div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">USDC</span>
                  </div>
                  <p className="mt-1 text-xl font-bold text-white tabular-nums">
                    {loading ? "…" : (usdc == null ? "—" : usdc.toFixed(2))}
                  </p>
                  <p className="text-[10px] text-white/50 mt-0.5">on Base</p>
                </div>
                {/* Ru$h */}
                <div className="rounded-xl border border-pink-400/30 bg-pink-500/[0.06] p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">💎</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Ru$h</span>
                  </div>
                  <p className="mt-1 text-xl font-bold text-white tabular-nums">
                    {loading ? "…" : (rush == null ? "—" : (rush.regular + rush.gifted).toLocaleString())}
                  </p>
                  <p className="text-[10px] text-white/50 mt-0.5">
                    {rush && rush.gifted > 0 ? `+${rush.gifted} gifted` : "spendable balance"}
                  </p>
                </div>
              </div>

              {/* Wallet address */}
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Wallet address · Base</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono text-white/90 truncate">{shortAddress}</code>
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.08] text-white/80 hover:bg-white/[0.14] transition min-h-[32px]"
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={openInBasescan}
                    aria-label="View on Basescan"
                    className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.08] text-white/80 hover:bg-white/[0.14] transition min-h-[32px]"
                  >
                    ↗
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleFund}
                  className="min-h-[52px] rounded-xl font-bold text-white flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition"
                  style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
                >
                  <span className="text-lg leading-none">💳</span>
                  <span className="text-[11px]">Fund with card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBuyModal(true)}
                  className="min-h-[52px] rounded-xl font-bold text-white flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                >
                  <span className="text-lg leading-none">💎</span>
                  <span className="text-[11px]">Buy Ru$h</span>
                </button>
                <button
                  type="button"
                  onClick={openInBasescan}
                  className="min-h-[52px] rounded-xl font-semibold text-white/90 bg-white/[0.06] hover:bg-white/[0.10] transition flex flex-col items-center justify-center gap-0.5"
                >
                  <span className="text-lg leading-none">📜</span>
                  <span className="text-[11px]">Activity</span>
                </button>
                <button
                  type="button"
                  onClick={refresh}
                  className="min-h-[52px] rounded-xl font-semibold text-white/90 bg-white/[0.06] hover:bg-white/[0.10] transition flex flex-col items-center justify-center gap-0.5"
                >
                  <span className="text-lg leading-none">🔄</span>
                  <span className="text-[11px]">Refresh</span>
                </button>
              </div>

              {/* Note */}
              <p className="text-[10px] text-white/40 leading-relaxed text-center pt-1">
                Only your wallet can sign transactions. PNPtv never has access to your funds.
              </p>
            </>
          )}
        </div>

        {/* BuyTokensModal drill-in — lazy-loaded above; overlays this sheet */}
        {showBuyModal && (
          <_Suspense fallback={null}>
            <_LazyBuyTokensModal
              isOpen={showBuyModal}
              onClose={() => setShowBuyModal(false)}
              onSuccess={() => refresh()}
              dpnsHandle={null}
            />
          </_Suspense>
        )}
      </div>
    </div>
  );
}
