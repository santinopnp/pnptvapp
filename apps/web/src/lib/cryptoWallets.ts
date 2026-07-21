export const WALLETS = {
  trust: {
    name: "Trust Wallet",
    letter: "T",
    grad: "linear-gradient(135deg,#3375BB,#5ED1C4)",
    color: "#3375BB",
    android: "https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp",
    ios: "https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409",
  },
  metamask: {
    name: "MetaMask",
    letter: "M",
    grad: "linear-gradient(135deg,#F6851B,#FFB454)",
    color: "#F6851B",
    android: "https://play.google.com/store/apps/details?id=io.metamask",
    ios: "https://apps.apple.com/app/metamask-blockchain-wallet/id1438144202",
    chrome: "https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn",
  },
} as const;

export type WalletKey = keyof typeof WALLETS;
