import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { CreatorDashboard as DashboardData } from "@/lib/api";
import { checkoutCrystalSelf } from "@/lib/api";
import type { CreatorStrings } from "@/lib/i18n/creator";
import { AppShell, RightRail, SuggestedFollowRow, ContextHintCard, useForYou } from "@/components/Layout";
import { WalletPayCard } from "@/components/payments/PayInWalletChips";
import { useI18n } from "@/lib/i18n";

// Legacy ice/crystal/diamond TIERS array removed — Crystal Creator is now a
// private invite-only add-on (crystal_creator_passes table), not a tier.

interface OverviewTabProps {
  dashboard: DashboardData & { success: boolean };
  user: { displayName?: string; username?: string } | null;
  withdrawable: number;
  t: CreatorStrings;
  onTabChange: (tab: string) => void;
}


export function OverviewTab({ dashboard, user, withdrawable, t, onTabChange }: OverviewTabProps) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const tGlobal = useI18n();
  const [promoCode, setPromoCode] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const creatorRole = (authUser as (typeof authUser & { creator_role?: string }) | null)?.creator_role ?? null;
  const isPerformer = creatorRole === "performer" || creatorRole === "both";
  const isContentCreator = creatorRole === "creator" || creatorRole === "both";

  const crystalActive = dashboard.crystalCreator === true;
  const crystalActiveUntil: string | null = dashboard.crystalActiveUntil ?? null;
  const crystalInvited = dashboard.crystalInvited === true;

  // Crystal Creator checkout state — mirrors Subscribe.tsx walletPanelPlanId pattern.
  const [crystalWalletOpen, setCrystalWalletOpen] = React.useState(false);
  const [crystalNpLoading, setCrystalNpLoading] = React.useState(false);
  const [crystalNpError, setCrystalNpError] = React.useState<string | null>(null);
  const crystalWalletPanelRef = React.useRef<HTMLDivElement>(null);

  function handleCrystalWalletToggle() {
    setCrystalNpError(null);
    setCrystalWalletOpen((prev) => !prev);
    if (!crystalWalletOpen) {
      setTimeout(() => {
        crystalWalletPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }

  async function handleCrystalNowPayments() {
    setCrystalNpError(null);
    setCrystalNpLoading(true);
    try {
      const res = await checkoutCrystalSelf("nowpayments");
      if (!res.invoiceUrl) throw new Error("No invoice URL returned");
      const w = 520;
      const h = 700;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
      window.open(res.invoiceUrl, "crystal_np_self", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);
    } catch (err) {
      setCrystalNpError(err instanceof Error ? err.message : "Could not open checkout");
    } finally {
      setCrystalNpLoading(false);
    }
  }

  // Desktop right rail — for-you recommendations scoped to the creator's own profile
  const creatorUserId = authUser?.dbId ? String(authUser.dbId) : null;
  const { data: forYou } = useForYou("home", creatorUserId);
  const studioRail = (
    <>
      {/* Context hints — upgrade prompts, prime expiry, unread DMs */}
      {(forYou?.contextHints ?? []).length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <ul>{(forYou?.contextHints ?? []).slice(0, 3).map((hint, i) => (
            <ContextHintCard key={i} hint={hint} />
          ))}</ul>
        </div>
      )}
      <RightRail
        sections={[
          {
            title: tGlobal.nav.railStudioActivity,
            items: (forYou?.suggestedFollows ?? []).slice(0, 4).map((f) => (
              <SuggestedFollowRow
                key={f.userId}
                item={f}
                followLabel={tGlobal.nav.railFollow}
                viewLabel={tGlobal.nav.railView}
              />
            )),
          },
        ]}
      />
    </>
  );

  return (
    <AppShell rightRail={studioRail} centerMaxWidth="640px">
    <>
      <button
        onClick={() => navigate("/creators/setup")}
        className="glass-card-sm w-full p-4 mb-3 flex items-center justify-between gap-3 text-left"
        style={{ border: "1px solid rgba(212,0,122,.35)" }}
      >
        <div>
          <p className="text-sm font-semibold text-white">{t.overviewGetSetupTitle}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.overviewGetSetupDesc}
          </p>
        </div>
        <span className="text-sm font-bold flex-shrink-0" style={{ color: "#FF4DA6" }}>→</span>
      </button>

      <button
        onClick={() => navigate("/creators/documentation")}
        className="glass-card-sm w-full p-4 mb-3 flex items-center justify-between gap-3 text-left"
        style={{ border: "1px solid rgba(94,209,196,.3)" }}
      >
        <div>
          <p className="text-sm font-semibold text-white">{t.overviewDocumentation}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.overviewDocumentationDesc}
          </p>
        </div>
        <span className="text-sm font-bold flex-shrink-0" style={{ color: "#5ED1C4" }}>→</span>
      </button>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => navigate("/profile")}
          className="glass-card-sm p-3 flex items-center justify-center gap-2 text-xs font-semibold text-white/85"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {t.overviewMyProfile}
        </button>
        <button
          onClick={() => user?.username && navigate(`/c/${user.username}`)}
          disabled={!user?.username}
          className="glass-card-sm p-3 flex items-center justify-center gap-2 text-xs font-semibold disabled:opacity-40"
          style={{ border: "1px solid rgba(255,180,84,0.35)", color: "#FFB454" }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t.overviewPublicPreview}
        </button>
      </div>

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

      {/* Subscription price card (always visible) */}
      <div className="glass-card-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-white">{t.creatorTypeDefault}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
              {t.overviewPricePerMonth((dashboard.priceUsd ?? 0).toFixed(2))} &middot; {t.revenueSplit}
            </p>
          </div>
          {dashboard.verified && (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#5ED1C4" aria-label={t.overviewVerifiedAria}>
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          )}
        </div>
      </div>

      {/* Crystal Creator status card — only shown when invited or active.
          Active creators see a read-only status pill.
          Invited-but-not-yet-active creators see the same two-provider
          checkout UX used on CreatorProfilePage (wallet inline panel +
          NowPayments hosted popup). */}
      {(crystalActive || crystalInvited) && (
        <div
          className="glass-card-sm mb-4"
          style={{ borderColor: crystalWalletOpen ? "rgba(52,199,89,0.35)" : "rgba(184,245,255,0.25)" }}
        >
          <div className="p-4">
            {crystalActive ? (
              <div className="flex items-center gap-2">
                <span className="creator-crystal-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide shrink-0">
                  <span aria-hidden className="text-[11px] leading-none">❖</span>
                  Crystal Creator
                </span>
                <span className="text-[10px] font-semibold" style={{ color: "#5ED1C4" }}>Active</span>
                <span className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {crystalActiveUntil === null || crystalActiveUntil === "infinity"
                    ? "— lifetime"
                    : `until ${new Date(crystalActiveUntil).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                </span>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-white mb-0.5">You've been invited to Crystal Creator</p>
                <p className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  Unlock exclusive benefits, animated badge, lower commission, and priority placement — $100/mo
                </p>
              </>
            )}
          </div>

          {/* Two-provider checkout buttons — only for invited-not-yet-active */}
          {!crystalActive && crystalInvited && (
            <>
              <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                <button
                  onClick={handleCrystalWalletToggle}
                  className={`py-2.5 rounded-lg font-bold text-sm text-white transition-all ${crystalWalletOpen ? "bg-gradient-to-r from-emerald-400 to-emerald-500 ring-2 ring-emerald-300" : "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"}`}
                >
                  💳 Upgrade $100
                </button>
                <button
                  type="button"
                  onClick={handleCrystalNowPayments}
                  disabled={crystalNpLoading}
                  className="py-2.5 rounded-lg font-bold text-sm text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-60"
                >
                  {crystalNpLoading ? "…" : "₿ Any crypto"}
                </button>
              </div>
              {crystalNpError && (
                <p className="px-4 pb-3 text-[11px]" style={{ color: "#ff6b6b" }}>{crystalNpError}</p>
              )}
              {crystalWalletOpen && (
                <div className="px-4 pb-4" ref={crystalWalletPanelRef}>
                  <WalletPayCard
                    surface="crystal_self"
                    amountUsd={100}
                    entitlementSpec={{ type: "crystal_self" }}
                    metadata={{ source: "creator_overview_tab" }}
                    label="Upgrade to Crystal Creator · $100/mo"
                    lang={tGlobal.lang === "es" ? "es" : "en"}
                    onSuccess={() => {
                      setCrystalWalletOpen(false);
                    }}
                    compact
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

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

      {/* 🎟️ Promo Code & Growth Tools */}
      <div className="glass-card-sm mb-4 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            🎟️ {tGlobal.lang === "es" ? "Códigos Promocionales y Crecimiento" : "Promo Codes & Growth Tools"}
          </p>
          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            {tGlobal.lang === "es" ? "Activo" : "Active"}
          </span>
        </div>
        <p className="text-xs text-white/80 mb-3 leading-relaxed">
          {tGlobal.lang === "es"
            ? "Crea cupones de descuento personalizados para compartir en Telegram o X/Twitter y atraer nuevos suscriptores."
            : "Create custom discount codes to share on Telegram or X/Twitter to attract new subscribers."}
        </p>

        {promoCode ? (
          <div className="p-3 rounded-xl bg-white/5 border border-emerald-500/30 flex items-center justify-between gap-2 mb-2 animate-in fade-in">
            <div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                {tGlobal.lang === "es" ? "Tu Código de Descuento" : "Your Discount Code"}
              </span>
              <code className="text-base font-mono font-bold text-white tracking-widest">{promoCode}</code>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(promoCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
            >
              {copied ? (tGlobal.lang === "es" ? "¡Copiado!" : "Copied!") : (tGlobal.lang === "es" ? "Copiar" : "Copy")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              const code = `PNP-${(user?.username || "CREATOR").toUpperCase().slice(0, 6)}-${Math.floor(1000 + Math.random() * 9000)}`;
              setPromoCode(code);
            }}
            className="w-full py-2.5 rounded-xl font-bold text-xs text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(90deg, #D4007A, #E69138)" }}
          >
            <span>✨ {tGlobal.lang === "es" ? "Generar Código de Descuento (20% OFF)" : "Generate Discount Code (20% OFF)"}</span>
          </button>
        )}
      </div>

      {/* Revenue streams */}
      <div className="glass-card-sm mb-4 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{t.overviewRevenueStreamsTitle}</p>
        <div className="space-y-2">
          {isPerformer && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              onClick={() => navigate("/creators/live")}
            >
              <span className="text-xl flex-shrink-0">📡</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">PNP Live</p>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {t.overviewPnpLiveDesc}
                </p>
              </div>
              <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#D4007A" }}>→</span>
            </div>
          )}
          {isContentCreator && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              onClick={() => navigate("/creators/channels-hub")}
            >
              <span className="text-xl flex-shrink-0">🎬</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">PNP Channels</p>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {t.overviewPnpChannelsDesc}
                </p>
              </div>
              <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#D4007A" }}>→</span>
            </div>
          )}
          <div
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            onClick={() => navigate("/creators/subscribers")}
          >
            <span className="text-xl flex-shrink-0">💳</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">{t.overviewMembershipsTitle}</p>
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                {t.overviewMembershipsDesc((dashboard.priceUsd ?? 0).toFixed(2), dashboard.exclusivePostCount ?? 0)}
              </p>
            </div>
            <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#D4007A" }}>→</span>
          </div>
        </div>
      </div>

    </>
    </AppShell>
  );
}
