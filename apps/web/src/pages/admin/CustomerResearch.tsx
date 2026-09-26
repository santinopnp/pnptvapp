import React, { useState, useEffect, useCallback } from "react";
import { getCustomerResearch, type CustomerResearch } from "@/lib/api";

function fmt(n: number) { return n.toLocaleString("en-US"); }
function usd(n: number) { return `$${n.toFixed(2)}`; }

const PROFILE_COLORS: Record<string, string> = {
  explorador: "#636366",
  prime:      "#D4007A",
  whale:      "#30D158",
  creator:    "#E69138",
  inactive:   "#3A3A3C",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: "var(--pnp-surface,#1C1C1E)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#8E8E93" }}>{title}</h2>
      {children}
    </div>
  );
}

function SkeletonBlock({ h = "h-48" }: { h?: string }) {
  return <div className={`rounded-xl ${h} animate-pulse`} style={{ background: "var(--pnp-surface,#1C1C1E)" }} />;
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

  const totalRevenue = data ? data.revenueByPlan.reduce((s, r) => s + r.ingresos, 0) : 0;

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pnp-textPrimary">Investigación de clientes</h1>
          <p className="text-sm mt-1" style={{ color: "#8E8E93" }}>
            Quiénes son, qué usan y qué generan — siempre datos en vivo.
          </p>
        </div>
        {!loading && (
          <button onClick={load} className="text-xs border rounded-lg px-3 py-1.5 hover:text-white transition-colors"
            style={{ color: "#8E8E93", borderColor: "rgba(255,255,255,0.1)" }}>
            Actualizar
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm text-red-400" style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.2)" }}>
          {error}
        </div>
      )}

      {/* Top KPIs */}
      {loading ? <SkeletonBlock h="h-20" /> : data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Usuarios totales", value: fmt(data.population.totalUsers) },
            { label: "Con suscripción activa", value: fmt(data.population.everPaidUsers) },
            { label: "Activos (30 d)", value: fmt(data.population.active30d) },
            { label: "Creadores / performers", value: fmt(data.population.creatorsActive) },
          ].map(k => (
            <div key={k.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-lg font-bold text-white">{k.value}</div>
              <div className="text-xs font-medium mt-0.5" style={{ color: "#D4007A" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 5 Named profiles */}
      {loading ? <SkeletonBlock h="h-40" /> : data && (
        <Section title="Cinco perfiles de cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.profiles.map(p => {
              const color = PROFILE_COLORS[p.key] || "#636366";
              return (
                <div key={p.key} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", borderLeft: `3px solid ${color}`, border: `1px solid rgba(255,255,255,0.07)`, borderLeftColor: color }}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-bold text-white">{p.label}</span>
                    {p.signal && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: `${color}22`, color }}>
                        {p.signal}
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold mb-2" style={{ color }}>{fmt(p.count)}</div>
                  <p className="text-xs leading-relaxed" style={{ color: "#8E8E93" }}>{p.desc}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Revenue + Feature usage */}
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4"><SkeletonBlock /><SkeletonBlock /></div>
      ) : data && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Revenue by plan */}
          <Section title={`Ingresos por plan — ${usd(totalRevenue)} total`}>
            <div className="space-y-2">
              {data.revenueByPlan.filter(r => r.plan !== 'Sin plan').slice(0, 8).map(r => {
                const pct = totalRevenue > 0 ? Math.round(r.ingresos / totalRevenue * 100) : 0;
                return (
                  <div key={r.plan} className="py-1.5 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-white truncate max-w-[60%]" title={r.plan}>{r.plan}</span>
                      <span className="text-xs font-bold text-white">{usd(r.ingresos)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#D4007A" }} />
                      </div>
                      <span className="text-[10px] w-20 text-right" style={{ color: "#636366" }}>
                        {r.pagos} pagos · {usd(r.ticketPromedio)} avg
                      </span>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] pt-1" style={{ color: "#636366" }}>
                {data.revenueByPlan.find(r => r.plan === 'Sin plan')
                  ? `+ ${usd(data.revenueByPlan.find(r => r.plan === 'Sin plan')!.ingresos)} en compras de Ru$h 💎 (sin plan etiquetado)`
                  : null}
              </p>
            </div>
          </Section>

          {/* Feature usage */}
          <Section title="Uso real por función">
            <div className="space-y-1">
              {[...data.featureUsage].sort((a, b) => b.count - a.count).map((f, i) => (
                <div key={f.label} className="flex justify-between items-center py-2 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <span className="text-sm" style={{ color: f.count === 0 ? "#636366" : "white" }}>{f.label}</span>
                  <span className={`text-sm font-bold ${f.count === 0 ? "" : "text-white"}`}
                    style={{ color: i === 0 ? "#D4007A" : f.count === 0 ? "#636366" : undefined }}>
                    {fmt(f.count)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] mt-3" style={{ color: "#636366" }}>
              PNP Live tickets y PNP Channels: sin tracción aún.
            </p>
          </Section>
        </div>
      )}

      {/* Top payers */}
      {loading ? <SkeletonBlock h="h-48" /> : data && (
        <Section title="Top 10 pagadores">
          <div className="space-y-1">
            {data.topPayers.map((p, i) => (
              <div key={p.userId} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <span className="text-xs w-5 text-center font-bold" style={{ color: "#636366" }}>#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">
                    {p.username ? `@${p.username}` : p.userId}
                  </div>
                  <div className="text-[10px]" style={{ color: "#636366" }}>{p.pagos} pago{p.pagos !== 1 ? "s" : ""}</div>
                </div>
                <div className="text-sm font-bold" style={{ color: "#30D158" }}>{usd(p.totalGastado)}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data && (
        <p className="text-[11px] text-center" style={{ color: "#636366" }}>
          Datos al {new Date(data.asOf).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </div>
  );
}
