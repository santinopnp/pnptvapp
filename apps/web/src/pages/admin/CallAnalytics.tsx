import React, { useState, useEffect, useCallback } from "react";
import { getCallAnalytics as fetchCallAnalytics } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface SurveyStats {
  total_surveys: number;
  avg_rating: string | null;
  avg_tech_quality: string | null;
  avg_performance_quality: string | null;
  avg_presentation: string | null;
  avg_politeness: string | null;
  shared_with_model: number;
  has_tech_feedback: number;
  has_app_feedback: number;
  has_equipment_feedback: number;
}

interface RatingBucket { rating: number; count: number }

interface CreatorRow {
  creator_id: string;
  username: string | null;
  display_name: string | null;
  survey_count: number;
  avg_rating: string | null;
  avg_tech_quality: string | null;
  avg_performance_quality: string | null;
  avg_presentation: string | null;
  avg_politeness: string | null;
}

interface FeedbackRow {
  id: string;
  created_at: string;
  rating: number | null;
  tech_quality: number | null;
  performance_quality: number | null;
  presentation: number | null;
  politeness: number | null;
  feedback: string | null;
  tech_improvement: string | null;
  app_feedback: string | null;
  equipment_feedback: string | null;
  share_with_model: boolean;
  creator_username: string | null;
  member_username: string | null;
}

interface TipStats {
  total_tips: number;
  completed_tips: number;
  pending_tips: number;
  total_usd: string;
  avg_usd: string;
  max_usd: string;
}

interface TipCreatorRow {
  creator_id: string;
  username: string | null;
  display_name: string | null;
  tip_count: number;
  total_usd: string;
  avg_usd: string;
}

interface TipRow {
  id: string;
  amount_usd: string;
  message: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  pay_currency: string | null;
  payer_username: string | null;
  creator_username: string | null;
}

interface CallAnalyticsData {
  callAnalytics: {
    surveyStats: SurveyStats;
    ratingDistribution: RatingBucket[];
    topCreators: CreatorRow[];
    recentFeedback: FeedbackRow[];
  };
  tipAnalytics: {
    overallStats: TipStats;
    topCreators: TipCreatorRow[];
    recentTips: TipRow[];
    dailyStats: { date: string; tip_count: number; total_usd: string }[];
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(iso); }
}

function fmtUsd(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function star(v: string | null | undefined): string {
  const n = parseFloat(v ?? "0");
  if (isNaN(n) || n === 0) return "—";
  return n.toFixed(2);
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100 mt-1">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SurveySection({ data }: { data: CallAnalyticsData["callAnalytics"] }) {
  const s = data.surveyStats;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-100">Call Surveys — last 90 days</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Surveys" value={s.total_surveys ?? 0} />
        <MetricCard label="Avg Overall" value={star(s.avg_rating)} />
        <MetricCard label="Avg Tech" value={star(s.avg_tech_quality)} />
        <MetricCard label="Avg Performance" value={star(s.avg_performance_quality)} />
        <MetricCard label="Avg Presentation" value={star(s.avg_presentation)} />
        <MetricCard label="Avg Politeness" value={star(s.avg_politeness)} />
      </div>
      <div className="flex gap-4 text-sm text-zinc-400 flex-wrap">
        <span>Shared with creator: <strong className="text-zinc-200">{s.shared_with_model ?? 0}</strong></span>
        <span>Tech feedback: <strong className="text-zinc-200">{s.has_tech_feedback ?? 0}</strong></span>
        <span>App feedback: <strong className="text-zinc-200">{s.has_app_feedback ?? 0}</strong></span>
        <span>Equipment feedback: <strong className="text-zinc-200">{s.has_equipment_feedback ?? 0}</strong></span>
      </div>

      {data.ratingDistribution.length > 0 && (
        <div className="flex items-end gap-2 h-16">
          {[1, 2, 3, 4, 5].map((r) => {
            const bucket = data.ratingDistribution.find((b) => b.rating === r);
            const count = bucket?.count ?? 0;
            const max = Math.max(...data.ratingDistribution.map((b) => b.count), 1);
            const pct = Math.round((count / max) * 100);
            return (
              <div key={r} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-xs text-zinc-400">{count}</span>
                <div
                  className="w-full rounded-t bg-pnp-accent/60"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
                <span className="text-xs text-zinc-500">{r}★</span>
              </div>
            );
          })}
        </div>
      )}

      {data.topCreators.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-300">Top Creators by Rating (min 2 surveys)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-400 border-b border-zinc-700">
                <tr>
                  <th className="py-2 pr-3">Creator</th>
                  <th className="py-2 pr-3">Surveys</th>
                  <th className="py-2 pr-3">Overall</th>
                  <th className="py-2 pr-3">Tech</th>
                  <th className="py-2 pr-3">Performance</th>
                  <th className="py-2 pr-3">Presentation</th>
                  <th className="py-2 pr-3">Politeness</th>
                </tr>
              </thead>
              <tbody>
                {data.topCreators.map((c) => (
                  <tr key={c.creator_id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                    <td className="py-2 pr-3 font-medium text-zinc-200">{c.display_name || c.username || c.creator_id}</td>
                    <td className="py-2 pr-3 text-zinc-400">{c.survey_count}</td>
                    <td className="py-2 pr-3">{star(c.avg_rating)}</td>
                    <td className="py-2 pr-3">{star(c.avg_tech_quality)}</td>
                    <td className="py-2 pr-3">{star(c.avg_performance_quality)}</td>
                    <td className="py-2 pr-3">{star(c.avg_presentation)}</td>
                    <td className="py-2 pr-3">{star(c.avg_politeness)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.recentFeedback.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-300">Recent Text Feedback (last 30 days)</h3>
          <div className="space-y-3">
            {data.recentFeedback.map((fb) => (
              <div key={fb.id} className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3 text-sm space-y-1.5">
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>{fmtDate(fb.created_at)}</span>
                  {fb.creator_username && <span>Creator: <strong className="text-zinc-300">{fb.creator_username}</strong></span>}
                  {fb.member_username && <span>Member: <strong className="text-zinc-300">{fb.member_username}</strong></span>}
                  {fb.rating != null && <span>Overall: <strong className="text-zinc-200">{fb.rating}★</strong></span>}
                  {fb.share_with_model && <span className="text-emerald-400">Shared with creator</span>}
                </div>
                {fb.feedback && (
                  <p className="text-zinc-300"><span className="text-zinc-500 text-xs">General: </span>{fb.feedback}</p>
                )}
                {fb.tech_improvement && (
                  <p className="text-zinc-300"><span className="text-zinc-500 text-xs">Tech improvement: </span>{fb.tech_improvement}</p>
                )}
                {fb.app_feedback && (
                  <p className="text-zinc-300"><span className="text-zinc-500 text-xs">App feedback: </span>{fb.app_feedback}</p>
                )}
                {fb.equipment_feedback && (
                  <p className="text-zinc-300"><span className="text-zinc-500 text-xs">Equipment: </span>{fb.equipment_feedback}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TipsSection({ data }: { data: CallAnalyticsData["tipAnalytics"] }) {
  const s = data.overallStats;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-100">Creator Tips — last 90 days</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Tips" value={s.total_tips ?? 0} />
        <MetricCard label="Completed" value={s.completed_tips ?? 0} />
        <MetricCard label="Pending" value={s.pending_tips ?? 0} />
        <MetricCard label="Total USD" value={fmtUsd(s.total_usd)} />
        <MetricCard label="Avg Tip" value={fmtUsd(s.avg_usd)} />
        <MetricCard label="Largest Tip" value={fmtUsd(s.max_usd)} />
      </div>

      {data.topCreators.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-300">Top Tipped Creators</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-400 border-b border-zinc-700">
                <tr>
                  <th className="py-2 pr-3">Creator</th>
                  <th className="py-2 pr-3">Tips</th>
                  <th className="py-2 pr-3">Total USD</th>
                  <th className="py-2 pr-3">Avg USD</th>
                </tr>
              </thead>
              <tbody>
                {data.topCreators.map((c) => (
                  <tr key={c.creator_id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                    <td className="py-2 pr-3 font-medium text-zinc-200">{c.display_name || c.username || c.creator_id}</td>
                    <td className="py-2 pr-3 text-zinc-400">{c.tip_count}</td>
                    <td className="py-2 pr-3">{fmtUsd(c.total_usd)}</td>
                    <td className="py-2 pr-3">{fmtUsd(c.avg_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.recentTips.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-300">Recent Tips</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-400 border-b border-zinc-700">
                <tr>
                  <th className="py-2 pr-3">Payer</th>
                  <th className="py-2 pr-3">Creator</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Currency</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Message</th>
                  <th className="py-2 pr-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTips.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
                    <td className="py-2 pr-3 text-zinc-300">{t.payer_username || "—"}</td>
                    <td className="py-2 pr-3 text-zinc-300">{t.creator_username || "—"}</td>
                    <td className="py-2 pr-3">{fmtUsd(t.amount_usd)}</td>
                    <td className="py-2 pr-3 uppercase text-xs text-zinc-400">{t.pay_currency || "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        t.status === "completed" ? "bg-emerald-900/40 text-emerald-300" :
                        t.status === "pending" ? "bg-amber-900/40 text-amber-300" :
                        "bg-zinc-700 text-zinc-400"
                      }`}>{t.status}</span>
                    </td>
                    <td className="py-2 pr-3 text-zinc-400 max-w-[160px] truncate">{t.message || "—"}</td>
                    <td className="py-2 pr-3 text-zinc-500 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CallAnalytics() {
  const [data, setData] = useState<CallAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCallAnalytics();
      setData(res as unknown as CallAnalyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="p-6 text-zinc-400">Loading call analytics…</div>;
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error}</p>
        <button onClick={load} className="mt-3 px-3 py-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-sm">
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="p-6 space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Book-a-Call Analytics</h1>
          <p className="text-sm text-zinc-400 mt-1">Survey scores and tip activity — 90-day window.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <SurveySection data={data.callAnalytics} />
      <TipsSection data={data.tipAnalytics} />
    </div>
  );
}
