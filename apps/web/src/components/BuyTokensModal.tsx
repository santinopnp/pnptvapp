import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import {
  getTokenPackages,
  initiateWalletCheckout,
  verifyWalletCheckoutTx,
  getWalletUsdcBalance,
  activateTokenCode,
  type TokenPackage,
} from "@/lib/api";
import { usePrivy, useWallets, useAddFunds } from "@privy-io/react-auth";
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
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0] || null;

  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  const [walletUsdc, setWalletUsdc] = useState<number | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [payingPackageId, setPayingPackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tokens: number } | null>(null);

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

  // Load USDC balance on open + when wallet changes
  useEffect(() => {
    if (!isOpen || !authenticated || !embeddedWallet) { setWalletUsdc(null); return; }
    setWalletLoading(true);
    getWalletUsdcBalance()
      .then((r) => setWalletUsdc(r.hasWallet ? r.usdc : null))
      .catch(() => setWalletUsdc(null))
      .finally(() => setWalletLoading(false));
  }, [isOpen, authenticated, embeddedWallet?.address]);

  if (!isOpen) return null;

  const refreshBalance = () => {
    if (!authenticated || !embeddedWallet) return;
    getWalletUsdcBalance().then((r) => setWalletUsdc(r.hasWallet ? r.usdc : null)).catch(() => {});
  };

  const handleWalletPay = async (pkg: TokenPackage) => {
    if (!embeddedWallet) return;
    const price = Number(pkg.usd);
    setError(null); setPayingPackageId(pkg.id);
    try {
      const intent = await initiateWalletCheckout({
        rail: "usdc",
        surface: "rush",
        amountUsd: price,
        entitlementSpec: { tokens: Number(pkg.tokens), packageId: pkg.id },
        metadata: { source: "buy_tokens_modal", packageId: pkg.id },
      });
      if (!intent.receivingAddress || !intent.amountUsdc) throw new Error("intent_missing_fields");

      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: base, transport: custom(provider),
      });
      const data = encodeFunctionData({
        abi: USDC_TRANSFER_ABI, functionName: "transfer",
        args: [intent.receivingAddress as `0x${string}`, parseUnits(intent.amountUsdc.toFixed(6), 6)],
      });
      const txHash = await walletClient.sendTransaction({
        to: USDC_BASE_ADDRESS as `0x${string}`, data, value: 0n,
      });
      const verified = await verifyWalletCheckoutTx(intent.intentId, txHash);
      if (!verified.ok) throw new Error(verified.reason || "verify_failed");
      const credited = verified.rushCredited ?? Number(pkg.tokens);
      setSuccess({ tokens: credited });
      refreshBalance();
      if (onSuccess) onSuccess(credited);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/User rejected|user denied|cancel/i.test(msg)
        ? (es ? "Cancelaste la transacción." : "You cancelled the transaction.")
        : msg);
    } finally { setPayingPackageId(null); }
  };

  const handleFundForPackage = async (pkg: TokenPackage) => {
    if (!embeddedWallet) return;
    const price = Number(pkg.usd);
    setError(null);
    try {
      await addFunds({
        destination: {
          address: embeddedWallet.address,
          chain: BASE_CAIP2,
          asset: USDC_BASE_ADDRESS,
        },
        fiat: { defaultAmount: price.toFixed(0) },
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

  const eligiblePackages = packages.filter((p) => Number(p.usd) >= 30);

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

          {/* Wallet state summary */}
          {authenticated && embeddedWallet ? (
            <div
              className="rounded-xl border border-emerald-400/40 bg-emerald-500/[0.06] px-3 py-2 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "rgba(52,211,153,0.15)" }}>
                <span className="text-lg leading-none">💳</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">
                  {es ? "Tu billetera" : "Your wallet"}
                </p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {walletLoading
                    ? (es ? "Consultando…" : "Checking…")
                    : walletUsdc == null
                      ? (es ? "Sin saldo USDC" : "No USDC balance")
                      : `${walletUsdc.toFixed(2)} USDC · Base`}
                </p>
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

          {/* Package grid — pick a Ru$h pack. When wallet has enough USDC we
              sign a direct transfer. Otherwise we open Privy's fund modal with
              the exact amount preselected so the user pays with card / Apple /
              Google Pay in a single step. */}
          {authenticated && embeddedWallet && (
            <div>
              <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide mb-2">
                {es ? "Elige un paquete" : "Choose a package"}
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
                    const canAfford = walletUsdc != null && walletUsdc >= price;
                    const isPaying = payingPackageId === pkg.id;
                    const disabled = isPaying || success !== null;
                    const onClick = () => canAfford ? handleWalletPay(pkg) : handleFundForPackage(pkg);
                    const subLabel = isPaying
                      ? (es ? "Firmando…" : "Signing…")
                      : canAfford
                        ? `${es ? "Pagar" : "Pay"} $${price.toFixed(2)}`
                        : `$${price.toFixed(0)} · ${es ? "Tarjeta" : "Card"}`;
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
