import React from "react";

// Wallet icon SVGs live here so both the NowPaymentsWaitingPanel and
// BookCallModal chip strip can share them without a circular import.

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

// SLIP-44 coin IDs — hint to Trust Wallet which coin's browser to open the URL in.
// Fallback to ETH (60) when currency is unknown or missing from the map.
const TW_COIN_ID: Record<string, number> = {
  btc: 0,
  ltc: 2,
  doge: 3,
  eth: 60, usdterc20: 60, usdcerc20: 60,
  bnbbsc: 60, usdtbsc: 60, usdcbsc: 60, bnb: 714,
  trx: 195, usdttrc20: 195, usdctrc20: 195,
  sol: 501, usdcsol: 501,
  xrp: 144,
};

// MetaMask holds only EVM assets — hide the chip for BTC/LTC/DOGE/SOL/etc.
const EVM_CURRENCIES = new Set([
  "eth", "usdterc20", "usdcerc20",
  "bnbbsc", "usdtbsc", "usdcbsc", "bnb",
]);

export function trustWalletDeepLink(invoiceUrl: string, payCurrency?: string | null): string {
  const coinId = TW_COIN_ID[(payCurrency || "").toLowerCase()] ?? 60;
  return `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(invoiceUrl)}`;
}

export function metaMaskDeepLink(invoiceUrl: string): string {
  return `https://metamask.app.link/dapp/${invoiceUrl.replace(/^https?:\/\//, "")}`;
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
