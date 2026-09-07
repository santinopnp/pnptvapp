import React, { useCallback, useEffect, useState } from "react";
import { getCallDiagnostics } from "@/lib/api";
import type {
  CallDiagnosticsPendingPayment,
  CallDiagnosticsAbandonedUser,
  CallDiagnosticsCreatorNoAvail,
  CallDiagnosticsStuckBooking,
} from "@/lib/api";

interface Diag {
  generated_at: string;
  totals: {
    creators_with_packages: number;
    creators_with_availability: number;
    completed_last_7d: number;
    expired_last_7d: number;
    unused_credits: number;
    conversion_rate_7d: number | null;
  };
  pending_payments: CallDiagnosticsPendingPayment[];
  abandoned_users_7d: CallDiagnosticsAbandonedUser[];
  creators_without_availability: CallDiagnosticsCreatorNoAvail[];
  stuck_bookings: CallDiagnosticsStuckBooking[];
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "warn" | "bad" | "good" }) {
  const toneClass =
    tone === "bad" ? "border-red-500/40 bg-red-500/5"
    : tone === "warn" ? "border-yellow-500/40 bg-yellow-500/5"
    : tone === "good" ? "border-green-500/40 bg-green-500/5"
    : "border-white/10 bg-white/5";
  return (
    <div className={`rounded-lg border ${toneClass} p-4`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-3">
        {title} <span className="opacity-60 text-sm">({count})</span>
      </h2>
      {count === 0 ? (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-sm opacity-80">
          Nothing to report — clean.
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export default function CallDiagnostics() {
  const [data, setData] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCallDiagnostics();
      const { success: _s, ...rest } = res;
      setData(rest as Diag);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="p-6 opacity-70">Loading diagnostics…</div>;
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;
  if (!data) return null;

  const availPct = data.totals.creators_with_packages > 0
    ? Math.round((data.totals.creators_with_availability / data.totals.creators_with_packages) * 100)
    : 0;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Book-a-Call Diagnostics</h1>
          <p className="text-xs opacity-60 mt-1">Generated {new Date(data.generated_at).toLocaleString()}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md border border-white/20 hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Creators w/ packages" value={data.totals.creators_with_packages} />
        <StatCard
          label="Creators w/ availability"
          value={`${data.totals.creators_with_availability} (${availPct}%)`}
          tone={availPct < 30 ? "bad" : availPct < 70 ? "warn" : "good"}
        />
        <StatCard label="Completed 7d" value={data.totals.completed_last_7d} tone="good" />
        <StatCard label="Expired 7d" value={data.totals.expired_last_7d} tone={data.totals.expired_last_7d > 0 ? "warn" : "default"} />
        <StatCard
          label="Conversion 7d"
          value={data.totals.conversion_rate_7d != null ? `${data.totals.conversion_rate_7d.toFixed(0)}%` : "—"}
          tone={data.totals.conversion_rate_7d != null && data.totals.conversion_rate_7d < 30 ? "bad" : "default"}
        />
        <StatCard label="Unused credits" value={data.totals.unused_credits} />
      </div>

      <Section title="Pending payments > 30 min old" count={data.pending_payments.length}>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left">
                <th className="p-2">User</th>
                <th className="p-2">Creator</th>
                <th className="p-2">Duration</th>
                <th className="p-2">Provider</th>
                <th className="p-2 text-right">Amount</th>
                <th className="p-2 text-right">Age (min)</th>
              </tr>
            </thead>
            <tbody>
              {data.pending_payments.map(p => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="p-2">{p.username ?? p.user_id}</td>
                  <td className="p-2">{p.creator_username ?? p.creator_id ?? "—"}</td>
                  <td className="p-2">{p.duration ?? "—"}</td>
                  <td className="p-2">{p.provider}</td>
                  <td className="p-2 text-right">${p.amount.toFixed(2)}</td>
                  <td className="p-2 text-right">{p.age_minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Repeat abandoners (last 7d, ≥2 expired)" count={data.abandoned_users_7d.length}>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left">
                <th className="p-2">User</th>
                <th className="p-2 text-right">Abandoned</th>
                <th className="p-2 text-right">Total $</th>
                <th className="p-2">Last attempt</th>
              </tr>
            </thead>
            <tbody>
              {data.abandoned_users_7d.map(u => (
                <tr key={u.user_id} className="border-t border-white/5">
                  <td className="p-2">{u.username ?? u.first_name ?? u.user_id}</td>
                  <td className="p-2 text-right">{u.abandoned}</td>
                  <td className="p-2 text-right">${u.total_usd.toFixed(0)}</td>
                  <td className="p-2 text-xs opacity-70">{new Date(u.last_attempt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Creators selling calls with NO availability" count={data.creators_without_availability.length}>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left">
                <th className="p-2">Creator</th>
                <th className="p-2 text-right">Active pkgs</th>
                <th className="p-2 text-right">Min price</th>
              </tr>
            </thead>
            <tbody>
              {data.creators_without_availability.map(c => (
                <tr key={c.creator_id} className="border-t border-white/5">
                  <td className="p-2">
                    {c.username ?? c.first_name ?? c.creator_id}
                  </td>
                  <td className="p-2 text-right">{c.active_packages}</td>
                  <td className="p-2 text-right">${c.min_price.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Stuck bookings > 30 min" count={data.stuck_bookings.length}>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left">
                <th className="p-2">Booking</th>
                <th className="p-2">Member</th>
                <th className="p-2">Creator</th>
                <th className="p-2">Status</th>
                <th className="p-2">Payment</th>
                <th className="p-2 text-right">Age (min)</th>
              </tr>
            </thead>
            <tbody>
              {data.stuck_bookings.map(b => (
                <tr key={b.id} className="border-t border-white/5">
                  <td className="p-2 font-mono text-xs">{b.id.slice(0, 8)}…</td>
                  <td className="p-2">{b.username ?? b.member_id}</td>
                  <td className="p-2">{b.creator_username ?? b.creator_id}</td>
                  <td className="p-2">{b.status}</td>
                  <td className="p-2 text-xs opacity-70">
                    {b.payment_provider ?? "—"} / {b.payment_status ?? "—"}
                  </td>
                  <td className="p-2 text-right">{b.age_minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
