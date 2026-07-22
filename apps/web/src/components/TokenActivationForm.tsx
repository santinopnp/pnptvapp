/**
 * TokenActivationForm
 *
 * Renders the activation-code screen shared by BuyTokensModal (inline Meru flow)
 * and any future standalone page (e.g. /live?activate=CODE deep-link).
 *
 * It does NOT fetch the reservation itself — the parent is responsible for
 * calling reserveTokenActivation() and passing the result down as props.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  activateTokenCode,
  getTokenActivationStatus,
  getWalletBalance,
  type TokenActivationReserveResult,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;
const POLL_MAX_MS = 5 * 60 * 1000; // 5 min

const LS_KEY = "pnptv:token_activation:pending";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function persistActivation(data: TokenActivationReserveResult): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function loadPersistedActivation(): TokenActivationReserveResult | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TokenActivationReserveResult;
    // Discard if already expired
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPersistedActivation(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="animate-spin flex-shrink-0"
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivationState =
  | { kind: "idle" }
  | { kind: "activating" }
  | { kind: "polling"; startedAt: number }
  | { kind: "success"; tokens: number; newBalance: number }
  | { kind: "expired" }
  | { kind: "already_used" }
  | { kind: "error"; message: string };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TokenActivationFormProps {
  /** Full reservation result from reserveTokenActivation(). */
  reservation: TokenActivationReserveResult;
  /** Called when activation succeeds so the parent can refresh its balance display. */
  onSuccess?: (newBalance: number) => void;
  /** Called when user clicks "Start over" after expiry. */
  onReset?: () => void;
  /** Called immediately after successful activation (before the 3-second auto-close). */
  onClose?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TokenActivationForm({
  reservation,
  onSuccess,
  onReset,
  onClose,
}: TokenActivationFormProps) {
  const tAll = useI18n();
  const t = tAll.live;

  // Countdown display
  const [countdown, setCountdown] = useState(() => formatCountdown(reservation.expiresAt));
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clipboard feedback
  const [copied, setCopied] = useState(false);

  // Activation state machine
  const [state, setState] = useState<ActivationState>({ kind: "idle" });

  // Poll interval ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist the reservation so the user can resume via ?activate=CODE
  useEffect(() => {
    persistActivation(reservation);
    return () => {
      // Do NOT clear on unmount — user may have closed the modal mid-flow
    };
  }, [reservation]);

  // Countdown tick
  useEffect(() => {
    const tick = () => {
      const label = formatCountdown(reservation.expiresAt);
      setCountdown(label);
      if (label === "00:00") {
        if (countdownRef.current) clearInterval(countdownRef.current);
        // Surface expiry only if not already in a terminal state
        setState((prev) =>
          prev.kind === "idle" || prev.kind === "polling"
            ? { kind: "expired" }
            : prev
        );
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [reservation.expiresAt]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(reservation.activationCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [reservation.activationCode]);

  const handleOpenMeru = useCallback(() => {
    window.open(reservation.meruUrl, "_blank", "noopener,noreferrer");
  }, [reservation.meruUrl]);

  const runActivation = useCallback(async () => {
    setState({ kind: "activating" });
    try {
      const res = await activateTokenCode({ activationCode: reservation.activationCode });
      clearPersistedActivation();
      setState({ kind: "success", tokens: res.tokensCredited, newBalance: res.newBalance });
      if (onSuccess) onSuccess(res.newBalance);
      setTimeout(() => {
        if (onClose) onClose();
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      // Map backend error codes
      if (msg.includes("PAYMENT_REQUIRED") || msg.includes("402")) {
        // Start polling
        const startedAt = Date.now();
        setState({ kind: "polling", startedAt });
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          if (Date.now() - startedAt >= POLL_MAX_MS) {
            if (pollRef.current) clearInterval(pollRef.current);
            setState({ kind: "error", message: t.tokenActNotPaidYet });
            return;
          }
          try {
            const status = await getTokenActivationStatus(reservation.activationCode);
            if (status.status === "paid" || status.status === "activated") {
              // Re-run activation now that the backend sees payment
              if (pollRef.current) clearInterval(pollRef.current);
              try {
                const res2 = await activateTokenCode({ activationCode: reservation.activationCode });
                clearPersistedActivation();
                setState({ kind: "success", tokens: res2.tokensCredited, newBalance: res2.newBalance });
                if (onSuccess) onSuccess(res2.newBalance);
                setTimeout(() => {
                  if (onClose) onClose();
                }, 3000);
              } catch {
                // A second activate call after status=paid could 409 if the server
                // credited it automatically — treat as success by checking balance
                const balRes = await getWalletBalance().catch(() => ({ balance: 0 }));
                clearPersistedActivation();
                setState({ kind: "success", tokens: status.tokens, newBalance: balRes.balance });
                if (onSuccess) onSuccess(balRes.balance);
                setTimeout(() => {
                  if (onClose) onClose();
                }, 3000);
              }
            } else if (status.status === "expired") {
              if (pollRef.current) clearInterval(pollRef.current);
              setState({ kind: "expired" });
            }
          } catch {
            // keep polling on network errors
          }
        }, POLL_INTERVAL_MS);
      } else if (msg.includes("EXPIRED") || msg.includes("410")) {
        setState({ kind: "expired" });
      } else if (msg.includes("ALREADY_USED") || msg.includes("409")) {
        clearPersistedActivation();
        // Fetch real balance since tokens were already credited
        const balRes = await getWalletBalance().catch(() => ({ balance: 0 }));
        setState({ kind: "already_used" });
        if (onSuccess) onSuccess(balRes.balance);
      } else if (msg.includes("CODE_NOT_FOUND") || msg.includes("404")) {
        setState({
          kind: "error",
          message: tAll.lang === "es"
            ? "Código no encontrado. Verifica que lo ingresaste correctamente."
            : "Code not found. Check that you entered it correctly.",
        });
      } else {
        setState({
          kind: "error",
          message: msg ||
            (tAll.lang === "es"
              ? "Error de activación. Intenta de nuevo."
              : "Activation error. Please try again."),
        });
      }
    }
  }, [reservation.activationCode, t, tAll.lang, onSuccess, onClose]);

  const handleActivate = useCallback(() => {
    if (state.kind === "activating" || state.kind === "polling") return;
    runActivation();
  }, [state.kind, runActivation]);

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    clearPersistedActivation();
    setState({ kind: "idle" });
    if (onReset) onReset();
  }, [onReset]);

  // ── Success screen ────────────────────────────────────────────────────────

  if (state.kind === "success") {
    return (
      <div
        className="flex flex-col items-center gap-4 py-6 text-center"
        role="status"
        aria-live="polite"
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "rgba(212,0,122,0.18)" }}
          aria-hidden="true"
        >
          <svg
            className="w-8 h-8"
            style={{ color: "#D4007A" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-bold text-pnp-textPrimary">
          {t.tokenActSuccess(state.tokens, state.newBalance)}
        </p>
        <div className="flex items-center gap-2 text-xs text-pnp-textSecondary">
          <Spinner size={12} />
          <span>
            {tAll.lang === "es" ? "Cerrando…" : "Closing…"}
          </span>
        </div>
      </div>
    );
  }

  // ── Already-used screen ───────────────────────────────────────────────────

  if (state.kind === "already_used") {
    return (
      <div
        className="flex flex-col items-center gap-4 py-6 text-center"
        role="status"
        aria-live="polite"
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "rgba(34,197,94,0.15)" }}
          aria-hidden="true"
        >
          <svg
            className="w-8 h-8 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-pnp-textPrimary text-center">
          {t.tokenActAlreadyUsed}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.97]"
          style={{ background: "linear-gradient(90deg,#D4007A,#E69138)" }}
        >
          {tAll.lang === "es" ? "Cerrar" : "Close"}
        </button>
      </div>
    );
  }

  // ── Expired screen ────────────────────────────────────────────────────────

  if (state.kind === "expired") {
    return (
      <div
        className="flex flex-col items-center gap-4 py-6 text-center"
        role="alert"
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,69,58,0.15)" }}
          aria-hidden="true"
        >
          <svg
            className="w-8 h-8"
            style={{ color: "#FF453A" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-sm font-semibold text-pnp-textPrimary">{t.tokenActExpired}</p>
        <button
          type="button"
          onClick={handleReset}
          className="px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.97]"
          style={{ background: "linear-gradient(90deg,#D4007A,#E69138)" }}
        >
          {t.tokenActStartOver}
        </button>
      </div>
    );
  }

  // ── Main code screen ──────────────────────────────────────────────────────

  const isWorking = state.kind === "activating" || state.kind === "polling";

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <p className="text-sm font-bold text-pnp-textPrimary">{t.tokenActTitle}</p>
        <p className="text-xs text-pnp-textSecondary leading-relaxed mt-1">
          {t.tokenActSubtitle}
        </p>
      </div>

      {/* Activation code box */}
      <div>
        <p className="text-xs font-semibold text-pnp-textSecondary mb-2">
          {t.tokenActCodeLabel}
        </p>
        <div
          className="relative rounded-xl"
          style={{
            border: "2px dashed rgba(212,0,122,0.45)",
            background: "rgba(212,0,122,0.07)",
          }}
        >
          {/* Code display — role=textbox so screen readers can read + copy */}
          <div
            role="textbox"
            aria-readonly="true"
            aria-label={t.tokenActCodeLabel}
            className="px-4 py-4 text-center font-mono text-2xl font-bold tracking-widest text-pnp-textPrimary select-all break-all"
          >
            {reservation.activationCode}
          </div>

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? t.tokenActCodeCopied : t.tokenActCopyCode}
            className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
            style={{
              background: copied ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.08)",
              color: copied ? "#34C759" : "#A1A1A3",
              border: copied ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {copied ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            <span>{copied ? t.tokenActCodeCopied : t.tokenActCopyCode}</span>
          </button>
        </div>

        {/* Sub-labels: emailed note + countdown */}
        <div className="flex items-center justify-between mt-2 px-0.5">
          <p className="text-[11px] text-pnp-textSecondary">{t.tokenActAlsoEmailed}</p>
          <p
            className="text-[11px] font-mono font-semibold tabular-nums"
            style={{
              color:
                countdown === "00:00"
                  ? "#FF453A"
                  : parseInt(countdown.split(":")[0] || "99") < 5
                  ? "#FF9F0A"
                  : "#A1A1A3",
            }}
            aria-live="off"
          >
            {t.tokenActExpiresIn}: {countdown}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {state.kind === "error" && (
        <p role="alert" className="text-xs text-center" style={{ color: "#FF453A" }}>
          {state.message}
        </p>
      )}

      {/* Polling status */}
      {state.kind === "polling" && (
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
          style={{
            background: "rgba(255,159,10,0.10)",
            border: "1px solid rgba(255,159,10,0.30)",
            color: "#FF9F0A",
          }}
          role="status"
          aria-live="polite"
        >
          <Spinner size={12} />
          <span>{t.tokenActPolling}</span>
        </div>
      )}

      {/* Primary CTA: Open Meru — only rendered when we have a real URL.
          Deep-link arrivals (user returning from Meru via emailed link) have an
          empty meruUrl; hiding the button prevents opening a blank tab. */}
      {reservation.meruUrl && (
      <button
        type="button"
        onClick={handleOpenMeru}
        disabled={isWorking}
        aria-label={t.tokenActPayOnMeru(reservation.priceUsd ?? 0)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "linear-gradient(90deg,#D4007A,#E69138)" }}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
        {t.tokenActPayOnMeru(reservation.priceUsd ?? 0)}
      </button>
      )}

      {/* Secondary CTA: I already paid */}
      <button
        type="button"
        onClick={handleActivate}
        disabled={isWorking}
        aria-label={t.tokenActIAlreadyPaid}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "rgba(212,0,122,0.12)",
          border: "1px solid rgba(212,0,122,0.30)",
          color: "#f9a8d4",
        }}
      >
        {isWorking && <Spinner size={14} />}
        {state.kind === "activating"
          ? t.tokenActActivating
          : t.tokenActIAlreadyPaid}
      </button>

      {/* Privacy note */}
      <p className="text-[10px] text-pnp-textSecondary text-center leading-relaxed">
        {t.tokenActPrivacyNote}
      </p>
    </div>
  );
}
