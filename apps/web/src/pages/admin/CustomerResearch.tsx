import React, { useState, useEffect, useCallback } from "react";
import { getCustomerResearch, type CustomerResearch } from "@/lib/api";

function fmt(n: number) { return n.toLocaleString("en-US"); }
function usd(n: number) { return `$${n.toFixed(2)}`; }

function StatPill({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs font-medium mt-0.5" style={{ color: "#D4007A" }}>{label}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "#636366" }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: "var(--pnp-surface, #1C1C1E)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{title}</h2>
      {children}
    </div>
  );
}

function SkeletonBlock({ h = "h-48" }: { h?: string }) {
  return <div className={`rounded-xl ${h} animate-pulse`} style={{ background: "var(--pnp-surface, #1C1C1E)" }} />;
}

function FeatureBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-sm text-white">{label}</span>
          <span className="text-sm font-bold text-white">{fmt(count)}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#D4007A,#E69138)" }} />
        </div>
      </div>
    </div>
  );
}

export default function CustomerResearchPage() {
  const [data, setData] = useState<CustomerResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCustomerResearch();
      setData(res.research);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxFeature = data ? Math.max(...data.featureUsage.map(f => f.count), 1) : 1;
  const totalRevenue = data ? data.revenueByPlan.reduce((s, r) => s + r.ingresos, 0) : 0;

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pnp-textPrimary">Radiografía de clientes</h1>
          <p className="text-sm mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            Quiénes son, cuánto pagan, qué usan — siempre datos en vivo.
          </p>
        </div>
        {!loading && (
          <button
            onClick={load}
            className="text-xs border rounded-lg px-3 py-1.5 transition-colors hover:text-white"
            style={{ color: "var(--pnp-text-secondary, #8E8E93)", borderColor: "rgba(255,255,255,0.1)" }}
          >
            Actualizar
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm text-red-400" style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.2)" }}>
          {error}
        </div>
      )}

      {/* Population KPIs */}
      {loading ? <SkeletonBlock h="h-24" /> : data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatPill label="Usuarios totales" value={fmt(data.population.totalUsers)} />
          <StatPill
            label="Activos (7 d)"
            value={fmt(data.population.activeUsers)}
            sub={`${Math.round(data.population.activeUsers / Math.max(data.population.totalUsers, 1) * 100)}%`}
          />
          <StatPill
            label="Activos (30 d)"
            value={fmt(data.population.active30d)}
            sub={`${Math.round(data.population.active30d / Math.max(data.population.totalUsers, 1) * 100)}%`}
          />
          <StatPill label="Creadores activos" value={fmt(data.population.creatorsActive)} />
          <StatPill
            label="Han pagado"
            value={fmt(data.population.everPaidUsers)}
            sub={`${Math.round(data.population.everPaidUsers / Math.max(data.population.totalUsers, 1) * 100)}% conversión`}
          />
        </div>
      )}

      {/* Profiles + Revenue grid */}
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonBlock /><SkeletonBlock />
        </div>
      ) : data && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Customer profiles */}
          <Section title="Perfiles de usuario">
            <div className="space-y-3">
              {data.profiles.map((p) => (
                <div key={p.label} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <span className="text-sm text-white">{p.label}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-white">{fmt(p.count)}</span>
                    {p.signal !== 'base' && (
                      <span className="ml-2 text-xs" style={{ color: "#D4007A" }}>{p.signal}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Revenue by plan */}
          <Section title={`Ingresos por plan — ${usd(totalRevenue)} total`}>
            <div className="space-y-2">
              {data.revenueByPlan.slice(0, 10).map((r) => {
                const pct = totalRevenue > 0 ? Math.round(r.ingresos / totalRevenue * 100) : 0;
                return (
                  <div key={r.plan} className="py-1.5 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-white truncate max-w-[55%]" title={r.plan}>{r.plan}</span>
                      <span className="text-xs font-bold text-white">{usd(r.ingresos)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#D4007A" }} />
                      </div>
                      <span className="text-[10px] w-16 text-right" style={{ color: "#636366" }}>
                        {r.pagos} pagos · {usd(r.ticketPromedio)} avg
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      )}

      {/* Feature usage + Top payers */}
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonBlock /><SkeletonBlock />
        </div>
      ) : data && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Feature usage */}
          <Section title="Uso de funciones">
            {data.featureUsage.map((f) => (
              <FeatureBar key={f.label} label={f.label} count={f.count} max={maxFeature} />
            ))}
          </Section>

          {/* Top payers */}
          <Section title="Top 10 pagadores">
            <div className="space-y-1">
              {data.topPayers.map((p, i) => (
                <div key={p.userId} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <span className="text-xs w-5 text-center font-bold" style={{ color: "#636366" }}>#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">
                      {p.username ? `@${p.username}` : p.userId}
                    </div>
                    <div className="text-[10px]" style={{ color: "#636366" }}>{p.pagos} pago{p.pagos !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-sm font-bold" style={{ color: "#30D158" }}>{usd(p.totalGastado)}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* Timestamp */}
      {data && (
        <p className="text-[11px] text-center" style={{ color: "#636366" }}>
          Datos al {new Date(data.asOf).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </div>
  );
}
