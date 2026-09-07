import { useState, useEffect, useCallback } from "react";
import {
  getAdminMonetizationSummary,
  type AdminMonetizationSlot,
  type AdminMonetizationCohortRow,
  type AdminMonetizationVariantRow,
  type AdminMonetizationHourlyRow,
} from "@/lib/api";

const RANGES = [
  { label: "24h",  hours: 24 },
  { label: "7d",   hours: 24 * 7 },
  { label: "30d",  hours: 24 * 30 },
];

function StatPill({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs font-medium mt-0.5" style={{ color: "#D4007A" }}>{label}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "#636366" }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: "var(--pnp-surface, #1C1C1E)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function pct(a: number, b: number) { return b > 0 ? ((a / b) * 100).toFixed(2) + "%" : "0.00%"; }

export default function AdminMonetization() {
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<AdminMonetizationSlot[]>([]);
  const [newPrimeSubs, setNewPrimeSubs] = useState(0);
  const [uniqueUsers, setUniqueUsers] = useState(0);
  const [cohort, setCohort] = useState<AdminMonetizationCohortRow[]>([]);
  const [variants, setVariants] = useState<AdminMonetizationVariantRow[]>([]);
  const [hourly, setHourly] = useState<AdminMonetizationHourlyRow[]>([]);

  const load = useCallback((h: number) => {
    setLoading(true);
    setError(null);
    getAdminMonetizationSummary(h)
      .then((r) => {
        setSlots(r.summary.slots || []);
        setNewPrimeSubs(r.summary.newPrimeSubs || 0);
        setUniqueUsers(r.summary.uniqueUsersServedAds || 0);
        setCohort(r.cohort || []);
        setVariants(r.variants || []);
        setHourly(r.hourly || []);
      })
      .catch((err) => setError(err?.message || "load failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(hours); }, [hours, load]);

  const totals = slots.reduce(
    (acc, s) => ({
      imp: acc.imp + Number(s.impressions || 0),
      clk: acc.clk + Number(s.clicks || 0),
      upgShown: acc.upgShown + Number(s.upgrade_shown || 0),
      upgClick: acc.upgClick + Number(s.upgrade_click || 0),
    }),
    { imp: 0, clk: 0, upgShown: 0, upgClick: 0 },
  );
  const cohortAvgImp = cohort.length > 0
    ? Math.round(cohort.reduce((s, r) => s + Number(r.impressions_prior_30d || 0), 0) / cohort.length)
    : 0;

  return (
    <div className="min-h-dvh px-4 pt-4 pb-16 max-w-6xl mx-auto space-y-4" style={{ background: "var(--pnp-background, #0A0A0B)", color: "#fff" }}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Monetización</h1>
        <div className="flex gap-1 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.hours}
              type="button"
              onClick={() => setHours(r.hours)}
              className="px-3 py-1.5 rounded-lg font-semibold transition-colors"
              style={{
                background: hours === r.hours ? "#D4007A" : "rgba(255,255,255,0.06)",
                color: hours === r.hours ? "#fff" : "#8E8E93",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(255,69,58,0.10)", border: "1px solid rgba(255,69,58,0.3)", color: "#FF6B6B" }}>
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatPill label="Impresiones" value={totals.imp.toLocaleString()} sub={loading ? "loading..." : ""} />
        <StatPill label="Clicks" value={totals.clk.toLocaleString()} sub={`CTR ${pct(totals.clk, totals.imp)}`} />
        <StatPill label="Users con ads" value={uniqueUsers.toLocaleString()} />
        <StatPill label="Nuevos PRIME" value={newPrimeSubs.toLocaleString()} sub={`avg ${cohortAvgImp} imp antes`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatPill label="Upgrade CTA shown" value={totals.upgShown.toLocaleString()} />
        <StatPill label="Upgrade CTA click" value={totals.upgClick.toLocaleString()} sub={`CTR ${pct(totals.upgClick, totals.upgShown)}`} />
      </div>

      {hourly.length > 0 && (
        <Section title={`Impresiones por hora — últimas ${hours}h`}>
          <div className="flex items-end gap-0.5 h-24">
            {hourly.map((h, i) => {
              const max = Math.max(...hourly.map((x) => Number(x.impressions) || 0), 1);
              const heightPct = Math.max((Number(h.impressions) / max) * 100, 2);
              return (
                <div key={i} className="group relative flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className="w-full rounded-t transition-colors"
                    style={{ height: `${heightPct}%`, background: "rgba(212,0,122,0.7)" }}
                  />
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black/90 border border-white/10 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap z-10 pointer-events-none">
                    {new Date(h.bucket).toISOString().slice(5, 13).replace('T', ' ')}: {Number(h.impressions).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {variants.length > 0 && (
        <Section title={`A/B variants — últimas ${hours}h`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  <th className="text-left py-2 pr-3">Variant</th>
                  <th className="text-right py-2 px-2">Users</th>
                  <th className="text-right py-2 px-2">Imp</th>
                  <th className="text-right py-2 px-2">Clk</th>
                  <th className="text-right py-2 px-2">CTR</th>
                  <th className="text-right py-2 px-2">Upg shown</th>
                  <th className="text-right py-2 px-2">Upg click</th>
                  <th className="text-right py-2 pl-2">Upg CTR</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.variant} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <td className="py-2 pr-3 font-mono text-xs">
                      <span
                        className="px-2 py-0.5 rounded-full text-white font-bold"
                        style={{
                          background: v.variant === 'A' ? '#D4007A'
                            : v.variant === 'B' ? '#E69138'
                            : v.variant === 'control' ? '#636366' : '#3A3A3C',
                        }}
                      >{v.variant}</span>
                    </td>
                    <td className="text-right py-2 px-2">{Number(v.unique_users).toLocaleString()}</td>
                    <td className="text-right py-2 px-2">{Number(v.impressions).toLocaleString()}</td>
                    <td className="text-right py-2 px-2">{Number(v.clicks).toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-white/60 text-xs">{pct(Number(v.clicks), Number(v.impressions))}</td>
                    <td className="text-right py-2 px-2">{Number(v.upgrade_shown).toLocaleString()}</td>
                    <td className="text-right py-2 px-2">{Number(v.upgrade_click).toLocaleString()}</td>
                    <td className="text-right py-2 pl-2 text-white/60 text-xs">{pct(Number(v.upgrade_click), Number(v.upgrade_shown))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title={`Slots — últimas ${hours}h`}>
        {slots.length === 0 ? (
          <div className="text-sm text-white/40 py-4 text-center">Sin datos en el rango seleccionado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  <th className="text-left py-2 pr-3">Slot</th>
                  <th className="text-right py-2 px-2">Imp</th>
                  <th className="text-right py-2 px-2">Clk</th>
                  <th className="text-right py-2 px-2">CTR</th>
                  <th className="text-right py-2 px-2">Upg shown</th>
                  <th className="text-right py-2 px-2">Upg click</th>
                  <th className="text-right py-2 px-2">Upg CTR</th>
                  <th className="text-right py-2 pl-2">Dismiss</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.slot_id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <td className="py-2 pr-3 font-mono text-xs text-white/90">{s.slot_id}</td>
                    <td className="text-right py-2 px-2">{Number(s.impressions).toLocaleString()}</td>
                    <td className="text-right py-2 px-2">{Number(s.clicks).toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-white/60 text-xs">{pct(Number(s.clicks), Number(s.impressions))}</td>
                    <td className="text-right py-2 px-2">{Number(s.upgrade_shown).toLocaleString()}</td>
                    <td className="text-right py-2 px-2">{Number(s.upgrade_click).toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-white/60 text-xs">{pct(Number(s.upgrade_click), Number(s.upgrade_shown))}</td>
                    <td className="text-right py-2 pl-2 text-white/40">{Number(s.dismiss).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Cohort — nuevos PRIME en las últimas ${hours}h`}>
        {cohort.length === 0 ? (
          <div className="text-sm text-white/40 py-4 text-center">Sin conversiones en el rango.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  <th className="text-left py-2 pr-3">User</th>
                  <th className="text-left py-2 px-2">Upgraded at</th>
                  <th className="text-right py-2 px-2">Imp 30d prior</th>
                  <th className="text-right py-2 pl-2">CTAs clicked</th>
                </tr>
              </thead>
              <tbody>
                {cohort.slice(0, 50).map((r) => (
                  <tr key={r.user_id + r.upgraded_at} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <td className="py-2 pr-3 font-mono text-xs text-white/80 truncate max-w-[220px]">{r.user_id}</td>
                    <td className="py-2 px-2 text-white/60 text-xs">{new Date(r.upgraded_at).toISOString().slice(0, 19).replace('T', ' ')}</td>
                    <td className="text-right py-2 px-2">{Number(r.impressions_prior_30d).toLocaleString()}</td>
                    <td className="text-right py-2 pl-2">{Number(r.upgrade_ctas_clicked).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cohort.length > 50 && <p className="text-xs text-white/40 mt-2 text-center">Mostrando primeras 50 de {cohort.length}</p>}
          </div>
        )}
      </Section>
    </div>
  );
}
