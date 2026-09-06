import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@pnptv/ui-kit";
import { useI18n } from "@/lib/i18n";
import { DataTable } from "@/components/admin/DataTable";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import {
  getCreatorSubscriptions,
  getCreatorSubscriptionDetail,
  getCreatorSubscriptionPlatformSummary,
  processCreatorPayout,
  processAllPayouts,
  adminCancelCreatorSubscription,
  adminExtendCreatorSubscription,
  getAdminWeeklyPayouts,
  markWeeklyPayoutPaid,
  getWeeklyPayoutReceiptUrl,
  createManualPayoutProposal,
  cancelManualPayoutProposal,
  getAdminCreatorPayoutHistory,
  type CreatorSubscriptionSummary,
  type SubscriptionDetail,
  type CreatorDetailAdmin,
  type MonthlyRevenueRow,
  type CreatorPayoutSummary,
  type PlatformPayoutSummary,
  type AdminWeeklyPayoutRow,
  type AdminCreatorPayoutHistoryRow,
} from "@/lib/api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number | string | null | undefined): string {
  const v = parseFloat(String(n ?? 0));
  return isNaN(v) ? "$0.00" : `$${v.toFixed(2)}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// CREATOR_TYPE_BADGE (ice/crystal/diamond) removed — legacy tier system retired.

const STATUS_BADGE: Record<
  string,
  "default" | "accent" | "success" | "warning" | "error"
> = {
  active: "success",
  cancelled: "error",
  expired: "warning",
};

// ─── Avatar helper ────────────────────────────────────────────────────────────

function Avatar({
  src,
  name,
  size = "sm",
}: {
  src: string | null | undefined;
  name: string;
  size?: "sm" | "md";
}) {
  const initials = (name || "?")[0].toUpperCase();
  const cls =
    size === "md"
      ? "w-10 h-10 rounded-full object-cover flex-shrink-0 bg-pnp-surface flex items-center justify-center text-pnp-textSecondary font-bold text-sm"
      : "w-7 h-7 rounded-full object-cover flex-shrink-0 bg-pnp-surface flex items-center justify-center text-pnp-textSecondary font-bold text-xs";
  if (src) {
    return <img src={src} alt={name} className={cls} />;
  }
  return <div className={cls}>{initials}</div>;
}

// ─── Monthly Revenue Mini-Table ───────────────────────────────────────────────

function MonthlyRevenueTable({
  rows,
  showCreators = false,
}: {
  rows: MonthlyRevenueRow[];
  showCreators?: boolean;
}) {
  const t = useI18n().admin;
  if (rows.length === 0) {
    return (
      <p className="text-xs text-pnp-textSecondary py-2">{t.creatorSubs.noRevenueData}</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-pnp-border">
            <th className="text-left py-2 pr-4 text-xs font-semibold text-pnp-textSecondary">
              {t.creatorSubs.month}
            </th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-pnp-textSecondary">
              {t.creatorSubs.gross}
            </th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-pnp-textSecondary">
              {t.creatorSubs.creatorShare}
            </th>
            <th className="text-right py-2 pr-4 text-xs font-semibold text-pnp-textSecondary">
              {t.creatorSubs.platformShare}
            </th>
            {!showCreators && (
              <th className="text-right py-2 text-xs font-semibold text-pnp-textSecondary">
                {t.creatorSubs.subs}
              </th>
            )}
            {showCreators && (
              <th className="text-right py-2 text-xs font-semibold text-pnp-textSecondary">
                {t.creators.title}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.month}
              className="border-b border-pnp-border/50 hover:bg-pnp-surface/40 transition-colors"
            >
              <td className="py-2 pr-4 font-mono text-xs text-pnp-textPrimary">
                {r.month}
              </td>
              <td className="py-2 pr-4 text-right text-pnp-textPrimary">
                {fmtUsd(r.gross)}
              </td>
              <td className="py-2 pr-4 text-right text-green-400">
                {fmtUsd(r.creator_share)}
              </td>
              <td className="py-2 pr-4 text-right text-pnp-accent">
                {fmtUsd(r.platform_share)}
              </td>
              <td className="py-2 text-right text-pnp-textSecondary text-xs">
                {showCreators
                  ? r.active_creators ?? "—"
                  : r.subscription_count ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Payout Summary Card ──────────────────────────────────────────────────────

function PayoutSummaryCard({
  summary,
  monthlyRevenue,
  onProcessAll,
  processing,
}: {
  summary: PlatformPayoutSummary;
  monthlyRevenue: MonthlyRevenueRow[];
  onProcessAll: () => void;
  processing: boolean;
}) {
  const t = useI18n().admin;
  return (
    <div className="rounded-xl border border-pnp-border bg-pnp-surface p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-pnp-textPrimary">
          {t.creatorSubs.payoutSummary}
        </h2>
        <button
          onClick={onProcessAll}
          disabled={processing || parseFloat(String(summary.total_pending)) <= 0}
          className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? t.shared.processing : t.creatorSubs.processAll}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <PayoutStatCard
          label={t.creatorSubs.totalPending}
          value={fmtUsd(summary.total_pending)}
          highlight={parseFloat(String(summary.total_pending)) > 0}
        />
        <PayoutStatCard
          label={t.creatorSubs.paidThisMonth}
          value={fmtUsd(summary.paid_this_month)}
        />
        <PayoutStatCard
          label={t.creatorSubs.creatorsAwaiting}
          value={String(summary.creators_with_pending)}
        />
        <PayoutStatCard
          label={t.creatorSubs.platformRevenue}
          value={fmtUsd(summary.total_platform_revenue)}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pnp-textSecondary mb-3">
          {t.creatorSubs.monthlyRevenue}
        </h3>
        <MonthlyRevenueTable rows={monthlyRevenue} showCreators />
      </div>
    </div>
  );
}

function PayoutStatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-pnp-background border border-pnp-border p-3">
      <p className="text-xs text-pnp-textSecondary mb-1">{label}</p>
      <p
        className={`text-lg font-bold ${highlight ? "text-amber-400" : "text-pnp-textPrimary"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Subscription Detail Panel ────────────────────────────────────────────────

interface DetailState {
  creator: CreatorDetailAdmin;
  subscriptions: SubscriptionDetail[];
  monthlyRevenue: MonthlyRevenueRow[];
  payoutSummary: CreatorPayoutSummary;
}

function CreatorDetailPanel({
  creatorId,
  onClose,
  onPayoutSuccess,
}: {
  creatorId: string;
  onClose: () => void;
  onPayoutSuccess: () => void;
}) {
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = useI18n().admin;
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<SubscriptionDetail | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [extendTarget, setExtendTarget] = useState<SubscriptionDetail | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [extendLoading, setExtendLoading] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  // Manual (emergency) advance state — sits on top of the weekly workflow.
  const [manualNote, setManualNote] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualMsg, setManualMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [history, setHistory] = useState<AdminCreatorPayoutHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCreatorSubscriptionDetail(creatorId);
      setDetail({
        creator: res.creator,
        subscriptions: res.subscriptions,
        monthlyRevenue: res.monthlyRevenue,
        payoutSummary: res.payoutSummary,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load creator detail");
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryErr(null);
    try {
      const res = await getAdminCreatorPayoutHistory(creatorId, 8);
      setHistory(res.history || []);
    } catch (err) {
      setHistoryErr(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const [showPayoutConfirm, setShowPayoutConfirm] = useState(false);
  const [showManualConfirm, setShowManualConfirm] = useState(false);

  const handlePayout = async () => {
    setShowPayoutConfirm(false);
    setPayoutLoading(true);
    setPayoutMsg(null);
    try {
      const res = await processCreatorPayout(creatorId);
      if (res.amount > 0) {
        setPayoutMsg(
          `Payout of ${fmtUsd(res.amount)} processed for @${res.creator} (${res.earningsCount} records) via ${res.method}.`
        );
      } else {
        setPayoutMsg(res.message ?? "No pending payout.");
      }
      onPayoutSuccess();
      await load();
    } catch (err) {
      setPayoutMsg(err instanceof Error ? err.message : "Payout failed");
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelLoading(true);
    try {
      await adminCancelCreatorSubscription(creatorId, cancelTarget.id);
      setCancelTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
      setCancelTarget(null);
    } finally {
      setCancelLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!extendTarget) return;
    setExtendLoading(true);
    setExtendError(null);
    try {
      const days = parseInt(extendDays, 10);
      if (!days || days < 1 || days > 365) {
        setExtendError("Enter a value between 1 and 365.");
        setExtendLoading(false);
        return;
      }
      await adminExtendCreatorSubscription(creatorId, extendTarget.id, days);
      setExtendTarget(null);
      await load();
    } catch (err) {
      setExtendError(err instanceof Error ? err.message : "Extend failed");
    } finally {
      setExtendLoading(false);
    }
  };

  const handleManualPropose = async () => {
    setShowManualConfirm(false);
    setManualLoading(true);
    setManualMsg(null);
    try {
      const res = await createManualPayoutProposal(creatorId, manualNote.trim() || undefined);
      setManualMsg({
        kind: "ok",
        text: `Adelanto enviado — ${fmtUsd(res.proposal.amountUsd)} propuesto al creador. Recibirá email + Telegram.`,
      });
      setManualNote("");
      await Promise.all([load(), loadHistory()]);
      onPayoutSuccess();
    } catch (err) {
      setManualMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "No se pudo crear el adelanto",
      });
    } finally {
      setManualLoading(false);
    }
  };

  const handleCancelManual = async (approvalId: string) => {
    if (!window.confirm("¿Cancelar este adelanto manual? El saldo vuelve al pool.")) return;
    try {
      await cancelManualPayoutProposal(approvalId);
      await Promise.all([load(), loadHistory()]);
      onPayoutSuccess();
    } catch (err) {
      setManualMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "No se pudo cancelar",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative bg-pnp-background border-l border-pnp-border h-full w-full max-w-2xl overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-pnp-border bg-pnp-background">
          <h2 className="text-base font-bold text-pnp-textPrimary">
            {loading ? t.shared.loading : detail?.creator ? `@${detail.creator.username}` : t.creators.title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-pnp-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div className="m-5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && detail && (
          <div className="p-5 space-y-6">
            {/* Creator info + payout strip */}
            <div className="flex items-start gap-4">
              <Avatar src={detail.creator.avatar_url} name={detail.creator.first_name} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-pnp-textPrimary">
                  {detail.creator.first_name}{" "}
                  <span className="text-pnp-textSecondary font-normal">
                    @{detail.creator.username}
                  </span>
                </p>
                <p className="text-xs text-pnp-textSecondary mt-0.5">
                  {detail.creator.creator_type ?? "—"} creator &middot; {fmtUsd(detail.creator.creator_price_usd)}/mo &middot; payout: {detail.creator.payout_method ?? "—"}
                </p>
                {detail.creator.creator_dash_address && (
                  <p className="font-mono text-xs text-pnp-textSecondary mt-0.5 truncate">
                    {detail.creator.creator_dash_address}
                  </p>
                )}
              </div>
            </div>

            {/* Payout action */}
            <div className="rounded-lg border border-pnp-border bg-pnp-surface p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-xs text-pnp-textSecondary">{t.creatorSubs.pendingPayout}</p>
                <p className="text-xl font-bold text-amber-400">
                  {fmtUsd(detail.payoutSummary.pending_total)}
                </p>
                <p className="text-xs text-pnp-textSecondary">
                  {detail.payoutSummary.pending_count} unpaid earning records &middot; total paid: {fmtUsd(detail.payoutSummary.paid_total)}
                </p>
              </div>
              <button
                onClick={() => setShowPayoutConfirm(true)}
                disabled={payoutLoading || parseFloat(String(detail.payoutSummary.pending_total)) <= 0}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {payoutLoading ? t.shared.processing : t.creatorSubs.payNow}
              </button>
            </div>

            {payoutMsg && (
              <div className="px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400">
                {payoutMsg}
              </div>
            )}

            {/* Manual (emergency) advance */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold text-amber-300">Adelanto por emergencia</p>
                  <p className="text-xs text-pnp-textSecondary">
                    Envía el saldo disponible al creador para su aprobación fuera del ciclo semanal.
                    Requiere saldo ≥ $10 y método de pago configurado.
                  </p>
                </div>
                <a
                  href={detail.creator.username ? `/c/${detail.creator.username}` : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-2 py-1 rounded border border-pnp-border text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors whitespace-nowrap"
                >
                  Ver perfil ↗
                </a>
              </div>
              <textarea id="pnp-creatorsubscriptions-1"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value.slice(0, 500))}
                placeholder="Motivo (opcional) — se muestra al creador en el email"
                rows={2}
                className="w-full text-sm rounded border border-pnp-border bg-pnp-background text-pnp-textPrimary px-3 py-2 mb-2 focus:outline-none focus:border-amber-500"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-pnp-textSecondary">
                  {manualNote.length}/500 caracteres
                </p>
                <button
                  onClick={() => setShowManualConfirm(true)}
                  disabled={
                    manualLoading ||
                    parseFloat(String(detail.payoutSummary.pending_total)) < 10
                  }
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {manualLoading ? "Enviando…" : "Enviar adelanto al creador"}
                </button>
              </div>
              {manualMsg && (
                <div
                  className={`mt-3 px-3 py-2 rounded text-xs ${
                    manualMsg.kind === "ok"
                      ? "bg-green-500/10 border border-green-500/20 text-green-400"
                      : "bg-red-500/10 border border-red-500/20 text-red-400"
                  }`}
                >
                  {manualMsg.text}
                </div>
              )}
            </div>

            {/* Recent weekly payouts history */}
            <div className="rounded-lg border border-pnp-border bg-pnp-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-pnp-textPrimary">
                  Historial de payouts (últimos 8)
                </p>
                <button
                  onClick={() => loadHistory()}
                  className="text-xs px-2 py-1 rounded border border-pnp-border text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-background transition-colors"
                >
                  ↻ Refrescar
                </button>
              </div>
              {historyLoading ? (
                <p className="text-xs text-pnp-textSecondary">Cargando…</p>
              ) : historyErr ? (
                <p className="text-xs text-red-400">{historyErr}</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-pnp-textSecondary">Sin propuestas todavía.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between text-xs rounded border border-pnp-border/60 bg-pnp-background px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-pnp-textSecondary shrink-0">
                          {fmtDate(h.createdAt)}
                        </span>
                        {h.isManual && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold shrink-0">
                            MANUAL
                          </span>
                        )}
                        <span className="text-pnp-textPrimary font-semibold">
                          {fmtUsd(h.balanceUsd)}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                            h.status === "paid"
                              ? "bg-green-500/20 text-green-400"
                              : h.status === "approved"
                              ? "bg-blue-500/20 text-blue-400"
                              : h.status === "proposed"
                              ? "bg-amber-500/20 text-amber-300"
                              : h.status === "rejected"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-pnp-border text-pnp-textSecondary"
                          }`}
                        >
                          {h.status.toUpperCase()}
                        </span>
                      </div>
                      {h.isManual && h.status === "proposed" && (
                        <button
                          onClick={() => handleCancelManual(h.id)}
                          className="text-[11px] text-red-400 hover:text-red-300 underline shrink-0"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Monthly revenue */}
            <div>
              <h3 className="text-sm font-semibold text-pnp-textSecondary mb-3">
                {t.creatorSubs.revenueLast6}
              </h3>
              <MonthlyRevenueTable rows={detail.monthlyRevenue} />
            </div>

            {/* Subscriber list */}
            <div>
              <h3 className="text-sm font-semibold text-pnp-textSecondary mb-3">
                {t.creatorSubs.subscribers} ({detail.subscriptions.length})
              </h3>
              {detail.subscriptions.length === 0 ? (
                <p className="text-xs text-pnp-textSecondary">{t.creatorSubs.noSubs}</p>
              ) : (
                <div className="space-y-2">
                  {detail.subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-pnp-border bg-pnp-surface/50 p-3"
                    >
                      <Avatar
                        src={sub.subscriber_avatar}
                        name={sub.subscriber_first_name}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-pnp-textPrimary truncate">
                          {sub.subscriber_first_name}{" "}
                          <span className="text-pnp-textSecondary font-normal">
                            @{sub.subscriber_username}
                          </span>
                        </p>
                        <p className="text-xs text-pnp-textSecondary">
                          Started {fmtDate(sub.started_at)} &middot; Expires{" "}
                          <span
                            className={
                              isExpired(sub.expires_at)
                                ? "text-red-400"
                                : "text-pnp-textSecondary"
                            }
                          >
                            {fmtDate(sub.expires_at)}
                          </span>{" "}
                          &middot; {fmtUsd(sub.price_usd)}/mo &middot; Revenue:{" "}
                          {fmtUsd(sub.revenue)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={STATUS_BADGE[sub.status] ?? "default"}>
                          {sub.status}
                        </Badge>
                        {sub.status === "active" && (
                          <>
                            <button
                              onClick={() => {
                                setExtendTarget(sub);
                                setExtendDays("30");
                                setExtendError(null);
                              }}
                              className="text-xs text-pnp-accent hover:underline"
                            >
                              {t.creatorSubs.extend}
                            </button>
                            <button
                              onClick={() => setCancelTarget(sub)}
                              className="text-xs text-red-400 hover:underline"
                            >
                              {t.shared.cancel}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Payout confirm */}
      <ConfirmModal
        open={showPayoutConfirm}
        title={t.creatorSubs.processPayout}
        message={`Process payout of ${detail ? fmtUsd(detail.payoutSummary.pending_total) : "$0.00"} to @${detail?.creator.username ?? ""}?`}
        confirmLabel={t.creatorSubs.payNow}
        variant="warning"
        onConfirm={handlePayout}
        onCancel={() => setShowPayoutConfirm(false)}
        loading={payoutLoading}
      />

      {/* Manual advance confirm */}
      <ConfirmModal
        open={showManualConfirm}
        title="Enviar adelanto al creador"
        message={`Se enviará una propuesta de ${detail ? fmtUsd(detail.payoutSummary.pending_total) : "$0.00"} a @${detail?.creator.username ?? ""} por email + Telegram. El creador debe aprobar antes de procesar el pago.`}
        confirmLabel="Enviar propuesta"
        variant="warning"
        onConfirm={handleManualPropose}
        onCancel={() => setShowManualConfirm(false)}
        loading={manualLoading}
      />

      {/* Cancel confirm */}
      <ConfirmModal
        open={!!cancelTarget}
        title={t.creatorSubs.cancelSubscription}
        message={`Cancel @${cancelTarget?.subscriber_username ?? ""}'s subscription? They will lose access when the current period ends.`}
        confirmLabel={t.creatorSubs.cancelSubscription}
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
        loading={cancelLoading}
      />

      {/* Extend modal */}
      {extendTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setExtendTarget(null)}
        >
          <div className="fixed inset-0 bg-black/60" />
          <div
            className="relative bg-pnp-background border border-pnp-border rounded-xl p-6 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-pnp-textPrimary mb-2">
              {t.creatorSubs.extendSubscription}
            </h3>
            <p className="text-xs text-pnp-textSecondary mb-4">
              Extending for @{extendTarget.subscriber_username} (currently expires{" "}
              {fmtDate(extendTarget.expires_at)}).
            </p>
            {extendError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {extendError}
              </div>
            )}
            <label className="block text-xs text-pnp-textSecondary mb-1">
              {t.creatorSubs.daysToAdd}
            </label>
            <input id="pnp-creatorsubscriptions-2"
              type="number"
              min="1"
              max="365"
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-sm focus:outline-none focus:border-pnp-accent mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setExtendTarget(null)}
                disabled={extendLoading}
                className="px-4 py-2 text-sm rounded-lg border border-pnp-border text-pnp-textSecondary hover:bg-pnp-surface disabled:opacity-50 transition-colors"
              >
                {t.shared.cancel}
              </button>
              <button
                onClick={handleExtend}
                disabled={extendLoading}
                className="px-4 py-2 text-sm rounded-lg bg-pnp-accent text-white font-medium hover:bg-pnp-accent/80 disabled:opacity-50 transition-colors"
              >
                {extendLoading ? t.shared.processing : t.creatorSubs.extend}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ── Weekly payout ledger (Colombia + all creators) ──────────────────────────

function currentBogotaMonday(): string {
  const now = new Date();
  const bogotaMs = now.getTime() - 5 * 3600 * 1000;
  const b = new Date(bogotaMs);
  const daysBack = (b.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - daysBack));
  return mon.toISOString().slice(0, 10);
}

function weeklyMethodLabel(m: AdminWeeklyPayoutRow["method"] | null): string {
  if (!m) return "—";
  const laneName: Record<string, string> = {
    bre_b: "Bre-B",
    meru: "Meru",
    btc: "Bitcoin",
    dash: "Dash",
    usdt_tron: "USDT (TRON)",
    usdt_base: "USDT (Base)",
    fiat_legacy: "Fiat (legacy)",
  };
  const val = m.address || m.handle || m.key || m.account || "";
  const short = val.length > 18 ? `${val.slice(0, 8)}…${val.slice(-6)}` : val;
  return `${laneName[m.lane] || m.lane}${short ? ` · ${short}` : ""}`;
}

function StatusPill({ status }: { status: AdminWeeklyPayoutRow["status"] }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    proposed: { bg: "rgba(212,0,122,0.15)", fg: "#D4007A", label: "Propuesto" },
    approved: { bg: "rgba(94,209,196,0.15)", fg: "#5ED1C4", label: "Aprobado" },
    rejected: { bg: "rgba(255,69,58,0.15)", fg: "#FF453A", label: "Rechazado" },
    expired:  { bg: "rgba(142,142,147,0.2)", fg: "#8E8E93", label: "Expirado" },
    paid:     { bg: "rgba(50,215,75,0.15)", fg: "#32D74B", label: "Pagado" },
  };
  const s = map[status] || map.proposed;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

function MarkPaidModal({
  row,
  open,
  onClose,
  onSaved,
}: {
  row: AdminWeeklyPayoutRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [txRef, setTxRef] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setTxRef(""); setNotes(""); setReceipt(null); setError(null); }
  }, [open]);

  if (!open || !row) return null;

  async function submit() {
    if (!row) return;
    if (!txRef.trim()) { setError("Referencia de transacción requerida"); return; }
    setSaving(true);
    setError(null);
    try {
      await markWeeklyPayoutPaid(row.id, { txReference: txRef.trim(), adminNotes: notes.trim() || undefined, receipt });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falló marcar como pagado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "#1C1C1E", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-white mb-1">Marcar como pagado</h3>
        <p className="text-xs text-white/60 mb-4">
          {row.username ? `@${row.username}` : row.creatorId} · ${row.balanceUsd.toFixed(2)} USD
          {row.balanceCop != null ? ` (≈ COP $${row.balanceCop.toLocaleString("es-CO")})` : ""}
        </p>
        <label className="block text-xs font-semibold text-white/80 mb-1">Referencia de transacción *</label>
        <input id="pnp-creatorsubscriptions-3" type="text" value={txRef} onChange={(e) => setTxRef(e.target.value)}
          placeholder="Ej: TRX-2026-07-23-001" className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-white/30" />
        <label className="block text-xs font-semibold text-white/80 mt-3 mb-1">Notas del admin (opcional)</label>
        <textarea id="pnp-creatorsubscriptions-4" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-white/30" />
        <label className="block text-xs font-semibold text-white/80 mt-3 mb-1">Comprobante (PDF, JPG, PNG · máx 5MB)</label>
        <input id="pnp-creatorsubscriptions-5" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={(e) => setReceipt(e.target.files?.[0] || null)}
          className="w-full text-xs text-white/80 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white" />
        {error && (
          <p className="text-xs mt-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,69,58,0.1)", color: "#FF453A" }}>{error}</p>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm bg-white/10 text-white/80">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}>
            {saving ? "Guardando…" : "Marcar pagado"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WeeklyPayoutsLedger() {
  const [weekStart, setWeekStart] = useState<string>(currentBogotaMonday());
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [rows, setRows] = useState<AdminWeeklyPayoutRow[]>([]);
  const [summary, setSummary] = useState<{ status: string; count: number; total_usd: number }[]>([]);
  const [deadlineAt, setDeadlineAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [markTarget, setMarkTarget] = useState<AdminWeeklyPayoutRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminWeeklyPayouts({ weekStart, status: statusFilter || undefined, country: countryFilter || undefined });
      setRows(res.rows);
      setSummary(res.summary);
      setDeadlineAt(res.deadlineAt);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, statusFilter, countryFilter]);

  useEffect(() => { load(); }, [load]);

  async function viewReceipt(id: string) {
    try {
      const r = await getWeeklyPayoutReceiptUrl(id);
      if (r.url) window.open(r.url, "_blank", "noopener");
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo abrir el comprobante");
    }
  }

  const totalApproved = summary.find((s) => s.status === "approved")?.total_usd || 0;
  const totalApprovedCount = summary.find((s) => s.status === "approved")?.count || 0;
  const totalPaid = summary.find((s) => s.status === "paid")?.total_usd || 0;
  const totalPaidCount = summary.find((s) => s.status === "paid")?.count || 0;

  return (
    <div className="rounded-xl border border-pnp-border bg-pnp-surface p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-pnp-textPrimary">Payouts semanales</h2>
          <p className="text-xs text-pnp-textSecondary mt-0.5">
            Aprobados por creador · procesar los martes · deadline {deadlineAt ? new Date(deadlineAt).toLocaleString() : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-pnp-textSecondary">Semana:</label>
          <input id="pnp-creatorsubscriptions-6" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-xs focus:outline-none focus:border-pnp-accent" />
          <select id="pnp-creatorsubscriptions-7" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-xs focus:outline-none focus:border-pnp-accent">
            <option value="">Todos</option>
            <option value="proposed">Propuestos</option>
            <option value="approved">Aprobados</option>
            <option value="paid">Pagados</option>
            <option value="rejected">Rechazados</option>
            <option value="expired">Expirados</option>
          </select>
          <input id="pnp-creatorsubscriptions-8" type="text" placeholder="País (ej. Colombia)" value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-xs focus:outline-none focus:border-pnp-accent w-40" />
          <a
            href={`/api/webapp/admin/creator-payouts/weekly/export.csv?week_start=${weekStart}${statusFilter ? `&status=${statusFilter}` : ""}${countryFilter ? `&country=${encodeURIComponent(countryFilter)}` : ""}`}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/90 hover:bg-white/20"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-pnp-border bg-pnp-background p-3">
          <p className="text-xs text-pnp-textSecondary">Aprobados</p>
          <p className="text-lg font-bold text-pnp-textPrimary">{totalApprovedCount}</p>
          <p className="text-xs text-teal-400">{fmtUsd(totalApproved)} listos para pagar</p>
        </div>
        <div className="rounded-lg border border-pnp-border bg-pnp-background p-3">
          <p className="text-xs text-pnp-textSecondary">Pagados</p>
          <p className="text-lg font-bold text-pnp-textPrimary">{totalPaidCount}</p>
          <p className="text-xs text-green-400">{fmtUsd(totalPaid)}</p>
        </div>
        <div className="rounded-lg border border-pnp-border bg-pnp-background p-3">
          <p className="text-xs text-pnp-textSecondary">Propuestos</p>
          <p className="text-lg font-bold text-pnp-textPrimary">
            {summary.find((s) => s.status === "proposed")?.count || 0}
          </p>
          <p className="text-xs text-pnp-accent">{fmtUsd(summary.find((s) => s.status === "proposed")?.total_usd || 0)}</p>
        </div>
        <div className="rounded-lg border border-pnp-border bg-pnp-background p-3">
          <p className="text-xs text-pnp-textSecondary">Expirados</p>
          <p className="text-lg font-bold text-pnp-textPrimary">
            {summary.find((s) => s.status === "expired")?.count || 0}
          </p>
          <p className="text-xs text-white/40">{fmtUsd(summary.find((s) => s.status === "expired")?.total_usd || 0)}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-pnp-textSecondary py-8 text-center">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-pnp-textSecondary py-8 text-center">No hay propuestas para esta semana.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pnp-border text-left">
                <th className="py-2 pr-3 text-xs font-semibold text-pnp-textSecondary">Creador</th>
                <th className="py-2 pr-3 text-xs font-semibold text-pnp-textSecondary">País</th>
                <th className="py-2 pr-3 text-xs font-semibold text-pnp-textSecondary text-right">USD</th>
                <th className="py-2 pr-3 text-xs font-semibold text-pnp-textSecondary text-right">COP</th>
                <th className="py-2 pr-3 text-xs font-semibold text-pnp-textSecondary">Método</th>
                <th className="py-2 pr-3 text-xs font-semibold text-pnp-textSecondary">Estatus</th>
                <th className="py-2 pr-3 text-xs font-semibold text-pnp-textSecondary">Aprobado</th>
                <th className="py-2 pr-3 text-xs font-semibold text-pnp-textSecondary text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-pnp-border/50">
                  <td className="py-2 pr-3">
                    <p className="text-pnp-textPrimary flex items-center gap-2">
                      {r.firstName || r.username || r.creatorId}
                      {r.isManual && (
                        <span
                          title={r.adminNote || "Adelanto manual por emergencia"}
                          className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold"
                        >
                          MANUAL
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-pnp-textSecondary">@{r.username || "—"} · {r.email || ""}</p>
                    {r.isManual && r.adminNote && (
                      <p className="text-[11px] text-amber-400/80 mt-0.5 italic truncate max-w-xs">
                        “{r.adminNote}”
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-pnp-textSecondary">{r.country || "—"}</td>
                  <td className="py-2 pr-3 text-right text-pnp-textPrimary font-semibold">${r.balanceUsd.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right text-pnp-textSecondary">{r.balanceCop != null ? `$${r.balanceCop.toLocaleString("es-CO")}` : "—"}</td>
                  <td className="py-2 pr-3 text-xs">{weeklyMethodLabel(r.methodOverride || r.method)}</td>
                  <td className="py-2 pr-3"><StatusPill status={r.status} /></td>
                  <td className="py-2 pr-3 text-xs text-pnp-textSecondary">
                    {r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right space-x-2">
                    {r.status === "approved" && (
                      <button onClick={() => setMarkTarget(r)}
                        className="text-xs px-2 py-1 rounded bg-[#D4007A] text-white hover:bg-[#b8006a]">Marcar pagado</button>
                    )}
                    {r.receiptUrl && (
                      <button onClick={() => viewReceipt(r.id)}
                        className="text-xs px-2 py-1 rounded bg-white/10 text-white hover:bg-white/20">Comprobante</button>
                    )}
                    {r.isManual && r.status === "proposed" && (
                      <button
                        onClick={async () => {
                          if (!window.confirm("¿Cancelar este adelanto manual? El saldo vuelve al pool.")) return;
                          try {
                            await cancelManualPayoutProposal(r.id);
                            await load();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : "No se pudo cancelar");
                          }
                        }}
                        className="text-xs px-2 py-1 rounded bg-white/5 text-red-400 hover:bg-red-500/10">
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MarkPaidModal row={markTarget} open={markTarget !== null} onClose={() => setMarkTarget(null)} onSaved={load} />
    </div>
  );
}

type SortKey = "active_subscribers" | "total_revenue" | "pending_payout";

export default function CreatorSubscriptions() {
  const t = useI18n().admin;
  const [creators, setCreators] = useState<CreatorSubscriptionSummary[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [creatorsError, setCreatorsError] = useState<string | null>(null);

  const [summary, setSummary] = useState<{
    summary: {
      total_pending: number;
      paid_this_month: number;
      creators_with_pending: number;
      total_gross_all_time: number;
      total_platform_revenue: number;
    };
    monthlyRevenue: MonthlyRevenueRow[];
  } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const [sortBy, setSortBy] = useState<SortKey>("active_subscribers");
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);

  const [processAllLoading, setProcessAllLoading] = useState(false);
  const [processAllMsg, setProcessAllMsg] = useState<string | null>(null);
  const [showProcessAllConfirm, setShowProcessAllConfirm] = useState(false);

  const loadCreators = useCallback(async () => {
    setLoadingCreators(true);
    try {
      const res = await getCreatorSubscriptions();
      setCreators(res.creators);
      setCreatorsError(null);
    } catch (err) {
      setCreatorsError(
        err instanceof Error ? err.message : "Failed to load creators"
      );
    } finally {
      setLoadingCreators(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res = await getCreatorSubscriptionPlatformSummary();
      setSummary({ summary: res.summary, monthlyRevenue: res.monthlyRevenue });
    } catch {
      // Non-fatal — summary panel will show zeroes
      setSummary({
        summary: {
          total_pending: 0,
          paid_this_month: 0,
          creators_with_pending: 0,
          total_gross_all_time: 0,
          total_platform_revenue: 0,
        },
        monthlyRevenue: [],
      });
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    loadCreators();
    loadSummary();
  }, [loadCreators, loadSummary]);

  const handleProcessAll = async () => {
    setShowProcessAllConfirm(false);
    setProcessAllLoading(true);
    setProcessAllMsg(null);
    try {
      const res = await processAllPayouts();
      if (res.creatorsCount > 0) {
        setProcessAllMsg(
          `Processed payouts for ${res.creatorsCount} creator(s) — total ${fmtUsd(res.totalAmount)}.`
        );
      } else {
        setProcessAllMsg(res.message ?? "No pending payouts found.");
      }
      await Promise.all([loadCreators(), loadSummary()]);
    } catch (err) {
      setProcessAllMsg(
        err instanceof Error ? err.message : "Process all payouts failed."
      );
    } finally {
      setProcessAllLoading(false);
    }
  };

  const sorted = [...creators].sort((a, b) => {
    const av = parseFloat(String(a[sortBy] ?? 0));
    const bv = parseFloat(String(b[sortBy] ?? 0));
    return bv - av;
  });

  const columns = [
    {
      key: "creator",
      header: "Creator",
      render: (row: CreatorSubscriptionSummary) => (
        <div className="flex items-center gap-2">
          <Avatar src={row.creator_avatar} name={row.creator_first_name} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-pnp-textPrimary truncate">
              {row.creator_first_name}
            </p>
            <p className="text-xs text-pnp-textSecondary truncate">
              @{row.creator_username}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "crystal",
      header: "Crystal",
      render: (row: CreatorSubscriptionSummary) => {
        if (!row.crystalCreator) return <span className="text-pnp-textSecondary text-xs">—</span>;
        const until = row.crystalActiveUntil;
        const label = (!until || until === "infinity")
          ? "lifetime"
          : new Date(until).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
        return (
          <span className="creator-crystal-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide">
            <span aria-hidden className="text-[11px] leading-none">❖</span>
            {label}
          </span>
        );
      },
    },
    {
      key: "creator_price_usd",
      header: t.creatorSubs.pricePerMonth,
      render: (row: CreatorSubscriptionSummary) => (
        <span className="text-pnp-textPrimary font-medium">
          {fmtUsd(row.creator_price_usd)}
        </span>
      ),
    },
    {
      key: "active_subscribers",
      header: t.creatorSubs.activeSubs,
      render: (row: CreatorSubscriptionSummary) => (
        <span className="text-pnp-textPrimary font-semibold">
          {row.active_subscribers}
        </span>
      ),
    },
    {
      key: "total_revenue",
      header: t.creatorSubs.totalRevenueSort,
      render: (row: CreatorSubscriptionSummary) => (
        <span className="text-pnp-textPrimary">{fmtUsd(row.total_revenue)}</span>
      ),
    },
    {
      key: "pending_payout",
      header: t.creatorSubs.pendingPayout,
      render: (row: CreatorSubscriptionSummary) => (
        <span
          className={
            parseFloat(String(row.pending_payout)) > 0
              ? "text-amber-400 font-semibold"
              : "text-pnp-textSecondary"
          }
        >
          {fmtUsd(row.pending_payout)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row: CreatorSubscriptionSummary) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCreatorId(row.creator_id);
            }}
            className="text-xs text-pnp-accent hover:underline"
          >
            {t.creatorSubs.viewDetail}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-container space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pnp-textPrimary">
            {t.creatorSubs.title}
          </h1>
          <p className="text-sm text-pnp-textSecondary mt-1">
            {t.creatorSubs.subtitle}
          </p>
        </div>
      </div>

      {/* Process all success/error message */}
      {processAllMsg && (
        <div className="px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400 flex items-start justify-between gap-4">
          <span>{processAllMsg}</span>
          <button
            onClick={() => setProcessAllMsg(null)}
            className="text-green-400/70 hover:text-green-400 flex-shrink-0"
          >
            {t.shared.dismiss}
          </button>
        </div>
      )}

      {/* Section C: Platform Payout Summary */}
      {loadingSummary ? (
        <div className="rounded-xl border border-pnp-border bg-pnp-surface p-5">
          <div className="h-6 w-48 bg-pnp-background rounded animate-pulse mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-pnp-background animate-pulse" />
            ))}
          </div>
        </div>
      ) : summary ? (
        <PayoutSummaryCard
          summary={summary.summary}
          monthlyRevenue={summary.monthlyRevenue}
          onProcessAll={() => setShowProcessAllConfirm(true)}
          processing={processAllLoading}
        />
      ) : null}

      {/* Weekly payout ledger — Monday proposal → Tuesday admin processing */}
      <WeeklyPayoutsLedger />

      {/* Section A: Creator Overview Table */}
      <div className="rounded-xl border border-pnp-border bg-pnp-surface p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-base font-bold text-pnp-textPrimary">
            {t.creatorSubs.activeCreators} ({creators.length})
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-pnp-textSecondary">{t.creatorSubs.sortBy}</label>
            <select id="pnp-creatorsubscriptions-9"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="px-2 py-1.5 rounded-lg border border-pnp-border bg-pnp-background text-pnp-textPrimary text-xs focus:outline-none focus:border-pnp-accent"
            >
              <option value="active_subscribers">{t.creatorSubs.activeSubs}</option>
              <option value="total_revenue">{t.creatorSubs.totalRevenueSort}</option>
              <option value="pending_payout">{t.creatorSubs.pendingPayout}</option>
            </select>
          </div>
        </div>

        {creatorsError && (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {creatorsError}
          </div>
        )}

        <DataTable
          columns={columns}
          data={sorted}
          loading={loadingCreators}
          emptyMessage={t.creatorSubs.noActiveCreators}
          getRowId={(row) => row.creator_id}
          onRowClick={(row) => setSelectedCreatorId(row.creator_id)}
        />
      </div>

      {/* Section B: Creator Detail Slide-over */}
      {selectedCreatorId && (
        <CreatorDetailPanel
          creatorId={selectedCreatorId}
          onClose={() => setSelectedCreatorId(null)}
          onPayoutSuccess={() => {
            loadCreators();
            loadSummary();
          }}
        />
      )}

      <ConfirmModal
        open={showProcessAllConfirm}
        title={t.creatorSubs.processAll}
        message={`Process payouts for all ${summary?.summary.creators_with_pending ?? 0} creators with pending balances (${fmtUsd(summary?.summary.total_pending ?? 0)} total)?`}
        confirmLabel={t.creatorSubs.processAll}
        variant="warning"
        onConfirm={handleProcessAll}
        onCancel={() => setShowProcessAllConfirm(false)}
        loading={processAllLoading}
      />
    </div>
  );
}
