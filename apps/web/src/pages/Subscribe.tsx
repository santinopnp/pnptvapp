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
  getWalletBalance,
  getOnlineStats,
  logSubscribeVisit,
  type SubscriptionPlan,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTutorial } from "@/hooks/useTutorial";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { useI18n } from "@/lib/i18n";
import { connectSocket } from "@/lib/socket";

const MEMBER_PLAN_IDS = new Set(["member_monthly"]);
// These are filtered at the backend too (planModel.getPublicPlans HIDDEN_LEGACY_IDS).
// Frontend set is kept as a second safety net for any plan that slips through.
const HIDDEN_PLAN_IDS = new Set(["prime-trial-3d", "lifetime80", "monthly-pass-promo-15", "yearly50", "lifetime100", "lifetime-pass", "mondays_spundays_promo_20"]);

const RECURRING_PLANS = new Set(["prime-week-pass-7d", "monthly-pass", "prime-diamond-pass-365d"]);

const RECOMMENDED_PLAN_FALLBACK = "prime-diamond-pass-365d";

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
  if (days >= 36500) return "Founders";
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

  // Activation code
  const [activationExpanded, setActivationExpanded] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [activationSubmitting, setActivationSubmitting] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [recommendedPlanId, setRecommendedPlanId] = useState<string>(RECOMMENDED_PLAN_FALLBACK);

  // Social proof
  const [onlineStats, setOnlineStats] = useState<{ online: number; prime: number } | null>(null);


  useEffect(() => {
    getSubscriptionPlans()
      .then((res) => {
        if (res.success && res.plans.length > 0) {
          setPlans(res.plans);
          if (res.recommendedPlanId) setRecommendedPlanId(res.recommendedPlanId);
          const activeRec = res.recommendedPlanId || RECOMMENDED_PLAN_FALLBACK;
          const requestedPlanId = searchParams.get("plan");
          const requestedPlan = requestedPlanId
            ? res.plans.find((p) => p.id === requestedPlanId)
            : null;
          if (requestedPlan) {
            setSelectedPlan(requestedPlan.id);
            // Deep-link from /api/pay/np-go — auto-open the wallet checkout
            // panel so the user lands on the actual pay button, not the
            // plan list. `via=np-go` distinguishes broadcast clicks from
            // organic /subscribe visits.
            if (searchParams.get("via") === "np-go") {
              setWalletPanelPlanId(requestedPlan.id);
            }
          } else {
            const rec = res.plans.find((p) => p.id === activeRec || p.sku === activeRec);
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


    getOnlineStats().then(setOnlineStats).catch(() => {});
    if (user) logSubscribeVisit().catch(() => {});

    // Clean up any stale BTC session storage from before retirement
    sessionStorage.removeItem("pnp_pending_btc_order");
    sessionStorage.removeItem("pnp_pending_dash_order");

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

  // Real-time success signal from any payment path (crypto webhook, NP IPN,
  // Ru$h spend, EfiPay grant). Backend fires `user:entitlement-change` on
  // grantEntitlementsForPlan — mirror MainStage's listener so users don't
  // depend on the polling loop finishing.
  useEffect(() => {
    if (!user?.id) return;
    const socket = connectSocket();
    const onEntitlementChange = () => {
      // Close any pending polling and mark the page as successful.
      setPollingPaymentId(null);
      setPollingOverFiveMin(false);
      try { sessionStorage.removeItem("pnp_pending_payment"); } catch {}
      setPaymentSuccess(true);
      trackEvent("payment_success", { plan: selectedPlan || "unknown", provider: "socket" });
      refreshUser();
    };
    socket.on("user:entitlement-change", onEntitlementChange);
    return () => { socket.off("user:entitlement-change", onEntitlementChange); };
  }, [user?.id, selectedPlan, refreshUser]);

  // Poll payment status after hosted checkout opens (legacy fallback flow).
  useEffect(() => {
    if (!pollingPaymentId) return;

    let cancelled = false;
    let attempts = 0;
    let consecutive5xx = 0;
    const maxAttempts = 120; // 10 minutes at 5s intervals
    const baseInterval = 5000;
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
        consecutive5xx = 0;
        if (cancelled) return;
        if (data.status === "completed" || data.status === "paid" || data.status === "success" || data.status === "confirmed") {
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
        if (!cancelled) timerId = setTimeout(poll, baseInterval);
      } catch (err: unknown) {
        // 404/410 = order not found or gone forever → stop retrying.
        // 5xx = transient; exponential backoff and cap at 3 consecutive.
        const status = (err as { status?: number })?.status;
        if (status === 404 || status === 410) {
          setPollingPaymentId(null);
          setPollingOverFiveMin(false);
          try { sessionStorage.removeItem("pnp_pending_payment"); } catch {}
          failWithNudge(s.paymentNotSuccessful);
          return;
        }
        if (status && status >= 500 && status < 600) {
          consecutive5xx++;
          if (consecutive5xx > 3) {
            setPollingPaymentId(null);
            setPollingOverFiveMin(false);
            try { sessionStorage.removeItem("pnp_pending_payment"); } catch {}
            failWithNudge(s.paymentNotSuccessful);
            return;
          }
          const backoffMs = Math.min(30000, baseInterval * Math.pow(2, consecutive5xx));
          if (!cancelled) timerId = setTimeout(poll, backoffMs);
          return;
        }
        // Transient network / unknown → normal cadence
        if (!cancelled) timerId = setTimeout(poll, baseInterval);
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


  // BTC polling effect removed 2026-07-31 — BTCPay retired.
  // Dash polling effect removed 2026-07-31 — Dash/BTCPay retired.

  // Derive current tier display from user object
  function renderTierBanner() {
    if (!user) return null;
    const tier = (user.tier || "free").toLowerCase();
    const subType = (user.subscriptionType || "").toLowerCase();
    const isTrial = subType === "trial" || subType === "prime-trial-3d";
    if (isTrial) {
      // Compute expiry display — subscription_expires_at is not in the user object
      // so we just show the "trial active" banner without a date for now.
      return (
        <div className="mb-5 rounded-xl px-4 py-3 border border-emerald-500/40 flex items-start gap-3" style={{ background: "rgba(16,185,129,0.10)" }}>
          <span className="text-emerald-400 text-lg mt-0.5 flex-shrink-0">◈</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-400">{s.currentTierTrial}</p>
            <p className="text-xs text-pnp-textSecondary mt-0.5">{s.trialExpiresCta}</p>
          </div>
          <span
            className="flex-shrink-0 self-start text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: "rgba(16,185,129,0.18)", color: "#34d399", border: "1px solid rgba(16,185,129,0.40)" }}
          >
            {t.lang === "es" ? "24 h gratis" : "24-hour trial"}
          </span>
        </div>
      );
    }
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
            onClick={() => navigate("/")}
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
  const promoPlans: typeof plans = [];

  // Derived: is the currently selected plan a member (non-prime) tier?
  const selectedPlanObj = plans.find((p) => p.id === selectedPlan);
  const selectedPlanIsMember = selectedPlanObj
    ? MEMBER_PLAN_IDS.has(selectedPlanObj.id) || (selectedPlanObj.tier || "").toLowerCase() === "member"
    : false;

  return (
    <div className="page-container py-6 px-4 max-w-2xl mx-auto">
      {showTutorial && <TutorialOverlay section="subscribe" onDismiss={dismissTutorial} onDismissForever={dismissForever} />}
      <Helmet>
        <title>{s.pageTitle}</title>
        <meta name="description" content={s.pageDescription} />
        <meta property="og:title" content="Join PNPtv! PRIME — Exclusive queer content, creator tips & private calls" />
        <meta property="og:description" content="Unlock premium content, tip your favorite creators with Ru$h 💎, and book private calls. Join PNPtv! PRIME today." />
        <meta property="og:image" content="https://pnptv.app/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Join PNPtv! PRIME — Exclusive queer content & creator tips" />
        <meta name="twitter:description" content="Unlock premium content, tip creators with Ru$h 💎, book private calls. Join PNPtv! PRIME." />
        <meta name="twitter:image" content="https://pnptv.app/og-image.png" />
      </Helmet>

      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-pnp-textPrimary mb-1">{s.chooseYourPlan}</h1>
        <p className="text-sm text-pnp-textSecondary">{s.subtitle}</p>
      </div>

      {/* Current tier status banner */}
      {renderTierBanner()}

      {/* ── Promo deals section — yearly50 + lifetime100 ───────────────── */}
      {promoPlans.length > 0 && (user?.tier || "free") !== "prime" && (
        <div className="mb-5">
          {/* Section header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🔥</span>
            <span className="text-sm font-bold text-pnp-textPrimary">
              {t.lang === "es" ? "Promos exclusivas" : "Exclusive Deals"}
            </span>
            <span
              className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: "rgba(212,0,122,0.18)", color: "#FF6BB0", border: "1px solid rgba(212,0,122,0.35)" }}
            >
              {t.lang === "es" ? "Tiempo limitado" : "Limited time"}
            </span>
          </div>

          {/* Social proof row */}
          <div className="flex items-center justify-between mb-3 gap-2">
            {onlineStats && onlineStats.prime > 0 && (
              <div className="flex items-center gap-1 ml-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <span className="text-[10px] text-white/50">
                  {t.lang === "es"
                    ? `${onlineStats.prime} PRIME online`
                    : `${onlineStats.prime} PRIME online`}
                </span>
              </div>
            )}
          </div>

          {/* Two-card grid — yearly50 only (lifetime100 is popup-only) */}
          <div className="grid grid-cols-2 gap-2.5">
            {promoPlans
              .filter((plan) => !isLifetimePlan(plan))
              .map((plan) => {
              const isLifetime = isLifetimePlan(plan);

              const cardStyle = isLifetime
                ? { background: "linear-gradient(145deg,rgba(20,20,20,0.95),rgba(30,25,20,0.95))", border: "1px solid rgba(230,145,56,0.40)" }
                : { background: "linear-gradient(145deg,rgba(212,0,122,0.14),rgba(255,107,176,0.07))", border: "1px solid rgba(212,0,122,0.40)" };

              const accentColor = isLifetime ? "#E69138" : "#FF6BB0";
              const tagBg = isLifetime ? "rgba(230,145,56,0.15)" : "rgba(212,0,122,0.18)";
              const tagBorder = isLifetime ? "rgba(230,145,56,0.40)" : "rgba(212,0,122,0.40)";

              const tagLabel = isLifetime
                ? (t.lang === "es" ? "🖤 Membresía Founders" : "🖤 Founders Membership")
                : (t.lang === "es" ? "🔥 Mejor precio" : "🔥 Best deal");

              const subline = isLifetime
                ? (t.lang === "es" ? "18 meses PRIME + ✨ Prime Channel" : "18 mo PRIME + ✨ Prime Channel")
                : (t.lang === "es" ? "Ahorrás vs mensual" : "Save vs monthly");

              return (
                <div key={plan.id} className="flex flex-col rounded-2xl overflow-hidden" style={cardStyle}>
                  <div className="p-3 flex flex-col gap-1.5 flex-1">
                    {/* Tag */}
                    <span
                      className="self-start text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ background: tagBg, color: accentColor, border: `1px solid ${tagBorder}` }}
                    >
                      {tagLabel}
                    </span>

                    {/* Price */}
                    <div className="flex items-baseline gap-0.5 leading-none mt-0.5">
                      <span className="text-[11px] font-bold" style={{ color: accentColor }}>$</span>
                      <span className="text-2xl font-black text-white">{Math.round(plan.price)}</span>
                      {!isLifetime && (
                        <span className="text-[10px] font-semibold text-white/50 ml-0.5">
                          {t.lang === "es" ? "/año" : "/yr"}
                        </span>
                      )}
                    </div>

                    {/* Name + subline */}
                    <p className="text-[11px] font-bold text-white leading-tight">
                      {isLifetime
                        ? (t.lang === "es" ? "Membresía Founders" : "Founders Membership")
                        : (t.lang === "es" ? "PRIME anual" : "PRIME Annual")}
                    </p>
                    <p className="text-[10px] text-white/50 leading-snug">{subline}</p>

                  </div>

                  {/* CTA buttons */}
                  <div className="px-3 pb-3 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => { window.location.href = `/checkout?plan=${plan.id}`; }}
                      className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98]"
                      style={{ background: "linear-gradient(135deg, #D4007A, #9B00B0)", minHeight: 48 }}
                    >
                      Pay with card
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

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
            <input id="pnp-subscribe-1"
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

      {/* ── Hero gradient banner ─────────────────────────────────────────────── */}
      {(primePlans.length > 0 || memberPlans.length > 0) && (
        <div
          className="mb-5 rounded-[20px] px-5 py-6"
          style={{ background: "linear-gradient(115deg, #0B1436 0%, #D4007A 58%, #E69138 100%)" }}
        >
          <p
            className="uppercase text-white font-bold mb-1 leading-tight"
            style={{ fontFamily: "'Ethnocentric Rg', sans-serif", fontSize: 26 }}
          >
            {s.heroPrimary}
          </p>
          <p className="text-sm text-white leading-snug" style={{ opacity: 0.92 }}>
            {selectedPlanIsMember ? s.heroSubtextMember : s.heroSubtext}
          </p>
        </div>
      )}

      {/* ── Plan cards — radio-button selector style ─────────────────────────── */}
      <div className="space-y-3 mb-5">

        {memberPlans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const planLabel = getPlanLabel(plan, true);
          const hasAddOns = plan.addOns && plan.addOns.length > 0;
          const planDays = plan.duration_days || plan.duration || 30;

          return (
            <div
              key={plan.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => setSelectedPlan(plan.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedPlan(plan.id); } }}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background ${
                isSelected
                  ? "bg-pnp-surfaceRaised border-pnp-accent"
                  : "bg-pnp-surface border-pnp-border hover:border-pnp-controlBorder"
              }`}
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <div className="flex items-center gap-3">
                {/* Radio dot */}
                <div
                  className={`flex-shrink-0 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected ? "border-pnp-accent bg-pnp-accent" : "border-pnp-controlBorder bg-transparent"
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>

                {/* Plan info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold text-pnp-textPrimary leading-tight">
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
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-pnp-textTertiary">{durationLabel(planDays)}</span>
                    <span className="text-pnp-textTertiary text-[10px]">·</span>
                    <span className="text-[10px] text-pnp-textTertiary">{s.oneTimePayment}</span>
                  </div>
                  {hasAddOns && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
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
                </div>

                {/* Price */}
                <div className="flex-shrink-0 text-right">
                  <PriceDisplay amount={plan.price} className="text-pnp-textPrimary" />
                </div>
              </div>
            </div>
          );
        })}

        {primePlans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isRecommended = plan.id === recommendedPlanId || plan.sku === recommendedPlanId;
          const planLabel = getPlanLabel(plan, false);
          const hasAddOns = plan.addOns && plan.addOns.length > 0;
          const planDays = plan.duration_days || plan.duration || 30;

          // Compute per-month price for multi-month plans
          const perMonthPrice = (planDays >= 60 && planDays < 36500)
            ? formatPrice(plan.price / Math.max(1, Math.round(planDays / 30)), "USD")
            : null;

          // Savings tag: compare to monthly prime plan price if we can find it
          const monthlyPrimePlan = primePlans.find((p) => {
            const d = p.duration_days || p.duration || 0;
            return d >= 25 && d <= 40;
          });
          const monthlyEquivalent = monthlyPrimePlan && planDays >= 60 && planDays < 36500
            ? monthlyPrimePlan.price * Math.round(planDays / 30)
            : null;
          const savings = monthlyEquivalent && monthlyEquivalent > plan.price
            ? formatPrice(monthlyEquivalent - plan.price, "USD")
            : null;

          return (
            <div
              key={plan.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => setSelectedPlan(plan.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedPlan(plan.id); } }}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background ${
                isSelected
                  ? "bg-pnp-surfaceRaised border-pnp-accent"
                  : "bg-pnp-surface border-pnp-border hover:border-pnp-controlBorder"
              }`}
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <div className="flex items-center gap-3">
                {/* Radio dot */}
                <div
                  className={`flex-shrink-0 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected ? "border-pnp-accent bg-pnp-accent" : "border-pnp-controlBorder bg-transparent"
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>

                {/* Plan info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold text-pnp-textPrimary leading-tight">
                      {plan.display_name || plan.name}
                    </span>
                    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getLabelColor(planLabel)}`}>
                      {planLabel}
                    </span>
                    {isRecommended && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pnp-accent text-white">
                        {s.mostPopular}
                      </span>
                    )}
                    {isLifetimePlan(plan) && !isRecommended && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FFB454] text-[#1C1C1E] px-2 py-0.5 rounded-full">
                        {s.lifetime}
                      </span>
                    )}
                    {savings && !isRecommended && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(52,199,89,0.14)", color: "#34C759" }}
                      >
                        {s.saveBadge} {savings}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-xs text-pnp-textTertiary">{durationLabel(planDays)}</span>
                    {perMonthPrice && (
                      <>
                        <span className="text-pnp-textTertiary text-[10px]">·</span>
                        <span className="text-[10px] text-pnp-textTertiary">{perMonthPrice}{s.perMonth}</span>
                      </>
                    )}
                    <span className="text-pnp-textTertiary text-[10px]">·</span>
                    <span className="text-[10px] text-pnp-textTertiary">{s.oneTimePayment}</span>
                  </div>
                  {hasAddOns && (
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
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
                </div>

                {/* Price */}
                <div className="flex-shrink-0 text-right">
                  <PriceDisplay amount={plan.price} className="text-pnp-textPrimary" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Feature checklist ────────────────────────────────────────────────── */}
      {(memberPlans.length > 0 || primePlans.length > 0) && (() => {
        const isPrime = !selectedPlanIsMember;
        const features: Array<{ label: string; included: boolean }> = [
          { label: s.featFeedHangouts, included: true },
          { label: s.featDm, included: true },
          { label: s.featPremiumContent, included: isPrime },
          { label: s.featPrivateCalls, included: isPrime },
          { label: s.featMainStage, included: isPrime },
        ];
        return (
          <div className="mb-5 rounded-xl bg-pnp-surface border border-pnp-border p-4 space-y-3">
            {features.map(({ label, included }) => (
              <div key={label} className="flex items-center gap-3">
                {included ? (
                  <svg className="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  <svg className="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#707076" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 7l10 10M17 7L7 17" />
                  </svg>
                )}
                <span
                  className={`text-sm leading-tight ${
                    included ? "text-pnp-textPrimary" : "text-pnp-controlBorder line-through"
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Footer CTA — single pay button for selected plan ─────────────────── */}
      {selectedPlan && (() => {
        const plan = plans.find((p) => p.id === selectedPlan);
        if (!plan) return null;
        return (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => { window.location.href = `/checkout?plan=${plan.id}`; }}
              className="w-full h-12 rounded-xl bg-pnp-accent hover:bg-pnp-accentHover active:scale-[0.98] transition-all duration-150 font-semibold text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background"
            >
              {t.lang === "es" ? "Continuar" : "Continue"}
            </button>
            <p className="mt-2 text-center text-xs text-pnp-textTertiary">
              {s.renewsMonthly}
            </p>
          </div>
        );
      })()}

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
                    ? "✅ ¡Acceso activado! Tu nuevo plan ya está listo."
                    : "✅ Access activated! Your new plan is ready to go."}
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => { window.location.href = "/"; }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                    style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                  >
                    {t.lang === "es" ? "Ir a PNPtv" : "Go to PNPtv"}
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                    style={{ background: "rgba(255,255,255,0.12)" }}
                  >
                    {t.lang === "es" ? "Recargar" : "Refresh"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input id="pnp-subscribe-2"
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

