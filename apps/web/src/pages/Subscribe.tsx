import React, { useState, useEffect, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, Skeleton } from "@pnptv/ui-kit";
import {
  getSubscriptionPlans,
  getPaymentStatus,
  getUsdcAvailable,
  getLabelColor,
  validatePromoCode,
  trackEvent,
  redeemActivationCode,
  assertPaymentUrl,
  getWalletBalance,
  paySubscriptionWithTokens,
  type SubscriptionPlan,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTutorial } from "@/hooks/useTutorial";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { useI18n } from "@/lib/i18n";
import { WalletPayCard, WalletCheckoutHero } from "@/components/payments/PayInWalletChips";

const MEMBER_PLAN_IDS = new Set(["member_monthly"]);
const HIDDEN_PLAN_IDS = new Set(["prime-trial-3d"]);

const RECURRING_PLANS = new Set(["prime-week-pass-7d", "monthly-pass", "prime-diamond-pass-365d"]);

const RECOMMENDED_PLAN = "prime-diamond-pass-365d";

function formatPrice(amount: number, currency: string): string {
  if (currency === "COP") {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(amount);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function PriceDisplay({ amount, className = "" }: { amount: number; className?: string }) {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  const match = formatted.match(/^(\$)(\d+)(\.\d+)?$/);
  if (!match) return <span className={className}>{formatted}</span>;
  const [, symbol, integer, decimal] = match;
  return (
    <span className={`inline-flex items-start leading-none ${className}`}>
      <span className="text-sm font-bold self-start mt-[3px] opacity-80">{symbol}</span>
      <span className="text-2xl font-black tracking-tight">{integer}</span>
      {decimal && <span className="text-sm font-bold self-start mt-[3px] opacity-80">{decimal}</span>}
    </span>
  );
}

function durationLabel(days: number): string {
  if (days >= 36500) return "Lifetime";
  const years = Math.round(days / 365);
  if (days >= 365) return `${years} ${years === 1 ? "Year" : "Years"}`;
  const months = Math.round(days / 30);
  if (days >= 30) return `${months} ${months === 1 ? "Month" : "Months"}`;
  return `${days} ${days === 1 ? "Day" : "Days"}`;
}

function getPlanLabel(plan: SubscriptionPlan, isMemberPlan: boolean): 'PRIME' | 'BASIC' | 'FREE' {
  if (plan.tier) {
    const t = plan.tier.toLowerCase();
    if (t === 'prime') return 'PRIME';
    if (t === 'member') return 'BASIC';
  }
  return isMemberPlan ? 'BASIC' : 'PRIME';
}

function isLifetimePlan(plan: SubscriptionPlan): boolean {
  return !!(plan.isLifetime || (plan.duration_days ?? plan.duration ?? 0) >= 36500);
}

export default function Subscribe() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const { showTutorial, dismissTutorial, dismissForever } = useTutorial("subscribe");
  const t = useI18n();
  const s = t.subscribe;

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Meru state removed 2026-08-08 with the Card button.
  // Per-plan benefits expand state — plans start collapsed (N-06)
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const togglePlanBenefits = (planId: string) => {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  // Promo code state — driven by ?promo= URL param or the "Have a code?" input
  const [promoInput, setPromoInput] = useState(searchParams.get("promo") || "");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    finalPrice: number;
    originalPrice: number;
    discountAmount: number;
    basePlanId: string | null;
    isAnyPlan: boolean;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);

  // Polling payment ID (legacy fallback)
  const [pollingPaymentId, setPollingPaymentId] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const pollingStartRef = useRef<number | null>(null);
  const [pollingOverFiveMin, setPollingOverFiveMin] = useState(false);

  function failWithNudge(msg: string) {
    setError(msg);
  }

  const [usdcAvailable, setUsdcAvailable] = useState<boolean | null>(null);
  // Wallet-USDC-on-Base checkout — expands the WalletPayCard for the picked plan.
  // Server resolves canonical price + duration via planId — client just passes it.
  const [walletPanelPlanId, setWalletPanelPlanId] = useState<string | null>(null);
  const [tokenBalance, setTokensBalance] = useState<number | null>(null);
  // Gifted balance is spendable on member/prime plans (safe: tier unlock, no external payout).
  // See feedback_gifted_tokens_santino_lex_only.md for the scope rules.
  const [giftedBalance, setGiftedBalance] = useState<number>(0);
  const [tokenSuccess, setTokensSuccess] = useState<string | null>(null);

  // Activation code
  const [activationExpanded, setActivationExpanded] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [activationSubmitting, setActivationSubmitting] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  // NowPayments hook retired 2026-08-09 — Wallet (USDC on Base) is the only
  // crypto path now. Any resumed NP order from sessionStorage is ignored.

  useEffect(() => {
    getSubscriptionPlans()
      .then((res) => {
        if (res.success && res.plans.length > 0) {
          setPlans(res.plans);
          const requestedPlanId = searchParams.get("plan");
          const requestedPlan = requestedPlanId
            ? res.plans.find((p) => p.id === requestedPlanId)
            : null;
          if (requestedPlan) {
            setSelectedPlan(requestedPlan.id);
          } else {
            const rec = res.plans.find((p) => p.id === RECOMMENDED_PLAN || p.sku === RECOMMENDED_PLAN);
            setSelectedPlan(rec?.id || res.plans[0].id);
          }
        } else {
          setError(s.noPlansAvailable);
        }
      })
      .catch((err) => setError(err.message || s.failedToLoadPlans))
      .finally(() => setLoading(false));

    getUsdcAvailable()
      .then((res) => setUsdcAvailable(res.available === true && res.configured === true))
      .catch(() => setUsdcAvailable(false));

    if (user) {
      getWalletBalance()
        .then((res) => {
          if (res.success) {
            setTokensBalance(res.balance);
            setGiftedBalance(res.giftedBalance || 0);
          }
        })
        .catch(() => {});
    }

    // Clean up any stale BTC/Dash session storage from before retirement
    sessionStorage.removeItem("pnp_pending_btc_order");
    sessionStorage.removeItem("pnp_pending_dash_order");

    // Handle ?nowpayments=success&order=<id> from hosted checkout return
    const nowpResult = searchParams.get("nowpayments");
    const nowpOrderId = searchParams.get("order");
    if (nowpResult === "success" && nowpOrderId && /^pnptv-nowp-[A-Za-z0-9_-]+-\d+$/.test(nowpOrderId)) {
      window.history.replaceState({}, "", window.location.pathname);
      // The hook will pick up the pending order from sessionStorage if it exists,
      // but if the user is returning from a redirect, we might need to trigger polling
      // if it wasn't already in storage (though it should be).
    }

    // Resume polling if returning from crypto checkout
    try {
      const pending = sessionStorage.getItem("pnp_pending_payment");
      if (pending) {
        sessionStorage.removeItem("pnp_pending_payment");
        setPollingPaymentId(pending);
      }
    } catch {}

  }, [searchParams]);

  // NP-error → warning-banner side effect retired 2026-08-09.

  // Validate a promo code server-side. For base-plan promos, we lock the
  // selected plan to the promo's base plan so the displayed price matches.
  const applyPromo = useCallback(async (rawCode: string, planId?: string | null) => {
    const code = rawCode.trim();
    if (!code) {
      setAppliedPromo(null);
      setPromoError(null);
      return;
    }
    setPromoValidating(true);
    setPromoError(null);
    try {
      const res = await validatePromoCode(code, planId || undefined);
      if (!res.success) {
        setAppliedPromo(null);
        setPromoError(res.message || s.promoInvalid);
        return;
      }
      // For any-plan promos without a planId yet, we can't compute finalPrice — defer.
      if (res.isAnyPlan && (!res.pricing || res.pricing.finalPrice == null)) {
        setAppliedPromo({
          code: res.code || code,
          finalPrice: 0,
          originalPrice: 0,
          discountAmount: 0,
          basePlanId: null,
          isAnyPlan: true,
        });
        setPromoError(null);
        return;
      }
      if (!res.pricing || res.pricing.finalPrice == null || res.pricing.originalPrice == null) {
        setAppliedPromo(null);
        setPromoError(s.promoInvalid);
        return;
      }
      setAppliedPromo({
        code: res.code || code,
        finalPrice: res.pricing.finalPrice,
        originalPrice: res.pricing.originalPrice,
        discountAmount: res.pricing.discountAmount || (res.pricing.originalPrice - res.pricing.finalPrice),
        basePlanId: res.basePlanId || null,
        isAnyPlan: !!res.isAnyPlan,
      });
      // Lock selection to the promo's base plan if it's a single-plan promo
      if (!res.isAnyPlan && res.basePlanId) {
        setSelectedPlan(res.basePlanId);
      }
    } catch (err) {
      setAppliedPromo(null);
      setPromoError(err instanceof Error ? err.message : s.promoInvalid);
    } finally {
      setPromoValidating(false);
    }
  }, [s]);

  // Auto-apply promo from URL once plans load — need plans first so we can lock selection
  const autoAppliedRef = useRef(false);
  const orderPanelRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  useEffect(() => {
    if (autoAppliedRef.current) return;
    const urlPromo = searchParams.get("promo");
    if (!urlPromo || plans.length === 0) return;
    autoAppliedRef.current = true;
    applyPromo(urlPromo, null);
  }, [plans, searchParams, applyPromo]);

  // When selectedPlan changes and an any-plan promo is applied, re-validate
  // to get the correct discounted price for the new plan.
  useEffect(() => {
    if (!appliedPromo?.isAnyPlan || !selectedPlan) return;
    applyPromo(appliedPromo.code, selectedPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan]);

  // Auto-scroll to the inline wallet-USDC panel when it opens for a plan.
  useEffect(() => {
    if (walletPanelPlanId && orderPanelRef.current) {
      setTimeout(() => {
        orderPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }, [walletPanelPlanId]);

  function clearPromo() {
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError(null);
    const next = new URLSearchParams(searchParams);
    next.delete("promo");
    setSearchParams(next, { replace: true });
  }

  // Poll payment status after hosted checkout opens (legacy fallback flow).
  useEffect(() => {
    if (!pollingPaymentId) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes at 5s intervals
    const interval = 5000;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    pollingStartRef.current = Date.now();
    setPollingOverFiveMin(false);

    const poll = async () => {
      if (cancelled || attempts >= maxAttempts) {
        if (attempts >= maxAttempts) {
          setPollingPaymentId(null);
          setPollingOverFiveMin(false);
          try { sessionStorage.removeItem("pnp_pending_payment"); } catch {}
          failWithNudge(s.paymentTimedOut);
        }
        return;
      }
      attempts++;
      const elapsed = Date.now() - (pollingStartRef.current ?? Date.now());
      if (elapsed > 5 * 60 * 1000) {
        setPollingOverFiveMin(true);
      }
      try {
        const data = await getPaymentStatus(pollingPaymentId);
        if (cancelled) return;
        if (data.status === "completed" || data.status === "paid" || data.status === "success") {
          setPollingPaymentId(null);
          setPollingOverFiveMin(false);
          try { sessionStorage.removeItem("pnp_pending_payment"); } catch {}
          setPaymentSuccess(true);
          trackEvent("payment_success", { plan: selectedPlan || "unknown", provider: "polling" });
          await refreshUser();
          return;
        }
        if (data.status === "failed" || data.status === "refunded" || data.status === "abandoned") {
          setPollingPaymentId(null);
          setPollingOverFiveMin(false);
          try { sessionStorage.removeItem("pnp_pending_payment"); } catch {}
          failWithNudge(data.message || s.paymentNotSuccessful);
          return;
        }
        if (!cancelled) timerId = setTimeout(poll, interval);
      } catch {
        if (!cancelled) timerId = setTimeout(poll, interval);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [pollingPaymentId, refreshUser]);

  // handleQuickCheckout + handleCryptoSubscribe removed 2026-08-09 — NP retired.
  // handleBitcoinCheckout, handleDashCheckout removed 2026-07-31 — BTCPay/Dash retired.

  async function handleTokensSubscribe(planId: string, planPrice: number) {
    if (submitting) return;
    const tokenCost = Math.round(planPrice * 6);
    // Member/prime plans allow gifted; other plans (creator subs, add-ons)
    // only accept regular. Server enforces this — client mirrors for the check.
    const isPlatformTier = MEMBER_PLAN_IDS.has(planId) || String(planId).startsWith("prime");
    const spendable = isPlatformTier ? ((tokenBalance ?? 0) + giftedBalance) : (tokenBalance ?? 0);
    if (spendable < tokenCost) {
      setError(t.lang === "es" ? `Ru$h ⚡💲 insuficiente. Necesitas ${tokenCost.toLocaleString()} Ru$h — tienes ${spendable.toLocaleString()} Ru$h.` : `Not enough Ru$h ⚡💲. Need ${tokenCost.toLocaleString()} Ru$h — you have ${spendable.toLocaleString()} Ru$h.`);
      return;
    }
    setSelectedPlan(planId);
    setError(null);
    setSubmitting(true);
    setTokensSuccess(null);
    try {
      const result = await paySubscriptionWithTokens(planId);
      if (!result.success) {
        if (result.code === "INSUFFICIENT_TOKENS") {
          setError(t.lang === "es" ? `Ru$h ⚡💲 insuficiente. Necesitas ${result.required?.toLocaleString()} Ru$h — tienes ${result.current?.toLocaleString()} Ru$h.` : `Not enough Ru$h ⚡💲. Need ${(result.required ?? 0).toLocaleString()} Ru$h — you have ${(result.current ?? 0).toLocaleString()} Ru$h.`);
        } else {
          setError(result.error || (t.lang === "es" ? "No se pudo activar el plan." : "Failed to activate plan."));
        }
        return;
      }
      if (result.newBalance !== undefined) setTokensBalance(result.newBalance);
      setTokensSuccess(planId);
      await refreshUser();
      setTimeout(() => { setPaymentSuccess(true); trackEvent("payment_success", { plan: planId, provider: "tokens" }); }, 400);
    } catch (err: any) {
      setError(err.message || (t.lang === "es" ? "Error al pagar con Ru$h." : "Ru$h payment error."));
    } finally {
      setSubmitting(false);
    }
  }

  // BTC polling effect removed 2026-07-31 — BTCPay retired.
  // Dash polling effect removed 2026-07-31 — Dash/BTCPay retired.

  // Derive current tier display from user object
  function renderTierBanner() {
    if (!user) return null;
    const tier = (user.tier || "free").toLowerCase();
    if (tier === "prime") {
      return (
        <div className="mb-5 rounded-xl px-4 py-3 border border-[#FFB454]/30 bg-[#FFB454]/8 flex items-center gap-3">
          <span className="text-[#FFB454] text-lg">★</span>
          <div>
            <p className="text-sm font-semibold text-[#FFB454]">{s.currentTierPrime}</p>
            <p className="text-xs text-pnp-textSecondary">{s.extendCta}</p>
          </div>
        </div>
      );
    }
    if (tier === "member") {
      return (
        <div className="mb-5 rounded-xl px-4 py-3 border border-blue-400/30 bg-blue-400/8 flex items-center gap-3">
          <span className="text-blue-400 text-lg">◆</span>
          <div>
            <p className="text-sm font-semibold text-blue-400">{s.currentTierMember}</p>
            <p className="text-xs text-pnp-textSecondary">{s.extendCta}</p>
          </div>
        </div>
      );
    }
    // free / unknown
    return (
      <div className="mb-5 rounded-xl px-4 py-3 border border-white/10 bg-white/5 flex items-center gap-3">
        <span className="text-pnp-textSecondary text-lg">○</span>
        <div>
          <p className="text-sm font-medium text-pnp-textPrimary">{s.currentTierFree}</p>
          <p className="text-xs text-pnp-textSecondary">{s.upgradeCta}</p>
        </div>
      </div>
    );
  }

  // Build feature list for a plan from server-driven data
  function getPlanFeatures(plan: SubscriptionPlan, isMemberPlan: boolean): string[] {
    if (plan.features && plan.features.length > 0) {
      return plan.features;
    }
    return isMemberPlan ? [s.platformAccess] : [s.primeAccess];
  }

  // Resolve an add-on to a display label
  function addOnLabel(addOnId: string | undefined, name?: string): string {
    if (!addOnId) return name || "";
    const id = addOnId.toLowerCase();
    if (id === "pnp-member" || id === "member" || id === "basic") return s.addonMember;
    if (id === "prime") return s.addonPrime;
    if (id === "creator-subscription" || id === "creator") return s.addonCreator;
    if (id.includes("private") || id.includes("call")) return s.addonPrivateCalls;
    return name || addOnId;
  }


  // Loading state
  if (loading) {
    return (
      <div className="page-container py-6 px-4 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <Skeleton className="h-8 w-48 mx-auto mb-2" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Payment success state
  if (paymentSuccess) {
    return (
      <div className="page-container flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-pnp-textPrimary mb-2">{s.paymentConfirmed}</h2>
          <p className="text-pnp-textSecondary mb-4 text-sm">
            {s.subscriptionNowActive}
          </p>

          <button
            onClick={() => navigate("/welcome")}
            className="btn-gradient px-6 py-2.5 rounded-xl text-white font-medium"
          >
            {s.goToPNPtv}
          </button>
        </Card>
      </div>
    );
  }

  // Error state (no plans loaded)
  if (error && plans.length === 0) {
    return (
      <div className="page-container flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-pnp-textSecondary mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-gradient px-6 py-2 rounded-xl text-white font-medium">
            {s.retry}
          </button>
        </Card>
      </div>
    );
  }

  const memberPlans = plans.filter((p) => MEMBER_PLAN_IDS.has(p.id) && !HIDDEN_PLAN_IDS.has(p.id));
  const primePlans = plans.filter((p) => !MEMBER_PLAN_IDS.has(p.id) && !HIDDEN_PLAN_IDS.has(p.id));

  return (
    <div className="page-container py-6 px-4 max-w-2xl mx-auto">
      {showTutorial && <TutorialOverlay section="subscribe" onDismiss={dismissTutorial} onDismissForever={dismissForever} />}
      <Helmet>
        <title>{s.pageTitle}</title>
        <meta name="description" content={s.pageDescription} />
        {/* Ru$h Wallet launch OG override — replaces the generic /og-image.png fallback from index.html */}
        <meta property="og:title" content="Ru$h Wallet on PNPtv! — 20% off yearly & lifetime PRIME" />
        <meta property="og:description" content="Tip creators, unlock content, book private calls — all with Ru$h 💎. Launch offer through Aug 23." />
        <meta property="og:image" content="https://pnptv.app/rush-wallet/preview.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="2133" />
        <meta property="og:image:alt" content="Ru$h Wallet preview" />
        <meta property="og:video" content="https://pnptv.app/rush-wallet/marketing-vertical.mp4" />
        <meta property="og:video:type" content="video/mp4" />
        <meta property="og:video:width" content="1080" />
        <meta property="og:video:height" content="1920" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Ru$h Wallet on PNPtv! — 20% off yearly & lifetime PRIME" />
        <meta name="twitter:description" content="Tip creators, unlock content, book private calls — all with Ru$h 💎." />
        <meta name="twitter:image" content="https://pnptv.app/rush-wallet/preview.jpg" />
        <meta name="twitter:image:alt" content="Ru$h Wallet preview" />
      </Helmet>

      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-pnp-textPrimary mb-1">{s.chooseYourPlan}</h1>
        <p className="text-sm text-pnp-textSecondary">{s.subtitle}</p>
      </div>

      {/* Current tier status banner */}
      {renderTierBanner()}

      {/* New-to-crypto onboarding card — links to /crypto-guide */}
      <a
        href="/crypto-guide"
        className="group block w-full mb-4 rounded-2xl overflow-hidden transition-transform active:scale-[0.99] hover:-translate-y-0.5"
        style={{
          background: "linear-gradient(135deg, rgba(247,147,26,0.16) 0%, rgba(0,141,228,0.12) 55%, rgba(16,185,129,0.14) 100%)",
          border: "1px solid rgba(247,147,26,0.35)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.03) inset",
        }}
      >
        <div className="p-4 flex items-center gap-3.5">
          {/* Stacked coin icons */}
          <div className="relative flex-shrink-0" style={{ width: 56, height: 44 }}>
            {[
              { bg: "#F7931A", letter: "₿",  offset: 0,  z: 40, ring: "#F7931A" },  // Bitcoin
              { bg: "#26A17B", letter: "₮",  offset: 14, z: 30, ring: "#26A17B" },  // USDT
              { bg: "#5ED1C4", letter: "$",  offset: 28, z: 20, ring: "#5ED1C4" },  // USDC
              { bg: "#627EEA", letter: "Ξ",  offset: 42, z: 10, ring: "#627EEA" },  // ETH
            ].map((c) => (
              <div
                key={c.letter}
                className="absolute top-0 w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-lg"
                style={{
                  left: c.offset,
                  zIndex: c.z,
                  background: c.bg,
                  border: "2.5px solid #0D0D0D",
                  boxShadow: `0 0 12px ${c.ring}55`,
                }}
                aria-hidden="true"
              >
                {c.letter}
              </div>
            ))}
          </div>

          {/* Copy */}
          <div className="flex-1 min-w-0 ml-4">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md"
                style={{ background: "rgba(247,147,26,0.2)", color: "#F7931A", border: "1px solid rgba(247,147,26,0.4)" }}
              >
                {t.lang === "es" ? "Guía completa" : "Full guide"}
              </span>
              <span className="text-[10px] font-semibold text-pnp-textSecondary">
                {t.lang === "es" ? "3 min de lectura" : "3 min read"}
              </span>
            </div>
            <p className="text-sm font-bold text-pnp-textPrimary leading-tight">
              {t.lang === "es" ? "¿Primera vez pagando con crypto?" : "First time paying with crypto?"}
            </p>
            <p className="text-xs text-pnp-textSecondary mt-1 leading-snug">
              {t.lang === "es"
                ? "Compra USDT, Bitcoin o USDC en 5 minutos — sin experiencia previa."
                : "Buy USDT, Bitcoin or USDC in 5 minutes — no experience needed."}
            </p>
          </div>

          {/* CTA arrow */}
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-0.5"
            style={{ background: "linear-gradient(135deg,#F7931A,#D4007A)", boxShadow: "0 4px 12px rgba(247,147,26,0.35)" }}
            aria-hidden="true"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
        </div>
      </a>

      {/* Wallet-first pitch — one balance, one tap, no wallet apps. Rendered
          above the promo/plan grid so users know how checkout works before
          they pick a plan. */}
      <div className="mb-4">
        <WalletCheckoutHero lang={t.lang as "es" | "en"} compact />
      </div>

      {/* Promo code banner — applied state */}
      {appliedPromo && (
        <div
          className="mb-4 rounded-xl px-4 py-3 border flex items-center justify-between gap-3"
          style={{ borderColor: "rgba(212,0,122,0.4)", background: "rgba(212,0,122,0.10)" }}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold text-pnp-accent uppercase tracking-wider">
              {s.promoApplied}
            </p>
            <p className="text-sm font-mono text-pnp-textPrimary truncate">
              {appliedPromo.code}
            </p>
            {appliedPromo.originalPrice > 0 && (
              <p className="text-xs text-pnp-textSecondary mt-0.5">
                <span className="line-through">{formatPrice(appliedPromo.originalPrice, "USD")}</span>
                <span className="mx-2">→</span>
                <span className="text-pnp-accent font-semibold">{formatPrice(appliedPromo.finalPrice, "USD")}</span>
              </p>
            )}
          </div>
          <button
            onClick={clearPromo}
            className="shrink-0 text-xs text-pnp-textSecondary hover:text-pnp-textPrimary underline decoration-dotted"
            aria-label={s.promoRemove}
          >
            {s.promoRemove}
          </button>
        </div>
      )}

      {/* Promo code input — shown only when no promo is applied yet */}
      {!appliedPromo && (
        <details className="mb-4 rounded-xl px-4 py-3 border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer text-xs font-semibold text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors select-none">
            {s.promoHaveCode}
          </summary>
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyPromo(promoInput, selectedPlan);
                }
              }}
              placeholder={s.promoCodePlaceholder}
              maxLength={64}
              className="flex-1 px-3 py-2 rounded-lg bg-pnp-surface border border-white/10 text-sm text-pnp-textPrimary placeholder:text-pnp-textSecondary/60 focus:outline-none focus:border-pnp-accent/50"
            />
            <button
              onClick={() => applyPromo(promoInput, selectedPlan)}
              disabled={promoValidating || !promoInput.trim()}
              className="px-4 py-2 rounded-lg bg-pnp-accent text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {promoValidating ? "…" : s.promoApply}
            </button>
          </div>
          {promoError && (
            <p className="mt-2 text-xs text-red-400">{promoError}</p>
          )}
        </details>
      )}

      {/* Plan cards */}
      <div className="space-y-3 mb-6">

        {memberPlans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const features = getPlanFeatures(plan, true);
          const displayPrice = formatPrice(plan.price, "USD");
          const planLabel = getPlanLabel(plan, true);
          const hasAddOns = plan.addOns && plan.addOns.length > 0;
          const cryptoDisplayPrice = formatPrice(plan.price, "USD");

          const planDays = plan.duration_days || plan.duration || 30;
          const isPanelActive = false;
          const isDimmed = false;
          return (
            <div key={plan.id} className={`transition-all duration-200 ${isDimmed ? "opacity-50 pointer-events-none" : ""}`}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPlan(plan.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedPlan(plan.id); } }}
              className={`w-full text-left p-4 border-2 transition-all duration-200 cursor-pointer ${
                isPanelActive ? "rounded-t-xl rounded-b-none" : "rounded-xl"
              } ${
                isSelected
                  ? `border-[#D4007A] bg-[#D4007A]/10${isPanelActive ? " border-b-transparent" : ""}`
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-pnp-textPrimary">
                      {plan.display_name || plan.name}
                    </span>
                    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getLabelColor(planLabel)}`}>
                      {planLabel}
                    </span>
                    {isLifetimePlan(plan) && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FFB454] text-[#1C1C1E] px-2 py-0.5 rounded-full">
                        {s.lifetime}
                      </span>
                    )}
                    <span className="text-[10px] font-medium tracking-wide bg-white/5 text-pnp-textSecondary border border-white/10 px-2 py-0.5 rounded-full">
                      {s.launchRate}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-pnp-textSecondary">{durationLabel(planDays)}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{s.oneTimePayment}</span>
                  </div>
                </div>
                <span className="flex flex-col items-end">
                  <PriceDisplay amount={plan.price} className="text-pnp-textPrimary" />
                </span>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); togglePlanBenefits(plan.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); togglePlanBenefits(plan.id); } }}
                className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-[#D4007A] hover:text-[#E69138] transition-colors cursor-pointer"
                aria-expanded={expandedPlans.has(plan.id)}
              >
                {expandedPlans.has(plan.id) ? s.hideBenefits : s.showBenefits}
                <svg
                  className={`w-3 h-3 transition-transform ${expandedPlans.has(plan.id) ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
              {expandedPlans.has(plan.id) && (
                <ul className="space-y-1 mt-2">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-pnp-textSecondary">
                      <svg className="w-3 h-3 text-[#D4007A] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              {hasAddOns && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-pnp-textSecondary/70">{s.includesAddOns}</span>
                  {plan.addOns!.map((ao) => (
                    <span
                      key={ao.id || ao.add_on_id}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 text-pnp-textSecondary border border-white/10"
                    >
                      {addOnLabel(ao.id || ao.add_on_id, ao.name)}
                      {ao.is_lifetime && " ∞"}
                    </span>
                  ))}
                </div>
              )}

              {/* Quick-pay buttons — Wallet (USDC on Base) is the only crypto
                  path. NowPayments/hosted-invoice picker retired 2026-08-09. */}
              <div className="mt-3 pt-3 border-t border-white/5 flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const cost = Math.round(parseFloat(String(plan.price)) * 6);
                  const isPlatform = MEMBER_PLAN_IDS.has(plan.id) || String(plan.id).startsWith("prime");
                  const spendable = isPlatform ? ((tokenBalance ?? 0) + giftedBalance) : (tokenBalance ?? 0);
                  const usesGifted = isPlatform && giftedBalance > 0 && (tokenBalance ?? 0) < cost;
                  if (spendable < cost) return null;
                  return (
                    <button
                      disabled={submitting}
                      onClick={(e) => { e.stopPropagation(); handleTokensSubscribe(plan.id, parseFloat(String(plan.price))); }}
                      className="flex-1 min-w-[80px] flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border border-[#D4007A]/40 bg-[#D4007A]/10 hover:bg-[#D4007A]/20 disabled:opacity-50 transition-colors"
                    >
                      <span className="flex items-center gap-1 text-xs font-semibold text-[#FF69B4]">
                        <span>🎫</span>
                        <span>Ru$h 💎</span>
                      </span>
                      <span className="text-[11px] font-bold text-[#FF69B4] leading-none">{cost.toLocaleString()} 💎</span>
                      {usesGifted && (
                        <span className="text-[9px] font-medium text-[#FF69B4]/70 leading-none mt-0.5">
                          {t.lang === "es" ? "usa tus 💎 bonus" : "uses your starter 💎"}
                        </span>
                      )}
                    </button>
                  );
                })()}
                {/* Wallet USDC on Base — gas-sponsored, one signature, instant.
                    Server resolves canonical price via planId so client can't
                    fudge amount. */}
                <button
                  onClick={(e) => { e.stopPropagation(); setWalletPanelPlanId(walletPanelPlanId === plan.id ? null : plan.id); }}
                  className={`flex-1 min-w-[80px] flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border transition-colors ${walletPanelPlanId === plan.id ? "border-emerald-400/60 bg-emerald-500/20" : "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"}`}
                >
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300">
                    <span>💳</span>
                    <span>Wallet</span>
                    <span className="text-[9px] text-emerald-400/70">▾</span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-400 leading-none">USDC · Base</span>
                </button>
                {/* Card / Meru button removed 2026-08-08 — /subscribe accepts
                    only crypto (USDC + ETH on Base) and Ru$h now. Fiat card
                    users route through wallet → fund → USDC via the Privy
                    onramps (Stripe / MoonPay / Meld / Coinbase). */}
                {walletPanelPlanId === plan.id && (
                  <div className="w-full mt-2" onClick={(e) => e.stopPropagation()}>
                    <WalletPayCard
                      surface={MEMBER_PLAN_IDS.has(plan.id) ? "membership" : "prime"}
                      amountUsd={parseFloat(String(plan.price))}
                      entitlementSpec={{ planId: plan.id }}
                      metadata={{ source: "subscribe_page", planId: plan.id }}
                      label={t.lang === "es" ? `Pagar $${parseFloat(String(plan.price)).toFixed(2)} · ${plan.name || plan.id}` : `Pay $${parseFloat(String(plan.price)).toFixed(2)} · ${plan.name || plan.id}`}
                      lang={(t.lang as "es" | "en")}
                      onSuccess={() => {
                        setWalletPanelPlanId(null);
                        // Reload to reflect the new entitlement everywhere.
                        setTimeout(() => { window.location.href = "/"; }, 1200);
                      }}
                      compact
                    />
                  </div>
                )}
                {/* NP crypto picker + hosted-invoice panel removed 2026-08-09. */}
              </div>
            </div>
            </div>
          );
        })}

        {primePlans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isRecommended = plan.id === RECOMMENDED_PLAN || plan.sku === RECOMMENDED_PLAN;
          const features = getPlanFeatures(plan, false);
          const displayPrice = formatPrice(plan.price, "USD");
          const planLabel = getPlanLabel(plan, false);
          const hasAddOns = plan.addOns && plan.addOns.length > 0;
          const planDays = plan.duration_days || plan.duration || 30;
          const cryptoDisplayPrice = formatPrice(plan.price, "USD");

          const isPanelActive = false;
          const isDimmed = false;
          const primeBtnClass = [
            "w-full text-left p-4 border-2 transition-all duration-200",
            isPanelActive ? "rounded-t-xl rounded-b-none" : "rounded-xl",
            isSelected
              ? "border-[#D4007A] bg-[#D4007A]/10" + (isPanelActive ? " border-b-transparent" : "")
              : "border-white/10 bg-white/5 hover:border-white/20",
            isRecommended ? "ring-1 ring-[#FFB454]/40" : "",
          ].join(" ");
          return (
            <div key={plan.id} className={`transition-all duration-200 ${isDimmed ? "opacity-50 pointer-events-none" : ""}`}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPlan(plan.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedPlan(plan.id); } }}
              className={`cursor-pointer ${primeBtnClass}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-pnp-textPrimary">
                      {plan.display_name || plan.name}
                    </span>
                    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getLabelColor(planLabel)}`}>
                      {planLabel}
                    </span>
                    {isRecommended && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FFB454] text-[#1C1C1E] px-2 py-0.5 rounded-full">
                        {s.bestValue}
                      </span>
                    )}
                    {isLifetimePlan(plan) && !isRecommended && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FFB454] text-[#1C1C1E] px-2 py-0.5 rounded-full">
                        {s.lifetime}
                      </span>
                    )}
                    <span className="text-[10px] font-medium tracking-wide bg-white/5 text-pnp-textSecondary border border-white/10 px-2 py-0.5 rounded-full">
                      {s.launchRate}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-pnp-textSecondary">{durationLabel(planDays)}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{s.oneTimePayment}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex flex-col items-end">
                    <PriceDisplay amount={plan.price} className="text-pnp-textPrimary" />
                  </div>
                  {planDays >= 30 && planDays < 36500 && (
                    <div className="text-[10px] text-pnp-textSecondary">
                      {formatPrice(plan.price / Math.max(1, Math.round(planDays / 30)), "USD")}{s.perMonth}
                    </div>
                  )}
                </div>
              </div>

              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); togglePlanBenefits(plan.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); togglePlanBenefits(plan.id); } }}
                className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-[#D4007A] hover:text-[#E69138] transition-colors cursor-pointer"
                aria-expanded={expandedPlans.has(plan.id)}
              >
                {expandedPlans.has(plan.id) ? s.hideBenefits : s.showBenefits}
                <svg
                  className={`w-3 h-3 transition-transform ${expandedPlans.has(plan.id) ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
              {expandedPlans.has(plan.id) && (
                <>
                  {/* "Everything in Member plus:" header for PRIME plans */}
                  <p className="text-[10px] text-pnp-textSecondary/70 mt-2 mb-1.5">{s.everythingInMemberPlus}</p>

                  <ul className="space-y-1">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-pnp-textSecondary">
                        <svg className="w-3 h-3 text-[#D4007A] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {hasAddOns && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-pnp-textSecondary/70">{s.includesAddOns}</span>
                  {plan.addOns!.map((ao) => (
                    <span
                      key={ao.id || ao.add_on_id}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 text-pnp-textSecondary border border-white/10"
                    >
                      {addOnLabel(ao.id || ao.add_on_id, ao.name)}
                      {ao.is_lifetime && " ∞"}
                    </span>
                  ))}
                </div>
              )}

              {/* Quick-pay buttons — Wallet (USDC on Base) is the only crypto
                  path. NowPayments/hosted-invoice picker retired 2026-08-09. */}
              <div className="mt-3 pt-3 border-t border-white/5 flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const cost = Math.round(parseFloat(String(plan.price)) * 6);
                  const isPlatform = MEMBER_PLAN_IDS.has(plan.id) || String(plan.id).startsWith("prime");
                  const spendable = isPlatform ? ((tokenBalance ?? 0) + giftedBalance) : (tokenBalance ?? 0);
                  const usesGifted = isPlatform && giftedBalance > 0 && (tokenBalance ?? 0) < cost;
                  if (spendable < cost) return null;
                  return (
                    <button
                      disabled={submitting}
                      onClick={(e) => { e.stopPropagation(); handleTokensSubscribe(plan.id, parseFloat(String(plan.price))); }}
                      className="flex-1 min-w-[80px] flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border border-[#D4007A]/40 bg-[#D4007A]/10 hover:bg-[#D4007A]/20 disabled:opacity-50 transition-colors"
                    >
                      <span className="flex items-center gap-1 text-xs font-semibold text-[#FF69B4]">
                        <span>🎫</span>
                        <span>Ru$h 💎</span>
                      </span>
                      <span className="text-[11px] font-bold text-[#FF69B4] leading-none">{cost.toLocaleString()} 💎</span>
                      {usesGifted && (
                        <span className="text-[9px] font-medium text-[#FF69B4]/70 leading-none mt-0.5">
                          {t.lang === "es" ? "usa tus 💎 bonus" : "uses your starter 💎"}
                        </span>
                      )}
                    </button>
                  );
                })()}
                {/* Wallet USDC on Base — gas-sponsored, one signature, instant.
                    Server resolves canonical price via planId so client can't
                    fudge amount. */}
                <button
                  onClick={(e) => { e.stopPropagation(); setWalletPanelPlanId(walletPanelPlanId === plan.id ? null : plan.id); }}
                  className={`flex-1 min-w-[80px] flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg border transition-colors ${walletPanelPlanId === plan.id ? "border-emerald-400/60 bg-emerald-500/20" : "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"}`}
                >
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300">
                    <span>💳</span>
                    <span>Wallet</span>
                    <span className="text-[9px] text-emerald-400/70">▾</span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-400 leading-none">USDC · Base</span>
                </button>
                {/* Card / Meru button removed 2026-08-08 — /subscribe accepts
                    only crypto (USDC + ETH on Base) and Ru$h now. Fiat card
                    users route through wallet → fund → USDC via the Privy
                    onramps (Stripe / MoonPay / Meld / Coinbase). */}
                {walletPanelPlanId === plan.id && (
                  <div className="w-full mt-2" onClick={(e) => e.stopPropagation()}>
                    <WalletPayCard
                      surface={MEMBER_PLAN_IDS.has(plan.id) ? "membership" : "prime"}
                      amountUsd={parseFloat(String(plan.price))}
                      entitlementSpec={{ planId: plan.id }}
                      metadata={{ source: "subscribe_page", planId: plan.id }}
                      label={t.lang === "es" ? `Pagar $${parseFloat(String(plan.price)).toFixed(2)} · ${plan.name || plan.id}` : `Pay $${parseFloat(String(plan.price)).toFixed(2)} · ${plan.name || plan.id}`}
                      lang={(t.lang as "es" | "en")}
                      onSuccess={() => {
                        setWalletPanelPlanId(null);
                        // Reload to reflect the new entitlement everywhere.
                        setTimeout(() => { window.location.href = "/"; }, 1200);
                      }}
                      compact
                    />
                  </div>
                )}
                {/* NP crypto picker + hosted-invoice panel removed 2026-08-09. */}
              </div>
            </div>
            </div>
          );
        })}
      </div>

      {/* Payment polling indicator */}
      {pollingPaymentId && (
        <div className="mb-4 p-3 rounded-xl text-sm text-center" style={{ background: "rgba(212,0,122,0.08)", border: "1px solid rgba(212,0,122,0.20)" }}>
          <div className="flex items-center justify-center gap-2 mb-1">
            <svg className="animate-spin h-4 w-4 text-[#D4007A]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="font-medium text-pnp-textPrimary">{s.waitingForPayment}</span>
          </div>
          <p className="text-xs text-pnp-textSecondary mb-1">
            {s.completePaymentInWindow}
          </p>
          {pollingOverFiveMin && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: "rgba(212,0,122,0.20)" }}>
              <p className="text-xs font-semibold text-amber-400 mb-1.5">
                {t.lang === "es"
                  ? "⏳ Tomando más tiempo de lo esperado"
                  : "⏳ Taking longer than expected"}
              </p>
              <p className="text-[11px] text-pnp-textSecondary mb-2">
                {t.lang === "es"
                  ? "Si ya enviaste el pago, puede tardar hasta 20 min en confirmarse. ¿Necesitas ayuda?"
                  : "If you've already sent payment, it may take up to 20 min to confirm. Need help?"}
              </p>
              <a
                href="mailto:support@pnptv.app?subject=Payment%20Pending"
                className="inline-block px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
                style={{ background: "rgba(212,0,122,0.60)" }}
              >
                {t.lang === "es" ? "Contactar soporte" : "Contact support"}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Crypto nudge removed 2026-08-09 — Wallet is now the only crypto path. */}

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 text-center whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Activation code */}
      <div className="mt-4">
        <button
          onClick={() => { setActivationExpanded(v => !v); setActivationError(null); }}
          className="w-full text-center text-xs text-pnp-textSecondary/60 hover:text-pnp-textSecondary transition-colors py-1"
        >
          {t.lang === "es" ? "¿Tienes un código de activación?" : "Have an activation code?"}
          <span className="ml-1 inline-block transition-transform" style={{ transform: activationExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
        </button>

        {activationExpanded && (
          <div className="mt-2 p-4 rounded-xl border border-white/10" style={{ background: "rgba(255,255,255,0.04)" }}>
            {activationSuccess ? (
              <div className="text-center">
                <p className="text-sm text-green-400 mb-3">
                  {t.lang === "es"
                    ? "✅ ¡Acceso activado! Recarga para ver tu nuevo plan."
                    : "✅ Access activated! Refresh to see your new plan."}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                  style={{ background: "rgba(255,255,255,0.12)" }}
                >
                  {t.lang === "es" ? "Recargar" : "Refresh"}
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={activationCode}
                    onChange={(e) => {
                      setActivationCode(e.target.value.toUpperCase());
                      setActivationError(null);
                    }}
                    placeholder={t.lang === "es" ? "CÓDIGO-AQUÍ" : "CODE-HERE"}
                    maxLength={50}
                    disabled={activationSubmitting}
                    className="flex-1 px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-pnp-textPrimary placeholder:text-pnp-textSecondary/40 focus:outline-none focus:border-white/25 disabled:opacity-50 font-mono tracking-wider"
                  />
                  <button
                    disabled={activationSubmitting || !activationCode.trim()}
                    onClick={async () => {
                      setActivationSubmitting(true);
                      setActivationError(null);
                      try {
                        await redeemActivationCode(activationCode.trim());
                        setActivationSuccess(true);
                      } catch (err: any) {
                        const errCode = err?.code || err?.message || "";
                        if (errCode === "already_used") {
                          setActivationError(t.lang === "es" ? "Este código ya fue usado." : "This code has already been used.");
                        } else if (errCode === "expired") {
                          setActivationError(t.lang === "es" ? "Este código ha vencido. Contacta soporte." : "This code has expired. Contact support.");
                        } else if (errCode === "use_lifetime100") {
                          setActivationError(t.lang === "es" ? "Este es un código Lifetime100 — úsalo en la página Lifetime100." : "This is a Lifetime100 code — use the Lifetime100 page to redeem it.");
                        } else if (errCode === "not_found" || errCode === "invalid_format") {
                          setActivationError(t.lang === "es" ? "Código inválido." : "Invalid code.");
                        } else {
                          setActivationError(err?.message || (t.lang === "es" ? "Error al activar. Intenta de nuevo." : "Activation failed. Try again."));
                        }
                      } finally {
                        setActivationSubmitting(false);
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 transition-colors whitespace-nowrap"
                    style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)" }}
                  >
                    {activationSubmitting
                      ? (t.lang === "es" ? "Activando..." : "Activating...")
                      : (t.lang === "es" ? "Canjear" : "Redeem")}
                  </button>
                </div>
                {activationError && (
                  <p className="mt-2 text-xs text-red-400">{activationError}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Legal footer */}
      <p className="mt-4 text-center text-[11px] text-pnp-textSecondary/50 leading-relaxed">
        {t.lang === "es"
          ? <>Al comprar aceptas nuestros <a href="/terms" className="underline decoration-dotted hover:text-pnp-textSecondary">Términos y Condiciones</a>. Reembolsos disponibles dentro de las 24h de pago — incluyendo cripto. <a href="/contact" className="underline decoration-dotted hover:text-pnp-textSecondary">Contáctanos</a> si tu solicitud cumple los requisitos.</>
          : <>By purchasing you agree to our <a href="/terms" className="underline decoration-dotted hover:text-pnp-textSecondary">Terms & Conditions</a>. Refunds available within 24h of payment — crypto included. <a href="/contact" className="underline decoration-dotted hover:text-pnp-textSecondary">Contact us</a> if your request meets our policy.</>
        }
      </p>

      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="w-full mt-3 py-2 text-sm text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors"
      >
        {s.goBack}
      </button>

    </div>
  );
}
