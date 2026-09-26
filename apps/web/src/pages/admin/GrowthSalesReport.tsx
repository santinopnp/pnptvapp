import React, { useState, useEffect, useCallback } from "react";
import { StatCard } from "@/components/admin/StatCard";
import { useI18n } from "@/lib/i18n";
import {
  fetchAdminGrowthSalesReport,
  type GrowthSalesReportData,
  type HourlyBucket,
} from "@/lib/api";

const REFRESH_INTERVAL_MS = 5 * 60_000; // periodic auto-refresh every 5 minutes

const AlertIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

function fmtHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

function fmtDateTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
    timeZoneName: "short",
  });
}

function HourlyBarChart({
  data,
  colorClass = "bg-pnp-accent/60 hover:bg-pnp-accent",
  formatTooltip,
}: {
  data: HourlyBucket[];
  colorClass?: string;
  formatTooltip?: (b: HourlyBucket) => string;
}) {
  const byHour = new Map(data.map((d) => [d.hour, d.n]));
  const series: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    n: byHour.get(h) || 0,
  }));
  const max = Math.max(...series.map((d) => d.n), 1);

  return (
    <div className="flex items-end gap-0.5 h-32">
      {series.map((d) => {
        const pct = Math.max((d.n / max) * 100, d.n > 0 ? 3 : 0);
        return (
          <div
            key={d.hour}
            className={`flex-1 rounded-sm transition-colors cursor-default group relative ${colorClass}`}
            style={{ height: `${pct}%` }}
          >
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black/80 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
              {formatTooltip ? formatTooltip(d) : `${fmtHour(d.hour)}: ${d.n.toLocaleString()}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GrowthSalesReport() {
  const i18n = useI18n();
  const t = i18n.admin.growthSalesReport;
  const locale = i18n.lang === "es" ? "es-ES" : "en-US";

  const [data, setData] = useState<GrowthSalesReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchAdminGrowthSalesReport();
      setData(res);
      setError(null);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedToLoad);
    } finally {
      setLoading(false);
    }
  }, [t.failedToLoad]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const [selectedDim, setSelectedDim] = useState<"tier" | "country" | "feature">("tier");

  const cliff = data?.trialCliff;
  const primeComposition = data?.primeComposition ?? [];
  const primeTotal = primeComposition.reduce((s, r) => s + r.count, 0);

  const dims: Record<string, { key: string; label: string; rows: HourlyBucket[] }[]> = {
    tier: Object.entries(
      (data?.hourlyTraffic.byTier ?? []).reduce<Record<string, HourlyBucket[]>>((acc, r) => {
        (acc[r.tier] = acc[r.tier] || []).push({ hour: r.hour, n: r.n });
        return acc;
      }, {})
    ).map(([key, rows]) => ({ key, label: key, rows })),
    country: Object.entries(
      (data?.hourlyTraffic.byCountry ?? []).reduce<Record<string, HourlyBucket[]>>((acc, r) => {
        (acc[r.country] = acc[r.country] || []).push({ hour: r.hour, n: r.n });
        return acc;
      }, {})
    ).map(([key, rows]) => ({ key, label: key, rows })),
    feature: Object.entries(
      (data?.hourlyTraffic.byFeature ?? []).reduce<Record<string, HourlyBucket[]>>((acc, r) => {
        (acc[r.feature] = acc[r.feature] || []).push({ hour: r.hour, n: r.n });
        return acc;
      }, {})
    ).map(([key, rows]) => ({ key, label: key, rows })),
  };

  const dimLabels: Record<"tier" | "country" | "feature", string> = {
    tier: t.dimTier,
    country: t.dimCountry,
    feature: t.dimFeature,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-pnp-textPrimary">{t.title}</h1>
          <p className="text-xs text-pnp-textSecondary mt-0.5">
            {t.subtitle}
            {lastFetched && (
              <>
                {" "}
                {t.updatedAt.replace(
                  "{0}",
                  lastFetched.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
                )}
              </>
            )}
          </p>
        </div>
        {loading && !data && <span className="text-xs text-pnp-textSecondary">{t.loading}</span>}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Trial cliff alert */}
      {cliff && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-3 text-red-400">
            <AlertIcon />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {t.trialCliffAlert}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <StatCard label={t.trialCohort} value={cliff.cohortTotal.toLocaleString()} variant="danger" />
            <StatCard label={t.expiring7d} value={cliff.expiring7d.toLocaleString()} variant="danger" />
            <StatCard
              label={t.withCard}
              value={cliff.cohortTotal ? `${Math.round((cliff.withCard / cliff.cohortTotal) * 100)}%` : "0%"}
              subtitle={`${cliff.withCard.toLocaleString()} / ${cliff.cohortTotal.toLocaleString()}`}
              variant="warning"
            />
            <StatCard label={t.telegramReachable} value={cliff.telegramReachable.toLocaleString()} variant="default" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-pnp-textSecondary">
            <div className="flex items-center gap-1.5">
              <ClockIcon />
              <span>
                {t.peakExpiryHour}: <strong className="text-pnp-textPrimary">{fmtDateTime(cliff.peakExpiryAt, locale)}</strong>
                {" "}({cliff.peakExpiryCount.toLocaleString()} {t.accounts})
              </span>
            </div>
            <div>{t.alreadyExpired}: <strong className="text-pnp-textPrimary">{cliff.alreadyExpired.toLocaleString()}</strong></div>
            <div>{t.nudgesSent}: <strong className="text-pnp-textPrimary">{cliff.nudgesSent.toLocaleString()}</strong></div>
          </div>
        </div>
      )}

      {/* PRIME composition */}
      <div className="rounded-xl bg-pnp-surface border border-pnp-border p-4">
        <div className="text-sm font-medium text-pnp-textPrimary mb-0.5">{t.primeComposition}</div>
        <div className="text-xs text-pnp-textSecondary mb-3">{t.primeCompositionDesc}</div>
        {primeComposition.length === 0 ? (
          <div className="text-xs text-pnp-textSecondary">{t.noData}</div>
        ) : (
          <div className="space-y-2">
            {primeComposition.map((row) => {
              const pct = primeTotal ? (row.count / primeTotal) * 100 : 0;
              return (
                <div key={row.bucket} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 text-xs text-pnp-textSecondary truncate">{row.bucket}</div>
                  <div className="flex-1 h-4 rounded-sm bg-pnp-bg overflow-hidden">
                    <div
                      className="h-full bg-pnp-accent/70 rounded-sm"
                      style={{ width: `${Math.max(pct, row.count > 0 ? 1 : 0)}%` }}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-xs text-pnp-textPrimary text-right">
                    {row.count.toLocaleString()} ({pct.toFixed(1)}%)
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hourly traffic */}
      <div className="rounded-xl bg-pnp-surface border border-pnp-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium text-pnp-textPrimary">
              {t.hourlyTraffic}
            </div>
            <div className="text-xs text-pnp-textSecondary">
              {t.hourlyTrafficDesc
                .replace("{0}", String(data?.hourlyTraffic.days ?? 14))
                .replace("{1}", dimLabels[selectedDim])}
            </div>
          </div>
          <div className="flex gap-1">
            {(["tier", "country", "feature"] as const).map((dim) => (
              <button
                key={dim}
                onClick={() => setSelectedDim(dim)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedDim === dim
                    ? "bg-pnp-accent text-white"
                    : "bg-pnp-bg text-pnp-textSecondary hover:text-pnp-textPrimary"
                }`}
              >
                {dimLabels[dim]}
              </button>
            ))}
          </div>
        </div>

        {data && (
          <div className="mb-4">
            <div className="text-xs text-pnp-textSecondary mb-2">{t.overall}</div>
            <HourlyBarChart data={data.hourlyTraffic.overall} />
          </div>
        )}

        {(dims[selectedDim] ?? []).length === 0 ? (
          <div className="text-xs text-pnp-textSecondary">{t.noDataDimension}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dims[selectedDim].map(({ key, label, rows }) => (
              <div key={key}>
                <div className="text-xs text-pnp-textSecondary mb-2">{label}</div>
                <HourlyBarChart data={rows} colorClass="bg-blue-500/50 hover:bg-blue-500" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
