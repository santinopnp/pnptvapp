import React, { useState, useEffect, useRef, useCallback } from "react";
import { ConfirmDialog } from "@/components/creators/ConfirmDialog";
import {
  requestWithdrawal,
  getCashoutBalance,
  requestCashout,
  getCashoutHistory,
  getCreatorWallet,
  type ModelWithdrawal,
  type CashoutBalance,
  type CashoutHistoryItem,
  type PayoutLane,
  type PayoutDestinations,
} from "@/lib/api";
import type { CreatorStrings } from "@/lib/i18n/creator";
import { Info, AlertCircle, RefreshCw, Wallet, ChevronRight, X, Check, Loader } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_CASHOUT_USD = 5;
const POLL_INTERVAL_MS = 60_000;

type CashoutLane = PayoutLane; // re-export for local readability
type PayoutMethod = "bank_transfer" | "dash";

// Display metadata for each cashout lane. Order here drives the lane picker.
// Aligned with backend cashoutService.js (migration 364, 2026-08-08). The
// previous lanes (meru/btc/dash/usdt_*) are permanently retired — the backend
// rejects them with 400 INVALID_LANE, which is why cashout requests were
// silently failing in the wild before this fix.
const LANE_META: { id: PayoutLane; label: string; icon: string; destField: "address" | "handle" | "email" }[] = [
  { id: "usdc_erc20", label: "USDC — Ethereum",  icon: "💵", destField: "address" },
  { id: "eth",        label: "ETH — Ethereum",   icon: "⟠",  destField: "address" },
  { id: "bre_b",      label: "Bre-B (Colombia)", icon: "🇨🇴", destField: "handle"  },
  { id: "cashapp",    label: "Cash App",         icon: "💰", destField: "handle"  },
  { id: "wise",       label: "Wise",             icon: "🌍", destField: "email"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimeUntilAvailable(iso: string | null): { h: number; m: number } | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const totalMinutes = Math.ceil(diff / 60_000);
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60 };
}

function laneStatusColor(status: string): string {
  if (status === "settled" || status === "completed") return "#5ED1C4";
  if (status === "processing") return "#FFB454";
  if (status === "failed") return "#FF453A";
  return "#8E8E93";
}

function laneLabelKey(lane: CashoutLane, _t: CreatorStrings): string {
  const meta = LANE_META.find((l) => l.id === lane);
  return meta?.label ?? lane;
}

// Pull the destination payload (e.g. {address}, {handle}, or {email}) for a
// lane from the saved destinations blob. Returns null when the creator has not
// saved this lane yet — the modal disables that lane in the picker.
function destForLane(lane: PayoutLane, destinations: PayoutDestinations): Record<string, string> | null {
  const meta = LANE_META.find((l) => l.id === lane);
  if (!meta) return null;
  const entry = (destinations as Record<string, { handle?: string; address?: string; email?: string } | undefined>)[lane];
  if (!entry) return null;
  if (meta.destField === "handle") {
    return entry.handle ? { handle: entry.handle } : null;
  }
  if (meta.destField === "email") {
    return entry.email ? { email: entry.email } : null;
  }
  return entry.address ? { address: entry.address } : null;
}

function statusLabelKey(status: string, t: CreatorStrings): string {
  if (status === "pending") return t.cashoutStatusPending;
  if (status === "processing") return t.cashoutStatusProcessing;
  if (status === "settled" || status === "completed") return t.cashoutStatusSettled;
  if (status === "failed") return t.cashoutStatusFailed;
  return status;
}

// ── Balance card skeleton ─────────────────────────────────────────────────────

function BalanceSkeleton({ label }: { label: string }) {
  return (
    <div className="glass-card-sm p-5 animate-pulse" aria-busy="true" aria-label={label}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="h-3 w-16 rounded bg-white/10" />
          <div className="h-6 w-24 rounded bg-white/10" />
          <div className="h-3 w-20 rounded bg-white/10" />
        </div>
        <div className="space-y-2 flex flex-col items-end">
          <div className="h-3 w-20 rounded bg-white/10" />
          <div className="h-6 w-24 rounded bg-white/10" />
          <div className="h-9 w-28 rounded-xl bg-white/10" />
        </div>
      </div>
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={text}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="ml-1 text-white/30 hover:text-white/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded"
      >
        <Info size={12} aria-hidden="true" />
      </button>
      {visible && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52 text-[11px] leading-relaxed rounded-lg px-3 py-2 text-white/80 pointer-events-none"
          style={{ background: "var(--pnp-surface-hover, #2C2C2E)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// ── Balance card ──────────────────────────────────────────────────────────────

interface BalanceCardProps {
  balance: CashoutBalance | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCashout: () => void;
  t: CreatorStrings;
}

function BalanceCard({ balance, loading, error, onRetry, onCashout, t }: BalanceCardProps) {
  if (loading) return <BalanceSkeleton label={t.modalLoadingBalance} />;

  if (error) {
    return (
      <div
        className="glass-card-sm p-5 flex items-center justify-between gap-3"
        role="alert"
      >
        <div className="flex items-center gap-2 text-sm" style={{ color: "#FF453A" }}>
          <AlertCircle size={16} aria-hidden="true" />
          <span>{t.cashoutBalanceError}</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
          aria-label={t.cashoutRetry}
        >
          <RefreshCw size={12} aria-hidden="true" />
          {t.cashoutRetry}
        </button>
      </div>
    );
  }

  const bothZero = balance && balance.holding_usd === 0 && balance.available_usd === 0;
  if (!balance || bothZero) {
    return (
      <div className="glass-card-sm p-5 text-center py-8">
        <Wallet size={28} className="mx-auto mb-3" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }} aria-hidden="true" />
        <p className="text-sm" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.cashoutNoEarnings}</p>
      </div>
    );
  }

  const timeUntil = formatTimeUntilAvailable(balance.earliest_available_at);
  const canCashout = balance.available_usd >= MIN_CASHOUT_USD;

  return (
    <div className="glass-card-sm p-5" style={{ borderColor: "rgba(212,0,122,0.2)" }}>
      <div className="grid grid-cols-2 gap-4">
        {/* Holding column */}
        <div>
          <div className="flex items-center mb-1">
            <span className="text-xs font-medium" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {t.cashoutHoldingLabel}
            </span>
            <InfoTooltip text={t.cashoutHoldingTooltip} />
          </div>
          <p className="text-lg font-bold text-white">
            ${balance.holding_usd.toFixed(2)}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.cashoutHoldingCount(balance.holding_count)}
          </p>
          {timeUntil !== null && (
            <p className="text-xs mt-1" style={{ color: "#FFB454" }}>
              {t.cashoutAvailableIn(timeUntil.h, timeUntil.m)}
            </p>
          )}
        </div>

        {/* Available column */}
        <div className="flex flex-col items-end">
          <p className="text-xs font-medium mb-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.cashoutAvailableLabel}
          </p>
          <p className="text-lg font-bold" style={{ color: "#D4007A" }}>
            ${balance.available_usd.toFixed(2)}
          </p>
          <button
            type="button"
            onClick={onCashout}
            disabled={!canCashout}
            aria-label={t.cashoutCashOutBtn}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4007A] focus-visible:ring-offset-2"
            style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff", minHeight: 44 }}
          >
            <ChevronRight size={14} aria-hidden="true" />
            {t.cashoutCashOutBtn}
          </button>
          {!canCashout && (
            <p className="text-[10px] mt-1 text-center" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {t.cashoutMinimum}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Cash-out history ──────────────────────────────────────────────────────────

interface CashoutHistoryProps {
  items: CashoutHistoryItem[];
  loading: boolean;
  error: string | null;
  t: CreatorStrings;
}

function CashoutHistory({ items, loading, error, t }: CashoutHistoryProps) {
  if (loading) {
    return (
      <div className="space-y-2 animate-pulse" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-center py-4" style={{ color: "#FF453A" }}>
        {t.cashoutHistoryLoadError}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
        {t.cashoutHistoryEmpty}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
        >
          <div>
            <p className="text-sm font-medium text-white">${item.amount_usd.toFixed(2)}</p>
            <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {new Date(item.requested_at).toLocaleDateString()} &middot; {laneLabelKey(item.lane, t)}
            </p>
          </div>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: `${laneStatusColor(item.status)}22`,
              color: laneStatusColor(item.status),
            }}
          >
            {statusLabelKey(item.status, t)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Cash-out modal ────────────────────────────────────────────────────────────

interface CashoutModalProps {
  open: boolean;
  balance: CashoutBalance;
  onClose: () => void;
  onSuccess: () => void;
  t: CreatorStrings;
}

function CashoutModal({ open, balance, onClose, onSuccess, t }: CashoutModalProps) {
  const [lane, setLane] = useState<CashoutLane>("meru");
  const [amountStr, setAmountStr] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<PayoutDestinations>({});
  const [destLoading, setDestLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Esc
  useEffect(() => {
    if (!open) return;
    firstFocusableRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Load saved destinations from creator profile + reset modal state on open
  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setAmountStr("");
    setDestLoading(true);
    getCreatorWallet()
      .then((res) => {
        if (res.success) {
          setDestinations(res.destinations || {});
          // Pre-select the first lane that has a saved destination
          const firstAvailable = LANE_META.find((m) => destForLane(m.id, res.destinations || {}));
          if (firstAvailable) setLane(firstAvailable.id);
        }
      })
      .catch(() => {})
      .finally(() => setDestLoading(false));
  }, [open]);

  if (!open) return null;

  const selectedDest = destForLane(lane, destinations);
  const selectedMeta = LANE_META.find((m) => m.id === lane);
  const amountNum = parseFloat(amountStr) || 0;
  const amountValid =
    amountNum >= MIN_CASHOUT_USD &&
    amountNum <= balance.available_usd &&
    !!selectedDest;

  const handleSubmit = async () => {
    if (!selectedDest) {
      setSubmitError(t.modalAddDestFirst(selectedMeta?.label || lane));
      return;
    }
    if (!amountValid) {
      setSubmitError(
        amountNum < MIN_CASHOUT_USD
          ? t.modalMinCashout(MIN_CASHOUT_USD)
          : amountNum > balance.available_usd
            ? t.modalAmountExceedsBalance(balance.available_usd.toFixed(2))
            : t.modalInvalidAmount
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await requestCashout({
        amount_usd: amountNum,
        lane,
        destination: selectedDest,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t.cashoutErrorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.cashoutModalTitle}
    >
      <div
        ref={modalRef}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]"
        style={{ background: "var(--pnp-surface, #1C1C1E)", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">{t.cashoutModalTitle}</h2>
          <button
            ref={firstFocusableRef}
            type="button"
            onClick={onClose}
            aria-label={t.cancelBtn}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <X size={16} style={{ color: "var(--pnp-text-secondary, #8E8E93)" }} aria-hidden="true" />
          </button>
        </div>

        {/* Available balance summary */}
        <div className="px-5 pb-3 flex-shrink-0">
          <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.cashoutAvailableLabel}:{" "}
            <strong style={{ color: "#D4007A" }}>${balance.available_usd.toFixed(2)}</strong>
          </p>
        </div>

        <div className="px-5 pb-6 overflow-y-auto flex-1">
          {/* Lane picker */}
          <p className="text-xs font-semibold text-white mb-2">{t.modalPayoutMethod}</p>
          <div className="space-y-2 mb-4">
            {LANE_META.map((meta) => {
              const dest = destForLane(meta.id, destinations);
              const enabled = !!dest;
              const isSelected = lane === meta.id;
              const destPreview = dest ? (dest.handle || dest.address) : null;
              return (
                <button
                  key={meta.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={!enabled || destLoading}
                  onClick={() => { setLane(meta.id); setSubmitError(null); }}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-lg text-left transition-colors disabled:opacity-40"
                  style={{
                    background: isSelected ? "rgba(212,0,122,0.15)" : "rgba(255,255,255,0.04)",
                    border: isSelected ? "1px solid #D4007A" : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-sm font-semibold text-white">{meta.label}</span>
                  </span>
                  <span className="text-xs font-mono truncate max-w-[180px]"
                    style={{ color: enabled ? "#8E8E93" : "rgba(142,142,147,0.5)" }}>
                    {destPreview
                      ? (destPreview.length > 18 ? destPreview.slice(0, 8) + "…" + destPreview.slice(-6) : destPreview)
                      : t.modalAddInSettings}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Amount input */}
          <p className="text-xs font-semibold text-white mb-1">{t.modalAmountUsd}</p>
          <div className="relative mb-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
            <input
              type="number"
              min={MIN_CASHOUT_USD}
              max={balance.available_usd}
              step="0.01"
              value={amountStr}
              onChange={(e) => { setAmountStr(e.target.value); setSubmitError(null); }}
              placeholder={t.modalAmountPlaceholder(MIN_CASHOUT_USD, balance.available_usd.toFixed(2))}
              className="w-full pl-7 pr-3 py-2.5 rounded-lg text-sm text-white placeholder-white/30 bg-white/5 border border-white/10 focus:outline-none focus:border-white/30"
            />
          </div>
          <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.modalMinManualNote(MIN_CASHOUT_USD)}
          </p>

          {submitError && (
            <div
              className="mb-3 flex items-start gap-2 px-3 py-3 rounded-lg text-xs"
              style={{ background: "rgba(255,69,58,0.1)", color: "#FF453A" }}
              role="alert"
            >
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || destLoading || !amountValid}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff" }}
          >
            {submitting
              ? <span className="inline-flex items-center gap-2"><Loader size={14} className="animate-spin" /> {t.modalSubmitting}</span>
              : selectedMeta
                ? t.modalRequestVia(amountNum > 0 ? amountNum.toFixed(2) : "0.00", selectedMeta.label)
                : t.modalRequestCashout}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Legacy payout method selector ────────────────────────────────────────────

const DASH_ADDRESS_REGEX = /^[X7][1-9A-HJ-NP-Za-km-z]{33}$/;

type LegacyPayoutMethod = "bank_transfer" | "dash";

interface LegacyWithdrawCardProps {
  withdrawable: number;
  withdrawals: ModelWithdrawal[];
  t: CreatorStrings;
  onReload: () => Promise<void>;
}

function LegacyWithdrawCard({ withdrawable, withdrawals, t, onReload }: LegacyWithdrawCardProps) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<LegacyPayoutMethod>("bank_transfer");
  const [dashAddress, setDashAddress] = useState("");
  const [dashAddressError, setDashAddressError] = useState<string | null>(null);

  const validateAndConfirm = () => {
    setDashAddressError(null);
    if (payoutMethod === "dash") {
      const trimmed = dashAddress.trim();
      if (!trimmed) {
        setDashAddressError(t.legacyDashRequired);
        return;
      }
      if (!DASH_ADDRESS_REGEX.test(trimmed)) {
        setDashAddressError(t.legacyDashInvalid);
        return;
      }
    }
    setShowConfirm(true);
  };

  const handleWithdraw = async () => {
    setShowConfirm(false);
    setWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);
    try {
      const paymentDetails: Record<string, string> = {};
      if (payoutMethod === "dash" && dashAddress.trim()) {
        paymentDetails.dash_address = dashAddress.trim();
      }
      const res = await requestWithdrawal(payoutMethod, paymentDetails);
      const successMsg = payoutMethod === 'dash' || (payoutMethod as string) === 'dash_btcpay'
        ? t.legacyDashSuccess
        : t.legacyBankSuccess;
      setWithdrawSuccess(
        t.legacyWithdrawSuccessLine(t.withdrawAmount(res.data.withdrawal.amountUsd.toFixed(2)), successMsg)
      );
      await onReload();
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : t.legacyWithdrawFailed);
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <>
      {/* Withdraw card */}
      <div className="glass-card-sm p-5" style={{ borderColor: "rgba(94,209,196,0.2)" }}>
        <p className="text-sm font-semibold text-white mb-1">{t.requestWithdrawalTitle}</p>
        <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {t.availableBalance} <strong style={{ color: "#5ED1C4" }}>${withdrawable.toFixed(2)}</strong>
        </p>

        {/* Payout method selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.legacyPayoutMethodLabel}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setPayoutMethod("bank_transfer"); setDashAddressError(null); }}
              className="flex-1 text-xs font-semibold py-2 px-3 rounded-lg border transition-colors"
              style={{
                background: payoutMethod === "bank_transfer" ? "rgba(94,209,196,0.12)" : "rgba(255,255,255,0.04)",
                borderColor: payoutMethod === "bank_transfer" ? "#5ED1C4" : "rgba(255,255,255,0.1)",
                color: payoutMethod === "bank_transfer" ? "#5ED1C4" : "#8E8E93",
              }}
            >
              {t.legacyBankTransferBtn}
            </button>
            <button
              type="button"
              onClick={() => { setPayoutMethod("dash"); setDashAddressError(null); }}
              className="flex-1 text-xs font-semibold py-2 px-3 rounded-lg border transition-colors"
              style={{
                background: payoutMethod === "dash" ? "rgba(0,141,228,0.12)" : "rgba(255,255,255,0.04)",
                borderColor: payoutMethod === "dash" ? "#008DE4" : "rgba(255,255,255,0.1)",
                color: payoutMethod === "dash" ? "#008DE4" : "#8E8E93",
              }}
            >
              {t.legacyDashBtn}
            </button>
          </div>
        </div>

        {payoutMethod === "bank_transfer" && (
          <div
            className="mb-4 px-3 py-3 rounded-lg text-xs"
            style={{ background: "rgba(255,255,255,0.04)", color: "var(--pnp-text-secondary, #8E8E93)", lineHeight: "1.6" }}
          >
            <strong style={{ color: "#fff", display: "block", marginBottom: 4 }}>{t.legacyBankTransferTitle}</strong>
            {t.legacyBankTransferBody}
          </div>
        )}

        {payoutMethod === "dash" && (
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {t.legacyDashAddressLabel}
            </label>
            <input
              type="text"
              value={dashAddress}
              onChange={(e) => { setDashAddress(e.target.value); setDashAddressError(null); }}
              placeholder={t.legacyDashAddressPlaceholder}
              className="w-full text-xs px-3 py-2 rounded-lg border outline-none font-mono"
              style={{
                background: "rgba(255,255,255,0.05)",
                borderColor: dashAddressError ? "#ef4444" : "rgba(255,255,255,0.12)",
                color: "#fff",
              }}
            />
            {dashAddressError && (
              <p className="mt-1 text-xs" style={{ color: "#ef4444" }}>{dashAddressError}</p>
            )}
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {t.legacyDashHelpBody}
            </p>
          </div>
        )}

        {withdrawSuccess && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(94,209,196,0.1)", color: "#5ED1C4" }}>
            {withdrawSuccess}
          </div>
        )}
        {withdrawError && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs text-red-300" style={{ background: "rgba(239,68,68,0.1)" }}>
            {withdrawError}
          </div>
        )}

        <button
          onClick={validateAndConfirm}
          disabled={withdrawing || withdrawable <= 0}
          className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #5ED1C4, #00D4E8)", color: "#000" }}
        >
          {withdrawing ? t.processing : withdrawable <= 0 ? t.noBalance : t.withdrawAmount(withdrawable.toFixed(2))}
        </button>
      </div>

      {/* Withdrawal history */}
      <div className="glass-card-sm p-4">
        <p className="text-sm font-semibold text-white mb-3">{t.withdrawalHistoryTitle}</p>
        {withdrawals.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.noWithdrawalsYet}</p>
        ) : (
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-sm font-medium text-white">${w.amountUsd.toFixed(2)}</p>
                  <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {new Date(w.requestedAt).toLocaleDateString()} &middot; {w.method.replace("_", " ")}
                  </p>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: w.status === "completed" ? "rgba(94,209,196,0.15)" :
                                w.status === "pending" ? "rgba(255,180,84,0.15)" : "rgba(142,142,147,0.15)",
                    color: w.status === "completed" ? "#5ED1C4" :
                           w.status === "pending" ? "#FFB454" : "#8E8E93",
                  }}
                >
                  {statusLabelKey(w.status, t)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdrawal confirmation dialog */}
      <ConfirmDialog
        open={showConfirm}
        title={t.withdrawConfirmTitle}
        message={
          payoutMethod === "dash"
            ? t.legacyWithdrawDashConfirmMsg(withdrawable.toFixed(2), dashAddress.trim())
            : t.withdrawConfirmMsg(withdrawable.toFixed(2))
        }
        confirmLabel={t.withdrawBtn}
        cancelLabel={t.cancelBtn}
        onConfirm={handleWithdraw}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

// ── Main PayoutsTab ───────────────────────────────────────────────────────────

interface PayoutsTabProps {
  withdrawable: number;
  withdrawals: ModelWithdrawal[];
  t: CreatorStrings;
  onReload: () => Promise<void>;
}

export function PayoutsTab({ withdrawable, withdrawals, t, onReload }: PayoutsTabProps) {
  const [balance, setBalance] = useState<CashoutBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [historyItems, setHistoryItems] = useState<CashoutHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Inline toast state for cashout success
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    setBalanceError(null);
    try {
      const data = await getCashoutBalance();
      setBalance(data);
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : t.cashoutBalanceError);
    } finally {
      setBalanceLoading(false);
    }
  }, [t]);

  const fetchHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const data = await getCashoutHistory();
      setHistoryItems(data);
    } catch {
      setHistoryError(t.cashoutHistoryLoadError);
    } finally {
      setHistoryLoading(false);
    }
  }, [t]);

  // Initial fetch
  useEffect(() => {
    fetchBalance();
    fetchHistory();
  }, [fetchBalance, fetchHistory]);

  // Poll every 60s, pause when tab is hidden
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      timer = setInterval(() => {
        if (!document.hidden) {
          fetchBalance();
        }
      }, POLL_INTERVAL_MS);
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        fetchBalance();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchBalance]);

  const handleCashoutSuccess = useCallback(() => {
    setSuccessBanner(t.cashoutSuccessToast);
    fetchBalance();
    fetchHistory();
    setTimeout(() => setSuccessBanner(null), 8000);
  }, [t, fetchBalance, fetchHistory]);

  return (
    <div className="space-y-4">
      {/* Success banner */}
      {successBanner && (
        <div
          className="flex items-start gap-2 px-4 py-3 rounded-xl text-xs leading-relaxed"
          style={{ background: "rgba(94,209,196,0.12)", color: "#5ED1C4", border: "1px solid rgba(94,209,196,0.25)" }}
          role="status"
          aria-live="polite"
        >
          <Check size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          {successBanner}
        </div>
      )}

      {/* USDT Balance card */}
      <BalanceCard
        balance={balance}
        loading={balanceLoading}
        error={balanceError}
        onRetry={() => { setBalanceLoading(true); fetchBalance(); }}
        onCashout={() => setModalOpen(true)}
        t={t}
      />

      {/* USDT Cash-out history */}
      {(!balanceLoading && !balanceError) && (
        <div className="glass-card-sm p-4">
          <p className="text-sm font-semibold text-white mb-3">{t.cashoutHistoryTitle}</p>
          <CashoutHistory
            items={historyItems}
            loading={historyLoading}
            error={historyError}
            t={t}
          />
        </div>
      )}

      {/* Cash-out modal */}
      {modalOpen && balance && (
        <CashoutModal
          open={modalOpen}
          balance={balance}
          onClose={() => setModalOpen(false)}
          onSuccess={handleCashoutSuccess}
          t={t}
        />
      )}

      {/* Ru$h 💎 withdraw / convert panel — creator's two exits */}
      <RushCreatorPanel />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RushCreatorPanel — withdraw earnings to USDT OR convert to spendable Ru$h
// ─────────────────────────────────────────────────────────────────────────────

interface EarningsSummary {
  success: boolean;
  earnings: { available_usd: string | number; holding_usd: string | number; paidout_usd: string | number; inpayout_usd: string | number };
  wallet: { balance_tokens: number; gifted_balance: number; total: number };
}

interface WithdrawRequestRow {
  id: string;
  amount_usd: string | number;
  destination_currency: string;
  destination_address: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  completed_at: string | null;
  admin_notes: string | null;
  deny_reason: string | null;
}

const RUSH_TO_USD_MIN = 60; // must match backend RUSH_TO_USD_MIN

function RushCreatorPanel() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [reqs, setReqs] = useState<WithdrawRequestRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'withdraw' | 'convert' | 'rush_to_usd'>('none');
  const [wAmount, setWAmount] = useState('');
  const [wCurrency, setWCurrency] = useState('usdttrc20');
  const [wAddress, setWAddress] = useState('');
  const [cAmount, setCAmount] = useState('');
  const [rushConvertAmount, setRushConvertAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [s, r] = await Promise.all([
        fetch('/api/webapp/creators/earnings-summary', { credentials: 'include' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
        fetch('/api/webapp/creators/withdraw', { credentials: 'include' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
      ]);
      setSummary(s);
      setReqs(r.requests || []);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const availableUsd = summary ? parseFloat(String(summary.earnings.available_usd || 0)) : 0;

  const submitWithdraw = async () => {
    const amt = parseFloat(wAmount);
    if (!(amt >= 50)) { setErr('Minimum $50'); return; }
    if (amt > availableUsd) { setErr(`You only have $${availableUsd.toFixed(2)} available`); return; }
    if (wAddress.trim().length < 20) { setErr('Invalid destination address'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/webapp/creators/withdraw', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: amt, destinationAddress: wAddress.trim(), destinationCurrency: wCurrency }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOkMsg(`Withdrawal request for $${amt.toFixed(2)} submitted. Admin will review shortly.`);
      setMode('none'); setWAmount(''); setWAddress('');
      await load();
      setTimeout(() => setOkMsg(null), 8000);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Withdrawal failed'); }
    finally { setBusy(false); }
  };

  const submitConvert = async () => {
    const amt = parseFloat(cAmount);
    if (!(amt >= 1)) { setErr('Minimum $1'); return; }
    if (amt > availableUsd) { setErr(`You only have $${availableUsd.toFixed(2)} available`); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/webapp/creators/convert-earnings', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: amt }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOkMsg(`Converted $${amt.toFixed(2)} → ${j.rushCredited} 💎 Ru$h. Ready to spend on other creators.`);
      setMode('none'); setCAmount('');
      await load();
      setTimeout(() => setOkMsg(null), 8000);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Conversion failed'); }
    finally { setBusy(false); }
  };

  const submitRushToUsd = async () => {
    const rushAmt = parseInt(rushConvertAmount, 10);
    if (!Number.isFinite(rushAmt) || rushAmt < RUSH_TO_USD_MIN) {
      setErr(`Minimum is ${RUSH_TO_USD_MIN} 💎 Ru$h ($${(RUSH_TO_USD_MIN / 6).toFixed(2)} gross)`);
      return;
    }
    const walletBalance = summary?.wallet.balance_tokens ?? 0;
    if (rushAmt > walletBalance) {
      setErr(`You only have ${walletBalance} 💎 available`);
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/webapp/creators/rush-to-usd', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rushAmount: rushAmt }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOkMsg(`Converted ${j.rushAmount} 💎 Ru$h → $${Number(j.creatorUsd).toFixed(2)} USD earnings. Added to your next Monday payout.`);
      setMode('none'); setRushConvertAmount('');
      await load();
      setTimeout(() => setOkMsg(null), 10000);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Conversion failed'); }
    finally { setBusy(false); }
  };

  if (!summary) return null;

  return (
    <div className="glass-card-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Ru$h 💎 — Withdraw or Spend</h3>
        <button onClick={load} className="text-[10px] px-2 py-1 rounded bg-white/5 text-white/60 hover:bg-white/10">Refresh</button>
      </div>

      {okMsg && <div className="px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300">{okMsg}</div>}
      {err && <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/25 text-xs text-red-300">{err}</div>}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
          <div className="uppercase tracking-wider text-[10px] opacity-70">Available</div>
          <div className="font-mono text-sm">${availableUsd.toFixed(2)}</div>
        </div>
        <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300">
          <div className="uppercase tracking-wider text-[10px] opacity-70">Holding (72h)</div>
          <div className="font-mono text-sm">${Number(summary.earnings.holding_usd).toFixed(2)}</div>
        </div>
        <div className="p-2 rounded-md bg-purple-500/10 border border-purple-500/25 text-purple-300">
          <div className="uppercase tracking-wider text-[10px] opacity-70">Wallet balance</div>
          <div className="font-mono text-sm">{summary.wallet.total} 💎</div>
        </div>
      </div>

      {mode === 'none' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setMode('withdraw'); setErr(null); }}
              disabled={availableUsd < 50}
              className="p-3 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-200 hover:bg-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              💵 Withdraw to crypto
              <div className="text-[10px] opacity-70 mt-1">Min $50 to USDT-TRC20 or others</div>
            </button>
            <button
              onClick={() => { setMode('convert'); setErr(null); }}
              disabled={availableUsd < 1}
              className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              💎 Convert to spendable Ru$h
              <div className="text-[10px] opacity-70 mt-1">Spend on other creators</div>
            </button>
          </div>
          <button
            onClick={() => { setMode('rush_to_usd'); setErr(null); setRushConvertAmount(''); }}
            disabled={(summary?.wallet.balance_tokens ?? 0) < RUSH_TO_USD_MIN}
            className="w-full p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-sm text-left"
          >
            <div className="flex items-center justify-between">
              <span>💰 Withdraw Ru$h 💎 → USD earnings</span>
              <span className="text-[10px] opacity-60">{summary?.wallet.balance_tokens ?? 0} 💎 available</span>
            </div>
            <div className="text-[10px] opacity-70 mt-1">Min {RUSH_TO_USD_MIN} 💎 · 70% to you · 30% platform · paid next Tuesday</div>
          </button>
        </div>
      )}

      {mode === 'withdraw' && (
        <div className="space-y-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div className="flex items-center justify-between">
            <div className="text-xs text-blue-200 font-semibold">Withdraw to crypto</div>
            <button onClick={() => setMode('none')} className="text-[10px] text-white/60">Cancel</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number" step="0.01" min="50" placeholder={`Min $50 · Max $${availableUsd.toFixed(2)}`}
              value={wAmount} onChange={(e) => setWAmount(e.target.value)}
              className="col-span-1 px-2 py-2 rounded-md bg-black/40 border border-white/10 text-xs text-white"
            />
            <select
              value={wCurrency} onChange={(e) => setWCurrency(e.target.value)}
              className="col-span-1 px-2 py-2 rounded-md bg-black/40 border border-white/10 text-xs text-white"
            >
              <option value="usdttrc20">USDT (TRON)</option>
              <option value="usdterc20">USDT (ERC-20)</option>
              <option value="usdtbsc">USDT (BSC)</option>
              <option value="usdcsol">USDC (Solana)</option>
              <option value="btc">Bitcoin</option>
              <option value="dash">Dash</option>
            </select>
            <input
              type="text" placeholder="Destination address"
              value={wAddress} onChange={(e) => setWAddress(e.target.value)}
              className="col-span-1 px-2 py-2 rounded-md bg-black/40 border border-white/10 text-xs text-white"
            />
          </div>
          <button
            onClick={submitWithdraw} disabled={busy}
            className="w-full py-2 rounded-md bg-blue-500/25 border border-blue-500/40 text-blue-100 hover:bg-blue-500/35 disabled:opacity-50 text-sm"
          >{busy ? 'Submitting…' : 'Request withdrawal'}</button>
          <p className="text-[10px] text-white/50">Admin will review your request within 72 hours. You cannot cancel once approved.</p>
        </div>
      )}

      {mode === 'convert' && (
        <div className="space-y-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center justify-between">
            <div className="text-xs text-amber-200 font-semibold">Convert earnings → Ru$h 💎</div>
            <button onClick={() => setMode('none')} className="text-[10px] text-white/60">Cancel</button>
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="number" step="0.01" min="1" placeholder={`Min $1 · Max $${availableUsd.toFixed(2)}`}
              value={cAmount} onChange={(e) => setCAmount(e.target.value)}
              className="flex-1 px-2 py-2 rounded-md bg-black/40 border border-white/10 text-xs text-white"
            />
            <div className="text-xs text-amber-200 whitespace-nowrap">
              → {cAmount && !isNaN(parseFloat(cAmount)) ? Math.floor(parseFloat(cAmount) * 6) : 0} 💎
            </div>
          </div>
          <button
            onClick={submitConvert} disabled={busy}
            className="w-full py-2 rounded-md bg-amber-500/25 border border-amber-500/40 text-amber-100 hover:bg-amber-500/35 disabled:opacity-50 text-sm"
          >{busy ? 'Converting…' : 'Convert now'}</button>
          <p className="text-[10px] text-white/50">Instant. Spend Ru$h on private calls, tips, exclusive content, or upgrade your own membership.</p>
        </div>
      )}

      {mode === 'rush_to_usd' && (() => {
        const rushAmt = parseInt(rushConvertAmount, 10) || 0;
        const grossUsd = rushAmt > 0 ? rushAmt / 6 : 0;
        const creatorUsd = grossUsd * 0.70;
        const platformUsd = grossUsd * 0.30;
        const walletBalance = summary?.wallet.balance_tokens ?? 0;
        const isValid = rushAmt >= RUSH_TO_USD_MIN && rushAmt <= walletBalance;
        return (
          <div className="space-y-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div className="text-xs text-emerald-200 font-semibold">💰 Withdraw Ru$h → USD earnings</div>
              <button onClick={() => setMode('none')} className="text-[10px] text-white/60">Cancel</button>
            </div>

            {/* Input */}
            <div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-xs">💎</span>
                <input
                  type="number"
                  step="1"
                  min={RUSH_TO_USD_MIN}
                  max={walletBalance}
                  placeholder={`Min ${RUSH_TO_USD_MIN} · Max ${walletBalance}`}
                  value={rushConvertAmount}
                  onChange={(e) => { setRushConvertAmount(e.target.value); setErr(null); }}
                  className="w-full pl-8 pr-3 py-2.5 rounded-md bg-black/40 border border-white/10 text-xs text-white"
                />
              </div>
              <p className="text-[10px] mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                Available: {walletBalance} 💎
              </p>
            </div>

            {/* Live breakdown */}
            {rushAmt >= RUSH_TO_USD_MIN && (
              <div className="rounded-md border border-white/8 divide-y divide-white/5 text-xs overflow-hidden">
                <div className="flex justify-between px-3 py-2">
                  <span style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Gross value</span>
                  <span className="text-white font-mono">${grossUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <span style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Your earnings (70%)</span>
                  <span className="font-mono font-semibold" style={{ color: "#5ED1C4" }}>${creatorUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <span style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Platform fee (30%)</span>
                  <span className="font-mono" style={{ color: "#8E8E93" }}>${platformUsd.toFixed(2)}</span>
                </div>
              </div>
            )}

            <button
              onClick={submitRushToUsd}
              disabled={busy || !isValid}
              className="w-full py-2.5 rounded-md text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #34C759, #5ED1C4)", color: "#000" }}
            >
              {busy ? 'Converting…' : isValid ? `Convert ${rushAmt} 💎 → $${creatorUsd.toFixed(2)} USD` : `Enter amount (min ${RUSH_TO_USD_MIN} 💎)`}
            </button>
            <p className="text-[10px] text-white/40 text-center">
              Added to Monday payout batch · paid Tuesday
            </p>
          </div>
        );
      })()}

      {reqs.length > 0 && (
        <div className="rounded-md border border-white/10 overflow-hidden">
          <div className="px-3 py-2 bg-white/5 text-[10px] uppercase tracking-wider text-white/60">Withdrawal history</div>
          <table className="w-full text-xs">
            <thead className="bg-white/[0.02] text-white/50">
              <tr className="text-left">
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Amount</th>
                <th className="px-2 py-1">To</th>
                <th className="px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map(r => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="px-2 py-1 text-white/70">{new Date(r.requested_at).toLocaleDateString()}</td>
                  <td className="px-2 py-1 font-mono">${Number(r.amount_usd).toFixed(2)}</td>
                  <td className="px-2 py-1 text-white/50 text-[10px]">{r.destination_currency.toUpperCase()}</td>
                  <td className="px-2 py-1">
                    <span className={
                      r.status === 'paid'      ? 'text-emerald-300' :
                      r.status === 'denied'    ? 'text-red-300' :
                      r.status === 'cancelled' ? 'text-white/40' :
                      'text-amber-300'
                    }>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
