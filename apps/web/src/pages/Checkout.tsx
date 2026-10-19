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

// ── Step indicator ────────────────────────────────────────────────────────────

type CheckoutStep = "plan" | "account" | "pay" | "success";

const STEPS: { key: CheckoutStep; label: string }[] = [
  { key: "plan", label: "Plan" },
  { key: "account", label: "Account" },
  { key: "pay", label: "Payment" },
  { key: "success", label: "Done" },
];
const STEP_INDEX: Record<CheckoutStep, number> = { plan: 0, account: 1, pay: 2, success: 3 };

function StepIndicator({ current }: { current: CheckoutStep }) {
  const currentIdx = STEP_INDEX[current];
  return (
    <div className="flex items-center justify-center gap-0 mb-8" role="list" aria-label="Checkout steps">
      {STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isLast = idx === STEPS.length - 1;
        return (
          <React.Fragment key={step.key}>
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
        const visible = (data.plans as SubscriptionPlan[]).filter((p) => !HIDDEN_PLAN_IDS.has(p.id));
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

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-pnp-textPrimary mb-1">Choose your plan</h2>
      <p className="text-sm text-pnp-textSecondary mb-4">
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
                "w-full text-left p-4 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent",
                isSelected
                  ? "border-pnp-accent bg-pnp-accent/10"
                  : "border-white/10 bg-pnp-surface hover:border-white/20",
              ].join(" ")}
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              aria-pressed={isSelected}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-pnp-textPrimary text-sm">
                      {plan.display_name || plan.name}
                    </span>
                    <span
                      className={[
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
                        tier === "PRIME"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          : "border-blue-400/40 bg-blue-400/10 text-blue-400",
                      ].join(" ")}
                    >
                      {tier}
                    </span>
                    {isRecommended && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-[#1C1C1E] px-2 py-0.5 rounded-full">
                        Best value
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-pnp-textSecondary">{durationLabel(days)}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className="text-2xl font-black text-pnp-textPrimary">{fmt(plan.price)}</div>
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
                  className="flex items-center gap-1 mt-2 text-xs font-semibold transition-colors focus-visible:outline-none"
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
            </button>
          </div>
        );
      })}

      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
        className="w-full min-h-[52px] rounded-2xl font-bold text-sm text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent mt-2"
        style={{
          background: "linear-gradient(135deg, #D4007A, #9B00B0)",
          boxShadow: selected ? "0 4px 24px rgba(212,0,122,0.35)" : "none",
        }}
      >
        {selected
          ? `Continue — ${fmt(selected.price)}`
          : "Select a plan to continue"}
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
  plan: SubscriptionPlan;
  email: string;
  receiverAddress: string;
  onBack: () => void;
  onSuccess: () => void;
}

function PayStep({ plan, email, receiverAddress, onBack, onSuccess }: PayStepProps) {
  const { user, getAccessToken } = usePrivy();
  const { depositFunds } = useDepositFunds();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gross = grossPrice(plan.price);
  const fee = +(gross - plan.price).toFixed(2);

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
        },
      });

      if (result.method === "fiat" && (result.status === "submitted" || result.status === "confirmed")) {
        // Get a fresh JWT token after on-ramp completes to authenticate the verify call.
        const token = await getAccessToken();
        await verifyCheckout(
          { planId: plan.id, privyUserId: user!.id, email: email || undefined },
          token,
        );
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

  const tier = getPlanTier(plan);

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
              <p className="font-semibold text-pnp-textPrimary text-sm">
                {plan.display_name || plan.name}
              </p>
              <p className="text-xs text-pnp-textSecondary mt-0.5">
                {durationLabel(plan.duration_days || plan.duration || 30)} of PRIME access
              </p>
            </div>
            <span
              className={[
                "text-[10px] font-bold px-2 py-1 rounded-full border flex-shrink-0",
                tier === "PRIME"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : "border-blue-400/40 bg-blue-400/10 text-blue-400",
              ].join(" ")}
            >
              {tier}
            </span>
          </div>
        </div>
        <div
          className="px-4 pt-3 pb-1 flex items-center justify-between border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <span className="text-xs text-pnp-textSecondary">Subscription</span>
          <span className="text-xs text-pnp-textPrimary">{fmt(plan.price)}</span>
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
          aria-label="Go back to plan selection"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Change plan
        </button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-pnp-textSecondary/50 leading-relaxed">
        <Lock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        Secured by Stripe · MoonPay · Meld · Privy
      </p>
    </div>
  );
}

// ── Step 4: Success ────────────────────────────────────────────────────────────

function SuccessStep({ plan }: { plan: SubscriptionPlan }) {
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
        <h2 className="text-2xl font-black text-pnp-textPrimary mb-1">You're in!</h2>
        <p className="text-sm text-pnp-textSecondary">
          {plan.display_name || plan.name} is now active on your account.
        </p>
      </div>
      <a
        href="/"
        className="w-full min-h-[52px] rounded-2xl font-bold text-sm text-white flex items-center justify-center transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-pnp-background focus-visible:ring-pnp-accent"
        style={{
          background: "linear-gradient(135deg, #D4007A, #9B00B0)",
          boxShadow: "0 4px 24px rgba(212,0,122,0.35)",
        }}
        aria-label="Go to PNPtv home"
      >
        Start watching →
      </a>
    </div>
  );
}

// ── Inner checkout shell ──────────────────────────────────────────────────────

function CheckoutInner() {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const initialPlanId = params.get("plan");

  const [step, setStep] = useState<CheckoutStep>("plan");
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
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

  const handlePlanSelect = useCallback((plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setStep("account");
  }, []);

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-start py-8 px-4"
      style={{ background: "#0A0A0F" }}
    >
      <Helmet>
        <title>Checkout — PNPtv!</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-1">
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
        {/* Card header */}
        <div
          className="px-6 pt-6 pb-4"
          style={{
            background: "linear-gradient(180deg, rgba(212,0,122,0.06) 0%, transparent 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <StepIndicator current={step} />
        </div>

        {/* Card body */}
        <div className="p-6">
          {step === "plan" && (
            <PlanStep initialPlanId={initialPlanId} onSelect={handlePlanSelect} />
          )}
          {step === "account" && (
            <AccountStep onDone={() => setStep("pay")} onEmailCapture={setEmail} />
          )}
          {step === "pay" && selectedPlan && (
            <PayStep
              plan={selectedPlan}
              email={email}
              receiverAddress={receiverAddress}
              onBack={() => setStep("plan")}
              onSuccess={() => setStep("success")}
            />
          )}
          {step === "success" && selectedPlan && <SuccessStep plan={selectedPlan} />}
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
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
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
