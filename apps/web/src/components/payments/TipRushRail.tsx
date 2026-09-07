import { useState, useEffect, useCallback, useMemo } from "react";
import { tipTokens, sendTip, getWalletBalance, getTokenPackages, type TokenPackage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { BuyTokensModal } from "@/components/BuyTokensModal";

/**
 * Shared Ru$h tip rail — used everywhere a member can tip a creator.
 *
 * STATE A (balance > 0): custom Ru$h amount input + "Max" button → send.
 * STATE B (balance = 0): package grid ($25/$50/$100/$500/$1000 with clear
 *   bonus breakdown) → opens BuyTokensModal to top up → returns to STATE A.
 *
 * Two API modes:
 *  - "ledger" (default): tipTokens → /api/webapp/tip-tokens.
 *  - "live": sendTip → /api/proxy/live/tips (fires tip animations).
 */

export const TIP_RUSH_PRESETS = [30, 60, 90, 120, 150] as const;

// Packages to display in the top-up grid. Matched by usd against API response;
// fallback to base rate (6 Ru$h / $1) when not found.
const TOPUP_AMOUNTS_USD = [25, 50, 100, 500, 1000] as const;

interface TipRushRailProps {
  creatorId: string;
  creatorName?: string;
  mode?: "ledger" | "live";
  variant?: "compact" | "full";
  showMessage?: boolean;
  showBalance?: boolean;
  allowGifted?: boolean;
  selectedPreset?: number | null;
  onSuccess?: (newBalance: number | null) => void;
  onClose?: () => void;
  className?: string;
}

const GIFTED_ALLOWED_IDS = ["8599671840", "8f5f4dd1-7bdb-4571-b026-e09d91113c91"];

export function TipRushRail({
  creatorId,
  creatorName,
  mode = "ledger",
  variant = "full",
  showMessage = true,
  allowGifted = false,
  selectedPreset = null,
  onSuccess,
  onClose,
  className,
}: TipRushRailProps) {
  const t = useI18n();
  const es = t.lang === "es";

  // ── Balance ────────────────────────────────────────────────────────────────
  const [regularBalance, setRegularBalance] = useState<number | null>(null);
  const [giftedBalance, setGiftedBalance] = useState<number | null>(null);
  const giftedAllowedForTarget = allowGifted && GIFTED_ALLOWED_IDS.includes(creatorId);
  const balance = useMemo(() => {
    if (regularBalance === null && giftedBalance === null) return null;
    const reg = regularBalance ?? 0;
    const gif = giftedBalance ?? 0;
    return giftedAllowedForTarget ? reg + gif : reg;
  }, [regularBalance, giftedBalance, giftedAllowedForTarget]);

  useEffect(() => {
    let cancelled = false;
    getWalletBalance()
      .then((r) => {
        if (cancelled || !r.success) return;
        setRegularBalance(r.regularBalance);
        setGiftedBalance(r.giftedBalance);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── STATE A: tip state ─────────────────────────────────────────────────────
  const [customRush, setCustomRush] = useState<string>("");
  const [pickedMax, setPickedMax] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // When parent passes a preset, seed the custom field.
  useEffect(() => {
    if (selectedPreset !== null) setCustomRush(String(selectedPreset));
  }, [selectedPreset]);

  const tipAmount = useMemo(() => {
    if (pickedMax && balance !== null && balance > 0) return balance;
    const n = parseInt(customRush, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [pickedMax, balance, customRush]);

  const insufficient = useMemo(
    () => balance !== null && tipAmount !== null && balance < tipAmount,
    [balance, tipAmount]
  );

  const send = useCallback(async () => {
    if (!tipAmount || sending) return;
    setSending(true);
    setResult(null);
    setErrorMsg("");
    try {
      if (mode === "live") {
        const res = await sendTip(creatorId, tipAmount, message.trim() || undefined);
        if (res.success) {
          setResult("success");
          getWalletBalance().then((w) => {
            if (!w.success) return;
            setRegularBalance(w.regularBalance);
            setGiftedBalance(w.giftedBalance);
          }).catch(() => {});
          onSuccess?.(typeof res.newBalance === "number" ? res.newBalance : null);
        } else {
          setResult("error");
          setErrorMsg(es ? "No se pudo enviar la propina." : "Could not send tip.");
        }
      } else {
        const res = await tipTokens(creatorId, tipAmount, message.trim() || undefined);
        if (res.success) {
          setRegularBalance(res.newBalance);
          if (typeof res.newGiftedBalance === "number") setGiftedBalance(res.newGiftedBalance);
          setResult("success");
          onSuccess?.(res.newBalance);
        } else {
          setResult("error");
          setErrorMsg(es ? "No se pudo enviar la propina." : "Could not send tip.");
        }
      }
    } catch (err: unknown) {
      setResult("error");
      const code = (err as { code?: string })?.code;
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === "INSUFFICIENT_TOKENS" || code === "INSUFFICIENT_FUNDS" || status === 402 || /insufficient/i.test(msg)) {
        setErrorMsg(es ? `Saldo insuficiente para ${tipAmount} Ru$h.` : `Not enough Ru$h to send ${tipAmount} 💎.`);
      } else {
        setErrorMsg(msg || (es ? "Error al enviar." : "Send failed."));
      }
    } finally {
      setSending(false);
    }
  }, [tipAmount, message, sending, mode, creatorId, onSuccess, es]);

  // ── STATE B: top-up state ──────────────────────────────────────────────────
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [selectedTopupUsd, setSelectedTopupUsd] = useState<number | null>(null);
  const [customTopupUsd, setCustomTopupUsd] = useState<string>("");
  const [showBuyModal, setShowBuyModal] = useState(false);

  // Fetch packages once (when STATE B is first rendered).
  useEffect(() => {
    if (balance !== null && balance > 0) return;
    getTokenPackages().then((r) => {
      if (r.success) setPackages(r.packages);
    }).catch(() => {});
  }, [balance]);

  // Resolved top-up amount (user-selected pkg usd OR custom input), min $25.
  const topupUsd = useMemo(() => {
    if (selectedTopupUsd !== null) return selectedTopupUsd;
    const n = parseFloat(customTopupUsd);
    return Number.isFinite(n) && n >= 25 ? n : null;
  }, [selectedTopupUsd, customTopupUsd]);

  // For each display amount, find the API package (for bonus) or fall back.
  const displayPackages = useMemo(() =>
    TOPUP_AMOUNTS_USD.map((usd) => {
      const pkg = packages.find((p) => Number(p.usd) === usd);
      const baseRush = Math.round(usd * 6);
      const totalRush = pkg ? Number(pkg.tokens) : baseRush;
      const bonus = pkg?.bonus ?? (totalRush - baseRush > 0 ? totalRush - baseRush : 0);
      return { usd, totalRush, baseRush, bonus, pkgId: pkg?.id ?? null };
    }),
    [packages]
  );

  // ── Compact variant ────────────────────────────────────────────────────────
  // Compact keeps a minimal UI for Chat/hangout contexts. If no balance,
  // just shows a "Get Ru$h" button that opens BuyTokensModal.
  if (variant === "compact") {
    if (balance === null) {
      return <div className={`flex items-center justify-center py-2 ${className ?? ""}`}><span className="text-xs text-white/40">{es ? "Cargando…" : "Loading…"}</span></div>;
    }
    if (balance === 0) {
      return (
        <div className={`${className ?? ""}`}>
          <button
            type="button"
            onClick={() => setShowBuyModal(true)}
            className="w-full py-2 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
          >
            {es ? "Conseguir Ru$h 💎" : "Get Ru$h 💎"}
          </button>
          <BuyTokensModal isOpen={showBuyModal} onClose={() => setShowBuyModal(false)} onSuccess={(nb) => { setRegularBalance(nb); setShowBuyModal(false); }} />
        </div>
      );
    }
    // Has balance — show max chip + custom + auto-send button
    return (
      <div className={`${className ?? ""}`}>
        <div className="flex gap-2 mb-2">
          <input
            id="pnp-tiprushrail-compact-custom"
            type="number"
            inputMode="numeric"
            min={1}
            max={balance}
            value={pickedMax ? String(balance) : customRush}
            onChange={(e) => { setCustomRush(e.target.value); setPickedMax(false); }}
            placeholder={es ? "Ru$h a enviar" : "Ru$h to send"}
            disabled={sending || result === "success"}
            className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none tabular-nums"
            style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <button
            type="button"
            onClick={() => { setPickedMax(true); setCustomRush(String(balance)); }}
            disabled={sending || result === "success"}
            className="px-3 py-2 rounded-lg text-xs font-bold text-white transition active:scale-95"
            style={{ background: "rgba(212,0,122,0.20)", border: "1px solid rgba(212,0,122,0.35)" }}
          >
            {es ? "Todo" : "Max"}
            <span className="block text-[9px] opacity-70">{balance.toLocaleString()} 💎</span>
          </button>
        </div>
        {result === "success" ? (
          <p className="text-center text-sm text-emerald-400 font-semibold py-2">✓ {es ? "¡Propina enviada!" : "Tip sent!"}</p>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!tipAmount || sending || insufficient || result === "success"}
            className="w-full py-2 rounded-xl text-sm font-bold text-white transition active:scale-95 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
          >
            {sending ? (es ? "Enviando…" : "Sending…") : tipAmount ? `${es ? "Enviar" : "Send"} ${tipAmount} 💎` : (es ? "Ingresa un monto" : "Enter amount")}
          </button>
        )}
        {result === "error" && <p className="text-xs text-red-400 mt-1">{errorMsg}</p>}
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (balance === null) {
    return (
      <div className={`space-y-2 ${className ?? ""}`}>
        {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-white/[0.05] animate-pulse" />)}
      </div>
    );
  }

  // ── STATE B: no Ru$h — show top-up packages ────────────────────────────────
  if (balance === 0) {
    return (
      <div className={className}>
        <p className="text-sm font-bold text-white mb-1">
          {es ? "Recarga Ru$h para propinar 💎" : "Top up Ru$h to send a tip 💎"}
        </p>
        <p className="text-[11px] text-white/50 mb-4">
          {es
            ? `El monto que no uses queda en tu billetera${creatorName ? ` para cuando quieras propinarle a ${creatorName} u otros` : ""}.`
            : `Any Ru$h you don't use stays in your wallet${creatorName ? ` for future tips to ${creatorName} or anyone else` : ""}.`}
        </p>

        {/* Package grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {displayPackages.slice(0, 3).map(({ usd, totalRush, baseRush, bonus }) => {
            const selected = selectedTopupUsd === usd;
            return (
              <button
                key={usd}
                type="button"
                onClick={() => { setSelectedTopupUsd(selected ? null : usd); setCustomTopupUsd(""); }}
                className="flex flex-col items-center py-3 px-2 rounded-xl border transition active:scale-95"
                style={selected
                  ? { background: "rgba(212,0,122,0.15)", borderColor: "rgba(212,0,122,0.55)" }
                  : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}
              >
                <span className="text-base font-black text-white">${usd}</span>
                <span className="text-xs font-bold mt-0.5" style={{ color: "#10b981" }}>
                  {bonus > 0 ? `${baseRush} + ${bonus}` : `${totalRush}`} 💎
                </span>
                {bonus > 0 && (
                  <span className="text-[9px] text-emerald-400/80 mt-0.5">
                    {bonus} {es ? "bonus" : "bonus"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {displayPackages.slice(3).map(({ usd, totalRush, baseRush, bonus }) => {
            const selected = selectedTopupUsd === usd;
            return (
              <button
                key={usd}
                type="button"
                onClick={() => { setSelectedTopupUsd(selected ? null : usd); setCustomTopupUsd(""); }}
                className="flex flex-col items-center py-3 px-2 rounded-xl border transition active:scale-95"
                style={selected
                  ? { background: "rgba(212,0,122,0.15)", borderColor: "rgba(212,0,122,0.55)" }
                  : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}
              >
                <span className="text-base font-black text-white">${usd}</span>
                <span className="text-xs font-bold mt-0.5" style={{ color: "#10b981" }}>
                  {bonus > 0 ? `${baseRush} + ${bonus}` : `${totalRush}`} 💎
                </span>
                {bonus > 0 && (
                  <span className="text-[9px] text-emerald-400/80 mt-0.5">
                    {bonus} {es ? "bonus" : "bonus"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom amount (min $25) */}
        <div className="mb-3">
          <div
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">
              {es ? "Otro monto" : "Custom amount"}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-white/60 font-bold">$</span>
              <input
                id="pnp-tiprushrail-topup-custom"
                type="number"
                inputMode="decimal"
                min={25}
                step={1}
                value={customTopupUsd}
                onChange={(e) => {
                  setCustomTopupUsd(e.target.value);
                  setSelectedTopupUsd(null);
                }}
                placeholder={es ? "Mín. $25" : "Min. $25"}
                className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none tabular-nums"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              {topupUsd !== null && topupUsd >= 25 && (
                <span className="text-xs font-bold whitespace-nowrap" style={{ color: "#10b981" }}>
                  ≈ {Math.round(topupUsd * 6)} 💎
                </span>
              )}
            </div>
            {customTopupUsd && parseFloat(customTopupUsd) < 25 && (
              <p className="text-[10px] text-red-400 mt-1">
                {es ? "Monto mínimo: $25" : "Minimum: $25"}
              </p>
            )}
          </div>
        </div>

        {/* Min $25 note */}
        <p className="text-[10px] text-white/35 text-center mb-3">
          {es
            ? "Mín. $25 · El saldo sobrante queda en tu billetera 💎"
            : "Min. $25 · Leftover Ru$h stays in your wallet 💎"}
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={() => setShowBuyModal(true)}
          disabled={topupUsd === null || topupUsd < 25}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed mb-3"
          style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
        >
          {topupUsd !== null && topupUsd >= 25
            ? (es ? `Cargar $${topupUsd} en Ru$h 💎` : `Load $${topupUsd} in Ru$h 💎`)
            : (es ? "Elige un monto" : "Choose an amount")}
        </button>

        {/* Grayed-out "Pay with Ru$h" — visible but disabled when balance = 0 */}
        <button
          type="button"
          disabled
          className="w-full py-2.5 rounded-xl text-xs font-semibold text-white/25 border border-white/[0.06] cursor-not-allowed"
          style={{ background: "rgba(255,255,255,0.02)" }}
          title={es ? "Sin saldo de Ru$h disponible" : "No Ru$h balance available"}
        >
          💎 {es ? "Pagar con Ru$h — sin saldo" : "Pay with Ru$h — no balance"}
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-2 py-1.5 text-xs"
            style={{ color: "rgba(255,255,255,0.4)", background: "none", border: "none" }}
          >
            {es ? "Cerrar" : "Close"}
          </button>
        )}

        <BuyTokensModal
          isOpen={showBuyModal}
          onClose={() => setShowBuyModal(false)}
          onSuccess={(newBalance) => {
            setRegularBalance(newBalance);
            setShowBuyModal(false);
          }}
        />
      </div>
    );
  }

  // ── STATE A: has Ru$h — simple tip UI ─────────────────────────────────────
  return (
    <div className={className}>
      {/* Balance */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-white">
          {creatorName
            ? (es ? `Propinar a ${creatorName} 💎` : `Tip ${creatorName} 💎`)
            : (es ? "Enviar propina 💎" : "Send tip 💎")}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "#10b981" }}>
          {balance.toLocaleString()} Ru$h {es ? "disponibles" : "available"}
        </span>
      </div>

      {result !== "success" && (
        <>
          {/* Custom amount input + Max button */}
          <div className="flex gap-2 mb-3">
            <div
              className="flex-1 flex items-center gap-2 rounded-xl px-3 py-3"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <input
                id="pnp-tiprushrail-statea-custom"
                type="number"
                inputMode="numeric"
                min={1}
                max={balance}
                value={pickedMax ? String(balance) : customRush}
                onChange={(e) => {
                  setCustomRush(e.target.value);
                  setPickedMax(false);
                  setResult(null);
                }}
                placeholder={es ? "Ru$h a enviar" : "Ru$h to send"}
                disabled={sending}
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-base font-bold text-white outline-none tabular-nums placeholder-white/30"
              />
              <span className="text-xs text-white/40 whitespace-nowrap">💎</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPickedMax(true);
                setCustomRush(String(balance));
                setResult(null);
              }}
              disabled={sending}
              className="flex flex-col items-center justify-center px-3 py-2 rounded-xl border transition active:scale-95 disabled:opacity-50"
              style={{ background: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.30)", minWidth: 64 }}
            >
              <span className="text-xs font-bold text-emerald-400">{es ? "Todo" : "Max"}</span>
              <span className="text-[9px] text-emerald-400/70 tabular-nums mt-0.5">
                {balance.toLocaleString()} 💎
              </span>
            </button>
          </div>

          {/* USD equivalent */}
          {tipAmount !== null && tipAmount > 0 && (
            <p className="text-[11px] text-white/40 mb-3 text-center tabular-nums">
              ≈ ${(tipAmount / 6).toFixed(2)} USD
            </p>
          )}

          {/* Message */}
          {showMessage && (
            <textarea
              id="pnp-tiprushrail-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 140))}
              placeholder={es ? "Agrega un mensaje… (opcional)" : "Add a message… (optional)"}
              maxLength={140}
              rows={2}
              disabled={sending}
              className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none outline-none mb-3 disabled:opacity-60"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            />
          )}

          {result === "error" && (
            <p className="text-xs text-red-400 mb-3">{errorMsg}</p>
          )}

          {insufficient && (
            <p className="text-xs text-amber-400 mb-3">
              {es
                ? `Solo tienes ${balance.toLocaleString()} Ru$h disponibles.`
                : `You only have ${balance.toLocaleString()} Ru$h available.`}
            </p>
          )}

          {/* Send button */}
          <button
            type="button"
            onClick={send}
            disabled={!tipAmount || sending || insufficient}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
          >
            {sending
              ? (es ? "Enviando…" : "Sending…")
              : tipAmount && !insufficient
                ? (es ? `Enviar ${tipAmount.toLocaleString()} 💎` : `Send ${tipAmount.toLocaleString()} 💎`)
                : (es ? "Ingresa un monto" : "Enter amount")}
          </button>
        </>
      )}

      {result === "success" && (
        <div className="text-center py-4">
          <p className="text-lg font-bold" style={{ color: "#34C759" }}>
            ✓ {es ? "¡Propina enviada!" : "Tip sent!"}
          </p>
          {tipAmount && (
            <p className="text-sm text-white/60 mt-1">
              {tipAmount.toLocaleString()} Ru$h → {creatorName ?? "creator"}
            </p>
          )}
        </div>
      )}

      {onClose && result !== "success" && (
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-1.5 text-xs"
          style={{ color: "rgba(255,255,255,0.4)", background: "none", border: "none" }}
        >
          {es ? "Cerrar" : "Close"}
        </button>
      )}
    </div>
  );
}

export default TipRushRail;
