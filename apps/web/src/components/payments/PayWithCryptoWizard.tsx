import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useNowPayments } from "@/hooks/useNowPayments";
import { NowPaymentsWaitingPanel } from "@/components/payments/NowPaymentsWaitingPanel";
import { getSubscriptionPlans, NP_COINS, type SubscriptionPlan } from "@/lib/api";
import { StepDots } from "@pnptv/ui-kit";

// ── Pay with Crypto Wizard ─────────────────────────────────────────────────
// A self-contained, reusable modal that walks a user through paying with
// crypto: pick a plan (unless one is preselected) → pick a coin → watch the
// NOWPayments invoice. Drop it anywhere with a trigger button; it owns its
// own useNowPayments() instance so multiple mount points never collide.

type WizardStep = "plan" | "coin" | "pay";

export interface PayWithCryptoWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Pre-select and lock a plan — skips the plan-picking step. */
  planId?: string;
  /** Associates the purchase with a specific creator (creator subscription). */
  creatorId?: string;
  /** Recurring subscription vs one-time invoice. Defaults to one-time. */
  isSubscription?: boolean;
  /** Optional header override, e.g. "Subscribe to @model with crypto". */
  title?: string;
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function durationLabel(days: number, es: boolean): string {
  if (days >= 36500) return es ? "De por vida" : "Lifetime";
  if (days >= 365) {
    const years = Math.round(days / 365);
    return es ? `${years} ${years === 1 ? "año" : "años"}` : `${years} ${years === 1 ? "Year" : "Years"}`;
  }
  if (days >= 30) {
    const months = Math.round(days / 30);
    return es ? `${months} ${months === 1 ? "mes" : "meses"}` : `${months} ${months === 1 ? "Month" : "Months"}`;
  }
  return es ? `${days} días` : `${days} ${days === 1 ? "Day" : "Days"}`;
}

export function PayWithCryptoWizard({
  open,
  onClose,
  onSuccess,
  planId,
  creatorId,
  isSubscription = false,
  title,
}: PayWithCryptoWizardProps) {
  const { user } = useAuth();
  const t = useI18n();
  const es = t.lang === "es";

  const [step, setStep] = useState<WizardStep>(planId ? "coin" : "plan");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(planId || null);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const {
    order,
    isSuccess,
    isConfirming,
    startPayment,
    cancelOrder,
  } = useNowPayments({
    storageKey: "pnp_pending_crypto_wizard_order",
    returnUrl: typeof window !== "undefined" ? window.location.pathname : undefined,
    onSuccess: () => {
      onSuccess?.();
    },
  });

  // Reset wizard state whenever it's (re)opened — unless a payment is already
  // in flight (resumed from sessionStorage by useNowPayments), in which case
  // jump straight to the waiting panel instead of losing it behind step 1.
  useEffect(() => {
    if (!open) return;
    if (order) {
      setStep("pay");
      return;
    }
    setStep(planId ? "coin" : "plan");
    setSelectedPlanId(planId || null);
    setSelectedCoin(null);
    setStartError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planId]);

  useEffect(() => {
    if (!open || planId) return;
    setLoadingPlans(true);
    setPlansError(null);
    getSubscriptionPlans()
      .then((res) => {
        if (res.success && res.plans.length > 0) {
          setPlans(res.plans);
        } else {
          setPlansError(es ? "No hay planes disponibles." : "No plans available right now.");
        }
      })
      .catch((err) => setPlansError(err?.message || (es ? "No se pudieron cargar los planes." : "Failed to load plans.")))
      .finally(() => setLoadingPlans(false));
  }, [open, planId, es]);

  if (!open) return null;

  async function handlePickCoin(coinCode: string) {
    if (!selectedPlanId || starting) return;
    setSelectedCoin(coinCode);
    setStarting(true);
    setStartError(null);
    try {
      const result = await startPayment(selectedPlanId, user?.email || undefined, creatorId, isSubscription, coinCode);
      if (!result.success) {
        setStartError(result.error || (es ? "No se pudo crear la factura." : "Failed to create the invoice."));
        return;
      }
      setStep("pay");
    } finally {
      setStarting(false);
    }
  }

  function handleCancelOrder() {
    cancelOrder();
    setSelectedCoin(null);
    setStep(planId ? "coin" : "plan");
  }

  function handleClose() {
    if (order && !isSuccess) cancelOrder();
    onClose();
  }

  function handleDone() {
    onClose();
  }

  const headerTitle =
    title ||
    (step === "plan"
      ? es ? "Paga con Cripto" : "Pay with Crypto"
      : step === "coin"
        ? es ? "Elige tu moneda" : "Choose your coin"
        : es ? "Completa tu pago" : "Complete your payment");

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="crypto-wizard-title"
      onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}
      tabIndex={-1}
    >
      <div
        className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-pnp-background border border-pnp-border rounded-t-2xl sm:rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {step === "coin" && !planId && (
              <button
                onClick={() => setStep("plan")}
                className="flex items-center justify-center min-w-[40px] min-h-[40px] w-10 h-10 rounded-full bg-pnp-surface hover:bg-pnp-surfaceHover transition-colors flex-shrink-0"
                aria-label={es ? "Volver" : "Back"}
              >
                <svg className="w-4 h-4 text-pnp-textSecondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 id="crypto-wizard-title" className="text-base font-bold text-pnp-textPrimary truncate">
              {headerTitle}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center min-w-[40px] min-h-[40px] w-10 h-10 rounded-full text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors flex-shrink-0"
            aria-label={es ? "Cerrar" : "Close"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-5">
          <StepDots total={3} current={(["plan", "coin", "pay"] as WizardStep[]).indexOf(step) + 1} />
        </div>

        {/* Step: Plan */}
        {step === "plan" && (
          <div className="space-y-2.5">
            {loadingPlans && (
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-pnp-surface animate-pulse" />
                ))}
              </div>
            )}
            {plansError && <p className="text-sm text-pnp-error">{plansError}</p>}
            {!loadingPlans && plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => { setSelectedPlanId(plan.id); setStep("coin"); }}
                className="w-full text-left p-3.5 rounded-xl border border-pnp-border bg-pnp-surface hover:border-pnp-accent/50 hover:bg-pnp-surfaceHover transition-all active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-pnp-textPrimary truncate">
                      {plan.display_name || plan.name}
                    </p>
                    <p className="text-xs text-pnp-textSecondary mt-0.5">
                      {durationLabel(plan.duration_days || plan.duration || 30, es)}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-pnp-textPrimary flex-shrink-0">
                    {formatUsd(plan.price)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step: Coin */}
        {step === "coin" && (
          <div className="space-y-4">
            {selectedPlan && (
              <div className="rounded-xl border border-pnp-border bg-pnp-surface p-3 flex items-center justify-between">
                <span className="text-sm text-pnp-textSecondary">
                  {selectedPlan.display_name || selectedPlan.name}
                </span>
                <span className="text-sm font-bold text-pnp-textPrimary">{formatUsd(selectedPlan.price)}</span>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-pnp-textSecondary">
                  {es ? "USDT es la opción más fácil para principiantes." : "USDT is the easiest option for first-timers."}
                </p>
                <a
                  href="/crypto-guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[10px] font-semibold text-amber-300 hover:text-amber-200 underline decoration-dotted underline-offset-2"
                >
                  {es ? "¿Qué red? →" : "Which network? →"}
                </a>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {NP_COINS.map((coin) => {
                  const isUsdt = coin.code === "usdtbsc" || coin.code === "usdttrc20";
                  const isPicking = starting && selectedCoin === coin.code;
                  return (
                    <button
                      key={coin.code}
                      type="button"
                      disabled={starting}
                      onClick={() => handlePickCoin(coin.code)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-colors disabled:opacity-50 ${
                        isUsdt
                          ? "border-pnp-tealMuted/40 bg-pnp-tealMuted/10 hover:bg-pnp-tealMuted/20"
                          : "border-pnp-border bg-pnp-surface hover:bg-pnp-surfaceHover"
                      }`}
                    >
                      <span className="text-lg leading-none" style={{ color: coin.color }}>{isPicking ? "…" : coin.icon}</span>
                      <span className={`text-[11px] font-semibold ${isUsdt ? "text-pnp-tealMuted" : "text-pnp-textPrimary"}`}>
                        {coin.label}
                      </span>
                      {isUsdt && <span className="text-[8px] font-bold text-pnp-tealMuted/80">★</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {startError && <p className="text-sm text-pnp-error">{startError}</p>}
          </div>
        )}

        {/* Step: Pay */}
        {step === "pay" && order && (
          <div className="space-y-3">
            {selectedPlan && (
              <div className="rounded-xl border border-pnp-border bg-pnp-surface p-3 flex items-center justify-between">
                <span className="text-sm text-pnp-textSecondary">
                  {selectedPlan.display_name || selectedPlan.name}
                </span>
                <span className="text-sm font-bold text-pnp-textPrimary">{formatUsd(selectedPlan.price)}</span>
              </div>
            )}
            <NowPaymentsWaitingPanel
              order={order}
              isSuccess={isSuccess}
              isConfirming={isConfirming}
              onCancel={handleCancelOrder}
              lang={t.lang}
              payCurrency={selectedCoin ?? order.payCurrency ?? null}
              productKind="subscription"
            />
            {isSuccess && (
              <button
                type="button"
                onClick={handleDone}
                className="w-full min-h-[48px] rounded-xl font-semibold text-white transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}
              >
                {es ? "Listo" : "Done"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
