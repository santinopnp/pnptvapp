// Shared wallet metadata — used by both CryptoGuide.tsx (static reference guide)
// and CryptoOnboardingWizard.tsx (gated step-through for first-timers), so the
// wallet list/links/colors only need updating in one place.
export const WALLETS = {
  metamask: {
    name: "MetaMask",
    emoji: "🦊",
    color: "#F6851B",
    android: "https://play.google.com/store/apps/details?id=io.metamask",
    ios: "https://apps.apple.com/app/metamask-blockchain-wallet/id1438144202",
  },
  binance: {
    name: "Binance",
    emoji: "🟡",
    color: "#F0B90B",
    android: "https://play.google.com/store/apps/details?id=com.binance.dev",
    ios: "https://apps.apple.com/app/binance-buy-bitcoin-crypto/id1436799971",
  },
  dash: {
    name: "Dash Wallet",
    emoji: "🥷",
    color: "#008DE4",
    android: "https://play.google.com/store/apps/details?id=hashengineering.darkcoin.wallet",
    ios: "https://apps.apple.com/app/dash-wallet/id1206647026",
  },
} as const;

export type WalletKey = keyof typeof WALLETS;
