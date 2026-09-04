import React, { useState, useEffect, useRef, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { BuyTokensModal } from "@/components/BuyTokensModal";
import { usePrivy, useWallets, useAddFunds, useConnectWallet } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits, parseEther } from "viem";
import { base } from "viem/chains";
import { getPreferredWallet, setPreferredWallet, walletTypeLabel, WalletTypeIcon } from "@/components/payments/PayInWalletChips";

// CAIP-2 chain id for Base — used by Privy's useAddFunds destination.
const BASE_CAIP2 = "eip155:8453" as const;
const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
import {
  getSubscriptionPlans,
  getWalletBalance,
  paySubscriptionWithTokens,
  getLabelColor,
  createCryptoPaymentIntent,
  recordCryptoTx,
  getCryptoPaymentStatus,
  requestGasTopup,
  reportWalletClientError,
  type SubscriptionPlan,
} from "@/lib/api";

const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = [{
  name: "transfer",
  type: "function" as const,
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}];

function fmtPrice(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function durationLabel(days: number) {
  if (days >= 36500) return "Lifetime";
  const y = Math.round(days / 365);
  if (days >= 365) return `${y} ${y === 1 ? "Year" : "Years"}`;
  const m = Math.round(days / 30);
  if (days >= 30) return `${m} ${m === 1 ? "Month" : "Months"}`;
  return `${days}d`;
}

function planTierLabel(plan: SubscriptionPlan): "PRIME" | "BASIC" {
  return (plan.tier || "").toLowerCase() === "member" ? "BASIC" : "PRIME";
}

const HIDDEN_PLAN_IDS = new Set(["prime-trial-3d"]);

type PayStatus = "idle" | "creating" | "signing" | "waiting" | "done" | "error";

export default function Donate() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const t = useI18n();
  const es = t.lang === "es";

  // ── Plans ───────────────────────────────────────────────────────────────
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // ── ETH price ───────────────────────────────────────────────────────────
  const [ethPrice, setEthPrice] = useState<number | null>(null);

  // ── Privy ───────────────────────────────────────────────────────────────
  const { ready: privyReady, authenticated: privyAuthed, login: privyLogin } = usePrivy();
  const { wallets } = useWallets();
  const { addFunds } = useAddFunds();
  const [connectError, setConnectError] = useState<string | null>(null);
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      setConnectError(null);
      if (wallet?.address) {
        setPreferredWallet(wallet.address);
        setPreferredAddr(wallet.address);
      }
    },
    onError: (err) => {
      const msg = typeof err === "string" ? err : String(err);
      if (/exited|closed|cancel|reject/i.test(msg)) return;
      setConnectError(es
        ? "No se pudo conectar la wallet. Intenta de nuevo."
        : "Could not connect wallet. Please try again.");
    },
  });
  // Preferred wallet: user's explicit choice (WalletHomeSheet writes this).
  // Fallback = embedded then first external. Never silently override.
  const [preferredAddr, setPreferredAddr] = useState<string | null>(() => getPreferredWallet());
  const setPreferred = (addr: string) => {
    setPreferredWallet(addr);
    setPreferredAddr(addr);
  };
  const preferredWallet = preferredAddr ? wallets.find((w) => w.address === preferredAddr) : null;
  const activeWallet = preferredWallet
    || wallets.find((w) => w.walletClientType === "privy")
    || wallets[0]
    || null;
  const isEmbedded = activeWallet?.walletClientType === "privy";
  const walletAddress = activeWallet?.address || null;

  // Guard state setters after unmount (poller runs on interval).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Per-plan payment state ───────────────────────────────────────────────
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState<"USDC" | "ETH" | null>(null);
  const [payStatus, setPayStatus] = useState<PayStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Token wallet ─────────────────────────────────────────────────────────
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [showBuyTokens, setShowBuyTokens] = useState(false);
  const [submittingRush, setSubmittingRush] = useState(false);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  useEffect(() => {
    getSubscriptionPlans()
      .then((res) => { if (res.success) setPlans(res.plans); })
      .catch(() => {})
      .finally(() => setPlansLoading(false));

    // Fetch ETH/USD price for display
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
      .then((r) => r.json())
      .then((d) => setEthPrice(d?.ethereum?.usd || null))
      .catch(() => {});

    if (user) {
      getWalletBalance()
        .then((r) => { if (r.success) setTokenBalance(r.balance); })
        .catch(() => {});
    }
  }, [user]);

  // ── Wallet pay (USDC or ETH via Privy) ──────────────────────────────────
  const handleWalletPay = useCallback(async (plan: SubscriptionPlan, token: "USDC" | "ETH") => {
    // If not connected to Privy at all, open login flow
    if (!privyAuthed || !activeWallet) {
      privyLogin();
      return;
    }

    setActivePlanId(plan.id);
    setActiveToken(token);
    setPayStatus("creating");
    setPayError(null);
    setTxHash(null);
    stopPoll();

    try {
      // Backend computes native amount server-side (USDC=USD, ETH=USD/ethOracle).
      // If ETH oracle is down, backend returns 503 and we surface it here.
      const intent = await createCryptoPaymentIntent({ planId: plan.id, token });
      setPayStatus("signing");

      const provider = await activeWallet.getEthereumProvider();
      const walletAddr = activeWallet.address as `0x${string}`;
      const client = createWalletClient({ account: walletAddr, chain: base, transport: custom(provider as any) });

      // Gas topup only makes sense for Privy embedded wallets (external wallets
      // like Trust/MetaMask already have their own ETH balance). External also
      // skips the treasury cap entirely.
      if (isEmbedded) {
        await requestGasTopup(walletAddr);
      }

      let hash: string;
      if (token === "USDC") {
        const amount = parseUnits(intent.amountNative.toFixed(6), 6);
        const data = encodeFunctionData({ abi: USDC_ABI, functionName: "transfer", args: [intent.receivingAddress as `0x${string}`, amount] });
        hash = await client.sendTransaction({ account: walletAddr, chain: base, to: USDC_CONTRACT as `0x${string}`, data, value: 0n });
      } else {
        // Use backend-locked ETH amount — never derive from a client-side price feed
        const ethAmount = parseEther(intent.amountNative.toFixed(10));
        hash = await client.sendTransaction({ account: walletAddr, chain: base, to: intent.receivingAddress as `0x${string}`, value: ethAmount });
      }

      setTxHash(hash);

      // Record tx hash server-side so webhook can primary-match it. If this
      // POST fails, the on-chain tx has already been sent — surface the
      // failure so the user knows to contact support rather than silently
      // ending up unconfirmable.
      try {
        await recordCryptoTx(intent.paymentId, hash, activeWallet.address);
      } catch (recErr: any) {
        stopPoll(); setPayStatus("error");
        setPayError(
          (es ? "Transacción enviada pero no se pudo registrar. Guarda este hash: " : "Transaction sent but recording failed. Save this hash: ")
          + hash
        );
        reportWalletClientError("donateRecordTxFailed", recErr, {
          surface: "donate", planId: plan.id, token, txHash: hash,
          paymentId: intent.paymentId, address: activeWallet?.address,
          walletType: activeWallet?.walletClientType,
        });
        return;
      }

      setPayStatus("waiting");

      // Absolute polling deadline — without this, a stuck backend / provider
      // status of "pending" would poll every 4s forever until the tab is
      // closed. Base txs finalize in ~10s; 5 min covers the worst case.
      const pollDeadline = Date.now() + 5 * 60 * 1000;
      pollRef.current = setInterval(async () => {
        if (!mountedRef.current) { stopPoll(); return; }
        if (Date.now() > pollDeadline) {
          stopPoll();
          if (mountedRef.current) {
            setPayStatus("error");
            setPayError(
              (es
                ? "Se agotó el tiempo esperando confirmación. Guarda este hash y contáctanos: "
                : "Timed out waiting for confirmation. Save this hash and contact us: ") + hash
            );
          }
          return;
        }
        try {
          const s = await getCryptoPaymentStatus(intent.paymentId);
          if (!mountedRef.current) return;
          if (s.status === "confirmed") {
            stopPoll(); setPayStatus("done");
            await refreshUser();
            if (mountedRef.current) setTimeout(() => { if (mountedRef.current) setPaymentSuccess(true); }, 500);
          } else if (s.status === "expired" || s.status === "failed") {
            stopPoll(); setPayStatus("error");
            setPayError(es ? "Pago expirado o fallido." : "Payment expired or failed.");
          }
        } catch { /* keep polling */ }
      }, 4000);
    } catch (err: any) {
      stopPoll(); setPayStatus("error");
      const msg = err?.shortMessage || err?.message || (es ? "Error en transacción." : "Transaction failed.");
      setPayError(msg);
      const isCancel = /User rejected|user denied|cancel/i.test(String(msg));
      if (!isCancel) {
        reportWalletClientError("donateWalletPay", err, {
          surface: "donate", planId: plan.id, token,
          address: activeWallet?.address, walletType: activeWallet?.walletClientType,
        });
      }
    }
  }, [privyAuthed, activeWallet, isEmbedded, privyLogin, stopPoll, es, refreshUser]);

  const resetPay = useCallback(() => {
    stopPoll(); setPayStatus("idle"); setActivePlanId(null); setActiveToken(null); setPayError(null); setTxHash(null);
  }, [stopPoll]);

  // ── Ru$h pay ─────────────────────────────────────────────────────────────
  const handleRushPay = useCallback(async (plan: SubscriptionPlan) => {
    const cost = Math.round(parseFloat(String(plan.price)) * 6);
    if (tokenBalance !== null && tokenBalance < cost) {
      setActivePlanId(plan.id);
      setActiveToken(null);
      setPayStatus("error");
      setPayError(es ? `Ru$h insuficiente. Tienes ${tokenBalance.toLocaleString()}, necesitas ${cost.toLocaleString()}.` : `Not enough Ru$h. You have ${tokenBalance?.toLocaleString() ?? 0}, need ${cost.toLocaleString()}.`);
      return;
    }
    setActivePlanId(plan.id);
    setActiveToken(null);
    setPayStatus("creating");
    setPayError(null);
    setSubmittingRush(true);
    try {
      const result = await paySubscriptionWithTokens(plan.id);
      if (!result.success) {
        setPayStatus("error");
        setPayError(result.error || "Failed.");
        return;
      }
      if (result.newBalance !== undefined) setTokenBalance(result.newBalance);
      setPayStatus("done");
      await refreshUser();
      setTimeout(() => setPaymentSuccess(true), 400);
    } catch (err: any) {
      setPayStatus("error");
      setPayError(err.message || "Error.");
    } finally {
      setSubmittingRush(false);
    }
  }, [tokenBalance, es, refreshUser]);

  // ── Success screen ────────────────────────────────────────────────────────
  if (paymentSuccess) {
    return (
      <div className="min-h-dvh bg-pnp-background flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center space-y-4 py-12">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-pnp-textPrimary">{es ? "¡Pago confirmado!" : "Payment confirmed!"}</h2>
          <p className="text-sm text-pnp-textSecondary">{es ? "Tu suscripción ya está activa." : "Your subscription is now active."}</p>
          <button onClick={() => navigate("/")} className="mt-4 px-6 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}>
            {es ? "Ir al inicio" : "Go home"}
          </button>
        </div>
      </div>
    );
  }

  const visiblePlans = plans.filter((p) => !HIDDEN_PLAN_IDS.has(p.id));

  return (
    <>
      <Helmet><title>Wallet Sandbox · PNPtv!</title></Helmet>

      <div className="min-h-dvh bg-pnp-background pb-20">

        {/* Sandbox banner */}
        <div className="sticky top-0 z-10 px-4 py-2 flex items-center gap-2 text-xs font-bold" style={{ background: "rgba(123,97,255,0.12)", borderBottom: "1px solid rgba(123,97,255,0.25)" }}>
          <span className="text-[#7B61FF]">🧪</span>
          <span className="text-[#7B61FF]">{es ? "Sandbox · Wallet embebida (pruebas)" : "Sandbox · Embedded wallet testing"}</span>
        </div>

        <div className="px-4 py-6 max-w-2xl mx-auto space-y-8">

          {/* ── WALLET STATUS ──────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-[#7B61FF]/30 bg-[#7B61FF]/8 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${privyAuthed && walletAddress ? "bg-green-400" : "bg-white/20"}`} />
                <div>
                  <p className="text-xs font-bold text-pnp-textPrimary">
                    {privyAuthed && walletAddress ? (es ? "Wallet conectada" : "Wallet connected") : (es ? "Sin wallet" : "No wallet")}
                  </p>
                  {walletAddress && (
                    <p className="text-[10px] font-mono text-pnp-textSecondary">{walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</p>
                  )}
                </div>
              </div>
              {privyReady && !privyAuthed ? (
                <button onClick={privyLogin} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#7B61FF] hover:bg-[#8B71FF] transition-all active:scale-95">
                  {es ? "Crear / conectar wallet" : "Create / connect wallet"}
                </button>
              ) : privyAuthed && walletAddress ? (
                <button
                  onClick={() => addFunds({
                    destination: { address: walletAddress, chain: BASE_CAIP2, asset: USDC_BASE_ADDRESS },
                    fiat: { defaultAmount: "20" },
                  }).catch(() => {})}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-[#7B61FF] border border-[#7B61FF]/40 hover:bg-[#7B61FF]/10 transition-all"
                >
                  {es ? "Añadir USDC" : "Add USDC"}
                </button>
              ) : null}
            </div>

            {/* Wallet picker + connect-external — parity with 💎 FAB so a
                subscriber can pay from Trust/MetaMask instead of the embedded
                PNPtv wallet. Choice persists across pages via preferred key. */}
            {privyAuthed && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
                {wallets.length > 1 && (
                  <span className="text-[9px] uppercase tracking-wide text-white/50 font-semibold pr-1">
                    {es ? "Pagar desde:" : "Pay from:"}
                  </span>
                )}
                {wallets.map((w) => {
                  const isActive = activeWallet?.address === w.address;
                  const label = walletTypeLabel(w.walletClientType);
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
                      <span>{label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { setConnectError(null); try { connectWallet(); } catch { /* swallow — onError handles surface */ } }}
                  className="text-[10px] font-semibold px-2 py-1 rounded-md border border-dashed border-white/20 text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition"
                >
                  + {es ? "Conectar Trust / MetaMask" : "Connect Trust / MetaMask"}
                </button>
              </div>
            )}
            {connectError && (
              <p className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1.5">
                {connectError}
              </p>
            )}

            {ethPrice && (
              <p className="text-[10px] text-pnp-textSecondary/60">
                ETH ≈ {fmtPrice(ethPrice)} · Base network · 1 Ru$h = $0.17 USD
              </p>
            )}
          </div>

          {/* ── PLAN SELECTION ─────────────────────────────────────────────── */}
          <section>
            <SectionHeader n={1} label={es ? "Elige tu plan" : "Choose your plan"} />

            {plansLoading ? (
              <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />)}</div>
            ) : (
              <div className="space-y-3">
                {visiblePlans.map((plan) => {
                  const label = planTierLabel(plan);
                  const planDays = plan.duration_days || plan.duration || 30;
                  const price = parseFloat(String(plan.price));
                  const rushCost = Math.round(price * 6);
                  const ethCost = ethPrice ? (price / ethPrice).toFixed(5) : null;
                  const isThisPlan = activePlanId === plan.id;
                  const busy = isThisPlan && (payStatus === "creating" || payStatus === "signing" || payStatus === "waiting");
                  const notConnected = !privyAuthed || !activeWallet;

                  return (
                    <div key={plan.id} className="rounded-2xl border border-white/10 bg-pnp-surface overflow-hidden">
                      {/* Plan header */}
                      <div className="p-4 pb-3">
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-pnp-textPrimary">{plan.display_name || plan.name}</span>
                              <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getLabelColor(label)}`}>{label}</span>
                            </div>
                            <span className="text-xs text-pnp-textSecondary">{durationLabel(planDays)}</span>
                          </div>
                          <span className="text-lg font-black text-pnp-textPrimary">{fmtPrice(price)}</span>
                        </div>
                      </div>

                      {/* Status panel (shows when paying this plan) */}
                      {isThisPlan && payStatus !== "idle" && (
                        <div className={`mx-4 mb-3 p-3 rounded-xl border text-[11px] leading-relaxed ${
                          payStatus === "error" ? "border-red-500/30 bg-red-500/8 text-red-300" :
                          payStatus === "done" ? "border-green-500/30 bg-green-500/8 text-green-300" :
                          "border-blue-500/30 bg-blue-500/8 text-blue-200"
                        }`}>
                          <div className="flex items-center gap-2">
                            {payStatus === "creating" && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {payStatus === "signing" && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {payStatus === "waiting" && <span className="w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />}
                            <span>
                              {payStatus === "creating" && (es ? "Creando orden…" : "Creating order…")}
                              {payStatus === "signing" && (es ? "Aprueba en tu wallet…" : "Approve in your wallet…")}
                              {payStatus === "waiting" && (es ? "Confirmando en Base…" : "Confirming on Base…")}
                              {payStatus === "done" && (es ? "¡Pago confirmado!" : "Payment confirmed!")}
                              {payStatus === "error" && (payError || "Error")}
                            </span>
                          </div>
                          {txHash && payStatus === "waiting" && (
                            <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="mt-1 block font-mono text-[10px] underline opacity-70">
                              {txHash.slice(0, 12)}…{txHash.slice(-8)}
                            </a>
                          )}
                          {(payStatus === "error" || payStatus === "done") && (
                            <button onClick={resetPay} className="mt-1.5 underline text-[10px] opacity-70">{es ? "Cerrar" : "Dismiss"}</button>
                          )}
                        </div>
                      )}

                      {/* Wallet-not-connected prompt */}
                      {notConnected && (
                        <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#7B61FF]/30 bg-[#7B61FF]/8">
                          <span className="text-[10px] text-[#A78BFA] flex-1">{es ? "Crea tu wallet para pagar con USDC/ETH" : "Create your wallet to pay with USDC / ETH"}</span>
                          <button onClick={privyLogin} className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white bg-[#7B61FF] hover:bg-[#8B71FF] transition-all active:scale-95">
                            {es ? "Conectar" : "Connect"}
                          </button>
                        </div>
                      )}

                      {/* Payment buttons */}
                      <div className="px-4 pb-4 grid grid-cols-3 gap-2">

                        {/* USDC on Base */}
                        <button
                          disabled={busy}
                          onClick={() => handleWalletPay(plan, "USDC")}
                          className="flex flex-col items-center gap-1 py-3 rounded-xl border border-[#7B61FF]/40 bg-[#7B61FF]/8 hover:bg-[#7B61FF]/15 active:scale-[0.97] transition-all disabled:opacity-50"
                        >
                          <span className="text-base">💜</span>
                          <span className="text-[10px] font-bold text-[#A78BFA]">USDC</span>
                          <span className="text-[9px] text-[#A78BFA]/60">{fmtPrice(price)}</span>
                        </button>

                        {/* ETH on Base */}
                        <button
                          disabled={busy || !ethPrice}
                          onClick={() => handleWalletPay(plan, "ETH")}
                          title={!ethPrice ? (es ? "Precio ETH no disponible" : "ETH price unavailable") : undefined}
                          className="flex flex-col items-center gap-1 py-3 rounded-xl border border-blue-500/40 bg-blue-500/8 hover:bg-blue-500/15 active:scale-[0.97] transition-all disabled:opacity-40"
                        >
                          <span className="text-base">⟠</span>
                          <span className="text-[10px] font-bold text-blue-300">ETH</span>
                          <span className="text-[9px] text-blue-300/60">{ethCost ? `${ethCost} ETH` : (es ? "no disp." : "unavail.")}</span>
                        </button>

                        {/* Ru$h tokens */}
                        <button
                          disabled={submittingRush && isThisPlan}
                          onClick={() => handleRushPay(plan)}
                          className="flex flex-col items-center gap-1 py-3 rounded-xl border border-[#D4007A]/40 bg-[#D4007A]/8 hover:bg-[#D4007A]/15 active:scale-[0.97] transition-all disabled:opacity-40"
                        >
                          <span className="text-base">💎</span>
                          <span className="text-[10px] font-bold text-[#FF69B4]">Ru$h</span>
                          <span className="text-[9px] text-[#FF69B4]/60">{rushCost.toLocaleString()}</span>
                        </button>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── RU$H BALANCE ───────────────────────────────────────────────── */}
          <section>
            <SectionHeader n={2} label={es ? "Tu saldo Ru$h 💎" : "Your Ru$h balance 💎"} />
            <div className="rounded-2xl border border-white/10 bg-pnp-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-pnp-textSecondary mb-0.5">{es ? "Saldo" : "Balance"}</p>
                  <p className="text-3xl font-black text-pnp-textPrimary">{tokenBalance !== null ? tokenBalance.toLocaleString() : "—"} <span className="text-sm font-semibold text-pnp-textSecondary">Ru$h</span></p>
                </div>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.2), rgba(230,145,56,0.2))", border: "1px solid rgba(212,0,122,0.25)" }}>💎</div>
              </div>
              <p className="text-xs text-pnp-textSecondary leading-relaxed mb-4">
                {es ? "Usa Ru$h para planes, tips en vivo y llamadas privadas. 1 USD = 6 Ru$h." : "Use Ru$h for plans, live tips, and private calls. 1 USD = 6 Ru$h."}
              </p>
              <button onClick={() => setShowBuyTokens(true)} className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:scale-[0.98] transition-all" style={{ background: "linear-gradient(90deg, #D4007A, #E69138)" }}>
                {es ? "Comprar Ru$h ⚡💲" : "Buy Ru$h ⚡💲"}
              </button>
            </div>
          </section>

          {/* ── BOOK A CALL ────────────────────────────────────────────────── */}
          <section>
            <SectionHeader n={3} label={es ? "Reservar llamada privada" : "Book a private call"} />
            <div className="rounded-2xl border border-white/10 bg-pnp-surface p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "linear-gradient(135deg, #D4007A, #7B61FF)" }}>🎭</div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-[#1C1C1E]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-pnp-textPrimary">Santino 🏳️‍🌈</p>
                  <p className="text-xs text-pnp-textSecondary">@santinopnp</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[10px] text-green-400 font-medium">{es ? "Disponible" : "Available"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-pnp-textPrimary">$15</p>
                  <p className="text-[10px] text-pnp-textSecondary">/ 30 min</p>
                </div>
              </div>
              <button onClick={() => navigate("/creators")} className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:scale-[0.98] transition-all" style={{ background: "linear-gradient(90deg, #D4007A, #7B61FF)" }}>
                {es ? "Ver creadores y reservar →" : "Browse creators & book →"}
              </button>
            </div>
          </section>

        </div>
      </div>

      <BuyTokensModal isOpen={showBuyTokens} onClose={() => setShowBuyTokens(false)} onSuccess={(b) => setTokenBalance(b)} />
    </>
  );
}

function SectionHeader({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(212,0,122,0.2)" }}>
        <span className="text-[10px] font-black" style={{ color: "#D4007A" }}>{n}</span>
      </div>
      <h2 className="text-sm font-bold text-pnp-textSecondary uppercase tracking-widest">{label}</h2>
    </div>
  );
}
