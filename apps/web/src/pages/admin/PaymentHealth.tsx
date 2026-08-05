import React, { useState, useEffect, useCallback } from "react";
import { getPaymentHealth, type PaymentHealth, type PaymentHealthStuckPayment, type PaymentHealthLeak } from "@/lib/api";

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function fmtAge(hours: number | undefined, minutes: number | undefined): string {
  const h = typeof hours === "number" ? hours : (typeof minutes === "number" ? minutes / 60 : 0);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function truncate(s: string | null | undefined, max = 24): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function num(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseInt(v, 10) || 0;
  return 0;
}

function StatusPill({ count, label }: { count: number; label: string }) {
  const tone = count === 0
    ? "bg-emerald-900/40 text-emerald-300 border-emerald-800"
    : count < 5
      ? "bg-amber-900/40 text-amber-300 border-amber-800"
      : "bg-red-900/40 text-red-300 border-red-800";
  return (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-2xl font-semibold mt-1">{count}</div>
    </div>
  );
}

function StuckMeruTable({ items }: { items: PaymentHealthStuckPayment[] }) {
  if (!items.length) return <p className="text-sm text-zinc-400 italic">No stuck Meru links. Reconciler is keeping up.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400 border-b border-zinc-700">
          <tr>
            <th className="py-2 pr-3">Code</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Reserved Email</th>
            <th className="py-2 pr-3">Reserved User</th>
            <th className="py-2 pr-3">Age</th>
            <th className="py-2 pr-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.code} className="border-b border-zinc-800 hover:bg-zinc-800/40">
              <td className="py-2 pr-3 font-mono">{p.code}</td>
              <td className="py-2 pr-3">{p.status}</td>
              <td className="py-2 pr-3">{p.reserved_for_email || "(orphan)"}</td>
              <td className="py-2 pr-3 font-mono text-xs">{truncate(p.reserved_for_user_id, 20)}</td>
              <td className="py-2 pr-3">{fmtAge(p.hours_since_create, undefined)}</td>
              <td className="py-2 pr-3">{fmtTime(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// StuckDashTable: historical view — BTCPay/Dash retired 2026-07-31, shows only old records
function StuckDashTable({ items }: { items: PaymentHealthStuckPayment[] }) {
  if (!items.length) return <p className="text-sm text-zinc-400 italic">No stuck BTCPay invoices (provider retired 2026-07-31).</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400 border-b border-zinc-700">
          <tr>
            <th className="py-2 pr-3">User</th>
            <th className="py-2 pr-3">Plan</th>
            <th className="py-2 pr-3">USD</th>
            <th className="py-2 pr-3">Invoice</th>
            <th className="py-2 pr-3">Age</th>
            <th className="py-2 pr-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-zinc-800 hover:bg-zinc-800/40">
              <td className="py-2 pr-3 font-mono text-xs">{truncate(p.user_id, 24)}</td>
              <td className="py-2 pr-3">{p.plan_id || "—"}</td>
              <td className="py-2 pr-3">${p.usd_amount}</td>
              <td className="py-2 pr-3 font-mono text-xs">{truncate(p.btcpay_invoice_id, 16)}</td>
              <td className="py-2 pr-3">{fmtAge(undefined, p.minutes_pending)}</td>
              <td className="py-2 pr-3">{fmtTime(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaksTable({ items }: { items: PaymentHealthLeak[] }) {
  if (!items.length) return <p className="text-sm text-zinc-400 italic">No suspicious access patterns in the last 7 days. ✓</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-400 border-b border-zinc-700">
          <tr>
            <th className="py-2 pr-3">URL</th>
            <th className="py-2 pr-3">Distinct Users</th>
            <th className="py-2 pr-3">Distinct IPs</th>
            <th className="py-2 pr-3">Fetches</th>
            <th className="py-2 pr-3">Last Hit</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => {
            const u = num(l.distinct_users);
            const ips = num(l.distinct_ips);
            const danger = u >= 3 || ips >= 5;
            return (
              <tr key={l.media_url} className={`border-b border-zinc-800 hover:bg-zinc-800/40 ${danger ? "bg-red-900/10" : ""}`}>
                <td className="py-2 pr-3 font-mono text-xs">{truncate(l.media_url, 50)}</td>
                <td className="py-2 pr-3">{u}</td>
                <td className="py-2 pr-3">{ips}</td>
                <td className="py-2 pr-3">{l.total_fetches}</td>
                <td className="py-2 pr-3">{fmtTime(l.last_fetched)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PaymentHealth() {
  const [data, setData] = useState<PaymentHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPaymentHealth();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s while page is open.
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return <div className="p-6 text-zinc-400">Loading payment health…</div>;
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error}</p>
        <button onClick={load} className="mt-3 px-3 py-1 bg-zinc-800 rounded hover:bg-zinc-700">Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const total = data.stuck.meru.count + data.stuck.dash.count;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payment Health</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Stuck payments, suspicious access, and reconciler activity. Refreshes every 60s.
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Active provider: <span className="text-zinc-300">NowPayments</span>.
            BTCPay/Dash retired 2026-07-31. ePayco closed 2026-06-27. Daimo retired 2026-04-21.
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 bg-pnp-primary hover:bg-pnp-primary/80 rounded text-sm"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatusPill count={total} label="Stuck Total" />
        <StatusPill count={data.stuck.meru.count} label="Meru Stuck" />
        <StatusPill count={data.stuck.dash.count} label="BTCPay (retired)" />
      </div>

      {/* Ru$h 💎 Currency Health */}
      <CurrencyHealthPanel />


      {/* 7-day activity */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">7-day Activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-zinc-400 text-xs">BTCPay (retired)</div><div className="text-lg font-mono">{data.activity.dash_completed_7d ?? 0}</div></div>
          <div><div className="text-zinc-400 text-xs">Meru completed</div><div className="text-lg font-mono">{data.activity.meru_completed_7d ?? 0}</div></div>
          <div><div className="text-zinc-400 text-xs">Video fetches</div><div className="text-lg font-mono">{data.activity.video_views_7d ?? 0}</div></div>
          <div><div className="text-zinc-400 text-xs">Distinct videos</div><div className="text-lg font-mono">{data.activity.distinct_videos_7d ?? 0}</div></div>
        </div>
      </div>

      {/* Leaks first — highest priority for security review */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">
          Suspicious Access (last 7d) — {data.leaks.count}
        </h2>
        <LeaksTable items={data.leaks.items} />
      </div>

      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">
          Stuck Meru — {data.stuck.meru.count}
        </h2>
        <StuckMeruTable items={data.stuck.meru.items} />
      </div>

      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400 mb-3">
          Stuck BTCPay (retired 2026-07-31, historical) — {data.stuck.dash.count}
        </h2>
        <StuckDashTable items={data.stuck.dash.items} />
      </div>

      <p className="text-xs text-zinc-500">
        Generated at {fmtTime(data.generated_at)}.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CurrencyHealthPanel — Ru$h 💎 supply, flow, integrity check
// ─────────────────────────────────────────────────────────────────────────────

interface CurrencyHealth {
  success: boolean;
  circulation: { total_circulating: string | number; total_balance: string | number; total_gifted: string | number; holders: string | number };
  windows: Array<{ label: string; purchased: string | number; granted: string | number; spent: string | number; event_count: string | number }>;
  top_holders: Array<{ user_id: string; username: string | null; first_name: string | null; balance_tokens: number; gifted_balance: number; total: number }>;
  drift: Array<{ user_id: string; wallet_balance: number; wallet_gifted: number; ledger_balance: number; ledger_gifted: number }>;
  drift_ok: boolean;
}

function CurrencyHealthPanel() {
  const [d, setD] = useState<CurrencyHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/webapp/admin/currency-health', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setD(await res.json());
    } catch (e) { setErr(e instanceof Error ? e.message : 'Load failed'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="rounded-lg bg-red-950/40 border border-red-800 p-4 text-sm text-red-300">Currency Health: {err}</div>;
  if (!d) return <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 text-sm text-zinc-400">Loading Ru$h health…</div>;

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-wide text-amber-400">Ru$h 💎 Currency Health</h2>
        {d.drift_ok
          ? <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-300">LEDGER ✓</span>
          : <span className="text-[10px] px-2 py-0.5 rounded bg-red-950/40 border border-red-800 text-red-300">DRIFT {d.drift.length}</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div><div className="text-zinc-400 text-xs">In circulation</div><div className="text-lg font-mono">{Number(d.circulation.total_circulating).toLocaleString()} 💎</div></div>
        <div><div className="text-zinc-400 text-xs">Purchased Ru$h</div><div className="text-lg font-mono">{Number(d.circulation.total_balance).toLocaleString()} 💎</div></div>
        <div><div className="text-zinc-400 text-xs">Gifted Ru$h</div><div className="text-lg font-mono">{Number(d.circulation.total_gifted).toLocaleString()} 💎</div></div>
        <div><div className="text-zinc-400 text-xs">Holders</div><div className="text-lg font-mono">{Number(d.circulation.holders).toLocaleString()}</div></div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Flow</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-zinc-400 border-b border-zinc-800">
              <tr className="text-left">
                <th className="py-1 pr-3">Window</th>
                <th className="py-1 pr-3">Purchased</th>
                <th className="py-1 pr-3">Granted</th>
                <th className="py-1 pr-3">Spent</th>
                <th className="py-1 pr-3">Events</th>
              </tr>
            </thead>
            <tbody>
              {d.windows.map(w => (
                <tr key={w.label} className="border-b border-zinc-800/60">
                  <td className="py-1 pr-3">{w.label}</td>
                  <td className="py-1 pr-3 font-mono text-emerald-300">+{Number(w.purchased).toLocaleString()} 💎</td>
                  <td className="py-1 pr-3 font-mono text-amber-300">+{Number(w.granted).toLocaleString()} 💎</td>
                  <td className="py-1 pr-3 font-mono text-red-300">−{Number(w.spent).toLocaleString()} 💎</td>
                  <td className="py-1 pr-3 font-mono text-zinc-400">{Number(w.event_count).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Top holders</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-zinc-400 border-b border-zinc-800">
              <tr className="text-left">
                <th className="py-1 pr-3">User</th>
                <th className="py-1 pr-3">Purchased</th>
                <th className="py-1 pr-3">Gifted</th>
                <th className="py-1 pr-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.top_holders.map(h => (
                <tr key={h.user_id} className="border-b border-zinc-800/60">
                  <td className="py-1 pr-3">{h.username || h.first_name || h.user_id}</td>
                  <td className="py-1 pr-3 font-mono">{Number(h.balance_tokens).toLocaleString()} 💎</td>
                  <td className="py-1 pr-3 font-mono text-amber-300">{Number(h.gifted_balance).toLocaleString()} 💎</td>
                  <td className="py-1 pr-3 font-mono font-semibold">{Number(h.total).toLocaleString()} 💎</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!d.drift_ok && (
        <div className="rounded-md bg-red-950/40 border border-red-800 p-3 text-xs text-red-300">
          <strong>Ledger drift detected</strong> — {d.drift.length} wallet(s) don't match the sum of their ledger rows.
          Manual reconciliation required.
        </div>
      )}
    </div>
  );
}

