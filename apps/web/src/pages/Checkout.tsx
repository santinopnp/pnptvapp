import React, { useState, useEffect, useCallback, useRef } from "react";
import { Helmet, HelmetProvider } from "react-helmet-async";
import {
  PrivyProvider,
  usePrivy,
  useLoginWithEmail,
  useDepositFunds,
} from "@privy-io/react-auth";
import { base } from "viem/chains";
import { Skeleton } from "@pnptv/ui-kit";
import type { SubscriptionPlan } from "@/lib/api";
import {
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Mail,
  Lock,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

// Fallback receiver address — overridden at runtime by /api/checkout/config receiverAddress
const DEFAULT_RECEIVER = (import.meta.env.VITE_PRIVY_CHECKOUT_RECEIVER ||
  "0x5d213FDDa92B5F9A78bf09cB360838cDa1eF7ED8") as string;

// Meld/Swapped charges ~3.9% on LATAM credit cards.
// We gross-up so the platform receives the full plan price after the fee.
const MELD_FEE_PCT = 0.039;

const HIDDEN_PLAN_IDS = new Set([
  "prime-trial-3d",
  "lifetime80",
  "monthly-pass-promo-15",
  "yearly50",
  "lifetime100",
  "lifetime-pass",
  "mondays_spundays_promo_20",
]);
const MEMBER_PLAN_IDS = new Set(["member_monthly"]);

const TOKEN_PACKAGES = [
  { id: "pkg_5",    tokens: 30,    usd: 5,    label: "30 Ru$h" },
  { id: "pkg_10",   tokens: 62,    usd: 10,   label: "62 Ru$h (+3%)" },
  { id: "pkg_25",   tokens: 155,   usd: 25,   label: "155 Ru$h (+3%)" },
  { id: "pkg_50",   tokens: 315,   usd: 50,   label: "315 Ru$h (+5%)" },
  { id: "pkg_100",  tokens: 636,   usd: 100,  label: "636 Ru$h (+6%)" },
  { id: "pkg_250",  tokens: 1620,  usd: 250,  label: "1,620 Ru$h (+8%)" },
  { id: "pkg_500",  tokens: 3270,  usd: 500,  label: "3,270 Ru$h (+9%)" },
  { id: "pkg_1000", tokens: 6600,  usd: 1000, label: "6,600 Ru$h (+10%)" },
  { id: "pkg_5000", tokens: 33000, usd: 5000, label: "33,000 Ru$h (+10%)" },
] as const;

type TokenPackage = typeof TOKEN_PACKAGES[number];

interface CallIntent {
  creatorId: string;
  packageId: string;
  packageLabel: string;
  priceUsd: number;
  creatorName: string;
  startAt?: string | null;
  endAt?: string | null;
  clientNotes?: string | null;
  creatorHandle?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function grossPrice(net: number): number {
  return Math.ceil((net / (1 - MELD_FEE_PCT)) * 100) / 100;
}

function durationLabel(days: number): string {
  if (days >= 36500) return "Lifetime";
  const years = Math.round(days / 365);
  if (days >= 365) return `${years} Year${years > 1 ? "s" : ""}`;
  const months = Math.round(days / 30);
  if (days >= 30) return `${months} Month${months > 1 ? "s" : ""}`;
  return `${days} Day${days > 1 ? "s" : ""}`;
}

function getPlanTier(plan: SubscriptionPlan): "PRIME" | "BASIC" {
  const t = (plan.tier || "").toLowerCase();
  return t === "member" || MEMBER_PLAN_IDS.has(plan.id) ? "BASIC" : "PRIME";
}

async function verifyCheckout(
  payload: { planId: string; privyUserId: string; email?: string },
  token?: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/checkout/verify", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Verification failed (${res.status})`);
  }
  return res.json();
}

async function verifyTokenCheckout(
  payload: { packageId: string; privyUserId: string; email?: string },
  token?: string | null,
): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/checkout/tokens/verify", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Verification failed (${res.status})`);
  }
  return res.json();
}

async function verifyCallCheckout(
  payload: {
    packageId: string;
    creatorId: string;
    startAt?: string | null;
    endAt?: string | null;
    clientNotes?: string | null;
    privyUserId: string;
    email?: string;
  },
  token?: string | null,
): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/checkout/calls/verify", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Verification failed (${res.status})`);
  }
  return res.json();
}

// ── Step indicator ────────────────────────────────────────────────────────────

type CheckoutStep = "plan" | "account" | "pay" | "success";
type CheckoutType = "" | "tokens" | "call";

function getSteps(type: CheckoutType): { key: CheckoutStep; label: string }[] {
  if (type === "tokens") {
    return [
      { key: "plan", label: "Tokens" },
      { key: "account", label: "Account" },
      { key: "pay", label: "Payment" },
      { key: "success", label: "Done" },
    ];
  }
  if (type === "call") {
    return [
      { key: "account", label: "Account" },
      { key: "pay", label: "Payment" },
      { key: "success", label: "Done" },
    ];
  }
  return [
    { key: "plan", label: "Plan" },
    { key: "account", label: "Account" },
    { key: "pay", label: "Payment" },
    { key: "success", label: "Done" },
  ];
}

function getStepIndex(type: CheckoutType, step: CheckoutStep): number {
  const steps = getSteps(type);
  return steps.findIndex((s) => s.key === step);
}

function StepIndicator({ current, type }: { current: CheckoutStep; type: CheckoutType }) {
  const steps = getSteps(type);
  const currentIdx = getStepIndex(type, current);

  return (
    <div className="flex items-center justify-center gap-0 mb-8" role="list" aria-label="Checkout steps">
      {steps.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isLast = idx === steps.length - 1;
        return (
          <React.Fragment key={step.key + String(idx)}>
            <div className="flex flex-col items-center gap-1.5" role="listitem">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                  isDone
                    ? "bg-pnp-accent text-white"
                    : isActive
                    ? "bg-pnp-accent/20 border-2 border-pnp-accent text-pnp-accent"
                    : "bg-pnp-surface border border-white/10 text-pnp-textSecondary",
                ].join(" ")}
                aria-current={isActive ? "step" : undefined}
              >
                {isDone ? (
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">{idx + 1}</span>
                )}
              </div>
              <span
                className={[
                  "text-[10px] font-medium transition-colors duration-300 hidden sm:block",
                  isActive ? "text-pnp-textPrimary" : "text-pnp-textSecondary",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={[
                  "h-px flex-1 mx-2 mb-5 transition-all duration-300",
                  isDone ? "bg-pnp-accent/60" : "bg-white/10",
                ].join(" ")}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Step 1: Plan ──────────────────────────────────────────────────────────────

interface PlanStepProps {
  initialPlanId: string | null;
  onSelect: (plan: SubscriptionPlan) => void;
}

function PlanStep({ initialPlanId, onSelect }: PlanStepProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recommendedId, setRecommendedId] = useState<string>("prime-diamond-pass-365d");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/checkout/config")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || !data.plans?.length) throw new Error("No plans available");
        const visible = (data.plans as SubscriptionPlan[]).filter((p) => !HIDDEN_PLAN_IDS.has(p.id) || p.id === initialPlanId);
        if (data.recommendedPlanId) setRecommendedId(data.recommendedPlanId as string);
        setPlans(visible);
        const preselect = initialPlanId
          ? visible.find((p) => p.id === initialPlanId)?.id
          : visible.find((p) => p.id === (data.recommendedPlanId || "prime-diamond-pass-365d"))?.id ||
            visible[0]?.id;
        setSelectedId(preselect || visible[0]?.id || null);
      })
      .catch((err: Error) => setError(err.message || "Failed to load plans"))
      .finally(() => setLoading(false));
  }, [initialPlanId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!initialPlanId || loading || plans.length === 0) return;
    const plan = plans.find((p) => p.id === selectedId);
    if (plan) onSelect(plan);
  }, [plans.length, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,69,58,0.15)" }}
        >
          <AlertTriangle className="w-5 h-5 text-pnp-error" aria-hidden="true" />
        </div>
        <p className="text-sm text-pnp-textSecondary">{error}</p>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] focus-visible:outline-none"
          style={{ background: "linear-gradient(135deg, #D4007A, #9B00B0)" }}
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  const selected = plans.find((p) => p.id === selectedId);
  void selected; // used for type narrowing below

  return (
    <div className="space-y-2">
      <h2 className="text-base font-bold text-pnp-textPrimary">Choose your plan</h2>
      <p className="text-xs text-pnp-textSecondary mb-2">
        Pay once, unlock full PRIME access.
      </p>

      {plans.map((plan) => {
        const tier = getPlanTier(plan);
        const isSelected = plan.id === selectedId;
        const isExpanded = expandedId === plan.id;
        const isRecommended = plan.id === recommendedId;
        const days = plan.duration_days || plan.duration || 30;
        const features = plan.features || [];

        return (
          <div key={plan.id}>
            <button
              type="button"
              onClick={() => setSelectedId(plan.id)}
              className={[
                "w-full text-left px-3 py-3 sm:p-4 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent",
                isSelected
                  ? "border-pnp-accent bg-pnp-accent/10"
                  : "border-white/10 bg-pnp-surface hover:border-white/20",
              ].join(" ")}
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              aria-pressed={isSelected}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-pnp-textPrimary text-sm leading-tight">
                      {plan.display_name || plan.name}
                    </span>
                    <span
                      className={[
                        "text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0",
                        tier === "PRIME"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          : "border-blue-400/40 bg-blue-400/10 text-blue-400",
                      ].join(" ")}
                    >
                      {tier}
                    </span>
                    {isRecommended && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-400 text-[#1C1C1E] px-1.5 py-0.5 rounded-full flex-shrink-0">
                        Best value
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-pnp-textSecondary mt-0.5">{durationLabel(days)}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className="text-xl font-black text-pnp-textPrimary">{fmt(plan.price)}</div>
                  <p className="text-[10px] text-pnp-textSecondary">USD</p>
                </div>
              </div>

              {features.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedId(isExpanded ? null : plan.id);
                  }}
                  className="flex items-center gap-1 mt-1.5 text-xs font-semibold transition-colors focus-visible:outline-none"
                  style={{ color: "#D4007A" }}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? "Hide features" : "Show features"}
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  )}
                </button>
              )}

              {isExpanded && features.length > 0 && (
                <ul className="mt-2 space-y-1" role="list">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-pnp-textSecondary">
                      <CheckCircle
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: "#D4007A" }}
                        aria-hidden="true"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              )}

              {isSelected && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(plan);
                  }}
                  className="w-full min-h-[44px] mt-2.5 rounded-xl font-bold text-sm text-white transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent"
                  style={{
                    background: "linear-gradient(135deg, #D4007A, #9B00B0)",
                    boxShadow: "0 4px 20px rgba(212,0,122,0.35)",
                  }}
                >
                  Continue — {fmt(plan.price)}
                </button>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1 (tokens): Token Package ────────────────────────────────────────────

interface TokenPackageStepProps {
  initialPkgId: string | null;
  onSelect: (pkg: TokenPackage) => void;
}

function TokenPackageStep({ initialPkgId, onSelect }: TokenPackageStepProps) {
  const [selectedId, setSelectedId] = useState<string>(
    initialPkgId && TOKEN_PACKAGES.find((p) => p.id === initialPkgId)
      ? initialPkgId
      : TOKEN_PACKAGES[0].id,
  );

  const selectedPkg = TOKEN_PACKAGES.find((p) => p.id === selectedId) ?? TOKEN_PACKAGES[0];

  return (
    <div className="space-y-2">
      <h2 className="text-base font-bold text-pnp-textPrimary">Choose a token package</h2>
      <p className="text-xs text-pnp-textSecondary mb-2">
        Ru$h tokens — spend them on tips, calls, and more.
      </p>

      {TOKEN_PACKAGES.map((pkg) => {
        const isSelected = pkg.id === selectedId;
        return (
          <button
            key={pkg.id}
            type="button"
            onClick={() => setSelectedId(pkg.id)}
            className={[
              "w-full text-left px-3 py-3 sm:p-4 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent",
              isSelected
                ? "border-pnp-accent bg-pnp-accent/10"
                : "border-white/10 bg-pnp-surface hover:border-white/20",
            ].join(" ")}
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            aria-pressed={isSelected}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 flex-shrink-0 text-amber-400" aria-hidden="true" />
                <span className="font-semibold text-pnp-textPrimary text-sm">{pkg.label}</span>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-xl font-black text-pnp-textPrimary">{fmt(pkg.usd)}</div>
                <p className="text-[10px] text-pnp-textSecondary">USD</p>
              </div>
            </div>
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onSelect(selectedPkg)}
        className="w-full min-h-[52px] mt-2 rounded-2xl font-bold text-sm text-white transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent"
        style={{
          background: "linear-gradient(135deg, #D4007A, #9B00B0)",
          boxShadow: "0 4px 24px rgba(212,0,122,0.35)",
        }}
      >
        Continue — {fmt(selectedPkg.usd)}
      </button>
    </div>
  );
}

// ── Step 2: Account (headless email OTP) ──────────────────────────────────────

interface AccountStepProps {
  onDone: () => void;
  onEmailCapture: (email: string) => void;
}

function AccountStep({ onDone, onEmailCapture }: AccountStepProps) {
  const { ready, authenticated, user } = usePrivy();
  const { sendCode, loginWithCode, state } = useLoginWithEmail();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Skip step if already authenticated
  useEffect(() => {
    if (!ready || !authenticated) return;
    const emailAccount = user?.linkedAccounts?.find(
      (a): a is { type: "email"; address: string } & typeof a => a.type === "email",
    );
    if (emailAccount?.address) onEmailCapture(emailAccount.address);
    onDone();
  }, [ready, authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  const isSending = state.status === "sending-code";
  const isSubmitting = state.status === "submitting-code";
  const needsCode = state.status === "awaiting-code-input" || state.status === "submitting-code";

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError("Please enter a valid email address.");
      return;
    }
    onEmailCapture(email);
    try {
      await sendCode({ email });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already_authenticated") || msg.includes("already authenticated")) {
        onDone();
      } else {
        setLocalError("Could not send code. Please try again.");
      }
    }
  };

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 4) return;
    setLocalError(null);
    try {
      await loginWithCode({ code });
      // authenticated useEffect handles onDone()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already_authenticated")) {
        onDone();
      } else if (msg.includes("invalid") || msg.includes("expired")) {
        setLocalError("Invalid or expired code. Try again.");
        setCode("");
      } else {
        setLocalError("Verification failed. Please try again.");
      }
    }
  };

  if (!ready) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
          style={{
            background: "linear-gradient(135deg, rgba(212,0,122,0.2), rgba(212,0,122,0.05))",
            border: "1px solid rgba(212,0,122,0.3)",
          }}
        >
          <Mail className="w-5 h-5" style={{ color: "#D4007A" }} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-pnp-textPrimary mb-1">
          {needsCode ? "Check your email" : "Your email"}
        </h2>
        <p className="text-sm text-pnp-textSecondary">
          {needsCode
            ? `We sent a 6-digit code to ${email}`
            : "We'll send your access confirmation here"}
        </p>
      </div>

      {!needsCode ? (
        <form onSubmit={handleSendCode} className="space-y-3" noValidate>
          <input
            ref={emailInputRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full h-12 px-4 rounded-xl border text-pnp-textPrimary text-sm bg-pnp-surface placeholder:text-pnp-textSecondary/50 focus:outline-none focus:ring-2 focus:ring-pnp-accent transition-all"
            style={{ borderColor: "rgba(255,255,255,0.12)" }}
            aria-label="Email address"
          />
          {localError && (
            <div className="flex items-start gap-2 text-xs text-pnp-error" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>{localError}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={isSending || !email}
            className="w-full min-h-[52px] rounded-2xl font-bold text-sm text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent"
            style={{
              background: "linear-gradient(135deg, #D4007A, #9B00B0)",
              boxShadow: "0 4px 24px rgba(212,0,122,0.35)",
            }}
          >
            {isSending ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                Sending code…
              </span>
            ) : (
              "Continue"
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmitCode} className="space-y-3" noValidate>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoFocus
            autoComplete="one-time-code"
            className="w-full h-14 px-4 rounded-xl border text-pnp-textPrimary text-center text-2xl font-bold tracking-widest bg-pnp-surface placeholder:text-pnp-textSecondary/30 focus:outline-none focus:ring-2 focus:ring-pnp-accent"
            style={{ borderColor: "rgba(255,255,255,0.12)" }}
            aria-label="Verification code"
          />
          {localError && (
            <div className="flex items-start gap-2 text-xs text-pnp-error" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>{localError}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting || code.length < 4}
            className="w-full min-h-[52px] rounded-2xl font-bold text-sm text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent"
            style={{
              background: "linear-gradient(135deg, #D4007A, #9B00B0)",
              boxShadow: "0 4px 24px rgba(212,0,122,0.35)",
            }}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                Verifying…
              </span>
            ) : (
              "Verify & Continue"
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setCode("");
              setLocalError(null);
              void sendCode({ email });
            }}
            className="w-full text-center text-xs text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors focus-visible:outline-none"
          >
            Resend code
          </button>
        </form>
      )}
    </div>
  );
}

// ── Step 3: Pay ────────────────────────────────────────────────────────────────

interface PayStepProps {
  label: string;
  sublabel: string;
  amountUsd: number;
  email: string;
  receiverAddress: string;
  onBack: () => void;
  onSuccess: () => void;
  verifyFn: (args: { privyUserId: string; email?: string }, token?: string | null) => Promise<unknown>;
}

function PayStep({ label, sublabel, amountUsd, email, receiverAddress, onBack, onSuccess, verifyFn }: PayStepProps) {
  const { user, getAccessToken } = usePrivy();
  const { depositFunds } = useDepositFunds();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gross = grossPrice(amountUsd);
  const fee = +(gross - amountUsd).toFixed(2);

  const handlePay = async () => {
    if (paying) return;
    setPaying(true);
    setError(null);

    try {
      // depositFunds opens the Meld/Swapped on-ramp modal.
      // We gross-up the amount so platform receives the full plan price after Meld's fee.
      // destination.wallet is our split wallet — USDC lands directly there.
      const result = await depositFunds({
        destination: {
          wallet: receiverAddress,
          asset: "usdc",
          chain: "base",
        },
        fiat: {
          environment: "production",
          defaultAmount: gross.toFixed(2),
          preferredProvider: "meld",
          source: { defaultAsset: "usd" },
        },
      });

      if (result.method === "fiat" && result.status === "confirmed") {
        // Get a fresh JWT token after on-ramp completes to authenticate the verify call.
        const token = await getAccessToken();
        await verifyFn({ privyUserId: user!.id, email: email || undefined }, token);
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      // User closed the modal — not an error worth showing
      if (
        msg.includes("cancel") ||
        msg.includes("exit") ||
        msg.includes("closed") ||
        msg.includes("user_exited") ||
        msg.includes("user closed")
      ) {
        setError(null);
      } else {
        setError(
          err instanceof Error ? err.message : "Payment could not be completed. Please try again.",
        );
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-pnp-textPrimary mb-1">Review your order</h2>

      {/* Order summary */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: "rgba(212,0,122,0.2)" }}
      >
        <div className="p-4" style={{ background: "rgba(212,0,122,0.05)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-pnp-textPrimary text-sm">{label}</p>
              <p className="text-xs text-pnp-textSecondary mt-0.5">{sublabel}</p>
            </div>
          </div>
        </div>
        <div
          className="px-4 pt-3 pb-1 flex items-center justify-between border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <span className="text-xs text-pnp-textSecondary">Amount</span>
          <span className="text-xs text-pnp-textPrimary">{fmt(amountUsd)}</span>
        </div>
        <div className="px-4 pb-3 flex items-center justify-between">
          <span className="text-xs text-pnp-textSecondary">Processing fee (3.9%)</span>
          <span className="text-xs text-pnp-textSecondary">{fmt(fee)}</span>
        </div>
        <div
          className="px-4 py-3 flex items-center justify-between border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(212,0,122,0.04)" }}
        >
          <span className="text-sm font-semibold text-pnp-textPrimary">Total due today</span>
          <span className="text-xl font-black text-pnp-textPrimary">{fmt(gross)}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border"
          style={{ background: "rgba(255,69,58,0.08)", borderColor: "rgba(255,69,58,0.25)" }}
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-pnp-error" aria-hidden="true" />
          <p className="text-sm text-pnp-textSecondary">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={handlePay}
          disabled={paying}
          className="w-full min-h-[56px] rounded-2xl font-bold text-base text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent"
          style={{
            background: "linear-gradient(135deg, #D4007A, #9B00B0)",
            boxShadow: "0 4px 24px rgba(212,0,122,0.35)",
          }}
          aria-label={`Pay ${fmt(gross)}`}
        >
          {paying ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              Processing…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" aria-hidden="true" />
              Pay {fmt(gross)} with card
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={paying}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl text-sm font-medium text-pnp-textSecondary hover:text-pnp-textPrimary transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent/50"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Go back
        </button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-pnp-textSecondary/50 leading-relaxed">
        <Lock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        Secured by Meld · Privy
      </p>
    </div>
  );
}

// ── Step 4: Success ────────────────────────────────────────────────────────────

interface SuccessStepProps {
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  returnUrl?: string;
}

function SuccessStep({
  title = "You're in!",
  subtitle = "Your PRIME access is now active.",
  ctaLabel = "Start watching →",
  returnUrl = "/",
}: SuccessStepProps) {
  return (
    <div className="text-center space-y-6 py-4">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
        style={{
          background: "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.08))",
          border: "2px solid rgba(16,185,129,0.4)",
        }}
      >
        <CheckCircle className="w-9 h-9 text-emerald-400" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-2xl font-black text-pnp-textPrimary mb-1">{title}</h2>
        <p className="text-sm text-pnp-textSecondary">{subtitle}</p>
      </div>
      <a
        href={returnUrl}
        className="w-full min-h-[52px] rounded-2xl font-bold text-sm text-white flex items-center justify-center transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent"
        style={{
          background: "linear-gradient(135deg, #D4007A, #9B00B0)",
          boxShadow: "0 4px 24px rgba(212,0,122,0.35)",
        }}
        aria-label={ctaLabel}
      >
        {ctaLabel}
      </a>
    </div>
  );
}

// ── Call summary banner ───────────────────────────────────────────────────────

function CallSummaryBanner({ intent }: { intent: CallIntent }) {
  const slotLabel = intent.startAt
    ? new Date(intent.startAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "ASAP";

  return (
    <div
      className="px-4 py-3 border-b"
      style={{
        background: "rgba(212,0,122,0.06)",
        borderColor: "rgba(212,0,122,0.15)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wider mb-0.5">
            Private Call
          </p>
          <p className="text-sm font-bold text-pnp-textPrimary truncate">
            {intent.creatorName}
            {intent.creatorHandle ? (
              <span className="font-normal text-pnp-textSecondary"> @{intent.creatorHandle}</span>
            ) : null}
          </p>
          <p className="text-xs text-pnp-textSecondary mt-0.5">{intent.packageLabel}</p>
          <p className="text-xs text-pnp-textSecondary">{slotLabel}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-black text-pnp-textPrimary">{fmt(intent.priceUsd)}</p>
          <p className="text-[10px] text-pnp-textSecondary">USD</p>
        </div>
      </div>
    </div>
  );
}

// ── Inner checkout shell ──────────────────────────────────────────────────────

function CheckoutInner() {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const initialPlanId = params.get("plan");
  const rawReturn = params.get("return") || "";
  const returnUrl = rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";
  const checkoutType = (params.get("type") || "") as CheckoutType;
  const initialPkgId = params.get("pkg");

  // Determine initial step
  const getInitialStep = (): CheckoutStep => {
    if (checkoutType === "call") return "account";
    return "plan";
  };

  const [step, setStep] = useState<CheckoutStep>(getInitialStep());
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedTokenPkg, setSelectedTokenPkg] = useState<TokenPackage | null>(null);
  const [callIntent, setCallIntent] = useState<CallIntent | null>(null);
  const [callIntentError, setCallIntentError] = useState(false);
  const [email, setEmail] = useState("");
  const [receiverAddress, setReceiverAddress] = useState<string>(DEFAULT_RECEIVER);

  // Load receiver address from backend config (overrides env default)
  useEffect(() => {
    fetch("/api/checkout/config")
      .then((r) => r.json())
      .then((data) => {
        if (data?.receiverAddress) setReceiverAddress(data.receiverAddress as string);
      })
      .catch(() => {/* keep default */});
  }, []);

  // For call type: read intent from sessionStorage
  useEffect(() => {
    if (checkoutType !== "call") return;
    try {
      const raw = sessionStorage.getItem("pnptv:call_intent");
      if (!raw) { setCallIntentError(true); return; }
      const parsed = JSON.parse(raw) as CallIntent;
      setCallIntent(parsed);
    } catch {
      setCallIntentError(true);
    }
  }, [checkoutType]);

  const handlePlanSelect = useCallback((plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setStep("account");
  }, []);

  const handleTokenPkgSelect = useCallback((pkg: TokenPackage) => {
    setSelectedTokenPkg(pkg);
    setStep("account");
  }, []);

  // Compute display properties for PayStep
  const getPayStepProps = (): { label: string; sublabel: string; amountUsd: number } => {
    if (checkoutType === "tokens" && selectedTokenPkg) {
      return {
        label: `${selectedTokenPkg.label} Tokens`,
        sublabel: "Ru$h tokens",
        amountUsd: selectedTokenPkg.usd,
      };
    }
    if (checkoutType === "call" && callIntent) {
      return {
        label: `Private Call with ${callIntent.creatorHandle ? `@${callIntent.creatorHandle}` : callIntent.creatorName}`,
        sublabel: `Private call · ${callIntent.packageLabel}`,
        amountUsd: callIntent.priceUsd,
      };
    }
    if (selectedPlan) {
      const tier = getPlanTier(selectedPlan);
      const days = selectedPlan.duration_days || selectedPlan.duration || 30;
      return {
        label: selectedPlan.display_name || selectedPlan.name,
        sublabel: `${durationLabel(days)} of ${tier} access`,
        amountUsd: selectedPlan.price,
      };
    }
    return { label: "", sublabel: "", amountUsd: 0 };
  };

  // Build verifyFn based on type
  const buildVerifyFn = (): ((args: { privyUserId: string; email?: string }, token?: string | null) => Promise<unknown>) | null => {
    if (checkoutType === "tokens" && selectedTokenPkg) {
      return (args, token) => verifyTokenCheckout({ ...args, packageId: selectedTokenPkg.id }, token);
    }
    if (checkoutType === "call" && callIntent) {
      return (args, token) =>
        verifyCallCheckout({
          ...args,
          packageId: callIntent.packageId,
          creatorId: callIntent.creatorId,
          startAt: callIntent.startAt,
          endAt: callIntent.endAt,
          clientNotes: callIntent.clientNotes,
        }, token);
    }
    if (selectedPlan) {
      return (args, token) => verifyCheckout({ ...args, planId: selectedPlan.id }, token);
    }
    return null;
  };

  // Success step props
  const getSuccessProps = (): SuccessStepProps => {
    if (checkoutType === "tokens") {
      return {
        title: "Tokens credited! ⚡",
        subtitle: "Your Ru$h tokens have been added to your wallet.",
        ctaLabel: "Go to wallet →",
        returnUrl: "/settings/payments",
      };
    }
    if (checkoutType === "call") {
      return {
        title: "Call booked!",
        subtitle: "Your call has been confirmed.",
        ctaLabel: "Go home →",
        returnUrl: "/",
      };
    }
    return {
      title: "You're in!",
      subtitle: "Your PRIME access is now active.",
      ctaLabel: "Start watching →",
      returnUrl,
    };
  };

  const payStepProps = getPayStepProps();
  const verifyFn = buildVerifyFn();
  const successProps = getSuccessProps();

  // Call type: no intent found
  if (checkoutType === "call" && callIntentError) {
    return (
      <div
        className="min-h-dvh w-full flex flex-col items-center justify-center py-6 px-4"
        style={{ background: "#0A0A0F" }}
      >
        <div className="w-full max-w-md text-center space-y-4">
          <AlertTriangle className="w-8 h-8 text-pnp-error mx-auto" aria-hidden="true" />
          <p className="text-sm text-pnp-textSecondary">
            No call booking found. Please go back and select a package.
          </p>
          <a
            href="/"
            className="inline-block text-sm font-semibold"
            style={{ color: "#D4007A" }}
          >
            ← Go back
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh w-full overflow-y-auto flex flex-col items-center py-6 px-4 pb-10"
      style={{ background: "#0A0A0F" }}
    >
      <Helmet>
        <title>Checkout — PNPtv!</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      {/* Logo */}
      <div className="mb-4 flex flex-col items-center gap-1">
        <a
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent rounded-lg"
          aria-label="Back to PNPtv home"
        >
          <img
            src="/logo.png"
            alt="PNPtv!"
            className="h-8 w-auto"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="text-xl font-black text-pnp-textPrimary">PNPtv!</span>
        </a>
        <p className="text-xs text-pnp-textSecondary">Secure checkout</p>
      </div>

      {/* Card container */}
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: "#1C1C1E",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,0,122,0.06)",
        }}
      >
        {/* Call summary banner — outside steps, always visible for call type */}
        {checkoutType === "call" && callIntent && step !== "success" && (
          <CallSummaryBanner intent={callIntent} />
        )}

        {/* Card header */}
        <div
          className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4"
          style={{
            background: "linear-gradient(180deg, rgba(212,0,122,0.06) 0%, transparent 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <StepIndicator current={step} type={checkoutType} />
        </div>

        {/* Card body */}
        <div className="p-4 sm:p-6">
          {/* Plan selection step */}
          {step === "plan" && checkoutType === "" && (
            <PlanStep initialPlanId={initialPlanId} onSelect={handlePlanSelect} />
          )}

          {/* Token package selection step */}
          {step === "plan" && checkoutType === "tokens" && (
            <TokenPackageStep initialPkgId={initialPkgId} onSelect={handleTokenPkgSelect} />
          )}

          {/* Account step */}
          {step === "account" && (
            <AccountStep
              onDone={() => setStep("pay")}
              onEmailCapture={setEmail}
            />
          )}

          {/* Pay step */}
          {step === "pay" && verifyFn && (
            <PayStep
              label={payStepProps.label}
              sublabel={payStepProps.sublabel}
              amountUsd={payStepProps.amountUsd}
              email={email}
              receiverAddress={receiverAddress}
              onBack={() => {
                if (checkoutType === "call") {
                  // For call, going back means going back to the booking modal
                  // We just go to account step (can't go back to plan)
                  setStep("account");
                } else {
                  setStep("plan");
                }
              }}
              onSuccess={() => setStep("success")}
              verifyFn={verifyFn}
            />
          )}

          {/* Success step */}
          {step === "success" && (
            <SuccessStep {...successProps} />
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-[11px] text-pnp-textSecondary/40 leading-relaxed">
        <a
          href="/terms"
          className="underline decoration-dotted hover:text-pnp-textSecondary/70 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms
        </a>
        {" · "}
        <a
          href="/privacy"
          className="underline decoration-dotted hover:text-pnp-textSecondary/70 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy
        </a>
      </p>
    </div>
  );
}

// ── Public export — wraps with its own PrivyProvider ─────────────────────────

export default function Checkout() {
  const appId = import.meta.env.VITE_PRIVY_CHECKOUT_APP_ID as string;
  const clientId = import.meta.env.VITE_PRIVY_CHECKOUT_CLIENT_DESKTOP as string | undefined;

  if (!appId) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center p-6 text-center"
        style={{ background: "#0A0A0F" }}
      >
        <div>
          <p className="text-pnp-textPrimary font-semibold mb-2">Checkout unavailable</p>
          <p className="text-xs text-pnp-textSecondary">
            VITE_PRIVY_CHECKOUT_APP_ID is not configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <HelmetProvider>
      <PrivyProvider
        appId={appId}
        clientId={clientId}
        config={{
          defaultChain: base,
          supportedChains: [base],
          loginMethodsAndOrder: {
            primary: ["email"],
          },
          embeddedWallets: { ethereum: { createOnLogin: "off" } },
          appearance: {
            theme: "dark",
            accentColor: "#D4007A",
            logo: "/logo.png",
          },
        }}
      >
        <CheckoutInner />
      </PrivyProvider>
    </HelmetProvider>
  );
}
