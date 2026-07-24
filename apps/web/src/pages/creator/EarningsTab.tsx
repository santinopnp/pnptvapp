import React, { useState, useEffect, useCallback, useRef } from "react";
import type { ModelEarnings, CreatorPayoutBalance, CreatorPayoutRecord, CreatorEarningsTrend, WeeklyPayoutApproval } from "@/lib/api";
import {
  getCreatorPayoutBalance,
  requestCreatorPayout,
  getCreatorPayoutHistory,
  getCreatorEarnings,
  getWeeklyPayoutPending,
  approveWeeklyPayout,
  rejectWeeklyPayout,
} from "@/lib/api";
import type { CreatorStrings } from "@/lib/i18n/creator";

function fmtCop(v: number | null | undefined): string {
  if (v == null) return "";
  return v.toLocaleString("es-CO");
}

function methodLabel(method: WeeklyPayoutApproval["method"] | null): string {
  if (!method) return "—";
  const lane = method.lane || "";
  const val = method.address || method.handle || method.key || method.account || "";
  const laneName: Record<string, string> = {
    bre_b: "Bre-B",
    meru: "Meru",
    btc: "Bitcoin",
    dash: "Dash",
    usdt_tron: "USDT (TRON)",
    usdt_base: "USDT (Base)",
    fiat_legacy: "Fiat (legacy)",
  };
  const short = val.length > 14 ? `${val.slice(0, 6)}…${val.slice(-4)}` : val;
  return `${laneName[lane] || lane}${short ? ` · ${short}` : ""}`;
}

function WeeklyApprovalBanner({
  approval,
  onDone,
  scrollRef,
}: {
  approval: WeeklyPayoutApproval;
  onDone: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const es = typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es");
  const isApproved = approval.status === "approved";
  const isColombiaBalance = approval.balanceCop != null;
  const isManual = !!approval.isManual;

  // Manual (emergency) advances have no fixed deadline — admin controls lifecycle.
  const deadline = approval.deadlineAt ? new Date(approval.deadlineAt).getTime() : null;
  const [msLeft, setMsLeft] = useState(deadline ? deadline - Date.now() : 0);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setMsLeft(deadline - Date.now()), 60_000);
    return () => clearInterval(t);
  }, [deadline]);
  const hoursLeft = Math.max(0, Math.floor(msLeft / 3_600_000));
  const minsLeft = Math.max(0, Math.floor((msLeft % 3_600_000) / 60_000));

  async function handleApprove() {
    setBusy("approve");
    setError(null);
    try {
      await approveWeeklyPayout(approval.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(null);
    }
  }
  async function handleReject() {
    if (!confirm(es ? "¿Rechazar este pago y devolver saldo a disponible?" : "Reject this payout and return the balance to available?")) return;
    setBusy("reject");
    setError(null);
    try {
      await rejectWeeklyPayout(approval.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusy(null);
    }
  }

  const accentColor = isManual ? "#F59E0B" : (isApproved ? "#5ED1C4" : "#D4007A");
  const accentBg = isManual ? "rgba(245,158,11,0.06)" : (isApproved ? "rgba(94,209,196,0.06)" : "rgba(212,0,122,0.06)");
  const accentBorder = isManual ? "rgba(245,158,11,0.35)" : (isApproved ? "rgba(94,209,196,0.35)" : "rgba(212,0,122,0.35)");

  const heading = isApproved
    ? (es ? "Pago aprobado — el equipo lo procesará pronto" : "Approved — the team will process it soon")
    : isManual
      ? (es ? "🚨 Adelanto de pago disponible" : "🚨 Emergency payout advance available")
      : (es ? "Aprobación semanal pendiente" : "Weekly approval pending");

  const approveButtonDisabled = busy !== null || (!isManual && deadline != null && msLeft <= 0);

  return (
    <div
      ref={scrollRef}
      className="glass-card-sm p-4 border"
      style={{ borderColor: accentBorder, background: accentBg }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: accentColor }}>
            {heading}
          </p>
          <p className="text-2xl font-bold text-white mt-1">${approval.balanceUsd.toFixed(2)} USD</p>
          {isColombiaBalance && (
            <p className="text-sm" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              ≈ COP ${fmtCop(approval.balanceCop)}
              {approval.usdCopRate ? ` · TRM ${approval.usdCopRate.toLocaleString("es-CO")}` : ""}
            </p>
          )}
          {isManual && approval.adminNote && (
            <p className="text-xs mt-2 italic" style={{ color: "#F59E0B" }}>
              {es ? "Nota: " : "Note: "}“{approval.adminNote}”
            </p>
          )}
          <p className="text-xs mt-2" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {es ? "Método: " : "Method: "}{methodLabel(approval.methodOverride || approval.method)}
          </p>
        </div>
        {!isApproved && !isManual && deadline != null && msLeft > 0 && (
          <div className="text-right text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            <p>{es ? "Aprueba antes de" : "Approve before"}</p>
            <p className="font-mono font-semibold text-white">4pm Bogotá</p>
            <p className="mt-0.5">{hoursLeft}h {minsLeft}m {es ? "restantes" : "left"}</p>
          </div>
        )}
        {!isApproved && isManual && (
          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded" style={{ background: "rgba(245,158,11,0.2)", color: "#F59E0B" }}>
            {es ? "Excepción" : "Exception"}
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,69,58,0.1)", color: "#FF453A" }}>{error}</p>
      )}

      {!isApproved && (
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approveButtonDisabled}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: isManual ? "#F59E0B" : "#D4007A" }}
          >
            {busy === "approve" ? "…" : es ? "Aprobar" : "Approve"}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={busy !== null}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-50"
          >
            {busy === "reject" ? "…" : es ? "Rechazar" : "Reject"}
          </button>
        </div>
      )}
      {isApproved && (
        <p className="text-xs mt-3" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          {isManual
            ? (es
                ? "El equipo procesará tu adelanto en las próximas horas y adjuntará el comprobante en tu historial."
                : "The team will process your advance in the next few hours and attach a receipt to your history.")
            : (es
                ? "El equipo procesará tu pago mañana martes y adjuntará el comprobante en tu historial."
                : "The team will process your payout tomorrow (Tuesday) and attach a receipt to your history.")}
        </p>
      )}
    </div>
  );
}

interface EarningsTabProps {
  earnings: ModelEarnings | null;
  t: CreatorStrings;
}

function statusBadge(status: string) {
  if (status === 'sent' || status === 'completed') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-500/20 text-teal-400">Sent</span>;
  }
  if (status === 'failed') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">Failed</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">Processing</span>;
}

export function EarningsTab({ earnings, t }: EarningsTabProps) {
  const [period, setPeriod] = useState<3 | 6 | 12>(6);

  const [balance, setBalance] = useState<CreatorPayoutBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  // FIX 12: Track balance fetch errors so creators see a retry option instead of silent failure
  const [balanceError, setBalanceError] = useState(false);

  const [weeklyApproval, setWeeklyApproval] = useState<WeeklyPayoutApproval | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const fetchWeekly = useCallback(() => {
    getWeeklyPayoutPending()
      .then((res) => setWeeklyApproval(res.approval))
      .catch(() => setWeeklyApproval(null));
  }, []);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState<{ payoutId: string | null } | null>(null);

  const [payouts, setPayouts] = useState<CreatorPayoutRecord[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(true);

  // FIX 8: Trends are fetched server-side with the selected period so the
  // months window is enforced at the DB level, not by slicing a fixed 6-month array.
  const [trends, setTrends] = useState<CreatorEarningsTrend[]>(() => earnings?.trends || []);
  const [trendsLoading, setTrendsLoading] = useState(false);

  // FIX 12: Extracted so it can be called on initial load and after a successful payout
  const fetchBalance = useCallback(() => {
    setBalanceLoading(true);
    setBalanceError(false);
    return getCreatorPayoutBalance()
      .then(res => { if (res.success) setBalance(res); })
      .catch(() => { setBalanceError(true); })
      .finally(() => setBalanceLoading(false));
  }, []);

  useEffect(() => {
    fetchBalance();
    fetchWeekly();

    setPayoutsLoading(true);
    getCreatorPayoutHistory()
      .then(res => { if (res.success) setPayouts(res.payouts.slice(0, 5)); })
      .catch(() => {})
      .finally(() => setPayoutsLoading(false));
  }, [fetchBalance, fetchWeekly]);

  // If landed with ?approve=<id> from email/DM, scroll banner into view once mounted.
  useEffect(() => {
    if (!weeklyApproval) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("approve") === weeklyApproval.id) {
      setTimeout(() => bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [weeklyApproval]);

  // FIX 8: Re-fetch trends from server whenever the period selector changes
  useEffect(() => {
    setTrendsLoading(true);
    getCreatorEarnings({ months: period })
      .then(res => { if (res.success) setTrends(res.trends); })
      .catch(() => {})
      .finally(() => setTrendsLoading(false));
  }, [period]);

  async function handleWithdrawSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawError('');
    setWithdrawLoading(true);
    try {
      const res = await requestCreatorPayout({ address: withdrawAddress.trim() });
      if (res.success) {
        setWithdrawSuccess({ payoutId: res.payout.nowpayments_payout_id });
        // FIX 12: Refetch authoritative server balance instead of optimistic mutation
        fetchBalance();
        getCreatorPayoutHistory()
          .then(r => { if (r.success) setPayouts(r.payouts.slice(0, 5)); })
          .catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payout request failed';
      setWithdrawError(msg);
    } finally {
      setWithdrawLoading(false);
    }
  }

  const canWithdraw = balance && balance.available_usd >= 5 && !withdrawSuccess;

  return (
    <div className="space-y-4">
      {weeklyApproval && (
        <WeeklyApprovalBanner
          approval={weeklyApproval}
          onDone={() => { fetchWeekly(); fetchBalance(); }}
          scrollRef={bannerRef as React.RefObject<HTMLDivElement>}
        />
      )}
      {earnings ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card-sm p-4 text-center">
            <p className="text-xl font-bold" style={{ color: "#5ED1C4" }}>
              ${(earnings.summary.total_creator || 0).toFixed(2)}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.yourEarnings70}</p>
          </div>
          <div className="glass-card-sm p-4 text-center">
            <p className="text-xl font-bold text-white">
              ${(earnings.summary.total_gross || 0).toFixed(2)}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.grossRevenue}</p>
          </div>
        </div>
      ) : (
        <div className="glass-card-sm p-8 text-center">
          <p className="text-white/60 text-sm">{t.noEarningsYet}</p>
        </div>
      )}

      <div className="glass-card-sm p-4">
        <p className="text-sm font-semibold text-white mb-3">{t.monthlyTrends}</p>

        <div className="flex gap-2 mb-3">
          {([3, 6, 12] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-[#D4007A] text-white'
                  : 'bg-white/5 text-pnp-textSecondary hover:bg-white/10'
              }`}
            >
              {p}m
            </button>
          ))}
        </div>

        {trendsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-4 rounded-full bg-white/5 animate-pulse" />)}
          </div>
        ) : trends.length === 0 ? (
          <p className="text-xs text-white/40">No earnings in the last {period} months</p>
        ) : (
          <div className="space-y-2">
            {trends.map((trend, i) => {
              const maxAmount = Math.max(...trends.map(x => x.amount), 1);
              const pct = (trend.amount / maxAmount) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-16 flex-shrink-0" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {new Date(trend.month).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                  </span>
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: "linear-gradient(to right, #D4007A, #E69138)" }}
                    />
                  </div>
                  <span className="text-xs font-medium text-white w-16 text-right">${trend.amount.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="glass-card-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Withdraw Earnings</p>

        {balanceLoading ? (
          <div className="h-12 rounded-lg bg-white/5 animate-pulse" />
        ) : balanceError ? (
          <div className="space-y-2">
            <p className="text-xs text-red-400">Could not load your balance. Check your connection and try again.</p>
            <button
              onClick={fetchBalance}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : balance ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold" style={{ color: "#5ED1C4" }}>
                  ${balance.available_usd.toFixed(2)}
                  <span className="text-sm font-normal ml-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>available</span>
                </p>
                {balance.holding_count > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    ${balance.holding_usd.toFixed(2)} releasing
                    {balance.earliest_available_at
                      ? ` ${new Date(balance.earliest_available_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : ' soon'}
                  </p>
                )}
                {balance.in_payout_usd > 0 && (
                  <p className="text-xs mt-0.5 text-amber-400">${balance.in_payout_usd.toFixed(2)} in transit</p>
                )}
              </div>

              {!showWithdraw && !withdrawSuccess && (
                <button
                  onClick={() => setShowWithdraw(true)}
                  disabled={!canWithdraw}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    canWithdraw
                      ? 'bg-[#D4007A] text-white hover:bg-[#b8006a] active:scale-95'
                      : 'bg-white/10 text-white/30 cursor-not-allowed'
                  }`}
                >
                  {balance.available_usd < 5 ? 'Min. $5.00' : 'Withdraw All'}
                </button>
              )}
            </div>

            {withdrawSuccess && (
              <div className="rounded-xl p-3 bg-teal-500/10 border border-teal-500/20">
                <p className="text-sm font-semibold text-teal-400">Payout initiated</p>
                {withdrawSuccess.payoutId && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    ID: {withdrawSuccess.payoutId}
                  </p>
                )}
              </div>
            )}

            {showWithdraw && !withdrawSuccess && (
              <form onSubmit={handleWithdrawSubmit} className="space-y-3 pt-1 border-t border-white/10">
                <div>
                  <p className="text-xs font-medium text-white/60 mb-1.5">USDT TRC-20 wallet address</p>
                  <input
                    type="text"
                    placeholder="T…"
                    value={withdrawAddress}
                    onChange={e => setWithdrawAddress(e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#D4007A] font-mono"
                  />
                </div>

                <div className="flex items-center justify-between text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  <span>Withdrawing</span>
                  <span className="font-semibold text-white">${balance.available_usd.toFixed(2)}</span>
                </div>

                {withdrawError && (
                  <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{withdrawError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowWithdraw(false); setWithdrawError(''); setWithdrawAddress(''); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={withdrawLoading || !withdrawAddress.trim()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#D4007A] text-white hover:bg-[#b8006a] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                  >
                    {withdrawLoading ? 'Sending…' : 'Confirm Withdrawal'}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <p className="text-xs text-white/40">Balance unavailable</p>
        )}
      </div>

      <div className="glass-card-sm p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Recent Payouts</p>
        {payoutsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />)}
          </div>
        ) : payouts.length === 0 ? (
          <p className="text-xs text-white/40">No payouts yet</p>
        ) : (
          <div className="space-y-2">
            {payouts.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2">
                  {statusBadge(p.status)}
                  <div>
                    <p className="text-xs font-medium text-white">${Number(p.amount_usd).toFixed(2)}</p>
                    <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>USDT TRC-20</p>
                  </div>
                </div>
                <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {p.requested_at
                    ? new Date(p.requested_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
