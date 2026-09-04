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

// ── Unified tip presets ───────────────────────────────────────────────────
// Single source of truth for tipping preset amounts across the app.
// USD presets are used by USDC / fiat rails; Rush presets are the token
// equivalents at 6 Ru$h = $1 (approximate). Any surface that shows tip
// chips (MainStage tip sheet, WalletFloater QuickTipSheet, CreatorProfile)
// should import these constants rather than hard-coding.
export const TIP_PRESETS_USD = [5, 10, 25, 50] as const;
export const TIP_PRESETS_RUSH = [30, 60, 150, 300] as const; // ~= $5/$10/$25/$50 at 6 Ru$h = $1

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
import { usePrivy, useWallets, useAddFunds, useConnectWallet, useSendTransaction, useUnlinkWallet, useCreateWallet } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits, parseEther } from "viem";
import { base, mainnet } from "viem/chains";

// CAIP-2 chain id for Base mainnet — required by Privy's useAddFunds destination
const _BASE_CAIP2 = "eip155:8453" as const;
// Base L1StandardBridge on Ethereum mainnet — official Coinbase-run contract
// that accepts ETH via bridgeETH() and mints matching balance on Base in ~15 min.
const _BASE_L1_BRIDGE = "0x3154Cf16ccdb4C6d922629664174b904d80F2C35" as const;
const _BRIDGE_ETH_ABI = [{
  name: "bridgeETH", type: "function" as const,
  inputs: [
    { name: "_minGasLimit", type: "uint32" },
    { name: "_extraData", type: "bytes" },
  ],
  outputs: [],
  stateMutability: "payable" as const,
}];
import {
  initiateWalletCheckout,
  verifyWalletCheckoutTx,
  getWalletUsdcBalance,
  getWalletEthBalance,
  getWalletEthMainnetBalance,
  getWalletUsdcMainnetBalance,
  getCctpAttestation,
  requestGasTopup,
  reportWalletClientError,
  type WalletCheckoutSurface,
} from "@/lib/api";

// ── CCTP (Circle Cross-Chain Transfer Protocol) constants ─────────────────
// Used to bridge native USDC from Ethereum mainnet → Base natively (no
// wrapped/bridged token). Flow: approve → depositForBurn → wait attestation
// → receiveMessage on Base.
const _USDC_ETHEREUM = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const _CCTP_TOKEN_MESSENGER_L1 = "0xBd3fa81B58Ba92a82136038B25aDec7066af3155" as const;
const _CCTP_MESSAGE_TRANSMITTER_L2 = "0xAD09780d193884d503182aD4588450C416D6F9D4" as const;
const _BASE_DOMAIN_ID = 6; // Circle's domain ID for Base
const _USDC_APPROVE_ABI = [{
  name: "approve", type: "function" as const,
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
  stateMutability: "nonpayable" as const,
}];
const _CCTP_DEPOSIT_FOR_BURN_ABI = [{
  name: "depositForBurn", type: "function" as const,
  inputs: [
    { name: "amount", type: "uint256" },
    { name: "destinationDomain", type: "uint32" },
    { name: "mintRecipient", type: "bytes32" },
    { name: "burnToken", type: "address" },
  ],
  outputs: [{ name: "nonce", type: "uint64" }],
  stateMutability: "nonpayable" as const,
}];
const _CCTP_RECEIVE_MESSAGE_ABI = [{
  name: "receiveMessage", type: "function" as const,
  inputs: [
    { name: "message", type: "bytes" },
    { name: "attestation", type: "bytes" },
  ],
  outputs: [{ name: "success", type: "bool" }],
  stateMutability: "nonpayable" as const,
}];

const _USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const _USDC_ABI = [{
  name: "transfer", type: "function" as const,
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}];

// Privy's card on-ramp (Stripe / MoonPay / Meld) DEDUCTS its processing fee
// from whatever fiat amount we pass — so if we pass the plan price directly,
// the USDC that lands is short and the downstream on-chain buy either fails
// the balance check or shorts the platform. Gross up by ~8% + $0.50 to safely
// cover Stripe (~3.5% + spread), MoonPay (~4.5%), and Meld (~5%). Also honors
// Stripe's $15 on-ramp minimum. Returns a string ready for `defaultAmount`.
export function grossUpForOnramp(targetUsd: number): string {
  const safe = Number.isFinite(targetUsd) && targetUsd > 0 ? targetUsd : 15;
  const grossed = Math.ceil((safe + 0.5) / 0.92);
  return Math.max(15, grossed).toFixed(0);
}

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
  surface, amountUsd: amountUsdRaw, entitlementSpec, metadata,
  label, onSuccess, onError, lang = "en", compact = false,
}: WalletPayCardProps) {
  const es = lang === "es";
  // Caller can pass NaN if plans haven't loaded yet or price parse fails
  // (parseFloat("") → NaN). Guard downstream .toFixed / Math.max / balance
  // comparisons — a "$NaN" button or `defaultAmount:"NaN"` addFunds call
  // silently breaks the flow. Fall back to $0 rendering; the button is
  // disabled below if amountUsd <= 0.
  const amountUsd = Number.isFinite(amountUsdRaw) && amountUsdRaw > 0 ? amountUsdRaw : 0;
  const priceReady = amountUsd > 0;
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { addFunds } = useAddFunds();
  const [connectError, setConnectError] = _useState<string | null>(null);
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      setConnectError(null);
      if (wallet?.address) _setPreferredWallet(wallet.address);
    },
    onError: (err) => {
      const msg = typeof err === "string" ? err : String(err);
      if (/exited|closed|cancel|reject/i.test(msg)) return;
      setConnectError(msg || (es ? "No se pudo conectar la billetera." : "Could not connect wallet."));
      reportWalletClientError("connectWallet", err, { surface });
    },
  });
  const { sendTransaction: privySendTransaction } = useSendTransaction();
  // Active wallet: honor user's preferred wallet (WalletHomeSheet writes this)
  // so tips/subs use the SAME wallet the user just picked. Fallback = embedded
  // then first external — never silently override an explicit choice.
  // State-backed so switching triggers re-render; sync to localStorage below.
  const [preferredAddr, setPreferredAddrState] = _useState<string | null>(() => _getPreferredWallet());
  const setPreferred = (addr: string) => {
    _setPreferredWallet(addr);
    setPreferredAddrState(addr);
  };
  const preferredWallet = preferredAddr ? wallets.find((w) => w.address === preferredAddr) : null;
  const activeWallet = preferredWallet
    || wallets.find((w) => w.walletClientType === "privy")
    || wallets[0]
    || null;
  const isEmbedded = activeWallet?.walletClientType === "privy";
  const [usdc, setUsdc] = _useState<number | null>(null);
  const [loading, setLoading] = _useState(false);
  const [paying, setPaying] = _useState(false);
  const [error, setError] = _useState<string | null>(null);
  const [success, setSuccess] = _useState(false);
  const [lastTxHash, setLastTxHash] = _useState<string | null>(null);
  // True from when addFunds resolves until either (a) balance covers the price
  // or (b) 60s of polling elapses. Prevents the "Pay with card" button from
  // re-appearing as if nothing happened while Stripe onramp settles.
  const [funding, setFunding] = _useState(false);

  _useEffect(() => {
    if (!authenticated || !activeWallet) return;
    setLoading(true);
    getWalletUsdcBalance(activeWallet.address)
      .then((r) => setUsdc(r.hasWallet ? r.usdc : null))
      .catch(() => setUsdc(null))
      .finally(() => setLoading(false));
  }, [authenticated, activeWallet?.address]);

  // Not signed into Privy yet — frame as card-primary so a card-only user
  // doesn't bail thinking this is a new-account onboarding step. The Privy
  // flow accepts credit/debit cards via Stripe onramp (useAddFunds); the fact
  // that it settles as USDC on Base is an implementation detail the user
  // never sees.
  if (!authenticated) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
        <p className="text-sm font-bold text-emerald-300 mb-1">
          {es
            ? `Paga $${amountUsd.toFixed(2)} con tarjeta`
            : `Pay $${amountUsd.toFixed(2)} with your card`}
        </p>
        <p className="text-[11px] leading-snug text-pnp-textSecondary mb-3">
          {es
            ? "Crédito, débito, Apple Pay o Google Pay. Un solo toque — sin descargar apps ni frases raras."
            : "Credit, debit, Apple Pay, or Google Pay. One tap — no apps to install, no seed phrases."}
        </p>
        <button
          type="button"
          onClick={() => login()}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity active:opacity-80"
          style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
        >
          {es
            ? `💳 Pagar $${amountUsd.toFixed(2)}`
            : `💳 Pay $${amountUsd.toFixed(2)}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setConnectError(null);
            try { connectWallet(); }
            catch (err) {
              reportWalletClientError("connectWallet", err, { surface });
              setConnectError(err instanceof Error ? err.message : String(err));
            }
          }}
          className="w-full mt-2 py-2 rounded-xl text-[11px] font-semibold text-white/70 border border-white/10 hover:bg-white/[0.04] transition"
        >
          {es ? "o conecta Trust / MetaMask" : "or connect Trust / MetaMask"}
        </button>
        {connectError && (
          <p className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5 mt-2">
            {connectError}
          </p>
        )}
        <p className="text-[9px] leading-snug text-pnp-textSecondary/70 mt-2 text-center">
          {es
            ? "Con tu Billetera PNPtv — sin comisiones y sin apps."
            : "Powered by your PNPtv Wallet — no fees, no apps needed."}
        </p>
      </div>
    );
  }
  // Signed in, wallet still provisioning (Privy embedded wallet takes a
  // second on first sign-in). Show a spinner instead of silent null.
  if (!activeWallet) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 flex items-center gap-3">
        <svg className="w-4 h-4 animate-spin text-emerald-400" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-xs text-pnp-textSecondary">
          {es ? "Preparando tu billetera…" : "Setting up your wallet…"}
        </p>
      </div>
    );
  }

  const canAfford = usdc != null && usdc >= amountUsd;

  const handleConnectExternal = () => {
    setConnectError(null);
    try {
      connectWallet();
    } catch (err: unknown) {
      reportWalletClientError("connectWallet", err, { surface });
      setConnectError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePay = async () => {
    if (!activeWallet) return;
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

      const data = encodeFunctionData({
        abi: _USDC_ABI, functionName: "transfer",
        args: [intent.receivingAddress as `0x${string}`, parseUnits(intent.amountUsdc.toFixed(6), 6)],
      });

      let txHash: `0x${string}`;
      if (isEmbedded) {
        // Privy embedded wallets are pure EOAs — the wallet itself has to pay
        // gas out of its own ETH. requestGasTopup seeds ~$0.20 in Base ETH
        // from a platform treasury when the wallet is empty; best-effort so
        // we proceed with the tx attempt either way (a 503 falls back to the
        // pre-existing "insufficient funds for gas" error, no regression).
        await requestGasTopup(activeWallet.address);
        const res = await privySendTransaction(
          { chainId: 8453, to: _USDC_BASE as `0x${string}`, data, value: "0" },
          { sponsor: false, address: activeWallet.address, uiOptions: { showWalletUIs: true } }
        );
        txHash = res.hash as `0x${string}`;
      } else {
        // External wallet (Trust/MetaMask via WalletConnect) — self-signs and
        // self-pays gas out of its own ETH balance (typically ~$0.01 on Base).
        const provider = await activeWallet.getEthereumProvider();
        const walletClient = createWalletClient({
          account: activeWallet.address as `0x${string}`,
          chain: base, transport: custom(provider),
        });
        txHash = await walletClient.sendTransaction({
          to: _USDC_BASE as `0x${string}`, data, value: 0n,
        });
      }

      const verified = await verifyWalletCheckoutTx(intent.intentId, txHash);
      if (!verified.ok) throw new Error(verified.reason || "verify_failed");
      setLastTxHash(txHash);
      setSuccess(true);
      setUsdc((prev) => (prev == null ? prev : Math.max(0, prev - amountUsd)));
      onSuccess?.({
        intentId: intent.intentId,
        rushCredited: verified.rushCredited,
        entitlementId: verified.entitlementId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isUserCancel = /User rejected|user denied|cancel/i.test(msg);
      const isChain = /wrong network|unrecognized chain|chain mismatch|switch chain|network mismatch/i.test(msg);
      const friendly = isUserCancel
        ? (es ? "Cancelaste la transacción." : "You cancelled the transaction.")
        : isChain
          ? (es ? "Cambia la red de tu billetera a Base y vuelve a intentar." : "Switch your wallet network to Base and try again.")
          : msg;
      setError(friendly);
      if (!isUserCancel) {
        reportWalletClientError("sendTransaction", err, {
          surface, amountUsd, address: activeWallet?.address,
          walletType: activeWallet?.walletClientType,
        });
      }
      onError?.(err);
    } finally { setPaying(false); }
  };

  const handleFund = async () => {
    if (!activeWallet) return;
    setError(null);
    try {
      // useAddFunds (Privy v3) surfaces ALL enabled onramps including Stripe,
      // whereas the legacy useFundWallet excludes Stripe by design. destination
      // uses CAIP-2 chain id + USDC contract on Base so the funding UI lands
      // USDC directly (no ETH → USDC swap step).
      // Stripe crypto onramp minimum is $15 USD; anything below silently fails
      // with "Something went wrong setting up checkout". Floor the onramp
      // amount at $15 so small tips ($10) and cheap plans still work — the
      // leftover USDC lands in the user's wallet for the next purchase.
      await addFunds({
        destination: {
          address: activeWallet.address,
          chain: _BASE_CAIP2,
          asset: _USDC_BASE,
        },
        fiat: {
          defaultAmount: grossUpForOnramp(amountUsd),
        },
      });
      // addFunds resolved — user closed the fund flow. Stripe settlement is
      // instant in sandbox and up to ~2 min in prod. Poll balance every 3s
      // for up to 60s so the user gets an obvious "we're waiting" affordance
      // instead of the same "Pay with card" button reappearing.
      setFunding(true);
      const start = Date.now();
      const poll = async (): Promise<void> => {
        try {
          const r = await getWalletUsdcBalance(activeWallet.address);
          const bal = r.hasWallet ? r.usdc : null;
          setUsdc(bal);
          if (bal != null && bal >= amountUsd) {
            setFunding(false);
            return;
          }
        } catch { /* keep polling on transient errors */ }
        if (Date.now() - start >= 60_000) {
          setFunding(false);
          return;
        }
        setTimeout(poll, 3_000);
      };
      poll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|closed|reject/i.test(msg)) return;
      setError(es ? `No se pudo abrir el pago: ${msg}` : `Could not open payment: ${msg}`);
      reportWalletClientError("addFunds", err, {
        surface, amountUsd, address: activeWallet?.address,
        walletType: activeWallet?.walletClientType,
      });
    }
  };

  // Gas label: Privy embedded wallets pay gas via the Alchemy Gas Manager
  // policy (fully sponsored). External wallets (Trust/MetaMask) pay their own
  // Base gas out of ETH balance — small (~$0.01) but not zero, so don't lie.
  const gasLabel = isEmbedded
    ? (es ? "gas gratis" : "no gas fees")
    : (es ? "gas: ~$0.01 en Base" : "gas: ~$0.01 on Base");

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
            {es
              ? (isEmbedded ? "Pagar desde tu billetera" : "Pagar con tu wallet externa")
              : (isEmbedded ? "Pay from your wallet" : "Pay with your external wallet")}
          </p>
          <p className="text-[11px] text-pnp-textSecondary">
            {loading
              ? (es ? "Consultando saldo…" : "Checking balance…")
              : usdc == null
                ? (es ? "Sin saldo USDC" : "No USDC balance")
                : `${usdc.toFixed(2)} USDC · Base · ${gasLabel}`}
          </p>
        </div>
      </div>

      {/* Wallet switcher — appears when the user has both an embedded and one
          or more external wallets. Tapping switches which wallet signs this
          specific payment AND persists the choice for future payments. Same
          shared preference key as WalletHomeSheet so both surfaces agree. */}
      {wallets.length > 1 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[9px] uppercase tracking-wide text-white/40 font-semibold pr-1">
            {es ? "Pagar desde:" : "Pay from:"}
          </span>
          {wallets.map((w) => {
            const isActive = activeWallet?.address === w.address;
            const walletLabel = walletTypeLabel(w.walletClientType);
            return (
              <button
                key={w.address}
                type="button"
                onClick={() => setPreferred(w.address)}
                className={`text-[10px] font-semibold px-2 py-1 rounded-md transition inline-flex items-center gap-1 ${
                  isActive
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                    : "bg-white/[0.04] text-white/60 border border-white/10 hover:bg-white/[0.08]"
                }`}
              >
                {isActive && <span className="text-emerald-300">✓</span>}
                <WalletTypeIcon clientType={w.walletClientType} size={10} />
                <span>{walletLabel}</span>
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
          {error}
        </div>
      )}
      {connectError && (
        <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
          {connectError}
        </div>
      )}
      {success && (
        <div className="rounded-xl px-3 py-3 bg-emerald-500/10 border border-emerald-500/30 space-y-2">
          <div className="flex items-center gap-2 text-emerald-200 font-semibold text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{es ? "¡Pago confirmado!" : "Payment confirmed!"}</span>
          </div>
          {lastTxHash && (
            <a
              href={`https://basescan.org/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[11px] text-emerald-300/80 hover:text-emerald-200 underline underline-offset-2 font-mono truncate"
            >
              {lastTxHash.slice(0, 10)}…{lastTxHash.slice(-8)} ↗
            </a>
          )}
          {(surface === 'prime' || surface === 'membership' || surface === 'creator_sub') && (
            <a
              href="/settings/account"
              className="inline-block text-[12px] font-semibold text-emerald-200 hover:text-emerald-100 underline underline-offset-2"
            >
              {es ? "Administrar suscripción →" : "Manage subscription →"}
            </a>
          )}
        </div>
      )}

      {/* If the wallet has enough USDC, show Pay as the primary CTA. Otherwise
          demote Pay and promote "Fund with card" so a zero-balance user gets a
          single obvious next step instead of two similar-looking buttons. */}
      {!priceReady ? (
        <div className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-center text-sm text-pnp-textSecondary">
          {es ? "Cargando precio…" : "Loading price…"}
        </div>
      ) : canAfford ? (
        <button
          type="button"
          onClick={handlePay}
          disabled={paying || success}
          className="w-full py-3 rounded-xl text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: paying ? "#333" : "linear-gradient(135deg,#10b981,#059669)" }}
        >
          {paying
            ? (es ? "Firmando…" : "Signing…")
            : (label || (es ? `Pagar $${amountUsd.toFixed(2)}` : `Pay $${amountUsd.toFixed(2)}`))}
        </button>
      ) : funding ? (
        <div
          className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-2"
          role="status"
          aria-live="polite"
        >
          <svg className="w-4 h-4 animate-spin text-emerald-300" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-semibold text-emerald-200">
            {es
              ? "Confirmando tu pago… (puede tardar hasta 1 min)"
              : "Confirming your payment… (up to 1 min)"}
          </span>
        </div>
      ) : (
        <>
          {!loading && isEmbedded && (() => {
            const topupUsd = Number(grossUpForOnramp(amountUsd));
            const leftoverUsd = Math.max(0, topupUsd - amountUsd);
            const showsLeftover = leftoverUsd >= 0.5;
            return (
              <button
                type="button"
                onClick={handleFund}
                className="w-full py-3 rounded-xl text-white transition active:scale-[0.98] flex flex-col items-center gap-0.5"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
              >
                <span className="text-base font-bold">
                  {es
                    ? `💳 Recargar $${topupUsd} con tarjeta`
                    : `💳 Top up $${topupUsd} with card`}
                </span>
                <span className="text-[11px] font-medium opacity-90">
                  {es
                    ? showsLeftover
                      ? `Esta compra: $${amountUsd.toFixed(2)} · Sobra en wallet: $${leftoverUsd.toFixed(2)}`
                      : `Esta compra: $${amountUsd.toFixed(2)} (mínimo de recarga)`
                    : showsLeftover
                      ? `This purchase: $${amountUsd.toFixed(2)} · Left in wallet: $${leftoverUsd.toFixed(2)}`
                      : `This purchase: $${amountUsd.toFixed(2)} (top-up minimum)`}
                </span>
              </button>
            );
          })()}
          {/* External wallet with insufficient USDC → user must top up inside
              their own wallet app (we can't onramp into external wallets via
              Stripe). Show the address to send to + a link to connect a Privy
              wallet if they want the card-onramp path instead. */}
          {!loading && !isEmbedded && (
            <div className="space-y-2">
              <p className="text-[11px] text-pnp-textSecondary leading-snug">
                {es
                  ? `Envía al menos $${amountUsd.toFixed(2)} USDC (Base) a tu dirección para completar el pago.`
                  : `Send at least $${amountUsd.toFixed(2)} USDC (Base) to your wallet to complete this payment.`}
              </p>
              <code className="block text-[10px] font-mono text-white/80 bg-white/[0.04] border border-white/10 rounded-md px-2 py-1.5 break-all">
                {activeWallet.address}
              </code>
              <button
                type="button"
                onClick={handleConnectExternal}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-white/80 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
              >
                {es ? "🔗 Conectar otra wallet" : "🔗 Connect a different wallet"}
              </button>
            </div>
          )}
          {loading && (
            <button
              type="button"
              disabled
              className="w-full py-3 rounded-xl text-sm font-semibold text-white/60 bg-white/5"
            >
              {es ? "Consultando saldo…" : "Checking balance…"}
            </button>
          )}
        </>
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
import { getWalletBalance as _getWalletBalance, getLinkedWallet as _getLinkedWallet } from "@/lib/api";
const _LazyBuyTokensModal = _lazy(() =>
  import("@/components/BuyTokensModal").then((m) => ({ default: m.BuyTokensModal }))
);

// Preferred wallet address is stored per-Privy-app so a returning user lands on
// the same wallet they last picked (e.g. Trust) instead of snapping back to the
// embedded default every reload. Exported so any Privy entry point
// (WalletHomeSheet, WalletPayCard, Donate, CryptoGuide, …) agrees on which
// wallet is active. localStorage is the fast local path; setPreferredWalletServer
// mirrors the choice to the user row so it survives across devices.
import { setPreferredWalletServer as _setPreferredWalletServer } from "@/lib/api";
export const PREFERRED_WALLET_KEY = "pnptv.wallet.preferred";
// Same-tab event so surfaces that don't re-render on localStorage writes (the
// FAB in Layout.tsx) can update immediately instead of polling. The native
// `storage` event only fires on OTHER tabs — this fills the same-tab gap.
export const PREFERRED_WALLET_EVENT = "pnptv:preferred-wallet-changed";
export const getPreferredWallet = (): string | null => {
  try { return localStorage.getItem(PREFERRED_WALLET_KEY); } catch { return null; }
};
export const setPreferredWallet = (addr: string | null) => {
  try {
    if (addr) localStorage.setItem(PREFERRED_WALLET_KEY, addr);
    else localStorage.removeItem(PREFERRED_WALLET_KEY);
  } catch { /* storage full / blocked — non-fatal */ }
  try {
    window.dispatchEvent(new CustomEvent(PREFERRED_WALLET_EVENT, { detail: { address: addr } }));
  } catch { /* SSR / older browsers — non-fatal */ }
  // Fire-and-forget cross-device mirror. If unauthenticated the endpoint 401s;
  // that's fine because localStorage still holds the preference on this browser.
  _setPreferredWalletServer(addr);
};

// ── Wallet-type icons ────────────────────────────────────────────────────────
// Tiny inline SVGs so users can identify their wallet at a glance without
// downloading external icon assets. Kept simple (single-color stroke/fill)
// so they render clean on both light and dark chip backgrounds.
export function walletTypeLabel(clientType?: string | null): string {
  if (!clientType) return "External";
  if (clientType === "privy") return "PNPtv";
  if (clientType === "metamask") return "MetaMask";
  if (clientType === "coinbase_wallet") return "Coinbase";
  if (clientType === "walletconnect") return "WalletConnect";
  return clientType;
}
export function WalletTypeIcon({ clientType, size = 12 }: { clientType?: string | null; size?: number }) {
  const s = { width: size, height: size, display: "inline-block", verticalAlign: "-1px" } as const;
  if (clientType === "privy") {
    // PNPtv diamond — matches the FAB 💎 idiom.
    return (
      <svg viewBox="0 0 12 12" style={s} aria-hidden="true"><path d="M6 1l3 3-3 7-3-7 3-3z" fill="#10b981" /></svg>
    );
  }
  if (clientType === "metamask") {
    // Simplified fox head silhouette (not the official logo — inline art).
    return (
      <svg viewBox="0 0 12 12" style={s} aria-hidden="true"><path d="M2 3l1.5 2.5L2 8l2 1 2-.8L8 9l2-1-1.5-2.5L10 3 7.5 4 6 3.5 4.5 4 2 3z" fill="#f6851b" /></svg>
    );
  }
  if (clientType === "coinbase_wallet") {
    return (
      <svg viewBox="0 0 12 12" style={s} aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#0052ff" /><rect x="4.5" y="4.5" width="3" height="3" rx="0.5" fill="#fff" /></svg>
    );
  }
  if (clientType === "walletconnect") {
    return (
      <svg viewBox="0 0 12 12" style={s} aria-hidden="true"><path d="M3 5c1.5-1.5 4.5-1.5 6 0M4 6.3c1-1 3-1 4 0M5 7.5c.5-.5 1.5-.5 2 0" fill="none" stroke="#3b99fc" strokeWidth="1" strokeLinecap="round" /></svg>
    );
  }
  // Generic external
  return (
    <svg viewBox="0 0 12 12" style={s} aria-hidden="true"><rect x="1.5" y="3" width="9" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" /><circle cx="8.5" cy="6" r="0.8" fill="currentColor" /></svg>
  );
}

// Aliases kept so the existing WalletHomeSheet / WalletPayCard usages below
// don't churn — same functions, different name at the call sites.
const _getPreferredWallet = getPreferredWallet;
const _setPreferredWallet = setPreferredWallet;

export function WalletHomeSheet({ onClose }: { onClose: () => void }) {
  const { authenticated, login, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const { addFunds } = useAddFunds();
  const [connectError, setConnectError] = _useState<string | null>(null);
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      setConnectError(null);
      // Auto-switch to freshly connected wallet + persist as preferred.
      if (wallet?.address) {
        setActiveAddress(wallet.address);
        _setPreferredWallet(wallet.address);
      }
    },
    onError: (err) => {
      // Privy fires onError for user-cancel too — filter those out so we don't
      // show a scary error when the user just closed the modal.
      const msg = typeof err === "string" ? err : String(err);
      if (/exited|closed|cancel|reject/i.test(msg)) return;
      setConnectError(msg || "Could not connect wallet — please try again.");
      reportWalletClientError("connectWallet", err, { source: "WalletHomeSheet" });
    },
  });
  const { unlink: unlinkWallet } = useUnlinkWallet();
  // Provision a PNPtv embedded wallet on demand — for users who signed up by
  // connecting Trust/MetaMask (wallet login) and therefore never got an embedded
  // wallet auto-provisioned. The Privy config now defaults to "all-users" for new
  // signups, but this hook covers the migration case for anyone who signed up
  // before that config change.
  const { createWallet } = useCreateWallet();
  const [creatingWallet, setCreatingWallet] = _useState<boolean>(false);
  // Privy's own tx sender — handles chain switching + fee estimation on the
  // embedded wallet correctly (unlike viem's walletClient which was ignoring
  // wallet_switchEthereumChain when we tried it, defaulting to Base and
  // showing "insufficient balance on Base" errors).
  const { sendTransaction: privySendTransaction } = useSendTransaction();

  // Wallet selector: user may have both an embedded PNPtv wallet AND external
  // (Trust/MetaMask via WalletConnect). When multiple, they pick which one the
  // balances + Fund/Send actions target. Preferred wallet (localStorage) wins;
  // fallback = embedded then first external.
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || null;
  const externalWallets = wallets.filter((w) => w.walletClientType !== "privy");
  const [activeAddress, setActiveAddress] = _useState<string | null>(null);
  const [unlinkingAddress, setUnlinkingAddress] = _useState<string | null>(null);

  _useEffect(() => {
    // Whenever wallet list changes, ensure activeAddress still exists in it.
    if (activeAddress && wallets.some((w) => w.address === activeAddress)) return;
    const preferred = _getPreferredWallet();
    const preferredStillConnected = preferred && wallets.some((w) => w.address === preferred);
    const fallback = preferredStillConnected
      ? preferred
      : (embeddedWallet?.address || externalWallets[0]?.address || null);
    setActiveAddress(fallback);
  }, [wallets.map((w) => w.address).join(","), embeddedWallet?.address]);

  // Server → localStorage hydration lives in App.tsx PrivyIdentitySync so it
  // runs once per auth cycle regardless of whether the wallet sheet is ever
  // opened. Do NOT re-fetch here — a duplicate racing effect used to fire in
  // parallel and could clobber a fresh setPreferred call.

  // One-tap reset to the PNPtv embedded wallet. Explicit + forceful — bypasses
  // any lingering "preferred=external" state and always ends with the embedded
  // wallet active. Renders as a prominent primary button whenever the active
  // wallet is external, so a user who accidentally connected Trust and can't
  // find the small × disconnect chip still has an obvious way back.
  const handleUsePnptvWallet = () => {
    if (!embeddedWallet) return;
    setError(null);
    setConnectError(null);
    setActiveAddress(embeddedWallet.address);
    _setPreferredWallet(embeddedWallet.address);
  };

  // Provision a fresh PNPtv embedded wallet for a user who never got one
  // (signed up via wallet-only login before the "all-users" config change).
  // On success, the new wallet auto-becomes active + preferred so the user
  // moves from "stuck on external Trust" to "PNPtv wallet" in one tap.
  const handleCreateEmbeddedWallet = async () => {
    if (creatingWallet || embeddedWallet) return;
    setError(null);
    setConnectError(null);
    setCreatingWallet(true);
    try {
      const created = await createWallet();
      const addr = (created as { address?: string } | null)?.address;
      if (addr) {
        setActiveAddress(addr);
        _setPreferredWallet(addr);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnectError(`Could not create PNPtv Wallet: ${msg}. Please try again.`);
      reportWalletClientError("createWallet", err, { source: "WalletHomeSheet" });
    } finally {
      setCreatingWallet(false);
    }
  };

  const activeWallet = wallets.find((w) => w.address === activeAddress) || null;
  const isActiveEmbedded = activeWallet?.walletClientType === "privy";

  // Session-linked wallet address: pulled via the pnptv session cookie so a
  // device where Privy hasn't been authenticated locally still knows which
  // address belongs to this user. Populated by /api/privy/link (server-side
  // + global PrivyIdentitySync). Enables cross-device READ-ONLY wallet view
  // (balances + address + Basescan) — signing still requires local Privy auth.
  const [sessionWalletAddress, setSessionWalletAddress] = _useState<string | null>(null);
  _useEffect(() => {
    let cancelled = false;
    _getLinkedWallet()
      .then((r) => { if (!cancelled) setSessionWalletAddress(r.walletAddress); })
      .catch(() => { /* non-fatal — falls back to Privy-only view */ });
    return () => { cancelled = true; };
  }, []);

  // Effective address the wallet UI renders against — prefer live Privy wallet
  // (can sign) over session-linked address (read-only).
  const address = activeWallet?.address || sessionWalletAddress || null;
  // Read-only mode: session knows the address but Privy is not authed locally.
  // Signing actions (Send / Buy Ru$h / Fund with card) require Privy auth on
  // the CURRENT browser — we hide those and show a "Sign in to send / buy"
  // banner instead. Balances + address + copy + Basescan all work read-only.
  const isReadOnlyView = !activeWallet && !!sessionWalletAddress;

  const [usdc, setUsdc] = _useState<number | null>(null);
  const [eth, setEth] = _useState<number | null>(null);
  // Ethereum mainnet balances — for the "wrong network" bridge recovery banners.
  // Separate from the Base balances shown in the main grid.
  const [ethMainnet, setEthMainnet] = _useState<number | null>(null);
  const [usdcMainnet, setUsdcMainnet] = _useState<number | null>(null);
  const [rush, setRush] = _useState<{ regular: number; gifted: number } | null>(null);
  const [loading, setLoading] = _useState(true);
  const [copied, setCopied] = _useState(false);
  const [showBuyModal, setShowBuyModal] = _useState(false);
  const [error, setError] = _useState<string | null>(null);
  const [bridging, setBridging] = _useState(false);
  const [bridgeTxHash, setBridgeTxHash] = _useState<string | null>(null);

  // USDC CCTP bridge state machine — separate from ETH bridge since it's a
  // multi-step flow (approve → burn → wait attestation → mint on Base).
  // Persisted per-address in localStorage so users can close and resume.
  type UsdcBridgeStage = "idle" | "approving" | "burning" | "waiting_attestation" | "ready_to_mint" | "minting" | "done";
  const [usdcBridgeStage, setUsdcBridgeStage] = _useState<UsdcBridgeStage>("idle");
  const [usdcBurnTxHash, setUsdcBurnTxHash] = _useState<string | null>(null);
  const [usdcAttestation, setUsdcAttestation] = _useState<{ message: string; attestation: string } | null>(null);
  const [usdcBridgeError, setUsdcBridgeError] = _useState<string | null>(null);

  // Send-crypto sub-panel state. Replaces the home body when sendOpen. Keeps
  // the widget one-file (no new component) per project convention.
  const [sendOpen, setSendOpen] = _useState(false);
  const [sendAsset, setSendAsset] = _useState<"usdc" | "eth">("usdc");
  const [sendTo, setSendTo] = _useState("");
  const [sendAmount, setSendAmount] = _useState("");
  const [sending, setSending] = _useState(false);
  const [sendTxHash, setSendTxHash] = _useState<string | null>(null);
  const [sendError, setSendError] = _useState<string | null>(null);
  const [sendConfirm, setSendConfirm] = _useState(false);

  const _usdcBridgeStorageKey = address ? `pnptv.usdcBridge.${address.toLowerCase()}` : null;

  // Restore in-flight USDC bridge from localStorage on mount / address change.
  _useEffect(() => {
    if (!_usdcBridgeStorageKey) return;
    try {
      const raw = localStorage.getItem(_usdcBridgeStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.burnTxHash && !usdcBurnTxHash) {
        setUsdcBurnTxHash(saved.burnTxHash);
        setUsdcBridgeStage(saved.stage || "waiting_attestation");
        if (saved.attestation && saved.message) {
          setUsdcAttestation({ message: saved.message, attestation: saved.attestation });
        }
      }
    } catch { /* corrupt storage — skip */ }
  }, [_usdcBridgeStorageKey]);

  const _saveUsdcBridge = (patch: Record<string, unknown>) => {
    if (!_usdcBridgeStorageKey) return;
    try {
      const raw = localStorage.getItem(_usdcBridgeStorageKey);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(_usdcBridgeStorageKey, JSON.stringify({ ...prev, ...patch, updatedAt: Date.now() }));
    } catch { /* localStorage full or blocked — non-fatal */ }
  };

  const _clearUsdcBridge = () => {
    if (!_usdcBridgeStorageKey) return;
    try { localStorage.removeItem(_usdcBridgeStorageKey); } catch { /* ignore */ }
    setUsdcBurnTxHash(null);
    setUsdcAttestation(null);
    setUsdcBridgeStage("idle");
  };

  const refresh = () => {
    if (!address) {
      setUsdc(null); setEth(null); setEthMainnet(null); setUsdcMainnet(null); setRush(null); setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      getWalletUsdcBalance(address).catch(() => null),
      getWalletEthBalance(address).catch(() => null),
      getWalletEthMainnetBalance(address).catch(() => null),
      getWalletUsdcMainnetBalance(address).catch(() => null),
      _getWalletBalance().catch(() => null),
    ]).then(([u, e, em, um, r]) => {
      setUsdc(u && u.hasWallet ? u.usdc : null);
      setEth(e && e.hasWallet ? e.eth : null);
      setEthMainnet(em && em.hasWallet ? em.eth : null);
      setUsdcMainnet(um && um.hasWallet ? um.usdc : null);
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
      reportWalletClientError("addFunds", err, { source: "WalletHomeSheet", address });
    }
  };

  const handleConnectExternal = () => {
    setError(null);
    setConnectError(null);
    try {
      connectWallet();
    } catch (err: unknown) {
      reportWalletClientError("connectWallet", err, { source: "WalletHomeSheet" });
      setConnectError(err instanceof Error ? err.message : String(err));
    }
  };

  // Set a wallet as the persistent default across reloads + across surfaces
  // (WalletPayCard reads the same localStorage key). Switching active wallet
  // in the picker also updates the preference — this is the explicit form.
  const handleSelectWallet = (addr: string) => {
    setActiveAddress(addr);
    _setPreferredWallet(addr);
  };

  // Disconnect an external wallet from the Privy account. Embedded PNPtv
  // wallet is intentionally NOT unlinkable here — many flows (gas topup,
  // card onramp, Ru$h ledger link) assume it exists. Users who really want
  // to remove it can do so from Privy's account UI directly.
  const handleUnlinkWallet = async (addr: string, isEmbedded: boolean) => {
    if (isEmbedded) return;
    if (!confirm("Disconnect this wallet from your PNPtv account? You can reconnect it any time.")) return;
    setError(null);
    setConnectError(null);
    setUnlinkingAddress(addr);
    // Optimistically clear the preference + snap active back to embedded RIGHT
    // AWAY. Even if Privy's unlink call errors out (some WalletConnect sessions
    // return a "wallet already unlinked" error after the user disconnected from
    // the wallet app side), the user's PNPtv-side state still ends up correct
    // so subsequent tips/subs sign with the embedded wallet, not the ghost.
    const wasActive = activeAddress === addr;
    if (wasActive || _getPreferredWallet() === addr) {
      const fallback = embeddedWallet?.address || wallets.find((w) => w.address !== addr)?.address || null;
      setActiveAddress(fallback);
      // Only mirror to preference storage when we have a real fallback. Writing
      // null used to spam the server with clear-then-reset PUTs and left the
      // DB row empty for users whose only wallet was the one they just unlinked.
      if (fallback) _setPreferredWallet(fallback);
    }
    try {
      await unlinkWallet({ address: addr });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // "wallet not linked" / "not found" mean Privy already forgot the wallet —
      // benign, treat as success. Anything else, surface prominently.
      if (!/not linked|not found|already/i.test(msg)) {
        setConnectError(`Could not disconnect: ${msg}. Your PNPtv wallet is still active — try refreshing the page.`);
        reportWalletClientError("unlinkWallet", err, { source: "WalletHomeSheet", address: addr });
      }
    } finally {
      setUnlinkingAddress(null);
    }
  };

  // Opens Privy's secure export flow — key is shown in a Privy-hosted modal
  // with warnings. Only meaningful for the embedded wallet (external wallets
  // are already user-custodied). Rare path — most users never need this.
  const handleExportKey = async () => {
    if (!address || !isActiveEmbedded) return;
    setError(null);
    try {
      await exportWallet({ address });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|closed|reject/i.test(msg)) return;
      reportWalletClientError("exportWallet", err, { source: "WalletHomeSheet" });
      setError(msg);
    }
  };

  // Bridge ETH from Ethereum mainnet → Base via the official Base L1
  // StandardBridge. Used when a user sent Binance withdrawal to the wallet
  // address but picked the wrong network (Ethereum instead of Base). Works
  // for embedded Privy wallets (chain switching handled by Privy's own
  // sendTransaction with explicit chainId) and — after Privy 3.37+ — for
  // external wallets too if they support Ethereum mainnet. Bridge
  // finalization: ~10-15 min.
  const handleBridgeEthToBase = async () => {
    if (!activeWallet || !ethMainnet || ethMainnet <= 0) return;
    setError(null);
    setBridging(true);
    setBridgeTxHash(null);
    try {
      // Leave ~0.0008 ETH for gas — Base bridge tx costs roughly $0.03-$4
      // depending on Ethereum gas conditions. Bridge everything else.
      const balanceWei = parseEther(ethMainnet.toFixed(18));
      const gasReserveWei = parseEther("0.0008");
      if (balanceWei <= gasReserveWei) {
        throw new Error(`Not enough ETH to cover bridge gas. Need at least 0.001 ETH, wallet has ${ethMainnet.toFixed(6)} ETH.`);
      }
      const amountToBridgeWei = balanceWei - gasReserveWei;

      const data = encodeFunctionData({
        abi: _BRIDGE_ETH_ABI,
        functionName: "bridgeETH",
        args: [200000, "0x"],
      });

      // For embedded Privy wallet → use Privy's own sender with explicit
      // chainId 1. Privy handles the chain switch + fee estimation on the
      // correct chain (mainnet), which viem's walletClient was fumbling.
      // For external wallets (MetaMask/Trust) → still use viem since Privy's
      // sender only works on embedded wallets.
      let txHash: `0x${string}`;
      if (isActiveEmbedded) {
        const res = await privySendTransaction(
          {
            chainId: 1, // Ethereum mainnet
            to: _BASE_L1_BRIDGE,
            data,
            value: amountToBridgeWei.toString(),
          },
          {
            // sponsor:false — no gas manager policy for mainnet; user pays.
            sponsor: false,
            address: activeWallet.address,
            uiOptions: {
              showWalletUIs: true,
            },
          }
        );
        txHash = res.hash;
      } else {
        const provider = await activeWallet.getEthereumProvider();
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x1" }],
          });
        } catch (_) { /* already on chain — continue */ }
        const walletClient = createWalletClient({
          account: activeWallet.address as `0x${string}`,
          chain: mainnet,
          transport: custom(provider),
        });
        txHash = await walletClient.sendTransaction({
          to: _BASE_L1_BRIDGE,
          data,
          value: amountToBridgeWei,
        });
      }

      setBridgeTxHash(txHash);
      // Fire-and-forget refresh loop — poll Base balance every 30s for 20 min
      // so the user sees the ETH land in Base without manually refreshing.
      const start = Date.now();
      const poll = async () => {
        if (Date.now() - start > 20 * 60_000) return;
        try {
          const r = await getWalletEthBalance(activeWallet.address);
          if (r.hasWallet && r.eth > (eth || 0)) {
            refresh();
            return;
          }
        } catch { /* keep polling */ }
        setTimeout(poll, 30_000);
      };
      setTimeout(poll, 30_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCancel = /User rejected|user denied|cancel/i.test(msg);
      setError(isCancel ? "You cancelled the transaction." : msg);
      if (!isCancel) {
        reportWalletClientError("bridgeEthToBase", err, {
          source: "WalletHomeSheet",
          address, ethMainnet,
        });
      }
    } finally {
      setBridging(false);
    }
  };

  // ── USDC CCTP bridge (Ethereum mainnet → Base) ─────────────────────────
  // Multi-step: approve() → depositForBurn() → poll Circle attestation
  // (~15 min) → receiveMessage() on Base. Uses Circle's native CCTP so the
  // result is native USDC on Base (not USDbC / bridged variant).
  const handleUsdcBridgeStart = async () => {
    if (!activeWallet || !usdcMainnet || usdcMainnet <= 0) return;
    setUsdcBridgeError(null);

    // Convert to USDC atomic units (6 decimals) — floor to avoid rounding-up
    // above wallet balance which would revert approve/burn.
    const amountRaw = BigInt(Math.floor(usdcMainnet * 1_000_000));
    if (amountRaw <= 0n) {
      setUsdcBridgeError("Amount too small to bridge.");
      return;
    }

    // mintRecipient is bytes32 = left-padded address of the destination wallet
    // (same address, since CCTP is cross-chain to the same EOA).
    const mintRecipient = ("0x" + activeWallet.address.toLowerCase().replace(/^0x/, "").padStart(64, "0")) as `0x${string}`;

    try {
      // Step 1 — approve USDC to CCTP TokenMessenger
      setUsdcBridgeStage("approving");
      _saveUsdcBridge({ stage: "approving" });
      const approveData = encodeFunctionData({
        abi: _USDC_APPROVE_ABI,
        functionName: "approve",
        args: [_CCTP_TOKEN_MESSENGER_L1, amountRaw],
      });
      if (isActiveEmbedded) {
        await privySendTransaction(
          { chainId: 1, to: _USDC_ETHEREUM, data: approveData, value: "0" },
          { sponsor: false, address: activeWallet.address, uiOptions: { showWalletUIs: true } }
        );
      } else {
        const provider = await activeWallet.getEthereumProvider();
        try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] }); } catch (_) {}
        const wc = createWalletClient({ account: activeWallet.address as `0x${string}`, chain: mainnet, transport: custom(provider) });
        await wc.sendTransaction({ to: _USDC_ETHEREUM, data: approveData, value: 0n });
      }

      // Step 2 — depositForBurn
      setUsdcBridgeStage("burning");
      _saveUsdcBridge({ stage: "burning" });
      const burnData = encodeFunctionData({
        abi: _CCTP_DEPOSIT_FOR_BURN_ABI,
        functionName: "depositForBurn",
        args: [amountRaw, _BASE_DOMAIN_ID, mintRecipient, _USDC_ETHEREUM],
      });
      let burnHash: `0x${string}`;
      if (isActiveEmbedded) {
        const res = await privySendTransaction(
          { chainId: 1, to: _CCTP_TOKEN_MESSENGER_L1, data: burnData, value: "0" },
          { sponsor: false, address: activeWallet.address, uiOptions: { showWalletUIs: true } }
        );
        burnHash = res.hash;
      } else {
        const provider = await activeWallet.getEthereumProvider();
        const wc = createWalletClient({ account: activeWallet.address as `0x${string}`, chain: mainnet, transport: custom(provider) });
        burnHash = await wc.sendTransaction({ to: _CCTP_TOKEN_MESSENGER_L1, data: burnData, value: 0n });
      }

      setUsdcBurnTxHash(burnHash);
      setUsdcBridgeStage("waiting_attestation");
      _saveUsdcBridge({ stage: "waiting_attestation", burnTxHash: burnHash });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCancel = /User rejected|user denied|cancel/i.test(msg);
      setUsdcBridgeError(isCancel ? "You cancelled the transaction." : msg);
      setUsdcBridgeStage("idle");
      if (!isCancel) {
        reportWalletClientError("usdcBridgeStart", err, { address, usdcMainnet, stage: usdcBridgeStage });
      }
    }
  };

  // Poll Circle attestation while waiting_attestation. Every 30s.
  _useEffect(() => {
    if (usdcBridgeStage !== "waiting_attestation" || !usdcBurnTxHash) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await getCctpAttestation(usdcBurnTxHash);
        if (cancelled) return;
        if (r.status === "ready" && r.messageBytes && r.attestation) {
          setUsdcAttestation({ message: r.messageBytes, attestation: r.attestation });
          setUsdcBridgeStage("ready_to_mint");
          _saveUsdcBridge({ stage: "ready_to_mint", message: r.messageBytes, attestation: r.attestation });
          return;
        }
      } catch { /* keep polling */ }
      setTimeout(poll, 30_000);
    };
    const t = setTimeout(poll, 5_000); // first check after 5s
    return () => { cancelled = true; clearTimeout(t); };
  }, [usdcBridgeStage, usdcBurnTxHash]);

  const handleUsdcBridgeMint = async () => {
    if (!activeWallet || !usdcAttestation) return;
    setUsdcBridgeError(null);
    try {
      setUsdcBridgeStage("minting");
      _saveUsdcBridge({ stage: "minting" });
      const mintData = encodeFunctionData({
        abi: _CCTP_RECEIVE_MESSAGE_ABI,
        functionName: "receiveMessage",
        args: [usdcAttestation.message as `0x${string}`, usdcAttestation.attestation as `0x${string}`],
      });
      if (isActiveEmbedded) {
        await privySendTransaction(
          { chainId: 8453, to: _CCTP_MESSAGE_TRANSMITTER_L2, data: mintData, value: "0" },
          { sponsor: true, address: activeWallet.address, uiOptions: { showWalletUIs: true } }
        );
      } else {
        const provider = await activeWallet.getEthereumProvider();
        try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] }); } catch (_) {}
        const wc = createWalletClient({ account: activeWallet.address as `0x${string}`, chain: base, transport: custom(provider) });
        await wc.sendTransaction({ to: _CCTP_MESSAGE_TRANSMITTER_L2, data: mintData, value: 0n });
      }
      setUsdcBridgeStage("done");
      _clearUsdcBridge();
      // Refresh to see the new USDC balance on Base
      setTimeout(() => refresh(), 3_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCancel = /User rejected|user denied|cancel/i.test(msg);
      setUsdcBridgeError(isCancel ? "You cancelled the transaction." : msg);
      setUsdcBridgeStage("ready_to_mint");
      if (!isCancel) {
        reportWalletClientError("usdcBridgeMint", err, { address, burnTxHash: usdcBurnTxHash });
      }
    }
  };

  const openInBasescan = () => {
    if (address) window.open(`https://basescan.org/address/${address}`, "_blank", "noopener,noreferrer");
  };

  const resetSend = () => {
    setSendOpen(false);
    setSendTo("");
    setSendAmount("");
    setSending(false);
    setSendTxHash(null);
    setSendError(null);
    setSendConfirm(false);
  };

  // Send USDC or ETH from the active wallet to any external address on Base.
  // Embedded Privy wallets get sponsored gas via the Alchemy Gas Manager
  // policy; external wallets pay their own gas (needs a dust of ETH on Base).
  const handleSend = async () => {
    if (!activeWallet) return;
    setSendError(null);
    setSendTxHash(null);

    const to = sendTo.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      setSendError("Invalid address. Must be a 0x… Base address.");
      return;
    }
    if (to.toLowerCase() === activeWallet.address.toLowerCase()) {
      setSendError("Destination is your own wallet.");
      return;
    }

    const amtNum = Number(sendAmount);
    if (!isFinite(amtNum) || amtNum <= 0) {
      setSendError("Enter an amount greater than 0.");
      return;
    }

    if (sendAsset === "usdc") {
      if (usdc == null || amtNum > usdc + 1e-9) {
        setSendError("Amount exceeds your USDC balance.");
        return;
      }
    } else {
      // ETH: always reserve a small dust for gas. Gas Manager sponsorship is
      // scoped to specific contracts (CCTP), not arbitrary sends, so user
      // always pays their own gas out of ETH balance on Base (~$0.001).
      const reserve = 0.00005;
      if (eth == null || amtNum > eth + 1e-12 || amtNum > Math.max(0, eth - reserve) + 1e-12) {
        setSendError(`Amount exceeds sendable balance (keep ~0.00005 ETH for gas).`);
        return;
      }
    }

    setSending(true);
    try {
      let txHash: `0x${string}`;
      if (sendAsset === "usdc") {
        const data = encodeFunctionData({
          abi: _USDC_ABI,
          functionName: "transfer",
          args: [to as `0x${string}`, parseUnits(amtNum.toFixed(6), 6)],
        });
        if (isActiveEmbedded) {
          // Base EOA — needs its own ETH for gas. requestGasTopup seeds ~$0.20
          // when the wallet is empty; best-effort.
          await requestGasTopup(activeWallet.address);
          const res = await privySendTransaction(
            { chainId: 8453, to: _USDC_BASE, data, value: "0" },
            { sponsor: false, address: activeWallet.address, uiOptions: { showWalletUIs: true } }
          );
          txHash = res.hash;
        } else {
          const provider = await activeWallet.getEthereumProvider();
          try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] }); } catch (_) {}
          const wc = createWalletClient({
            account: activeWallet.address as `0x${string}`,
            chain: base,
            transport: custom(provider),
          });
          txHash = await wc.sendTransaction({ to: _USDC_BASE as `0x${string}`, data, value: 0n });
        }
      } else {
        // Native ETH transfer on Base
        const valueWei = parseEther(amtNum.toFixed(18));
        if (isActiveEmbedded) {
          await requestGasTopup(activeWallet.address);
          const res = await privySendTransaction(
            { chainId: 8453, to: to as `0x${string}`, value: valueWei.toString() },
            { sponsor: false, address: activeWallet.address, uiOptions: { showWalletUIs: true } }
          );
          txHash = res.hash;
        } else {
          const provider = await activeWallet.getEthereumProvider();
          try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] }); } catch (_) {}
          const wc = createWalletClient({
            account: activeWallet.address as `0x${string}`,
            chain: base,
            transport: custom(provider),
          });
          txHash = await wc.sendTransaction({ to: to as `0x${string}`, value: valueWei });
        }
      }

      setSendTxHash(txHash);
      // Optimistic UI + refresh after settlement (~2s on Base).
      if (sendAsset === "usdc") setUsdc((prev) => (prev == null ? prev : Math.max(0, prev - amtNum)));
      else setEth((prev) => (prev == null ? prev : Math.max(0, prev - amtNum)));
      setTimeout(() => refresh(), 3_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCancel = /User rejected|user denied|cancel/i.test(msg);
      setSendError(isCancel ? "You cancelled the transaction." : msg);
      if (!isCancel) {
        reportWalletClientError("sendCrypto", err, {
          source: "WalletHomeSheet",
          address, sendAsset, amount: amtNum, to,
        });
      }
    } finally {
      setSending(false);
    }
  };

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  // Best-effort label for the active wallet type (shown next to the address).
  const walletLabel = !activeWallet
    ? null
    : activeWallet.walletClientType === "privy"
      ? "PNPtv Wallet"
      : activeWallet.walletClientType === "metamask"
        ? "MetaMask"
        : activeWallet.walletClientType === "coinbase_wallet"
          ? "Coinbase"
          : activeWallet.walletClientType === "walletconnect"
            ? "WalletConnect"
            : activeWallet.walletClientType || "External";

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
          {(!authenticated || !activeWallet) && !sessionWalletAddress ? (() => {
            // No local Privy session AND no session-linked wallet: truly new
            // user. Copy is inclusive for both returning users (whose Privy
            // session is fresh on this browser — e.g. desktop when they usually
            // use phone) and brand-new users. Signing in with the same email /
            // Google / Telegram / X they used elsewhere recovers the same
            // embedded wallet — Privy links wallets to accounts, not browsers.
            const _isEs = typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es");
            return (
              <div className="text-center py-8 space-y-4">
                <p className="text-4xl">👛</p>
                <p className="text-sm font-bold text-white">
                  {_isEs ? "Accede a tu billetera" : "Sign in to your wallet"}
                </p>
                <p className="text-[11px] text-white/60 leading-relaxed max-w-xs mx-auto">
                  {_isEs
                    ? "Usa el mismo email, Google, Telegram o X que hayas usado antes para ver tu billetera existente en este dispositivo — o crea una nueva al instante."
                    : "Use the same email, Google, Telegram or X you've signed in with before to see your existing wallet on this device — or create a new one instantly."}
                </p>
                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                  <button
                    type="button"
                    onClick={() => login()}
                    className="min-h-[44px] px-6 rounded-xl text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
                  >
                    {_isEs ? "✨ Ingresar / Crear billetera" : "✨ Sign in / Create wallet"}
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectExternal}
                    className="min-h-[44px] px-6 rounded-xl text-sm font-bold text-white border border-white/15"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    {_isEs ? "🔗 Conectar Trust / MetaMask" : "🔗 Connect Trust / MetaMask"}
                  </button>
                </div>
                {connectError && (
                  <div className="text-[10px] leading-snug text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 max-w-xs mx-auto">
                    {connectError}
                  </div>
                )}
                <p className="text-[10px] text-white/40 leading-relaxed pt-1">
                  {_isEs
                    ? "Tu billetera te sigue entre dispositivos — mismo login, misma billetera."
                    : "Your wallet follows you across devices — same login, same wallet."}
                </p>
              </div>
            );
          })() : sendOpen ? (
            <>
              {/* Send sub-panel — replaces the home body. Back button returns
                  to the wallet home. Success screen surfaces the tx hash link. */}
              <div className="flex items-center gap-2 -mt-1">
                <button
                  type="button"
                  onClick={resetSend}
                  className="text-[11px] px-2 py-1 rounded-md bg-white/[0.06] text-white/80 hover:bg-white/[0.12] transition min-h-[32px]"
                >
                  ← Back
                </button>
                <p className="text-sm font-bold text-white">Send crypto</p>
              </div>

              {sendTxHash ? (
                <div className="space-y-3 text-center py-4">
                  <p className="text-4xl">✅</p>
                  <p className="text-sm font-bold text-emerald-300">Sent!</p>
                  <p className="text-[11px] text-white/70 leading-snug max-w-xs mx-auto">
                    Your {sendAsset === "usdc" ? "USDC" : "ETH"} transfer has been broadcast. Balances update in ~10 seconds.
                  </p>
                  <a
                    href={`https://basescan.org/tx/${sendTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[11px] px-3 py-1.5 rounded-md bg-white/[0.08] text-white/90 hover:bg-white/[0.14] transition underline"
                  >
                    View on Basescan ↗
                  </a>
                  <div>
                    <button
                      type="button"
                      onClick={resetSend}
                      className="mt-2 text-[12px] font-semibold text-white/80 hover:text-white underline"
                    >
                      Back to wallet
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Asset picker */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50 px-1 pb-1">
                      Asset
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSendAsset("usdc")}
                        className={`text-xs font-semibold px-2 py-2 rounded-lg transition ${
                          sendAsset === "usdc"
                            ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                            : "bg-white/[0.04] text-white/70 border border-white/10 hover:bg-white/[0.08]"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-[#2775ca] text-white text-[9px] font-bold flex items-center justify-center">$</span>
                          USDC · {usdc == null ? "—" : usdc.toFixed(2)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendAsset("eth")}
                        className={`text-xs font-semibold px-2 py-2 rounded-lg transition ${
                          sendAsset === "eth"
                            ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/40"
                            : "bg-white/[0.04] text-white/70 border border-white/10 hover:bg-white/[0.08]"
                        }`}
                      >
                        Ξ ETH · {eth == null ? "—" : eth.toFixed(4)}
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40 mt-1.5 px-1">On Base network only.</p>
                  </div>

                  {/* Recipient address */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-white/60 px-1">
                      To address
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={sendTo}
                        onChange={(e) => { setSendTo(e.target.value); setSendError(null); }}
                        placeholder="0x…"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        className="flex-1 min-w-0 text-xs font-mono px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/25"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const txt = await navigator.clipboard.readText();
                            if (txt) { setSendTo(txt.trim()); setSendError(null); }
                          } catch { /* clipboard blocked */ }
                        }}
                        className="text-[11px] font-semibold px-2.5 rounded-lg bg-white/[0.08] text-white/80 hover:bg-white/[0.14] transition min-h-[40px]"
                      >
                        Paste
                      </button>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-white/60 px-1">
                      Amount ({sendAsset === "usdc" ? "USDC" : "ETH"})
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={sendAmount}
                        onChange={(e) => {
                          const v = e.target.value.replace(",", ".");
                          if (v === "" || /^\d*\.?\d*$/.test(v)) { setSendAmount(v); setSendError(null); }
                        }}
                        placeholder="0.00"
                        className="flex-1 min-w-0 text-base font-semibold tabular-nums px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/25"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (sendAsset === "usdc" && usdc != null) {
                            setSendAmount(usdc.toFixed(6).replace(/\.?0+$/, ""));
                          } else if (sendAsset === "eth" && eth != null) {
                            const max = Math.max(0, eth - 0.00005);
                            setSendAmount(max.toFixed(6).replace(/\.?0+$/, ""));
                          }
                          setSendError(null);
                        }}
                        className="text-[11px] font-semibold px-3 rounded-lg bg-white/[0.08] text-white/80 hover:bg-white/[0.14] transition min-h-[40px]"
                      >
                        Max
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40 px-1">
                      Balance: {sendAsset === "usdc"
                        ? (usdc == null ? "—" : `${usdc.toFixed(2)} USDC`)
                        : (eth == null ? "—" : `${eth.toFixed(6)} ETH`)}
                      {sendAsset === "eth" && " · ~0.00005 ETH reserved for gas"}
                    </p>
                  </div>

                  {sendError && (
                    <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                      {sendError}
                    </div>
                  )}

                  {/* Irreversibility warning + confirm gate */}
                  <label className="flex items-start gap-2 text-[11px] text-amber-100/90 bg-amber-500/[0.08] border border-amber-500/30 rounded-md px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendConfirm}
                      onChange={(e) => setSendConfirm(e.target.checked)}
                      className="mt-0.5 accent-amber-400"
                    />
                    <span className="leading-snug">
                      I checked the address. Crypto sends are <b>irreversible</b> — a wrong address means the funds are gone.
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !sendConfirm || !sendTo || !sendAmount}
                    className="w-full min-h-[48px] rounded-xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: sending ? "#555" : "linear-gradient(135deg,#7B61FF,#3B82F6)" }}
                  >
                    {sending
                      ? "Signing…"
                      : `↗️ Send ${sendAmount || "0"} ${sendAsset === "usdc" ? "USDC" : "ETH"}`}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {/* One-tap reset to the PNPtv embedded wallet. Only rendered when
                  the active wallet is external AND an embedded wallet exists —
                  matches the exact scenario where a user connected Trust and
                  now wants to go back but can't find the tiny × chip. */}
              {!isActiveEmbedded && embeddedWallet && (
                <button
                  type="button"
                  onClick={handleUsePnptvWallet}
                  className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px] active:scale-95 transition-all border border-emerald-500/40"
                  style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.20), rgba(16,185,129,0.08))" }}
                >
                  <WalletTypeIcon clientType="privy" size={14} />
                  <span>Use PNPtv Wallet</span>
                </button>
              )}
              {/* On-demand PNPtv embedded wallet provisioning — for users who
                  signed up via wallet-login (Trust/MetaMask/WalletConnect) and
                  therefore never got an embedded wallet auto-provisioned. Only
                  visible when NO embedded wallet exists AND at least one external
                  wallet is connected (so the user clearly wants a PNPtv rail). */}
              {!embeddedWallet && externalWallets.length > 0 && (
                <button
                  type="button"
                  onClick={handleCreateEmbeddedWallet}
                  disabled={creatingWallet}
                  className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px] active:scale-95 transition-all border border-emerald-500/40 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.20), rgba(16,185,129,0.08))" }}
                >
                  <WalletTypeIcon clientType="privy" size={14} />
                  <span>{creatingWallet ? "Creating PNPtv Wallet…" : "Create PNPtv Wallet"}</span>
                </button>
              )}
              {/* Wallet selector — always visible so a PNPtv-embedded user can
                  discover Trust/MetaMask, and multi-wallet users can switch. */}
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50 px-1 pb-1">
                  {wallets.length > 1 ? "Switch wallet" : "Your wallet"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {wallets.map((w) => {
                    const isActive = w.address === activeAddress;
                    const isEmbedded = w.walletClientType === "privy";
                    const isUnlinking = unlinkingAddress === w.address;
                    const label = walletTypeLabel(w.walletClientType);
                    return (
                      <div
                        key={w.address}
                        className={`inline-flex items-stretch rounded-lg overflow-hidden border transition ${
                          isActive
                            ? "bg-emerald-500/20 border-emerald-500/40"
                            : "bg-white/[0.04] border-white/10 hover:bg-white/[0.08]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectWallet(w.address)}
                          className={`text-[11px] font-semibold px-2.5 py-1.5 transition flex items-center gap-1.5 ${
                            isActive ? "text-emerald-200" : "text-white/70"
                          }`}
                          title={isActive ? "Active wallet" : "Use this wallet"}
                        >
                          {isActive && <span className="text-emerald-300">✓</span>}
                          <WalletTypeIcon clientType={w.walletClientType} size={12} />
                          <span>{label} · {w.address.slice(0, 5)}…{w.address.slice(-3)}</span>
                        </button>
                        {!isEmbedded && (
                          <button
                            type="button"
                            onClick={() => handleUnlinkWallet(w.address, isEmbedded)}
                            disabled={isUnlinking}
                            aria-label={`Disconnect ${label}`}
                            title="Disconnect wallet"
                            className="px-2 py-1.5 text-white/40 hover:text-red-300 hover:bg-red-500/10 border-l border-white/10 transition disabled:opacity-40"
                          >
                            {isUnlinking ? "…" : "×"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {/* Always-present "+ Connect" chip — even a PNPtv-embedded user
                      can bring in Trust/MetaMask/Coinbase without leaving this sheet. */}
                  <button
                    type="button"
                    onClick={handleConnectExternal}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-dashed border-white/20 text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition"
                  >
                    + Connect Trust / MetaMask
                  </button>
                </div>
                {connectError && (
                  <div className="mt-2 text-[10px] leading-snug text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
                    {connectError}
                  </div>
                )}
                {wallets.length > 1 && (
                  <p className="mt-1.5 text-[10px] text-white/40 px-1 leading-snug">
                    Your choice sticks across reloads and pages.
                  </p>
                )}
              </div>

              {/* Spend-it-now nudge — appears when user has meaningful on-chain
                  balance to catch dormant funded wallets on next login. Silent
                  when balance is trivial. */}
              {(() => {
                const _ETH_PRICE_ROUGH = 2500;
                const _totalUsd =
                  (usdc || 0) + (usdcMainnet || 0) +
                  ((eth || 0) + (ethMainnet || 0)) * _ETH_PRICE_ROUGH;
                if (loading || _totalUsd < 0.50) return null;
                const _isEs = typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es");
                return (
                  <div className="rounded-xl border border-yellow-400/50 bg-gradient-to-br from-yellow-500/[0.14] to-pink-500/[0.12] p-3 space-y-2 shadow-[0_0_18px_-4px_rgba(250,204,21,0.35)]">
                    <div className="text-sm font-bold text-yellow-200 flex items-center gap-1.5">
                      <span className="text-base">💰</span>
                      {_isEs
                        ? <>Tienes <span className="tabular-nums">≈ ${_totalUsd.toFixed(2)}</span> sin gastar</>
                        : <>You have <span className="tabular-nums">≈ ${_totalUsd.toFixed(2)}</span> unspent</>}
                    </div>
                    <p className="text-[11px] text-white/70 leading-snug">
                      {_isEs
                        ? "Úsalo ya en PRIME, propinas en vivo, videollamadas privadas o contenido exclusivo."
                        : "Use it now on PRIME, live tips, private video calls, or exclusive content."}
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <a href="/subscribe" onClick={onClose}
                         className="block text-center py-2 rounded-lg text-xs font-bold text-black bg-yellow-400 hover:bg-yellow-300 transition">
                        💎 {_isEs ? "Obtener PRIME" : "Get PRIME"}
                      </a>
                      <a href="/main-stage" onClick={onClose}
                         className="block text-center py-2 rounded-lg text-xs font-bold text-white bg-pink-600 hover:bg-pink-500 transition">
                        💸 {_isEs ? "Dar Propinas" : "Send Tips"}
                      </a>
                    </div>
                  </div>
                );
              })()}

              {/* Balances — USDC + ETH + Ru$h */}
              <div className="grid grid-cols-3 gap-2">
                {/* USDC */}
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] p-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-[#2775ca] text-white text-[9px] font-bold flex items-center justify-center">$</div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">USDC</span>
                  </div>
                  <p className="mt-1 text-lg font-bold text-white tabular-nums">
                    {loading ? "…" : (usdc == null ? "0.00" : usdc.toFixed(2))}
                  </p>
                  <p className="text-[10px] text-white/50 mt-0.5">on Base</p>
                </div>
                {/* ETH */}
                <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/[0.06] p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">Ξ</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">ETH</span>
                  </div>
                  <p className="mt-1 text-lg font-bold text-white tabular-nums">
                    {loading ? "…" : (eth == null ? "0.0000" : eth.toFixed(4))}
                  </p>
                  <p className="text-[10px] text-white/50 mt-0.5">on Base</p>
                </div>
                {/* Ru$h */}
                <div className="rounded-xl border border-pink-400/30 bg-pink-500/[0.06] p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">💎</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Ru$h</span>
                  </div>
                  <p className="mt-1 text-lg font-bold text-white tabular-nums">
                    {loading ? "…" : (rush == null ? "—" : (rush.regular + rush.gifted).toLocaleString())}
                  </p>
                  <p className="text-[10px] text-white/50 mt-0.5">
                    {rush && rush.gifted > 0 ? `+${rush.gifted} gifted` : "spendable"}
                  </p>
                </div>
              </div>

              {/* Wallet address */}
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  {walletLabel} · Base
                </p>
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
                {/* Export private key — only for the embedded Privy wallet.
                    Advanced use only (bridging cross-chain, importing to another
                    wallet). External wallets manage their own keys. */}
                {isActiveEmbedded && (
                  <button
                    type="button"
                    onClick={handleExportKey}
                    className="w-full mt-1 text-[10px] font-semibold text-amber-300/80 hover:text-amber-200 border border-amber-500/20 hover:border-amber-500/40 bg-amber-500/[0.04] rounded-md px-2 py-1.5 transition"
                  >
                    🔑 Export private key (advanced)
                  </button>
                )}
              </div>

              {error && (
                <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              {/* USDC wrong-network recovery via CCTP (Circle Cross-Chain
                  Transfer Protocol) — bridges native USDC from Ethereum to
                  Base with a 3-step flow: approve → burn → wait ~15 min for
                  Circle attestation → mint on Base. Persists in localStorage
                  so users can close and resume. */}
              {((usdcMainnet != null && usdcMainnet > 0) || (usdcBurnTxHash && usdcBridgeStage !== "idle" && usdcBridgeStage !== "done")) && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none pt-0.5">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-200">
                        ¿USDC en la red equivocada?
                      </p>
                      <p className="text-[11px] text-amber-100/80 leading-snug mt-0.5">
                        {usdcMainnet && usdcMainnet > 0
                          ? <>Detectamos <span className="font-mono font-bold">{usdcMainnet.toFixed(2)} USDC</span> en tu wallet en <b>Ethereum mainnet</b>. Puentealo a <b>Base</b> vía Circle CCTP (USDC nativo).</>
                          : <>Bridge USDC pendiente — completá los pasos abajo para recibirlo en Base.</>
                        }
                      </p>
                    </div>
                  </div>

                  {usdcBridgeError && (
                    <div className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
                      {usdcBridgeError}
                    </div>
                  )}

                  {usdcBridgeStage === "idle" && (
                    <>
                      <button
                        type="button"
                        onClick={handleUsdcBridgeStart}
                        disabled={!ethMainnet || ethMainnet < 0.002}
                        className="w-full min-h-[44px] rounded-xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: "linear-gradient(135deg,#E69138,#D4007A)" }}
                      >
                        🌉 Bridge {usdcMainnet?.toFixed(2)} USDC → Base
                      </button>
                      {(!ethMainnet || ethMainnet < 0.002) && (
                        <p className="text-[10px] text-red-200/80 leading-snug">
                          Necesitás ~0.002 ETH en Ethereum para el gas de approve + burn (2 txs). Enviate un poco de ETH primero.
                        </p>
                      )}
                      <p className="text-[9px] text-amber-100/60 leading-snug">
                        Circle CCTP oficial (2 txs en Ethereum + 1 tx en Base). El USDC llega como <b>USDC nativo</b> en Base en ~15 min.
                      </p>
                    </>
                  )}

                  {usdcBridgeStage === "approving" && (
                    <div className="text-[11px] text-amber-200 flex items-center gap-2">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Paso 1/3 — Firmá el approve en Ethereum
                    </div>
                  )}

                  {usdcBridgeStage === "burning" && (
                    <div className="text-[11px] text-amber-200 flex items-center gap-2">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Paso 2/3 — Firmá el burn en Ethereum
                    </div>
                  )}

                  {usdcBridgeStage === "waiting_attestation" && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-amber-200 flex items-center gap-2">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Esperando confirmación de Circle (~15 min)…
                      </div>
                      {usdcBurnTxHash && (
                        <p className="text-[10px] text-amber-100/60">
                          Podés cerrar la app — vas a poder completar cuando vuelvas.{" "}
                          <a href={`https://etherscan.io/tx/${usdcBurnTxHash}`} target="_blank" rel="noopener noreferrer" className="underline">Ver tx</a>
                        </p>
                      )}
                    </div>
                  )}

                  {usdcBridgeStage === "ready_to_mint" && (
                    <>
                      <div className="text-[11px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5">
                        ✅ Attestation lista. Paso 3/3 — firma en Base para recibir el USDC.
                      </div>
                      <button
                        type="button"
                        onClick={handleUsdcBridgeMint}
                        className="w-full min-h-[44px] rounded-xl text-sm font-bold text-white transition active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                      >
                        💎 Completar bridge en Base
                      </button>
                      <p className="text-[9px] text-emerald-100/60">
                        Gas gratis en Base (sponsoreado por PNPtv).
                      </p>
                    </>
                  )}

                  {usdcBridgeStage === "minting" && (
                    <div className="text-[11px] text-amber-200 flex items-center gap-2">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Minteando en Base…
                    </div>
                  )}
                </div>
              )}

              {/* Wrong-network recovery: if the active wallet has ETH sitting
                  on Ethereum mainnet (usually because someone withdrew from an
                  exchange picking the wrong network), offer a one-tap bridge
                  to Base via the official Base L1StandardBridge. Persistent
                  section — visible whenever there's ETH stuck on mainnet, so
                  it doubles as recovery UI for anyone else who makes the same
                  mistake. */}
              {ethMainnet != null && ethMainnet > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none pt-0.5">⚠️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-200">
                        ¿Enviaste a la red equivocada?
                      </p>
                      <p className="text-[11px] text-amber-100/80 leading-snug mt-0.5">
                        Detectamos <span className="font-mono font-bold">{ethMainnet.toFixed(6)} ETH</span> en tu wallet en <b>Ethereum mainnet</b>. Puentealo a <b>Base</b> con un tap.
                      </p>
                    </div>
                  </div>

                  {bridgeTxHash && (
                    <div className="text-[10px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5 leading-snug">
                      <p className="font-semibold">Bridge iniciado ✓</p>
                      <p className="mt-0.5">
                        Tarda 10-15 min en aparecer en Base. Podés cerrar esta ventana.{" "}
                        <a
                          href={`https://etherscan.io/tx/${bridgeTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Ver tx
                        </a>
                      </p>
                    </div>
                  )}

                  {!bridgeTxHash && (
                    <>
                      <button
                        type="button"
                        onClick={handleBridgeEthToBase}
                        disabled={bridging || ethMainnet <= 0.001}
                        className="w-full min-h-[44px] rounded-xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: bridging ? "#555" : "linear-gradient(135deg,#E69138,#D4007A)" }}
                      >
                        {bridging
                          ? "Firmando…"
                          : `🌉 Bridge ${Math.max(0, ethMainnet - 0.0008).toFixed(6)} ETH → Base`}
                      </button>
                      <p className="text-[9px] text-amber-100/60 leading-snug">
                        Reservamos ~0.0008 ETH para el gas. Puente oficial de Base ({_BASE_L1_BRIDGE.slice(0, 6)}…{_BASE_L1_BRIDGE.slice(-4)}) — llega a la misma address en Base en 10-15 min.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Actions — signing actions (Fund/Buy/Send) require Privy auth
                  on THIS browser. In read-only mode (session knows wallet
                  address but Privy isn't authed locally) we replace the
                  action grid with a sign-in prompt. Activity + Refresh work
                  read-only so they stay visible. */}
              {isReadOnlyView ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.08] p-3 space-y-2">
                    <p className="text-sm font-bold text-amber-100">Sign in on this device</p>
                    <p className="text-[11px] text-white/70 leading-snug">
                      Your wallet is here — balances above are live. To send crypto or buy Ru$h from this browser, sign in with the same email / Google / Telegram / X you use elsewhere.
                    </p>
                    <button
                      type="button"
                      onClick={() => login()}
                      className="w-full min-h-[44px] rounded-lg text-sm font-bold text-white transition active:scale-[0.98]"
                      style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
                    >
                      ✨ Sign in to unlock signing
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
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
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {/* Fund with card — Privy's Stripe onramp lands USDC at any
                      destination address, including external wallets. Works for
                      both PNPtv-embedded and Trust/MetaMask. */}
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
                    onClick={() => { resetSend(); setSendOpen(true); }}
                    className="min-h-[52px] rounded-xl font-bold text-white flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition"
                    style={{ background: "linear-gradient(135deg,#7B61FF,#3B82F6)" }}
                  >
                    <span className="text-lg leading-none">↗️</span>
                    <span className="text-[11px]">Send</span>
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
                    className="col-span-2 min-h-[52px] rounded-xl font-semibold text-white/90 bg-white/[0.06] hover:bg-white/[0.10] transition flex items-center justify-center gap-2"
                  >
                    <span className="text-lg leading-none">🔄</span>
                    <span className="text-[11px]">Refresh balances</span>
                  </button>
                </div>
              )}

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

// ── TipButton ─────────────────────────────────────────────────────────────
// Shared pink→orange 💸 pill + dual-rail (Ru$h / USDC) tip sheet. Reused
// across content pages (channel header, video player toolbar, PrimeHub, etc.)
// so a single tip UX ships everywhere. Lifted from the MainStage tip sheet
// (MainStage.tsx ~2379–2528) and kept in this file per feedback_no_new_files.md.
//
// Only Crystal Creators can receive tips — the backend rejects non-Crystal
// recipients with 403 RECIPIENT_NOT_CRYSTAL_CREATOR on both rails. Callers
// MUST pass `isCrystalCreator` from a source that computed the flag in SQL
// (crystal_creator_active_until > NOW()) — never a JS `new Date()` compare,
// which mis-handles Postgres 'infinity' (parsed to JS Infinity by node-pg).
//
// If !isCrystalCreator the component returns null so we never show a button
// that would 403.

// Lazy-load TipRushRail — same trick QuickTipSheet in Layout.tsx uses so
// the base checkout bundle doesn't pull in the Ru$h rail unless a user
// actually opens a tip sheet.
const _LazyTipRushRail = _lazy(() => import("@/components/payments/TipRushRail").then((m) => ({ default: m.TipRushRail })));

export interface TipButtonProps {
  /** The recipient's user ID (creator or video uploader). */
  creatorId: string;
  /** Display handle (@username) — shown in the sheet header when provided. */
  creatorUsername?: string;
  /** MUST be true for the button to render — see file header. */
  isCrystalCreator: boolean;
  /** `inline` = default pill in a flex row. `floating` = fixed FAB (not currently used). */
  variant?: "inline" | "floating";
  lang?: "en" | "es";
  className?: string;
  /**
   * Optional current Ru$h + gifted balances. When both add up to cover the
   * selected tip (6 Ru$h = $1), the sheet defaults to the Ru$h rail; otherwise
   * USDC. Passing neither defaults to USDC — safe fallback (the rail toggle
   * is always visible so users can switch).
   */
  tokenBalance?: number;
  giftedBalance?: number;
}

export function TipButton({
  creatorId,
  creatorUsername,
  isCrystalCreator,
  variant = "inline",
  lang = "en",
  className,
  tokenBalance,
  giftedBalance,
}: TipButtonProps) {
  const es = lang === "es";
  const [open, setOpen] = _useState(false);
  const [tipAmount, setTipAmount] = _useState<number>(() => {
    try {
      const raw = localStorage.getItem("pnptv:lastTipUsd");
      const n = parseInt(raw ?? "", 10);
      if (Number.isFinite(n) && n > 0 && n <= 500) return n;
    } catch { /* storage blocked */ }
    return TIP_PRESETS_USD[0];
  });
  const [tipMessage, setTipMessage] = _useState<string>("");
  // Rail default: Ru$h when balance covers, else USDC. Recomputed each
  // open + when amount changes so a repeat-tipper who tops up mid-session
  // sees the correct default.
  const [tipRailMode, setTipRailMode] = _useState<"rush" | "usdc">("usdc");
  const { authenticated: privyAuthenticated, login: privyLogin } = usePrivy();

  _useEffect(() => {
    if (!open) return;
    const needRush = tipAmount * 6;
    const haveRush = (tokenBalance ?? 0) + (giftedBalance ?? 0);
    setTipRailMode(haveRush >= needRush && haveRush > 0 ? "rush" : "usdc");
  }, [open, tipAmount, tokenBalance, giftedBalance]);

  // Hard gate — hide entirely for non-Crystal recipients so we never show a
  // button that would 403. See file header for the reasoning.
  if (!isCrystalCreator) return null;

  const closeSheet = () => setOpen(false);

  const pillClass = variant === "floating"
    ? "fixed bottom-24 right-4 z-40 min-h-[52px] px-4 rounded-full font-bold text-white shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
    : `min-h-[44px] px-3 rounded-full font-bold text-white text-sm active:scale-95 transition-all flex items-center gap-1 ${className ?? ""}`;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={pillClass}
        style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
        title={es ? "Enviar propina" : "Send tip"}
        aria-label={es ? "Enviar propina" : "Send tip"}
      >
        <span aria-hidden>💸</span>
        <span>{es ? "Propina" : "Tip"}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          onClick={closeSheet}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
            style={{ background: "rgba(19, 16, 26, 0.98)", border: "1px solid rgba(212,0,122,0.35)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="space-y-1">
              <p className="text-base font-bold text-white">
                💸 {es ? "Enviar propina a" : "Tip"}{" "}
                <span className="text-pink-400">
                  {creatorUsername ? `@${creatorUsername}` : (es ? "este creador" : "this creator")}
                </span>
              </p>
              <p className="text-[11px] text-white/60">
                {es
                  ? "USDC en Base o Ru$h 💎. 100% va al creador, al instante."
                  : "USDC on Base or Ru$h 💎. 100% goes to the creator, instantly."}
              </p>
            </div>

            {/* Preset chips — same dual-label ($USD + Ru$h) as MainStage */}
            <div className="grid grid-cols-4 gap-2">
              {TIP_PRESETS_USD.map((amt, i) => {
                const rushAmt = TIP_PRESETS_RUSH[i];
                const selected = tipAmount === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setTipAmount(amt);
                      try { localStorage.setItem("pnptv:lastTipUsd", String(amt)); } catch { /* blocked */ }
                    }}
                    className={`py-2.5 rounded-lg text-center transition-colors ${
                      selected
                        ? "bg-gradient-to-r from-pink-500 to-orange-400 text-white"
                        : "bg-white/[0.05] text-white/80 border border-white/10 hover:bg-white/[0.10]"
                    }`}
                  >
                    <span className="block text-sm font-bold">${amt}</span>
                    <span className="block text-[10px] opacity-70">{rushAmt} 💎</span>
                  </button>
                );
              })}
            </div>

            {/* Custom amount */}
            <input
              type="number"
              min={1}
              max={500}
              step={1}
              value={tipAmount}
              onChange={(e) => {
                const v = parseInt(e.target.value || "0", 10);
                if (Number.isFinite(v) && v > 0) {
                  const clamped = Math.min(500, v);
                  setTipAmount(clamped);
                  try { localStorage.setItem("pnptv:lastTipUsd", String(clamped)); } catch { /* blocked */ }
                }
              }}
              className="w-full py-2 px-3 rounded-lg text-sm text-white bg-white/[0.05] border border-white/10 focus:border-pink-400/60 focus:outline-none"
              placeholder={es ? "Cantidad personalizada ($)" : "Custom amount ($)"}
            />
            <input
              type="text"
              maxLength={140}
              value={tipMessage}
              onChange={(e) => setTipMessage(e.target.value)}
              className="w-full py-2 px-3 rounded-lg text-xs text-white bg-white/[0.05] border border-white/10 focus:border-pink-400/60 focus:outline-none"
              placeholder={es ? "Agrega un mensaje (opcional)" : "Add a message (optional)"}
            />

            {!privyAuthenticated ? (
              <button
                type="button"
                onClick={() => privyLogin()}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-transform active:scale-95"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
              >
                {es ? "Inicia sesión para enviar propina" : "Sign in to send tip"}
              </button>
            ) : (
              <>
                {/* Rail selector — Ru$h (instant, no fees) vs USDC (gasless on Base) */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTipRailMode("rush")}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                      tipRailMode === "rush"
                        ? "bg-gradient-to-r from-pink-500 to-orange-400 text-white shadow"
                        : "bg-white/[0.05] text-white/60 border border-white/10 hover:bg-white/[0.10]"
                    }`}
                  >
                    {es ? "Pagar con Ru$h 💎 — instante" : "Pay with Ru$h 💎 — instant"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipRailMode("usdc")}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                      tipRailMode === "usdc"
                        ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow"
                        : "bg-white/[0.05] text-white/60 border border-white/10 hover:bg-white/[0.10]"
                    }`}
                  >
                    {es ? "Pagar con USDC — sin gas" : "Pay with USDC — gasless"}
                  </button>
                </div>

                {tipRailMode === "rush" ? (
                  // Ledger mode — content pages are not Main Stage, so we
                  // don't fire tip animations. TipRushRail's `mode="ledger"`
                  // hits /api/webapp/tip-tokens which enforces the same
                  // Crystal-only gate as /live/tips.
                  <_Suspense fallback={<div className="h-16 flex items-center justify-center text-white/40 text-xs">…</div>}>
                    <_LazyTipRushRail
                      creatorId={creatorId}
                      creatorName={creatorUsername ? `@${creatorUsername}` : undefined}
                      mode="ledger"
                      variant="full"
                      showMessage={false}
                      showBalance
                      allowGifted={false}
                      onSuccess={() => setTimeout(closeSheet, 1200)}
                    />
                  </_Suspense>
                ) : (
                  <WalletPayCard
                    surface="tip"
                    amountUsd={tipAmount}
                    entitlementSpec={{
                      creator_id: creatorId,
                      message: tipMessage.trim() || undefined,
                    }}
                    metadata={{ context: "content_page" }}
                    label={es ? `Enviar propina de $${tipAmount}` : `Send $${tipAmount} tip`}
                    lang={lang}
                    onSuccess={() => setTimeout(closeSheet, 1200)}
                    compact
                  />
                )}
              </>
            )}

            <button
              type="button"
              onClick={closeSheet}
              className="w-full text-xs text-white/50 hover:text-white/80 transition"
            >
              {es ? "Cancelar" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
