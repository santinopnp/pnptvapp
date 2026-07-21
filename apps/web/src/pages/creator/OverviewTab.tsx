import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CreatorDashboard as DashboardData } from "@/lib/api";
import type { CreatorStrings } from "@/lib/i18n/creator";
import { TIER_UPGRADE_THRESHOLDS, TIER_CONFIG, type TierId } from "@/components/profile/CreatorEnrollmentWizard";

const TIERS: { key: "ice" | "crystal" | "diamond"; label: string; price: number; emoji: string }[] = [
  { key: "ice", label: "Ice", price: 5, emoji: "❄" },
  { key: "crystal", label: "Crystal", price: 10, emoji: "🔮" },
  { key: "diamond", label: "Diamond", price: 15, emoji: "💎" },
];

interface OverviewTabProps {
  dashboard: DashboardData & { success: boolean };
  user: { displayName?: string; username?: string } | null;
  withdrawable: number;
  t: CreatorStrings;
  onTabChange: (tab: string) => void;
}


export function OverviewTab({ dashboard, user, withdrawable, t, onTabChange }: OverviewTabProps) {
  const navigate = useNavigate();
  const tierInfo = TIERS.find((tier) => tier.key === dashboard.creatorType);
  const [studioWizardDone] = useState(() => {
    try { return localStorage.getItem("pnptv_studio_wizard_v1") === "done"; } catch { return false; }
  });

  return (
    <>
      {!studioWizardDone && (
        <button
          onClick={() => navigate("/creators/setup")}
          className="glass-card-sm w-full p-4 mb-4 flex items-center justify-between gap-3 text-left"
          style={{ border: "1px solid rgba(212,0,122,.35)" }}
        >
          <div>
            <p className="text-sm font-semibold text-white">Get set up to sell</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              OBS, contenido, canales, hangout y documentos — 6 pasos.
            </p>
          </div>
          <span className="text-sm font-bold flex-shrink-0" style={{ color: "#FF4DA6" }}>→</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="glass-card-sm p-4 text-center">
          <p className="text-2xl font-bold text-white">{(dashboard.subscriberCount ?? 0)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.statSubscribers}</p>
        </div>
        <div className="glass-card-sm p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: "#5ED1C4" }}>${(dashboard.monthlyEarnings ?? 0).toFixed(2)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.statThisMonth}</p>
        </div>
        <div className="glass-card-sm p-4 text-center">
          <p className="text-2xl font-bold text-white">${(dashboard.totalEarnings ?? 0).toFixed(2)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.statTotalEarnings}</p>
        </div>
        <div className="glass-card-sm p-4 text-center">
          <p className="text-2xl font-bold text-white">{(dashboard.exclusivePostCount ?? 0)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.statExclusivePosts}</p>
        </div>
      </div>

      {/* Tier badge + subscriber upgrade progress */}
      {(() => {
        const tierId = (dashboard.creatorType as TierId | "full_time" | null | undefined);
        const isStructuredTier = tierId === "ice" || tierId === "crystal" || tierId === "diamond";
        const tierCfg = isStructuredTier ? TIER_CONFIG[tierId as TierId] : null;
        const upgradeInfo = isStructuredTier ? TIER_UPGRADE_THRESHOLDS[tierId as TierId] : null;
        const nextTierCfg = upgradeInfo?.nextTier ? TIER_CONFIG[upgradeInfo.nextTier] : null;
        const threshold = upgradeInfo?.subscribersNeeded ?? null;
        const subCount = dashboard.subscriberCount ?? 0;
        const pct = threshold ? Math.min((subCount / threshold) * 100, 100) : null;

        return (
          <div className="glass-card-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white">
                  {dashboard.creatorType === "full_time" ? t.creatorTypeFullTime
                    : dashboard.creatorType === "diamond" ? `💎 ${t.creatorTypeDiamond}`
                    : dashboard.creatorType === "crystal" ? `🔮 ${t.creatorTypeCrystal}`
                    : dashboard.creatorType === "ice" ? `❄ ${t.creatorTypeIce}`
                    : t.creatorTypeDefault}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  ${(dashboard.priceUsd ?? 0).toFixed(2)}/month &middot; {t.revenueSplit}
                </p>
              </div>
              {dashboard.verified && (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#5ED1C4" aria-label="Verified">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>

            {/* Next-tier upgrade progress */}
            {isStructuredTier && threshold && pct !== null && nextTierCfg && (
              <div className="mt-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {subCount >= threshold
                      ? `Auto-upgrade to ${nextTierCfg.name} ready`
                      : `${threshold - subCount} more subscriber${threshold - subCount !== 1 ? "s" : ""} to ${nextTierCfg.name}`}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: subCount >= threshold ? "#5ED1C4" : "#fff" }}>
                    {subCount}/{threshold}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: subCount >= threshold
                        ? "#5ED1C4"
                        : (tierCfg?.gradient ?? "linear-gradient(to right, #D4007A, #E69138)"),
                    }}
                  />
                </div>
              </div>
            )}
            {isStructuredTier && !threshold && tierId === "diamond" && (
              <p className="text-[11px] mt-1" style={{ color: "#5ED1C4" }}>Top tier — you have reached Diamond</p>
            )}
          </div>
        );
      })()}

      {/* Withdrawable amount card */}
      {withdrawable > 0 && (
        <div className="glass-card-sm p-4 mb-4" style={{ borderColor: "rgba(94,209,196,0.3)" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.availableToWithdraw}</p>
              <p className="text-xl font-bold" style={{ color: "#5ED1C4" }}>${withdrawable.toFixed(2)}</p>
            </div>
            <button
              onClick={() => onTabChange("payouts")}
              className="text-xs font-semibold px-4 py-2 rounded-lg"
              style={{ background: "rgba(94,209,196,0.15)", color: "#5ED1C4", border: "1px solid rgba(94,209,196,0.3)" }}
            >
              {t.withdrawBtn}
            </button>
          </div>
        </div>
      )}

      {/* Revenue streams */}
      <div className="glass-card-sm mb-4 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Tus fuentes de ingreso</p>
        <div className="space-y-2">
          <div
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            onClick={() => navigate("/creators/live")}
          >
            <span className="text-xl flex-shrink-0">📡</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">PNP Live</p>
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                1 token/min por viewer activo · Tips en vivo · Llamadas privadas
              </p>
            </div>
            <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#D4007A" }}>→</span>
          </div>
          <div
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            onClick={() => navigate("/creators/subscribers")}
          >
            <span className="text-xl flex-shrink-0">💳</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">Membresías · Contenido exclusivo</p>
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                ${(dashboard.priceUsd ?? 0).toFixed(2)}/mes · {dashboard.exclusivePostCount ?? 0} post{(dashboard.exclusivePostCount ?? 0) !== 1 ? "s" : ""} exclusivo{(dashboard.exclusivePostCount ?? 0) !== 1 ? "s" : ""} · Canal + hangout
              </p>
            </div>
            <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#D4007A" }}>→</span>
          </div>
        </div>
      </div>

    </>
  );
}
