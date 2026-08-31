import React, { useState, useEffect, useCallback } from "react";
import {
  listMercadoPagoActivations,
  activateMercadoPagoPayment,
  listNequiActivations,
  activateNequiPayment,
  type MercadoPagoActivation,
  type NequiActivation,
} from "@/lib/api";

// plan_id is being added to the backend type — extend locally until api.ts is updated
type MercadoPagoActivationWithPlan = MercadoPagoActivation & { plan_id?: string | null };

type Tab = "mercadopago" | "nequi";
type Filter = "pending" | "activated" | "rejected" | "all";

const PLAN_LABELS: Record<string, string> = {
  "member_monthly":           "Basic $9.99",
  "prime-week-pass-7d":       "Week $14.99",
  "monthly-pass":             "Monthly $24.99",
  "prime-diamond-pass-365d":  "Year $99.99",
  "lifetime-pass":            "Lifetime $249.99",
  "lifetime100":              "Lifetime100 $100",
};

function planLabel(planId: string | null | undefined): string {
  if (!planId) return PLAN_LABELS["lifetime100"];
  return PLAN_LABELS[planId] ?? planId;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    pending:   { bg: "rgba(255,180,84,0.14)", color: "#FFB454" },
    activated: { bg: "rgba(74,222,128,0.14)", color: "#4ADE80" },
    rejected:  { bg: "rgba(239,68,68,0.14)",  color: "#EF4444" },
  };
  const c = cfg[status] ?? { bg: "rgba(255,255,255,0.08)", color: "#8E8E93" };
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.color }}
    >
      {status}
    </span>
  );
}

function PlanPill({ planId }: { planId: string | null | undefined }) {
  const label = planLabel(planId);
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide whitespace-nowrap"
      style={{ background: "rgba(255,255,255,0.07)", color: "#8E8E93" }}
    >
      {label}
    </span>
  );
}

function CopyCell({
  value,
  emphasize = false,
}: {
  value: string | null;
  emphasize?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-pnp-textSecondary">—</span>;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard denied — silently ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      title="Click to copy"
      className="group flex items-center gap-1.5 text-left transition-opacity hover:opacity-80 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent focus-visible:ring-offset-1 focus-visible:ring-offset-pnp-surface rounded"
    >
      {emphasize ? (
        <span
          className="font-mono font-bold text-sm tracking-wide px-1.5 py-0.5 rounded"
          style={{ background: "rgba(0,133,255,0.12)", color: "#5BB9FF" }}
        >
          {value}
        </span>
      ) : (
        <span className="font-mono text-[11px] break-all">{value}</span>
      )}
      <span
        className="shrink-0 text-[10px] font-semibold transition-all"
        style={{ color: copied ? "#4ADE80" : "#555" }}
      >
        {copied ? "copied ✓" : "⎘"}
      </span>
    </button>
  );
}

export default function ManualActivations() {
  const [tab, setTab] = useState<Tab>("mercadopago");
  const [filter, setFilter] = useState<Filter>("pending");
  const [mpRows, setMpRows] = useState<MercadoPagoActivationWithPlan[]>([]);
  const [nequiRows, setNequiRows] = useState<NequiActivation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "mercadopago") {
        const res = await listMercadoPagoActivations(filter);
        if (!res.success) throw new Error("Failed to load MercadoPago activations");
        setMpRows((res.activations || []) as MercadoPagoActivationWithPlan[]);
      } else {
        const res = await listNequiActivations(filter);
        if (!res.success) throw new Error("Failed to load Nequi activations");
        setNequiRows(res.activations || []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  const handleGrant = async (id: number, planId?: string | null) => {
    const provider = tab === "mercadopago" ? "MercadoPago" : "Nequi Negocios";
    const planLbl = tab === "mercadopago" ? planLabel(planId) : "Lifetime100 $100";
    if (!window.confirm(`Grant ${planLbl} for ${provider} activation #${id}? This sends the welcome email.`)) return;
    setBusyId(id);
    try {
      const res = tab === "mercadopago"
        ? await activateMercadoPagoPayment(id)
        : await activateNequiPayment(id);
      if (!res.success) throw new Error(res.error || "Activation failed");
      setBanner({ kind: "ok", text: `Granted access for #${id}. Welcome email sent.` });
      await load();
    } catch (e) {
      setBanner({ kind: "err", text: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const rows: Array<{
    id: number;
    email: string;
    userId: string | null;
    username: string | null;
    firstName: string | null;
    planId: string | null | undefined;
    reference: string | null;
    transactionId: string | null;
    externalStatus: string | null;
    status: "pending" | "activated" | "rejected";
    createdAt: string;
    activatedAt: string | null;
    notes: string | null;
    isMp: boolean;
  }> = tab === "mercadopago"
    ? mpRows.map((r) => ({
        id: r.id,
        email: r.email,
        userId: r.user_id,
        username: r.username,
        firstName: r.first_name,
        planId: r.plan_id,
        reference: r.mp_reference,
        transactionId: r.mp_transaction_id,
        externalStatus: r.mp_status,
        status: r.status,
        createdAt: r.created_at,
        activatedAt: r.activated_at,
        notes: r.notes,
        isMp: true,
      }))
    : nequiRows.map((r) => ({
        id: r.id,
        email: r.email,
        userId: r.user_id,
        username: r.username,
        firstName: r.first_name,
        planId: undefined,
        reference: r.wompi_reference,
        transactionId: r.wompi_transaction_id,
        externalStatus: r.wompi_status,
        status: r.status,
        createdAt: r.created_at,
        activatedAt: r.activated_at,
        notes: r.notes,
        isMp: false,
      }));

  const providerLabel = tab === "mercadopago" ? "MercadoPago" : "Nequi Negocios";
  const providerEmoji = tab === "mercadopago" ? "💳" : "📲";
  const providerNote  = tab === "mercadopago"
    ? "mpago.li lifetime link — charges ~320,000 COP ≈ $100 USD. Verify in the MercadoPago dashboard before granting."
    : "Wompi Nequi Negocios reusable link. Verify in the Wompi dashboard before granting.";

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto text-white">
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Manual Activations</h1>
        <p className="text-sm text-pnp-textSecondary mt-1">
          Grant lifetime access to buyers who paid via a hosted payment link. Both providers grant the same bundle: <strong>lifetime PRIME + pnp-member lifetime + founder badge + welcome email</strong>.
        </p>
      </div>

      {banner && (
        <div
          role="alert"
          className="mb-4 rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            background: banner.kind === "ok" ? "rgba(74,222,128,0.12)" : "rgba(239,68,68,0.12)",
            color:      banner.kind === "ok" ? "#4ADE80" : "#EF4444",
            border: `1px solid ${banner.kind === "ok" ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`,
          }}
        >
          {banner.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-pnp-border">
        {(["mercadopago", "nequi"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === t
                ? "border-pnp-accent text-white"
                : "border-transparent text-pnp-textSecondary hover:text-white"
            }`}
          >
            {t === "mercadopago" ? "💳 MercadoPago" : "📲 Nequi Negocios"}
          </button>
        ))}
      </div>

      {/* Provider note */}
      <div className="mb-4 rounded-lg px-4 py-3 text-xs text-pnp-textSecondary border border-pnp-border bg-pnp-surface/50">
        {providerEmoji} {providerNote}
      </div>

      {/* Filter + refresh */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["pending", "activated", "rejected", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide transition-colors ${
              filter === f
                ? "bg-pnp-accent text-black"
                : "border border-pnp-border text-pnp-textSecondary hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border border-pnp-border text-white hover:bg-pnp-surface disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/30">
          {error}
        </div>
      )}

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-pnp-textSecondary">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-pnp-textSecondary">
          No {filter === "all" ? "" : filter} {providerLabel} activations.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-pnp-border">
          <table className="w-full text-sm">
            <thead className="bg-pnp-surface text-xs uppercase tracking-wide text-pnp-textSecondary">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Email / User</th>
                <th className="text-left px-3 py-2">Plan</th>
                <th className="text-left px-3 py-2">Reference</th>
                <th className="text-left px-3 py-2">Op# / Tx</th>
                <th className="text-left px-3 py-2">Ext. Status</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Created</th>
                <th className="text-left px-3 py-2">Activated</th>
                <th className="text-right px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-pnp-border hover:bg-pnp-surface/40">
                  <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.email}</div>
                    {(r.username || r.firstName) && (
                      <div className="text-[11px] text-pnp-textSecondary">
                        {r.username ? `@${r.username}` : r.firstName}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.isMp
                      ? <PlanPill planId={r.planId} />
                      : <span className="text-pnp-textSecondary text-xs">—</span>
                    }
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] break-all">{r.reference || "—"}</td>
                  <td className="px-3 py-2">
                    <CopyCell value={r.transactionId} emphasize={r.isMp} />
                  </td>
                  <td className="px-3 py-2 text-xs">{r.externalStatus || "—"}</td>
                  <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDate(r.activatedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "pending" ? (
                      <button
                        onClick={() => void handleGrant(r.id, r.planId)}
                        disabled={busyId === r.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(90deg,#ff3377,#ff9933)" }}
                      >
                        {busyId === r.id ? "Granting…" : "Grant Access"}
                      </button>
                    ) : r.status === "activated" ? (
                      <span className="text-xs text-green-400 font-semibold">✓ Activated</span>
                    ) : (
                      <span className="text-xs text-pnp-textSecondary">—</span>
                    )}
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
