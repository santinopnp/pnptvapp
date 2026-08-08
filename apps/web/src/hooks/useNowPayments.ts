import { useState, useEffect, useCallback } from "react";
import {
  getUsdcSubscriptionStatus,
  prepareUsdcSubscription,
  assertPaymentUrl,
} from "@/lib/api";
import { isTelegramContext } from "@/lib/telegram";

export interface NowPaymentsOrder {
  orderId: string;
  planName: string;
  usdAmount: number;
  invoiceUrl: string;
  createdAt: number;
  nowpaymentsInvoiceId: string;
  payCurrency?: string | null;
  confirming?: boolean;
  // Onchain flow (MetaMask Embedded Wallets → Arbitrum). Populated only when
  // the order was created via /api/webapp/payments/onchain/prepare.
  payAddress?: string;
  payAmount?: string;
}

interface UseNowPaymentsOptions {
  storageKey?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  returnUrl?: string;
}

export function useNowPayments(options: UseNowPaymentsOptions = {}) {
  const {
    storageKey = "pnp_pending_usdc_order",
    onSuccess,
    onError,
    returnUrl,
  } = options;

  const [order, setOrder] = useState<NowPaymentsOrder | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPartiallyPaid, setIsPartiallyPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resume from storage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as NowPaymentsOrder;
        // Only resume if order is < 24h old (NOWPayments invoice TTL)
        if (parsed?.orderId && Date.now() - (parsed.createdAt || 0) < 86400000) {
          setOrder(parsed);
          setIsPolling(true);
        } else {
          sessionStorage.removeItem(storageKey);
        }
      }
    } catch (err) {
      console.error("Failed to resume NOWPayments order", err);
    }
  }, [storageKey]);

  // Polling logic
  useEffect(() => {
    if (!order || !isPolling || isSuccess) return;

    let cancelled = false;
    const maxDurationMs = 60 * 60 * 1000; // 60 min
    const startedAt = Date.now();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt >= maxDurationMs) {
        setIsPolling(false);
        return;
      }

      try {
        const data = await getUsdcSubscriptionStatus(order.orderId);
        if (cancelled) return;

        if (data.completed) {
          setIsPolling(false);
          setIsConfirming(false);
          setIsSuccess(true);
          sessionStorage.removeItem(storageKey);
          onSuccess?.();
          return;
        }

        if (data.confirming) {
          setIsConfirming(true);
        } else {
          setIsConfirming(false);
        }

        if (data.partiallyPaid) {
          setIsPartiallyPaid(true);
        } else {
          setIsPartiallyPaid(false);
        }

        if (data.failed) {
          setIsPolling(false);
          setIsConfirming(false);
          sessionStorage.removeItem(storageKey);
          const errMsg = "Payment failed or expired. Please try again.";
          setError(errMsg);
          onError?.(errMsg);
          return;
        }

        if (!cancelled) {
          timerId = setTimeout(poll, 8000);
        }
      } catch (err: any) {
        if (err.status === 401) {
          setIsPolling(false);
          return;
        }
        if (!cancelled) timerId = setTimeout(poll, 10000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [order, isPolling, isSuccess, storageKey, onSuccess, onError]);

  const startPayment = useCallback(async (planId: string, email?: string, creatorId?: string, isSubscription?: boolean, payCurrency?: string, promoCode?: string, storageKeyOverride?: string) => {
    setError(null);
    setIsSuccess(false);

    try {
      // creator_monthly ALWAYS uses /prepare (per feedback_creator_sub_uses_prepare.md).
      // The /subscribe endpoint only knows PRIME-tier NP subscription plans.
      const useSubscribe = isSubscription === true && planId !== "creator_monthly";
      const endpoint = useSubscribe ? "/api/webapp/payments/usdc/subscribe" : "/api/webapp/payments/usdc/prepare";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          planId,
          email,
          creatorId,
          ...(returnUrl ? { returnUrl } : {}),
          ...(payCurrency ? { payCurrency } : {}),
          ...(promoCode ? { promoCode } : {}),
        }),
      });

      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
        return { success: false, error: "Session expired" };
      }

      const result = await res.json();

      if (result.success && result.orderId && result.invoiceUrl) {
        const newOrder: NowPaymentsOrder = {
          orderId: result.orderId,
          planName: result.planName || "Subscription",
          usdAmount: result.usdAmount,
          invoiceUrl: result.invoiceUrl,
          createdAt: Date.now(),
          nowpaymentsInvoiceId: result.nowpaymentsInvoiceId || "",
          payCurrency: result.payCurrency || null,
        };

        setOrder(newOrder);
        setIsPolling(true);
        const effectiveKey = storageKeyOverride || storageKey;
        sessionStorage.setItem(effectiveKey, JSON.stringify(newOrder));

        if (isTelegramContext()) {
          window.Telegram!.WebApp.openLink(result.invoiceUrl);
        }
        return { success: true, order: newOrder };
      } else {
        const msg = result.error || "Failed to create crypto invoice.";
        setError(msg);
        onError?.(msg);
        return { success: false, error: msg };
      }
    } catch (err: any) {
      const msg = err.message || "An error occurred while preparing your payment.";
      setError(msg);
      onError?.(msg);
      return { success: false, error: msg };
    }
  }, [storageKey, onError, returnUrl]);

  const cancelOrder = useCallback(() => {
    setOrder(null);
    setIsPolling(false);
    setIsSuccess(false);
    setIsConfirming(false);
    setIsPartiallyPaid(false);
    sessionStorage.removeItem(storageKey);
  }, [storageKey]);

  return {
    order,
    isPolling,
    isSuccess,
    isConfirming,
    isPartiallyPaid,
    error,
    startPayment,
    cancelOrder,
    setError,
  };
}

// One-shot inline checkout: opens a NowPayments popup for the given plan
// (optionally scoped to a creator) and shows the crypto onboarding guide
// modal on the user's first-ever NP checkout. All paywall/upsell CTAs route
// through this so we never redirect to /subscribe.
const CRYPTO_GUIDE_SEEN_KEY = "pnp_crypto_guide_completed_v1";
const NP_POPUP_W = 520;
const NP_POPUP_H = 720;

function centeredNpPopup(url: string) {
  const left = Math.round(window.screenX + (window.outerWidth - NP_POPUP_W) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - NP_POPUP_H) / 2);
  return window.open(
    url,
    "nowpayments_checkout",
    `width=${NP_POPUP_W},height=${NP_POPUP_H},left=${left},top=${top},noopener,noreferrer`
  );
}

export function hasSeenCryptoGuide(): boolean {
  try { return localStorage.getItem(CRYPTO_GUIDE_SEEN_KEY) === "1"; } catch { return false; }
}
export function markCryptoGuideSeen() {
  try { localStorage.setItem(CRYPTO_GUIDE_SEEN_KEY, "1"); } catch { /* ignore */ }
}

interface InlineCheckoutArgs {
  planId: string;
  creatorId?: string;
  isSubscription?: boolean;
  storageKey?: string;
  payCurrency?: string;
}

export function useInlineNpCheckout(opts: { onSuccess?: () => void } = {}) {
  const [showGuide, setShowGuide] = useState(false);
  const [pending, setPending] = useState<InlineCheckoutArgs | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Underlying useNowPayments is instantiated with a stable fallback key.
  // Per-call storageKey is forwarded through startPayment's override arg so
  // concurrent paywalls on different creators don't overwrite each other's
  // pending orders.
  const { startPayment, order, isSuccess, isConfirming } = useNowPayments({
    storageKey: "pnp_pending_inline_np",
    onSuccess: opts.onSuccess,
  });

  const kick = useCallback(async (args: InlineCheckoutArgs) => {
    setLaunching(true);
    setError(null);
    const result = await startPayment(
      args.planId,
      undefined,
      args.creatorId,
      args.isSubscription,
      args.payCurrency,
      undefined,
      args.storageKey,
    );
    setLaunching(false);
    if (result.success && result.order?.invoiceUrl) {
      let safeUrl: string;
      try {
        safeUrl = assertPaymentUrl(result.order.invoiceUrl);
      } catch {
        setError("Invalid payment URL returned. Please try again.");
        return;
      }
      if (isTelegramContext()) {
        window.Telegram!.WebApp.openLink(safeUrl);
      } else {
        const popup = centeredNpPopup(safeUrl);
        if (!popup) {
          setError("Your browser blocked the payment window. Please allow popups for this site and try again.");
        }
      }
    } else if (result.error) {
      setError(result.error);
    }
  }, [startPayment]);

  const start = useCallback((args: InlineCheckoutArgs) => {
    if (hasSeenCryptoGuide()) {
      kick(args);
    } else {
      setPending(args);
      setShowGuide(true);
    }
  }, [kick]);

  const confirmGuideAndStart = useCallback(() => {
    markCryptoGuideSeen();
    setShowGuide(false);
    if (pending) kick(pending);
  }, [pending, kick]);

  // Skip: close the guide and fire the payment, but do NOT mark the guide
  // as seen. The user might want to see it next time.
  const skipGuideAndStart = useCallback(() => {
    setShowGuide(false);
    if (pending) kick(pending);
  }, [pending, kick]);

  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    setPending(null);
  }, []);

  return {
    start,
    showGuide,
    confirmGuideAndStart,
    skipGuideAndStart,
    dismissGuide,
    order,
    isSuccess,
    isConfirming,
    launching,
    error,
  };
}
