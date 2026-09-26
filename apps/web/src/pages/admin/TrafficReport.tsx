import React, { useState, useEffect, useCallback } from "react";
import { getTrafficReport, type TrafficReport } from "@/lib/api";

function fmt(n: number) { return n.toLocaleString("en-US"); }
function usd(n: number) { return `$${n.toFixed(2)}`; }

function fmtHour(h: number) {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function StatPill({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs font-medium mt-0.5" style={{ color: color ?? "#D4007A" }}>{label}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "#636366" }}>{sub}</div>}
    </div>
  );
}

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

function LineChart({ data, color = "#D4007A" }: { data: { hour: number; cnt: number }[]; color?: string }) {
  const full: { hour: number; cnt: number }[] = Array.from({ length: 24 }, (_, i) => {
    const found = data.find(d => d.hour === i);
    return { hour: i, cnt: found?.cnt ?? 0 };
  });
  const max = Math.max(...full.map(d => d.cnt), 1);
  const W = 600, H = 100, PAD = 4;
  const pts = full.map((d, i) => {
    const x = PAD + (i / (full.length - 1)) * (W - PAD * 2);
    const y = H - PAD - (d.cnt / max) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const first = pts.split(" ")[0];
  const last = pts.split(" ").slice(-1)[0];
  const area = `M ${first} L ${pts} L ${last.split(",")[0]},${H} L ${PAD},${H} Z`;
  const gradId = `lg-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 110 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function Sparkline({ vals, color = "#D4007A" }: { vals: number[]; color?: string }) {
  if (!vals.length) return <div className="h-12 text-xs" style={{ color: "#636366" }}>Sin datos</div>;
  const max = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {vals.map((v, i) => (
        <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max((v / max) * 100, 2)}%`, background: color, opacity: 0.8 }} />
      ))}
    </div>
  );
}

const HEATMAP_COLORS: Record<string, string> = {
  Básica:     "rgba(99,99,102,0.2)",
  Media:      "rgba(0,133,255,0.15)",
  Reforzada:  "rgba(212,0,122,0.18)",
  Máxima:     "rgba(212,0,122,0.38)",
};
const HEATMAP_TEXT: Record<string, string> = {
  Básica: "#636366", Media: "#0085FF", Reforzada: "#D4007A", Máxima: "#ff5cad",
};
const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DOW_ORDER  = [1, 2, 3, 4, 5, 6, 0];
const FRANJA_ORDER = ["madrugada", "manana", "tarde", "noche"];
const FRANJA_LABELS: Record<string, string> = {
  madrugada: "Madrugada 12–6a", manana: "Mañana 6a–12p",
  tarde: "Tarde 12–6p", noche: "Noche 6p–12a",
};

function heatLevel(cnt: number, sorted: number[]) {
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q2 = sorted[Math.floor(sorted.length * 0.50)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  if (cnt <= q1) return "Básica";
  if (cnt <= q2) return "Media";
  if (cnt <= q3) return "Reforzada";
  return "Máxima";
}

const TIER_COLORS: Record<string, string> = { PRIME: "#D4007A", member: "#30D158", free: "#636366" };
const COUNTRY_PALETTE = ["#D4007A","#0085FF","#30D158","#E69138","#FF453A","#bf5af2","#64d2ff","#ffd60a"];

export default function TrafficReportPage() {
  const [data, setData] = useState<TrafficReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<"all" | "tier" | "country">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTrafficReport();
      setData(res.report);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const primeTrial = data?.primeComposition.find(p => p.type === "trial")?.cnt ?? 0;
  const primeTotal = data?.primeComposition.reduce((s, p) => s + p.cnt, 0) ?? 1;
  const convRate = data ? (data.checkoutFunnel.completed / Math.max(data.checkoutFunnel.initiated, 1) * 100) : 0;

  const sortedHeatCnts = data
    ? [...data.weeklyHeatmap].map(r => r.cnt).sort((a, b) => a - b)
    : [];

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pnp-textPrimary">Reporte de tráfico</h1>
          <p className="text-sm mt-1" style={{ color: "#8E8E93" }}>
            Horas pico · {data ? `${data.windowDays} días · ${fmt(data.totalAccesses)} accesos totales` : "cargando…"}
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

      {/* Trial alert */}
      {!loading && data && data.trialAlert.count > 0 && (
        <div className="rounded-xl p-4" style={{ background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.3)" }}>
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <div className="font-bold text-white">
                {fmt(data.trialAlert.count)} cuentas trial vencen en los próximos 7 días
              </div>
              <p className="text-sm mt-1" style={{ color: "#8E8E93" }}>
                {Math.round(primeTrial / primeTotal * 100)}% del tier PRIME es prueba gratuita —
                solo {data.primeComposition.find(p => p.type === "one_time")?.cnt ?? 0} son clientes reales de pago.
                El 74% del cohorte tiene Telegram vinculado. Enviar mensaje de reconquista ahora es la palanca más rápida.
              </p>
              {data.trialAlert.earliest && (
                <p className="text-xs mt-1" style={{ color: "#FF453A" }}>
                  Primera expiración: {new Date(data.trialAlert.earliest).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} Bogotá
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      {loading ? <SkeletonBlock h="h-20" /> : data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatPill label="Accesos totales (14 d)" value={fmt(data.totalAccesses)} />
          <StatPill label="Hora pico" value={`${fmtHour(data.peakHour)}`}
            sub={`${fmt(data.hourly.find(h => h.hour === data.peakHour)?.cnt ?? 0)} accesos`} />
          <StatPill label="Promedio / día" value={fmt(Math.round(data.totalAccesses / data.windowDays))} />
          <StatPill label="Checkouts iniciados" value={fmt(data.checkoutFunnel.initiated)} sub="últimos 30 d" />
          <StatPill label="Tasa conversión" value={`${convRate.toFixed(1)}%`}
            sub={`${data.checkoutFunnel.completed} completados`}
            color={convRate >= 1 ? "#30D158" : "#FF453A"} />
        </div>
      )}

      {/* Hourly chart */}
      {loading ? <SkeletonBlock h="h-40" /> : data && (
        <Section title="Tráfico por hora del día (hora Bogotá)">
          <div className="flex gap-2 mb-4">
            {(["all", "tier", "country"] as const).map(v => (
              <button key={v} onClick={() => setActiveChart(v)}
                className="text-xs px-3 py-1 rounded-full transition-colors"
                style={{
                  background: activeChart === v ? "#D4007A" : "rgba(255,255,255,0.06)",
                  color: activeChart === v ? "white" : "#8E8E93",
                }}>
                {v === "all" ? "Total" : v === "tier" ? "Por tier" : "Por país"}
              </button>
            ))}
          </div>

          {activeChart === "all" && <LineChart data={data.hourly} />}

          {activeChart === "tier" && (
            <div className="space-y-4">
              {data.byTier.map((t, i) => (
                <div key={t.tier}>
                  <div className="text-xs mb-1 font-medium" style={{ color: TIER_COLORS[t.tier] ?? "#fff" }}>{t.tier}</div>
                  <LineChart data={t.hourly} color={TIER_COLORS[t.tier] ?? COUNTRY_PALETTE[i]} />
                </div>
              ))}
            </div>
          )}

          {activeChart === "country" && (
            <div className="space-y-4">
              {data.byCountry.map((c, i) => (
                <div key={c.country}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium" style={{ color: COUNTRY_PALETTE[i] }}>{c.country}</span>
                    <span style={{ color: "#636366" }}>{fmt(c.total)} accesos</span>
                  </div>
                  <LineChart data={c.hourly} color={COUNTRY_PALETTE[i]} />
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between mt-2 text-[10px]" style={{ color: "#636366" }}>
            {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
              <span key={h}>{fmtHour(h)}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Functionality + PRIME composition */}
      {loading ? (
        <div className="grid md:grid-cols-2 gap-4"><SkeletonBlock /><SkeletonBlock /></div>
      ) : data && (
        <div className="grid md:grid-cols-2 gap-4">
          <Section title="Por funcionalidad">
            {(() => {
              const maxCnt = Math.max(...data.functionality.map(f => f.cnt), 1);
              return data.functionality.map(f => (
                <div key={f.func} className="py-2 border-b last:border-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-white">{f.func}</span>
                    <span className="text-sm font-bold text-white">{fmt(f.cnt)}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(f.cnt / maxCnt) * 100}%`, background: "linear-gradient(90deg,#D4007A,#E69138)" }} />
                  </div>
                </div>
              ));
            })()}
          </Section>

          <Section title="Composición del tier PRIME">
            <div className="space-y-3">
              {data.primeComposition.map(p => {
                const pct = Math.round(p.cnt / primeTotal * 100);
                const color = p.type === "trial" ? "#FF453A" : "#30D158";
                const label = p.type === "trial" ? "Prueba gratuita (3 días)" : p.type === "one_time" ? "Plan de pago real" : p.type;
                return (
                  <div key={p.type}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-white">{label}</span>
                      <span className="text-sm font-bold" style={{ color }}>{fmt(p.cnt)} <span style={{ color: "#636366" }}>({pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs mt-4" style={{ color: "#8E8E93" }}>
              Solo {data.primeComposition.find(p => p.type === "one_time")?.cnt ?? 0} usuarios son clientes reales de pago.
            </p>
          </Section>
        </div>
      )}

      {/* Funnel */}
      {loading ? <SkeletonBlock h="h-28" /> : data && (
        <Section title="Funnel de checkout — últimos 30 días">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-white">{fmt(data.checkoutFunnel.initiated)}</div>
              <div className="text-xs mt-1" style={{ color: "#8E8E93" }}>Checkouts iniciados</div>
            </div>
            <div>
              <div className="text-3xl font-bold" style={{ color: "#30D158" }}>{fmt(data.checkoutFunnel.completed)}</div>
              <div className="text-xs mt-1" style={{ color: "#8E8E93" }}>Completados</div>
            </div>
            <div>
              <div className="text-3xl font-bold" style={{ color: convRate >= 1 ? "#30D158" : "#FF453A" }}>
                {convRate.toFixed(2)}%
              </div>
              <div className="text-xs mt-1" style={{ color: "#8E8E93" }}>Tasa de conversión</div>
            </div>
          </div>
          {convRate < 1 && (
            <p className="text-xs mt-4 text-center" style={{ color: "#FF453A" }}>
              El cuello de botella no es atraer gente — es lo que pasa después de que alguien llega.
            </p>
          )}
        </Section>
      )}

      {/* Trends */}
      {loading ? <SkeletonBlock h="h-32" /> : data && (
        <div className="grid md:grid-cols-2 gap-4">
          <Section title="Registros nuevos por día (30 d)">
            <Sparkline vals={data.dailyRegistrations.map(d => d.cnt)} color="#D4007A" />
            <div className="flex justify-between mt-1 text-[10px]" style={{ color: "#636366" }}>
              {data.dailyRegistrations[0] && <span>{data.dailyRegistrations[0].day.slice(5)}</span>}
              {data.dailyRegistrations.at(-1) && <span>{data.dailyRegistrations.at(-1)!.day.slice(5)}</span>}
            </div>
          </Section>
          <Section title="Ingresos completados por día (30 d)">
            <Sparkline vals={data.dailyRevenue.map(d => d.total)} color="#30D158" />
            <div className="flex justify-between mt-1 text-[10px]" style={{ color: "#636366" }}>
              {data.dailyRevenue[0] && <span>{data.dailyRevenue[0].day.slice(5)}</span>}
              {data.dailyRevenue.at(-1) && <span>{data.dailyRevenue.at(-1)!.day.slice(5)}</span>}
            </div>
          </Section>
        </div>
      )}

      {/* Weekly heatmap */}
      {loading ? <SkeletonBlock h="h-64" /> : data && data.weeklyHeatmap.length > 0 && (
        <Section title="Mapa semanal de cobertura (días × franja, hora Bogotá)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left pb-2 pr-3 font-normal" style={{ color: "#636366" }}>Día</th>
                  {FRANJA_ORDER.map(f => (
                    <th key={f} className="pb-2 px-2 font-normal text-center" style={{ color: "#636366" }}>
                      {FRANJA_LABELS[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOW_ORDER.map(dow => (
                  <tr key={dow}>
                    <td className="pr-3 py-1 font-medium text-white">{DOW_LABELS[dow]}</td>
                    {FRANJA_ORDER.map(franja => {
                      const cell = data.weeklyHeatmap.find(r => r.dow === dow && r.franja === franja);
                      const cnt = cell?.cnt ?? 0;
                      const level = heatLevel(cnt, sortedHeatCnts);
                      return (
                        <td key={franja} className="py-1 px-2 text-center rounded"
                          style={{ background: HEATMAP_COLORS[level] }}>
                          <div className="font-semibold" style={{ color: HEATMAP_TEXT[level] }}>{level}</div>
                          <div style={{ color: "#636366" }}>{fmt(cnt)}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 mt-3 flex-wrap">
            {Object.entries(HEATMAP_COLORS).map(([level, bg]) => (
              <div key={level} className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-3 rounded-sm" style={{ background: bg, border: "1px solid rgba(255,255,255,0.1)" }} />
                <span style={{ color: HEATMAP_TEXT[level] }}>{level}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data && (
        <p className="text-[11px] text-center" style={{ color: "#636366" }}>
          Datos al {new Date(data.asOf).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
          {" · "}Fuente: user_access_logs · zona horaria America/Bogotá
        </p>
      )}
    </div>
  );
}
