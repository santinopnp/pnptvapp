import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { tipTokens, sendTip, getWalletBalance } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { BuyTokensModal } from "@/components/BuyTokensModal";

/**
 * Shared Ru$h tip rail — used everywhere a member can tip a creator.
 *
 * Presets: 30 / 60 / 90 / 120 / 150 Ru$h (dual-labeled with USD @ 6 Ru$h = $1).
 *
 * Walkthroughs:
 *  - Zero / insufficient balance → inline "Top up with crypto" panel that
 *    opens BuyTokensModal (the shared Ru$h-purchase surface, NowPayments).
 *  - No wallet detected (`!window.ethereum` on desktop) → contextual
 *    "New to crypto? 2-min guide" link to /crypto-guide before top-up.
 *
 * Two API modes:
 *  - "ledger" (default): tipTokens → /api/webapp/tip-tokens.
 *      Works for creator profiles, hangout chats, in-call dock, spotlight,
 *      post cards, etc. Recipient credit is atomic Ru$h ledger.
 *  - "live":   sendTip → /api/proxy/live/tips. Only for the Live page —
 *      fires tip-goal + mainstage animation sockets.
 */

export const TIP_RUSH_PRESETS = [30, 60, 90, 120, 150] as const;

const USD_LABEL: Record<number, string> = {
  30: "$5",
  60: "$10",
  90: "$15",
  120: "$20",
  150: "$25",
};

interface TipRushRailProps {
  creatorId: string;
  creatorName?: string;
  mode?: "ledger" | "live";
  /** Compact = single row of chips only. Full = with message textarea + balance. */
  variant?: "compact" | "full";
  showMessage?: boolean;
  showBalance?: boolean;
  /** Called after a successful tip. */
  onSuccess?: (newBalance: number | null) => void;
  onClose?: () => void;
  className?: string;
}

function hasInjectedWallet(): boolean {
  if (typeof window === "undefined") return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyWin = window as any;
  if (anyWin.ethereum) return true;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  // Mobile deep-link wallets don't inject window.ethereum in Safari — treat
  // known in-app browsers as wallet-present so we don't nag mobile users.
  if (/TrustWallet|MetaMaskMobile|Rainbow/i.test(ua)) return true;
  return false;
}

export function TipRushRail({
  creatorId,
  creatorName,
  mode = "ledger",
  variant = "full",
  showMessage = true,
  showBalance = true,
  onSuccess,
  onClose,
  className,
}: TipRushRailProps) {
  const t = useI18n();
  const lang = t.lang === "es" ? "es" : "en";
  const [amount, setAmount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [needsTopUp, setNeedsTopUp] = useState(false);
  const hasWallet = useMemo(() => hasInjectedWallet(), []);

  // Load current Ru$h balance so users can see what they have before tipping.
  useEffect(() => {
    if (!showBalance) return;
    let cancelled = false;
    getWalletBalance()
      .then((r) => { if (!cancelled && r.success) setBalance(r.balance); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showBalance]);

  const insufficient = useMemo(() => {
    if (balance === null || amount === null) return false;
    return balance < amount;
  }, [balance, amount]);

  const send = useCallback(async () => {
    if (!amount || sending) return;
    setSending(true);
    setResult(null);
    setErrorMsg("");
    setNeedsTopUp(false);
    try {
      if (mode === "live") {
        const res = await sendTip(creatorId, amount, message.trim() || undefined);
        if (res.success) {
          setResult("success");
          const newBal = typeof res.newBalance === "number" ? res.newBalance : null;
          if (newBal !== null) setBalance(newBal);
          onSuccess?.(newBal);
        } else {
          setResult("error");
          setErrorMsg(lang === "es" ? "No se pudo enviar la propina." : "Could not send tip.");
        }
      } else {
        const res = await tipTokens(creatorId, amount, message.trim() || undefined);
        if (res.success) {
          setBalance(res.newBalance);
          setResult("success");
          onSuccess?.(res.newBalance);
        } else {
          setResult("error");
          setErrorMsg(lang === "es" ? "No se pudo enviar la propina." : "Could not send tip.");
        }
      }
    } catch (err: unknown) {
      setResult("error");
      const code = (err as { code?: string; status?: number })?.code;
      const status = (err as { code?: string; status?: number })?.status;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        code === "INSUFFICIENT_TOKENS" ||
        code === "INSUFFICIENT_FUNDS" ||
        status === 402 ||
        /insufficient/i.test(msg)
      ) {
        setNeedsTopUp(true);
        setErrorMsg(
          lang === "es"
            ? `Necesitas ${amount} Ru$h para esta propina.`
            : `You need ${amount} Ru$h for this tip.`
        );
      } else {
        setErrorMsg(msg || (lang === "es" ? "Error al enviar." : "Send failed."));
      }
    } finally {
      setSending(false);
    }
  }, [amount, message, sending, mode, creatorId, onSuccess, lang]);

  const showTopUpFlow = needsTopUp || insufficient;

  return (
    <div className={className}>
      {/* Header row: title + balance */}
      {variant === "full" && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">
            {lang === "es" ? "Enviar Ru$h 💎" : "Send Ru$h 💎"}
            {creatorName ? ` → ${creatorName}` : ""}
          </span>
          {showBalance && balance !== null && (
            <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {lang === "es" ? "Tu saldo" : "Your balance"}: {balance.toLocaleString()} 💎
            </span>
          )}
        </div>
      )}

      {/* Chip row */}
      <div
        className={
          variant === "compact"
            ? "flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
            : "grid grid-cols-5 gap-1.5 mb-3"
        }
        style={{ scrollbarWidth: "none" }}
      >
        {TIP_RUSH_PRESETS.map((amt) => {
          const selected = amount === amt;
          return (
            <button
              key={amt}
              type="button"
              onClick={() => { setAmount(selected ? null : amt); setResult(null); }}
              disabled={sending || result === "success"}
              className="min-h-[44px] flex flex-col items-center justify-center rounded-xl px-2 py-1.5 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap flex-shrink-0"
              style={
                selected
                  ? {
                      background: "linear-gradient(135deg, #D4007A, #E69138)",
                      color: "#fff",
                      border: "1px solid transparent",
                    }
                  : {
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.85)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }
              }
            >
              <span className="tabular-nums">{amt} 💎</span>
              <span className="text-[9px] font-normal opacity-70 mt-0.5">{USD_LABEL[amt]}</span>
            </button>
          );
        })}
      </div>

      {/* Message input */}
      {variant === "full" && showMessage && (
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 140))}
          placeholder={lang === "es" ? "Agrega un mensaje… (opcional)" : "Add a message… (optional)"}
          maxLength={140}
          rows={2}
          disabled={sending || result === "success"}
          className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none outline-none mb-3 disabled:opacity-60"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
        />
      )}

      {/* Success */}
      {result === "success" && (
        <div className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: "#34C759" }}>
          ✓ {lang === "es" ? "¡Propina enviada!" : "Tip sent!"}
        </div>
      )}

      {/* Error / needs top-up */}
      {result === "error" && !showTopUpFlow && errorMsg && (
        <p className="text-xs mb-3" style={{ color: "#FF6B6B" }}>{errorMsg}</p>
      )}

      {showTopUpFlow && (
        <div
          className="rounded-xl p-3 mb-3"
          style={{
            background: "rgba(212,0,122,0.08)",
            border: "1px solid rgba(212,0,122,0.30)",
          }}
        >
          <p className="text-sm font-semibold text-white mb-1">
            {lang === "es" ? "Saldo insuficiente" : "Not enough Ru$h"}
          </p>
          <p className="text-xs mb-2.5" style={{ color: "rgba(255,255,255,0.72)" }}>
            {lang === "es"
              ? `Compra Ru$h con crypto — se acredita al instante después de la confirmación.`
              : `Buy Ru$h with crypto — it lands in your balance the moment the payment confirms.`}
          </p>

          {!hasWallet && (
            <Link
              to="/crypto-guide"
              className="flex items-center gap-2 rounded-lg px-3 py-2 mb-2 text-xs font-semibold"
              style={{
                background: "rgba(123,97,255,0.10)",
                border: "1px solid rgba(123,97,255,0.30)",
                color: "#B8A5FF",
              }}
            >
              <span aria-hidden>🪄</span>
              <span>
                {lang === "es"
                  ? "¿Primera vez? Instala una wallet en 2 min →"
                  : "New here? Set up a wallet in 2 min →"}
              </span>
            </Link>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowTopUp(true)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-transform active:scale-95"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {lang === "es" ? "Comprar Ru$h con crypto" : "Buy Ru$h with crypto"}
            </button>
            <Link
              to="/crypto-guide"
              className="py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {lang === "es" ? "Guía 2 min" : "2-min guide"}
            </Link>
          </div>
        </div>
      )}

      {/* Send button */}
      {variant === "full" && (
        <button
          type="button"
          onClick={send}
          disabled={!amount || sending || result === "success" || insufficient}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
        >
          {sending
            ? (lang === "es" ? "Enviando…" : "Sending…")
            : insufficient
              ? (lang === "es" ? `Necesitas ${amount} Ru$h` : `Need ${amount} Ru$h`)
              : amount
                ? (lang === "es" ? `Enviar ${amount} 💎` : `Send ${amount} 💎`)
                : (lang === "es" ? "Elige un monto" : "Pick an amount")}
        </button>
      )}

      {/* Auto-send for compact variant (single chip → immediate send) */}
      {variant === "compact" && amount !== null && !insufficient && !sending && result !== "success" && (
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="mt-2 w-full py-2 rounded-xl text-xs font-bold text-white transition-transform active:scale-95"
          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
        >
          {lang === "es" ? `Enviar ${amount} 💎` : `Send ${amount} 💎`}
        </button>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-1.5 text-xs"
          style={{ color: "rgba(255,255,255,0.55)", background: "none", border: "none" }}
        >
          {lang === "es" ? "Cerrar" : "Close"}
        </button>
      )}

      {/* Top-up modal (BuyTokensModal handles the whole Ru$h purchase flow +
          NowPayments + wallet chips + crypto onboarding). */}
      <BuyTokensModal
        isOpen={showTopUp}
        onClose={() => setShowTopUp(false)}
        onSuccess={(newBalance) => {
          setBalance(newBalance);
          setNeedsTopUp(false);
          setShowTopUp(false);
        }}
      />
    </div>
  );
}

export default TipRushRail;
