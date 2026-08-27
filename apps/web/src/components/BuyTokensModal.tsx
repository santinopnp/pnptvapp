import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import {
  getTokenPackages,
  initiateWalletCheckout,
  verifyWalletCheckoutTx,
  getWalletUsdcBalance,
  getWalletEthBalance,
  getWalletEthPrice,
  activateTokenCode,
  buyTokensWithNowPayments,
  getNowPaymentsOrderStatus,
  assertPaymentUrl,
  type TokenPackage,
} from "@/lib/api";
import { usePrivy, useWallets, useAddFunds, useSendTransaction } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits } from "viem";
import { base } from "viem/chains";
import { WalletCheckoutHero } from "@/components/payments/PayInWalletChips";

const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_CAIP2 = "eip155:8453" as const;
const USDC_TRANSFER_ABI = [{
  name: "transfer",
  type: "function" as const,
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}];

interface BuyTokensModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newBalance: number) => void;
  dpnsHandle?: string | null;
}

export function BuyTokensModal({ isOpen, onClose, onSuccess, dpnsHandle: _dpnsHandle }: BuyTokensModalProps) {
  const t = useI18n();
  const es = t.lang === "es";
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { addFunds } = useAddFunds();
  const { sendTransaction: privySendTransaction } = useSendTransaction();

  // Active-wallet picker — same pattern as WalletHomeSheet so a user with an
  // external Trust/MetaMask that holds their ETH doesn't see "no balance"
  // because the modal picked the empty embedded wallet by default.
  const embeddedWalletDefault = wallets.find((w) => w.walletClientType === "privy") || null;
  const externalWallets = wallets.filter((w) => w.walletClientType !== "privy");
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  useEffect(() => {
    if (activeAddress && wallets.some((w) => w.address === activeAddress)) return;
    const fallback = embeddedWalletDefault?.address || externalWallets[0]?.address || null;
    setActiveAddress(fallback);
  }, [wallets.map((w) => w.address).join(","), embeddedWalletDefault?.address]);
  const activeWallet = wallets.find((w) => w.address === activeAddress) || null;
  const isEmbedded = activeWallet?.walletClientType === "privy";

  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  const [walletUsdc, setWalletUsdc] = useState<number | null>(null);
  const [walletEth, setWalletEth] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [payingPackageId, setPayingPackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tokens: number } | null>(null);

  // Rail selection + ETH spot for the ETH rail. Spot is refreshed every open;
  // the initiate call captures its own server-side snapshot for verification.
  const [rail, setRail] = useState<"usdc" | "eth">("usdc");
  const [ethUsdPrice, setEthUsdPrice] = useState<number | null>(null);

  // Custom-amount input (USD). When >0, this overrides preset packages.
  // Server-bounded to $1–$500 with flat 6 Ru$h per USD.
  const [customUsd, setCustomUsd] = useState<string>("");
  const [payingCustom, setPayingCustom] = useState(false);

  // Activation-code redemption (users who received a code out-of-band, e.g. via
  // support, ops top-up, or a legacy card checkout). Not a purchase path we
  // advertise — collapsed by default.
  const [activationExpanded, setActivationExpanded] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<number | null>(null);

  // Load packages on open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingPackages(true);
    getTokenPackages()
      .then((res) => {
        if (res.success && Array.isArray(res.packages)) setPackages(res.packages);
      })
      .catch(() => {})
      .finally(() => setLoadingPackages(false));
  }, [isOpen]);

  // Load USDC + ETH balance + ETH spot price on open. All three drive rail
  // affordability + custom-amount previews. Always queries the ACTIVE wallet
  // address explicitly — never falls back to the DB `users.wallet_address`,
  // which may not match the wallet the user actually connected/holds funds in.
  useEffect(() => {
    if (!isOpen || !authenticated || !activeWallet) {
      setWalletUsdc(null); setWalletEth(null); return;
    }
    setWalletLoading(true);
    Promise.all([
      getWalletUsdcBalance(activeWallet.address).catch(() => null),
      getWalletEthBalance(activeWallet.address).catch(() => null),
      getWalletEthPrice().catch(() => null),
    ]).then(([u, e, p]) => {
      setWalletUsdc(u && u.hasWallet ? u.usdc : null);
      setWalletEth(e && e.hasWallet ? e.eth : null);
      setEthUsdPrice(p && p.priceUsd > 0 ? p.priceUsd : null);
    }).finally(() => setWalletLoading(false));
  }, [isOpen, authenticated, activeWallet?.address]);

  if (!isOpen) return null;

  const refreshBalance = () => {
    if (!authenticated || !activeWallet) return;
    Promise.all([
      getWalletUsdcBalance(activeWallet.address).catch(() => null),
      getWalletEthBalance(activeWallet.address).catch(() => null),
    ]).then(([u, e]) => {
      setWalletUsdc(u && u.hasWallet ? u.usdc : null);
      setWalletEth(e && e.hasWallet ? e.eth : null);
    });
  };

  // Unified pay flow — dispatches USDC transfer or native ETH transfer based
  // on the intent's rail. Handles both preset packages and custom-amount
  // purchases: caller passes { rail, spec, expectedTokens }.
  const _executeIntent = async (
    railChoice: "usdc" | "eth",
    spec: Record<string, unknown>,
    expectedTokens: number,
    amountUsdOverride: number | null,
  ): Promise<void> => {
    if (!activeWallet) return;
    const intent = await initiateWalletCheckout({
      rail: railChoice,
      surface: "rush",
      ...(amountUsdOverride != null ? { amountUsd: amountUsdOverride } : {}),
      entitlementSpec: { ...spec, ...(amountUsdOverride != null ? { amountUsd: amountUsdOverride } : {}) },
      metadata: { source: "buy_tokens_modal", ...(spec.packageId ? { packageId: spec.packageId } : { custom: true }) },
    });
    if (!intent.receivingAddress) throw new Error("intent_missing_fields");

    let txHash: `0x${string}`;
    if (railChoice === "eth") {
      if (!intent.amountWeiExpected) throw new Error("intent_missing_eth_amount");
      const valueWei = BigInt(intent.amountWeiExpected);
      if (isEmbedded) {
        // Privy smart_wallet_config.enabled=false for this app — embedded
        // wallets are pure EOAs. sponsor:true is a no-op / error. User must
        // have ETH dust on Base (~0.00005 = ~$0.15) to cover gas.
        const res = await privySendTransaction(
          { chainId: 8453, to: intent.receivingAddress as `0x${string}`, value: valueWei.toString() },
          { sponsor: false, address: activeWallet.address, uiOptions: { showWalletUIs: true } }
        );
        txHash = res.hash;
      } else {
        const provider = await activeWallet.getEthereumProvider();
        try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] }); } catch (_) {}
        const walletClient = createWalletClient({
          account: activeWallet.address as `0x${string}`,
          chain: base, transport: custom(provider),
        });
        txHash = await walletClient.sendTransaction({
          to: intent.receivingAddress as `0x${string}`, value: valueWei,
        });
      }
    } else {
      // USDC ERC20 transfer
      if (!intent.amountUsdc) throw new Error("intent_missing_usdc_amount");
      const data = encodeFunctionData({
        abi: USDC_TRANSFER_ABI, functionName: "transfer",
        args: [intent.receivingAddress as `0x${string}`, parseUnits(intent.amountUsdc.toFixed(6), 6)],
      });
      if (isEmbedded) {
        // Privy smart wallets disabled → EOA, sponsor:true is a no-op.
        const res = await privySendTransaction(
          { chainId: 8453, to: USDC_BASE_ADDRESS, data, value: "0" },
          { sponsor: false, address: activeWallet.address, uiOptions: { showWalletUIs: true } }
        );
        txHash = res.hash;
      } else {
        const provider = await activeWallet.getEthereumProvider();
        try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] }); } catch (_) {}
        const walletClient = createWalletClient({
          account: activeWallet.address as `0x${string}`,
          chain: base, transport: custom(provider),
        });
        txHash = await walletClient.sendTransaction({
          to: USDC_BASE_ADDRESS as `0x${string}`, data, value: 0n,
        });
      }
    }

    const verified = await verifyWalletCheckoutTx(intent.intentId, txHash);
    if (!verified.ok) throw new Error(verified.reason || "verify_failed");
    const credited = verified.rushCredited ?? expectedTokens;
    setSuccess({ tokens: credited });
    refreshBalance();
    if (onSuccess) onSuccess(credited);
  };

  const handleWalletPay = async (pkg: TokenPackage) => {
    if (!activeWallet) return;
    setError(null); setPayingPackageId(pkg.id);
    try {
      await _executeIntent(
        rail,
        { tokens: Number(pkg.tokens), packageId: pkg.id },
        Number(pkg.tokens),
        null,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/User rejected|user denied|cancel/i.test(msg)
        ? (es ? "Cancelaste la transacción." : "You cancelled the transaction.")
        : msg);
    } finally { setPayingPackageId(null); }
  };

  const handleCustomPay = async () => {
    if (!activeWallet) return;
    const usd = Number(customUsd);
    if (!isFinite(usd) || usd < 1 || usd > 5000) {
      setError(es ? "Ingresa un monto entre $1 y $5000." : "Enter an amount between $1 and $5000.");
      return;
    }
    setError(null); setPayingCustom(true);
    try {
      const tokens = Math.round(usd * 6);
      await _executeIntent(rail, { tokens }, tokens, usd);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/User rejected|user denied|cancel/i.test(msg)
        ? (es ? "Cancelaste la transacción." : "You cancelled the transaction.")
        : msg);
    } finally { setPayingCustom(false); }
  };

  // NowPayments alternate-coin option — for users who want to pay in USDC (any
  // chain), BTC, or ETH outside our Base wallet flow. Restricted to those three
  // per product policy (2026-08-19); NP full picker (LTC/DOGE/XMR/etc.) is only
  // exposed on /subscribe, not for Ru$h top-ups. Popup-based per NP iframe rules.
  type NpCoin = 'usdcerc20' | 'btc' | 'eth';
  const [npCoin, setNpCoin] = useState<NpCoin>('usdcerc20');
  const [npFallbackPackageId, setNpFallbackPackageId] = useState<string | null>(null);
  const handlePayWithNowPayments = async (pkg: TokenPackage) => {
    setError(null);
    setNpFallbackPackageId(pkg.id);
    let popup: Window | null = null;
    try {
      const res = await buyTokensWithNowPayments(pkg.id, npCoin);
      if (!res.success || !res.checkoutUrl || !res.invoiceId) {
        throw new Error(res.error || "no_url");
      }
      assertPaymentUrl(res.checkoutUrl);
      const w = 480, h = 720;
      const left = Math.max(0, Math.round((window.outerWidth - w) / 2 + (window.screenX || 0)));
      const top = Math.max(0, Math.round((window.outerHeight - h) / 2 + (window.screenY || 0)));
      popup = window.open(
        res.checkoutUrl,
        "pnp_np_wallet",
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
      if (!popup) {
        window.location.href = res.checkoutUrl;
        return;
      }
      const orderId = res.invoiceId;
      const startedAt = Date.now();
      const maxWait = 30 * 60 * 1000; // 30 min
      while (Date.now() - startedAt < maxWait) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const s = await getNowPaymentsOrderStatus(orderId);
          if (s.completed) {
            const credited = Number(pkg.tokens);
            setSuccess({ tokens: credited });
            refreshBalance();
            if (onSuccess) onSuccess(credited);
            try { popup?.close(); } catch (_) { /* popup may be cross-origin */ }
            return;
          }
          if (s.failed) throw new Error(es ? "El pago falló o expiró." : "Payment failed or expired.");
          if (popup && popup.closed) {
            // User closed the popup — give up polling silently.
            return;
          }
        } catch (pollErr) {
          // Transient poll failure — keep trying until maxWait.
          void pollErr;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(es ? `No se pudo abrir el pago: ${msg}` : `Could not open payment: ${msg}`);
      try { popup?.close(); } catch (_) { /* ignore */ }
    } finally {
      setNpFallbackPackageId(null);
    }
  };

  const handleFundForPackage = async (pkg: TokenPackage) => {
    if (!activeWallet) return;
    const price = Number(pkg.usd);
    setError(null);
    try {
      await addFunds({
        destination: {
          address: activeWallet.address,
          chain: BASE_CAIP2,
          asset: USDC_BASE_ADDRESS,
        },
        fiat: { defaultAmount: Math.max(15, price).toFixed(0) },
      });
      refreshBalance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel|closed|reject/i.test(msg)) return;
      setError(es ? `No se pudo abrir el pago: ${msg}` : `Could not open payment: ${msg}`);
    }
  };

  const handleRedeemCode = async () => {
    const trimmedCode = activationCode.trim();
    if (!trimmedCode) {
      setActivationError(es ? "Ingresa tu código de activación." : "Enter your activation code.");
      return;
    }
    setActivationError(null); setActivationLoading(true);
    try {
      const res = await activateTokenCode({ activationCode: trimmedCode });
      if (!res.ok) {
        setActivationError(es ? "Código no válido o ya usado." : "Invalid or already-used code.");
      } else {
        setActivationSuccess(res.tokensCredited);
        if (onSuccess) onSuccess(res.newBalance);
      }
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : (es ? "Error al canjear el código." : "Failed to redeem code."));
    } finally {
      setActivationLoading(false);
    }
  };

  const eligiblePackages = packages.filter((p) => Number(p.usd) >= 1);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={es ? "Comprar Ru$h" : "Buy Ru$h"}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        style={{ background: "rgba(19,16,26,0.98)", border: "1px solid rgba(16,185,129,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">💎</span>
            <p className="text-base font-bold text-white">{es ? "Comprar Ru$h" : "Buy Ru$h"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={es ? "Cerrar" : "Close"}
            className="w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition flex items-center justify-center text-lg"
          >
            ×
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Hero — one-off marketing pitch shared with every other checkout surface. */}
          <WalletCheckoutHero lang={t.lang as "es" | "en"} compact />

          {/* Wallet switcher — only visible when >1 wallet is connected so
              users with an external Trust/MetaMask holding their funds can
              pick it instead of the empty embedded default. */}
          {authenticated && wallets.length > 1 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50 px-1 pb-1">
                {es ? "Cambiar billetera" : "Switch wallet"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {wallets.map((w) => {
                  const isActive = w.address === activeAddress;
                  const label = w.walletClientType === "privy"
                    ? "PNPtv"
                    : w.walletClientType === "metamask"
                      ? "MetaMask"
                      : w.walletClientType === "coinbase_wallet"
                        ? "Coinbase"
                        : w.walletClientType || "External";
                  return (
                    <button
                      key={w.address}
                      type="button"
                      onClick={() => setActiveAddress(w.address)}
                      className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition ${
                        isActive
                          ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                          : "bg-white/[0.04] text-white/70 border border-white/10 hover:bg-white/[0.08]"
                      }`}
                    >
                      {label} · {w.address.slice(0, 5)}…{w.address.slice(-3)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Wallet state summary + rail picker. USDC or ETH — both on Base.
              Shows live balance for the picked rail; ETH also shows spot USD. */}
          {authenticated && activeWallet ? (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/[0.06] p-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(52,211,153,0.15)" }}>
                  <span className="text-lg leading-none">💳</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                    {es ? "Pagar con" : "Pay with"}
                  </p>
                  <p className="text-sm font-bold text-white tabular-nums">
                    {walletLoading
                      ? (es ? "Consultando…" : "Checking…")
                      : rail === "usdc"
                        ? (walletUsdc == null ? (es ? "Sin saldo USDC" : "No USDC balance") : `${walletUsdc.toFixed(2)} USDC · Base`)
                        : (walletEth == null
                            ? (es ? "Sin saldo ETH" : "No ETH balance")
                            : `${walletEth.toFixed(6)} ETH · Base${ethUsdPrice ? ` · $${(walletEth * ethUsdPrice).toFixed(2)}` : ""}`)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setRail("usdc")}
                  className={`text-xs font-semibold px-2 py-2 rounded-lg transition ${
                    rail === "usdc"
                      ? "bg-emerald-500/25 text-emerald-100 border border-emerald-500/50"
                      : "bg-white/[0.04] text-white/70 border border-white/10 hover:bg-white/[0.08]"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#2775ca] text-white text-[9px] font-bold flex items-center justify-center">$</span>
                    USDC
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRail("eth")}
                  disabled={!ethUsdPrice}
                  className={`text-xs font-semibold px-2 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed ${
                    rail === "eth"
                      ? "bg-indigo-500/25 text-indigo-100 border border-indigo-500/50"
                      : "bg-white/[0.04] text-white/70 border border-white/10 hover:bg-white/[0.08]"
                  }`}
                >
                  Ξ ETH
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
              <p className="text-sm font-semibold text-white mb-2">
                {es ? "Crea tu billetera para continuar" : "Create your wallet to continue"}
              </p>
              <p className="text-[11px] text-white/60 mb-3 leading-snug">
                {es
                  ? "Una billetera integrada gratuita te permite comprar Ru$h con tarjeta y usarlo en toda la app."
                  : "A free embedded wallet lets you buy Ru$h with your card and spend it anywhere on the app."}
              </p>
              <button
                type="button"
                onClick={() => login()}
                className="min-h-[44px] px-6 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
              >
                {es ? "Crear billetera" : "Create wallet"}
              </button>
            </div>
          )}

          {/* Error / success */}
          {error && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
              +{success.tokens.toLocaleString()} Ru$h 💎 {es ? "acreditados" : "credited"}
            </div>
          )}

          {/* Custom amount — user types any USD value ($1–$500) and gets flat
              6 Ru$h per USD. Overrides preset packages. Pays via the selected
              rail (USDC or ETH) from the wallet balance. */}
          {authenticated && activeWallet && (() => {
            const usd = Number(customUsd);
            const validUsd = isFinite(usd) && usd >= 1 && usd <= 5000;
            const tokens = validUsd ? Math.round(usd * 6) : 0;
            const ethNeeded = validUsd && ethUsdPrice ? usd / ethUsdPrice : 0;
            const canAffordCustom = validUsd && (
              rail === "usdc"
                ? (walletUsdc != null && walletUsdc + 1e-9 >= usd)
                : (walletEth != null && ethUsdPrice && walletEth + 1e-12 >= ethNeeded)
            );
            const disabledCustom = payingCustom || success !== null || !validUsd || !canAffordCustom;

            // "Max" — pins the amount to spend the full balance on the selected
            // rail. For ETH, reserves a dust for gas on external wallets only
            // (embedded gets gas sponsored). Both rails clamp to the $5000
            // server cap and to 2-decimal precision to survive JSON round-trip.
            const gasReserveEth = 0.00005;
            const maxAvailableUsd = rail === "usdc"
              ? (walletUsdc ?? 0)
              : (walletEth != null && ethUsdPrice ? Math.max(0, walletEth - gasReserveEth) * ethUsdPrice : 0);
            const maxSpendableUsd = Math.min(5000, Math.floor(maxAvailableUsd * 100) / 100);
            const maxEnabled = maxSpendableUsd >= 1 && !payingCustom && !success;
            const willHitCap = maxAvailableUsd > 5000 + 0.01;

            return (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                  {es ? "Monto personalizado" : "Custom amount"}
                </p>
                <div className="flex gap-2 items-center">
                  <span className="text-lg text-white/70">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customUsd}
                    onChange={(e) => {
                      const v = e.target.value.replace(",", ".");
                      if (v === "" || /^\d*\.?\d*$/.test(v)) { setCustomUsd(v); setError(null); }
                    }}
                    placeholder="0.00"
                    className="flex-1 min-w-0 text-base font-semibold tabular-nums px-2 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/50"
                  />
                  <span className="text-[11px] text-white/50 font-semibold">USD</span>
                  <button
                    type="button"
                    onClick={() => { setCustomUsd(maxSpendableUsd.toFixed(2)); setError(null); }}
                    disabled={!maxEnabled}
                    className="text-[11px] font-semibold px-2.5 py-2 rounded-lg bg-white/[0.08] text-white/85 hover:bg-white/[0.14] transition min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Max
                  </button>
                </div>
                <p className="text-[11px] text-white/60 min-h-[16px]">
                  {validUsd ? (
                    <>
                      → <span className="font-semibold text-white">{tokens.toLocaleString()} Ru$h 💎</span>
                      {rail === "eth" && ethUsdPrice ? (
                        <span className="text-white/50"> · ≈ {ethNeeded.toFixed(6)} ETH</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-white/40">
                      {es ? "Entre $1 y $5000. 6 Ru$h por USD." : "Between $1 and $5000. 6 Ru$h per USD."}
                    </span>
                  )}
                </p>
                {willHitCap && (
                  <p className="text-[10px] text-amber-300/80">
                    {es
                      ? `Max limitado a $5000 (tu saldo cubre $${maxAvailableUsd.toFixed(2)}).`
                      : `Max capped at $5000 (your balance covers $${maxAvailableUsd.toFixed(2)}).`}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleCustomPay}
                  disabled={disabledCustom}
                  className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: disabledCustom
                      ? "#333"
                      : rail === "eth"
                        ? "linear-gradient(135deg,#7B61FF,#3B82F6)"
                        : "linear-gradient(135deg,#10b981,#059669)",
                  }}
                >
                  {payingCustom
                    ? (es ? "Firmando…" : "Signing…")
                    : validUsd
                      ? canAffordCustom
                        ? (rail === "eth"
                            ? `Ξ ${es ? "Pagar" : "Pay"} ${ethNeeded.toFixed(6)} ETH`
                            : `${es ? "Pagar" : "Pay"} $${usd.toFixed(2)} USDC`)
                        : (es ? "Saldo insuficiente" : "Insufficient balance")
                      : (es ? "Ingresa un monto" : "Enter an amount")}
                </button>
              </div>
            );
          })()}

          {/* Package grid — pick a preset Ru$h pack (bonus tiers). When wallet
              has enough on the selected rail we sign a direct transfer. USDC-
              only path falls back to Privy's card onramp for a zero-balance user. */}
          {authenticated && activeWallet && (
            <div>
              <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide mb-2">
                {es ? "O elige un paquete (con bono)" : "Or pick a package (with bonus)"}
              </p>
              {loadingPackages ? (
                <p className="text-xs text-white/40 text-center py-6">{es ? "Cargando paquetes…" : "Loading packages…"}</p>
              ) : eligiblePackages.length === 0 ? (
                <p className="text-xs text-white/40 text-center py-6">
                  {es ? "No hay paquetes disponibles." : "No packages available."}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {eligiblePackages.map((pkg) => {
                    const price = Number(pkg.usd);
                    const ethNeeded = ethUsdPrice ? price / ethUsdPrice : 0;
                    const canAfford = rail === "usdc"
                      ? (walletUsdc != null && walletUsdc >= price)
                      : (walletEth != null && ethUsdPrice != null && walletEth >= ethNeeded);
                    const isPaying = payingPackageId === pkg.id;
                    const disabled = isPaying || success !== null;
                    // Card fallback is USDC-only (Privy Stripe onramp lands USDC).
                    const onClick = () => canAfford
                      ? handleWalletPay(pkg)
                      : rail === "usdc" ? handleFundForPackage(pkg) : undefined;
                    const subLabel = isPaying
                      ? (es ? "Firmando…" : "Signing…")
                      : canAfford
                        ? (rail === "eth"
                            ? `Ξ ${ethNeeded.toFixed(6)} ETH`
                            : `${es ? "Pagar" : "Pay"} $${price.toFixed(2)}`)
                        : rail === "usdc"
                          ? `$${price.toFixed(0)} · ${es ? "Tarjeta" : "Card"}`
                          : (es ? "Sin ETH" : "Not enough ETH");
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        disabled={disabled}
                        onClick={onClick}
                        className={`flex flex-col items-start gap-1 px-3 py-3 rounded-lg border text-left transition ${
                          disabled
                            ? "border-white/10 bg-white/[0.03] opacity-50 cursor-not-allowed"
                            : canAfford
                              ? "border-emerald-400/40 bg-emerald-500/8 hover:bg-emerald-500/15 active:scale-[0.98]"
                              : "border-pink-400/40 bg-pink-500/8 hover:bg-pink-500/15 active:scale-[0.98]"
                        }`}
                      >
                        <span className="text-sm font-bold text-white leading-tight">
                          {Number(pkg.tokens).toLocaleString()} Ru$h 💎
                        </span>
                        <span className={`text-[10px] leading-none ${canAfford ? "text-white/70" : "text-pink-300"}`}>
                          {subLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-white/40 mt-2 text-center">
                {es
                  ? "1 USD = 6 Ru$h (base). Los paquetes grandes incluyen bono."
                  : "1 USD = 6 Ru$h (base). Larger packs include a bonus."}
              </p>

              {/* Alt-coin path — pay in USDC (Ethereum), Bitcoin, or Ethereum
                  via a hosted NowPayments invoice. Restricted to these three
                  for token top-ups per product policy; opens a centered popup
                  (NP can't be iframed) and polls until webhook credits Ru$h. */}
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-[11px] font-semibold text-white/70 text-center mb-2">
                  {es ? "O paga con cripto externa" : "Or pay with external crypto"}
                </p>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {([
                    { id: 'usdcerc20' as NpCoin, label: 'USDC', tint: 'text-[#2775ca]' },
                    { id: 'btc' as NpCoin,       label: 'BTC',  tint: 'text-[#F7931A]' },
                    { id: 'eth' as NpCoin,       label: 'ETH',  tint: 'text-[#627EEA]' },
                  ]).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNpCoin(c.id)}
                      className={`text-xs font-bold py-2 rounded-lg border transition ${
                        npCoin === c.id
                          ? "bg-orange-500/20 border-orange-400/60 text-orange-100"
                          : "bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]"
                      }`}
                    >
                      <span className={c.tint}>●</span> {c.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {eligiblePackages.map((pkg) => {
                    const price = Number(pkg.usd);
                    const isPaying = npFallbackPackageId === pkg.id;
                    const disabled = isPaying || success !== null || npFallbackPackageId !== null;
                    const coinLabel = npCoin === 'usdcerc20' ? 'USDC' : npCoin === 'btc' ? 'BTC' : 'ETH';
                    return (
                      <button
                        key={`np-${pkg.id}`}
                        type="button"
                        disabled={disabled}
                        onClick={() => handlePayWithNowPayments(pkg)}
                        className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border border-orange-400/30 bg-orange-500/[0.06] text-left transition hover:bg-orange-500/[0.12] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="text-[11px] font-semibold text-white/85 leading-tight">
                          {Number(pkg.tokens).toLocaleString()} Ru$h 💎
                        </span>
                        <span className="text-[9px] text-white/60 leading-none">
                          {isPaying
                            ? (es ? "Abriendo…" : "Opening…")
                            : `$${price.toFixed(0)} · ${coinLabel} ▸`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Activation-code redemption — collapsed. Users only reach this when
              they were given a code out-of-band (support top-up, legacy card
              path, or partner promo). Not advertised as a purchase route. */}
          <div className="border-t border-white/5 pt-3">
            <button
              type="button"
              onClick={() => setActivationExpanded((v) => !v)}
              className="w-full text-center text-xs text-white/50 hover:text-white/80 transition py-1"
            >
              {es ? "¿Tienes un código de activación?" : "Have an activation code?"}
              <span
                className="ml-1 inline-block transition-transform"
                style={{ transform: activationExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
              >▾</span>
            </button>

            {activationExpanded && (
              <div className="mt-2 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                {activationSuccess != null ? (
                  <p className="text-xs font-semibold text-emerald-300 text-center py-2">
                    +{activationSuccess.toLocaleString()} Ru$h 💎 {es ? "acreditados" : "credited"}
                  </p>
                ) : (
                  <>
                    <input
                      type="text"
                      value={activationCode}
                      onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                      placeholder={es ? "Código (ej: RUSH-XXXX-XXXX)" : "Code (e.g. RUSH-XXXX-XXXX)"}
                      className="w-full px-3 py-2 mb-2 rounded-md text-sm font-mono uppercase tracking-wide bg-white/[0.06] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/50"
                    />
                    {activationError && (
                      <p className="text-[11px] text-red-300 mb-2">{activationError}</p>
                    )}
                    <button
                      type="button"
                      disabled={activationLoading || !activationCode.trim()}
                      onClick={handleRedeemCode}
                      className="w-full py-2 rounded-md text-sm font-bold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                    >
                      {activationLoading ? (es ? "Canjeando…" : "Redeeming…") : (es ? "Canjear código" : "Redeem code")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <p className="text-[10px] text-white/40 leading-relaxed text-center pt-1">
            {es
              ? "Solo tu billetera puede firmar transacciones. PNPtv nunca tiene acceso a tus fondos."
              : "Only your wallet can sign transactions. PNPtv never has access to your funds."}
          </p>
        </div>
      </div>
    </div>
  );
}
