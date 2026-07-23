import React, { useState, useEffect } from "react";
import { Outlet, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  TIER_UPGRADE_THRESHOLDS,
  TIER_CONFIG,
  type TierId,
} from "@/components/profile/CreatorEnrollmentWizard";
import { useAuth } from "@/hooks/useAuth";
import { useCreatorData } from "@/hooks/useCreatorData";
import { Toast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/creators/ConfirmDialog";
import {
  getCreatorSetupStatus,
  getCreatorMySubscribers,
  getCreatorChannelSubscribers,
  getCreatorConsents,
  acceptCreatorPrivacyPolicy,
  acceptCreatorTerms,
  getCreatorAnnounceConsent,
  setCreatorAnnounceConsent,
  acceptTerms,
  updateProfile,
  getCreatorXAccount,
  getCreatorXCampaigns,
  createCreatorXCampaign,
  updateCreatorXCampaign,
  pauseCreatorXCampaign,
  resumeCreatorXCampaign,
  deleteCreatorXCampaign,
  getCreatorXCampaignHistory,
  startCreatorXOAuth,
  getOwnChannels,
  listCreatorInviteLinks,
  createCreatorInviteLink,
  deleteCreatorInviteLink,
  type XAutoCampaign,
  type XAutoCampaignPost,
  type CreatorChannel,
  type CreatorInviteLink,
} from "@/lib/api";
import { Helmet } from "react-helmet-async";

const TIER_BADGE: Record<string, { label: string; emoji: string }> = {
  ice: { label: "Ice", emoji: "❄" },
  crystal: { label: "Crystal", emoji: "🔮" },
  diamond: { label: "Diamond", emoji: "💎" },
};

type CreatorRoleClient = "creator" | "performer" | "both";

// roles: which creator_role values may see this nav item. Omit = always show.
const navItems: Array<{
  to: string;
  label: string;
  end?: boolean;
  icon: string;
  roles?: CreatorRoleClient[];
}> = [
  {
    to: "/creators",
    label: "Dashboard",
    end: true,
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
  },
  {
    to: "/creators/setup",
    label: "Studio Setup",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    to: "/creators/documentation",
    label: "Documentation",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    // PNP Live streaming — only roles that include Performer can broadcast.
    to: "/creators/live",
    label: "Start Webcamming",
    icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
    roles: ["performer", "both"],
  },
  {
    to: "/creators/availability",
    label: "Private calls",
    icon: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
    roles: ["performer", "both"],
  },
  {
    to: "/creators/channels-hub",
    label: "PNP Channels",
    icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
    roles: ["creator", "both"],
  },
  {
    to: "/creators/earnings",
    label: "Earnings",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    to: "/creators/payouts",
    label: "Payouts",
    icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  },
  {
    to: "/creators/analytics",
    label: "Analytics",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
  {
    to: "/creators/settings",
    label: "Settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.11 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    to: "/creators/subscribers",
    label: "Subscribers",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    to: "/creators/x-campaigns",
    label: "My AI Tools",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    to: "/creators/benefits",
    label: "My Benefits",
    icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  },
  {
    to: "/creators/tools",
    label: "Tools",
    icon: "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75",
  },
];

export default function CreatorLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { dashboard } = useCreatorData();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingRequiredCount, setPendingRequiredCount] = useState(0);

  useEffect(() => {
    if (user?.creator_status !== "active") return;
    getCreatorSetupStatus().then((res) => {
      if (res?.items) {
        setPendingRequiredCount(res.items.filter(i => i.required && !i.done).length);
      }
    }).catch(() => {});
  }, [user?.creator_status, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-pnp-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#D4007A", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // Admins and superadmins always pass — they manage the panel without being creators themselves.
  const isAdminRole = user?.role === "admin" || user?.role === "superadmin";
  const hasCreatorAccess = isAdminRole || user?.creator_status === "active";

  if (!isAuthenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Hard gate — no loopholes. Non-creators and non-admins never see the studio shell.
  if (!hasCreatorAccess) {
    return <Navigate to="/" replace />;
  }

  // Filter navItems by the user's creator_role. Admins see everything.
  const userRole = (user?.creator_role as CreatorRoleClient | null | undefined) ?? null;

  const isPerformerOnlyPath = ["/creators/live", "/creators/availability"].some(p => location.pathname.startsWith(p));
  if (isPerformerOnlyPath && !isAdminRole && userRole === "creator") {
    return <Navigate to="/creators" replace />;
  }
  const visibleNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (isAdminRole) return true;
    return userRole ? item.roles.includes(userRole) : false;
  });

  const creatorType = dashboard?.creatorType ?? user?.creator_type ?? null;
  const tierInfo = creatorType ? TIER_BADGE[creatorType] : null;
  const subscriberCount = dashboard?.subscriberCount ?? (user as (typeof user & { creator_subscriber_count?: number }) | null)?.creator_subscriber_count ?? 0;

  const sidebar = (
    <nav className="flex flex-col h-dvh">
      <div className="flex items-center gap-3 px-4 h-16 border-b border-pnp-border">
        <img src="/logo-header.png" alt="PNPtv!" className="h-9 w-auto" />
        <span
          className="text-sm font-bold text-gradient"
        >
          Creator Studio
        </span>
      </div>

      {/* Back to PNPtv link */}
      <div className="px-2 pt-3">
        <button
          onClick={() => { navigate("/"); setSidebarOpen(false); }}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back to PNPtv
        </button>
      </div>

      <div className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }: { isActive: boolean }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "text-white"
                  : "text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-pnp-surface"
              }`
            }
            style={({ isActive }: { isActive: boolean }) =>
              isActive
                ? { background: "linear-gradient(135deg, rgba(212,0,122,0.2), rgba(230,145,56,0.2))", borderLeft: "2px solid #D4007A" }
                : {}
            }
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="flex-1">{item.label}</span>
            {item.to === "/creators/documentation" && pendingRequiredCount > 0 && (
              <span
                className="min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                style={{ background: "#D4007A" }}
              >
                {pendingRequiredCount}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      {/* Sidebar footer: creator tier + subscriber count + next-tier progress */}
      <div className="p-3 border-t border-pnp-border space-y-2">
        {tierInfo && (() => {
          const tierId = (creatorType as TierId | null | undefined) ?? null;
          const upgradeInfo = tierId ? TIER_UPGRADE_THRESHOLDS[tierId] : null;
          const tierCfg = tierId ? TIER_CONFIG[tierId] : null;
          const nextTierLabel = upgradeInfo?.nextTier ? TIER_CONFIG[upgradeInfo.nextTier].name : null;
          const threshold = upgradeInfo?.subscribersNeeded ?? null;
          const pct = threshold ? Math.min((subscriberCount / threshold) * 100, 100) : null;

          return (
            <div className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: tierCfg ? `rgba(${tierCfg.rgb},0.08)` : "rgba(255,255,255,0.05)", border: tierCfg ? `1px solid rgba(${tierCfg.rgb},0.2)` : "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2">
                <span className="text-sm">{tierInfo.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: tierCfg?.color ?? "#D4007A" }}>{tierInfo.label} Creator</p>
                  <p className="text-xs text-pnp-textSecondary">
                    {subscriberCount} subscriber{subscriberCount !== 1 ? "s" : ""}
                    {threshold && subscriberCount < threshold && (
                      <span> &middot; {threshold - subscriberCount} to {nextTierLabel}</span>
                    )}
                    {threshold && subscriberCount >= threshold && nextTierLabel && (
                      <span className="text-xs font-semibold" style={{ color: "#5ED1C4" }}> &middot; Upgrade ready!</span>
                    )}
                  </p>
                </div>
              </div>
              {/* Progress bar toward next tier */}
              {threshold && pct !== null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-pnp-textSecondary">to {nextTierLabel}</span>
                    <span className="text-[10px] font-semibold text-white">{subscriberCount}/{threshold}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: pct >= 100 ? "#5ED1C4" : (tierCfg?.gradient ?? "linear-gradient(to right, #D4007A, #E69138)"),
                      }}
                    />
                  </div>
                </div>
              )}
              {!threshold && tierId === "diamond" && (
                <p className="text-[10px] text-pnp-textSecondary">Top tier reached</p>
              )}
            </div>
          );
        })()}
        <div className="px-3 text-xs text-pnp-textSecondary truncate">
          {user?.displayName || "Creator"}
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-pnp-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-56 lg:flex-col border-r border-pnp-border glass-nav">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 bg-pnp-background border-r border-pnp-border z-50">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Mobile topbar */}
      <header className="lg:hidden sticky top-0 z-40 h-14 flex items-center justify-between px-4 glass-nav border-b border-pnp-border">
        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-pnp-textSecondary">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <img src="/logo-header.png" alt="PNPtv!" className="h-9 w-auto" />
          <span
            className="text-xs font-bold text-gradient"
          >
            Creator Studio
          </span>
        </div>
        <div className="w-8" />
      </header>

      {/* Main content */}
      <main className="lg:pl-56">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {user?.creator_locked && <CreatorOnboardingLockBanner lang={user?.language === "es" ? "es" : "en"} />}
          <Outlet />
        </div>
      </main>

      <Toast />
    </div>
  );
}

function CreatorOnboardingLockBanner({ lang }: { lang: "es" | "en" }) {
  const copy = lang === "es"
    ? {
        title: "Tus herramientas de creador están en pausa",
        body: "Serás parte del primer grupo que incorporaremos, justo después de nuestro piloto esta semana. Tu onboarding oficial comienza en ~2 semanas (te compartiremos la fecha exacta muy pronto). Mientras tanto, puedes ver tu panel, pero las herramientas y los cobros a usuarios están temporalmente pausados. Hacemos esto porque queremos invertir de verdad en tu bienestar y éxito como creador.",
      }
    : {
        title: "Your creator tools are temporarily paused",
        body: "You'll be in our first onboarding group — right after this week's pilot. Your official onboarding begins in ~2 weeks (exact date shared very soon). Until then, you can browse your dashboard, but tools and member payments are temporarily paused. We do this because we genuinely want to invest in your wellness and success as a creator.",
      };
  return (
    <div
      role="alert"
      className="mb-6 rounded-xl border p-4 flex gap-3 items-start"
      style={{ background: "rgba(245, 158, 11, 0.08)", borderColor: "rgba(245, 158, 11, 0.35)" }}
    >
      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#F59E0B" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M12 21a9 9 0 110-18 9 9 0 010 18z" />
      </svg>
      <div>
        <p className="text-sm font-semibold" style={{ color: "#F59E0B" }}>{copy.title}</p>
        <p className="text-xs text-pnp-textSecondary mt-1 leading-relaxed">{copy.body}</p>
      </div>
    </div>
  );
}

// ── Creator Subscribers Page ──────────────────────────────────────────────────

function resolvePhoto(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("/") || url.startsWith("http")) return url;
  return null;
}

function SubscriberRow({ username, firstName, avatar, since, badge, badgeColor, detail }: {
  username: string; firstName: string; avatar: string | null;
  since: string; badge: string; badgeColor: string; detail: string;
}) {
  const photo = resolvePhoto(avatar);
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
      {photo ? (
        <img src={photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-pnp-surface flex items-center justify-center shrink-0">
          <span className="text-sm text-pnp-textSecondary">{(firstName || username || "?")[0].toUpperCase()}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{firstName || username}</p>
        <p className="text-xs text-pnp-textSecondary">@{username} · since {new Date(since).toLocaleDateString()}</p>
      </div>
      <div className="text-right shrink-0">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeColor}`}>{badge}</span>
        <p className="text-xs text-pnp-textSecondary mt-1">{detail}</p>
      </div>
    </div>
  );
}

// ── Invite Links sub-panel ────────────────────────────────────────────────────

function InviteLinksPanel() {
  const { user } = useAuth();
  const [links, setLinks] = React.useState<CreatorInviteLink[]>([]);
  const [channels, setChannels] = React.useState<CreatorChannel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState<{
    resourceType: "channel" | "creator";
    resourceId: string;
    durationHours: string;
    maxUses: string;
    note: string;
  }>({ resourceType: "creator", resourceId: "", durationHours: "72", maxUses: "", note: "" });
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, chRes] = await Promise.all([listCreatorInviteLinks(), getOwnChannels()]);
      if (linksRes.success) setLinks(linksRes.links);
      if (chRes.success) setChannels(chRes.channels);
    } catch (_) {}
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.resourceId) {
      setFormError("Select a resource.");
      return;
    }
    setSaving(true);
    try {
      const res = await createCreatorInviteLink({
        resourceType: form.resourceType,
        resourceId: form.resourceId,
        durationHours: parseInt(form.durationHours || "72", 10),
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
        note: form.note || undefined,
      });
      if (res.success) {
        setShowForm(false);
        setForm({ resourceType: "creator", resourceId: "", durationHours: "72", maxUses: "", note: "" });
        await load();
      } else {
        setFormError("Failed to create link.");
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create link.");
    }
    setSaving(false);
  };

  const handleDelete = async (code: string) => {
    try {
      await deleteCreatorInviteLink(code);
      setLinks(prev => prev.filter(l => l.code !== code));
    } catch (_) {}
    setDeleteConfirm(null);
  };

  const copyUrl = (code: string) => {
    navigator.clipboard.writeText(`https://pnptv.app/invite/${code}`).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = (l: CreatorInviteLink) =>
    (l.expires_at && new Date(l.expires_at) < new Date()) ||
    (l.max_uses !== null && l.use_count >= l.max_uses);

  const resourceLabel = (l: CreatorInviteLink) => {
    if (l.resource_type === "channel") {
      const ch = channels.find(c => String(c.id) === String(l.resource_id));
      return ch ? `📺 ${ch.name}` : `Channel #${l.resource_id}`;
    }
    return "👤 My Profile";
  };

  if (loading) return (
    <div className="animate-pulse space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-pnp-textSecondary">Share links that give fans free trial access to your content.</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setFormError(null); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pnp-primary text-white hover:opacity-90 transition-opacity shrink-0"
        >
          {showForm ? "Cancel" : "+ New Link"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          {/* Resource type */}
          <div>
            <label className="text-xs text-pnp-textSecondary mb-1 block">Access to</label>
            <div className="flex gap-2">
              {(["creator", "channel"] as const).map(rt => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, resourceType: rt, resourceId: rt === "creator" ? (user?.dbId ?? "") : "" }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${form.resourceType === rt ? "bg-pnp-primary text-white" : "bg-white/5 text-pnp-textSecondary hover:text-white"}`}
                >
                  {rt === "creator" ? "👤 My Profile" : "📺 A Channel"}
                </button>
              ))}
            </div>
          </div>

          {form.resourceType === "channel" && (
            <div>
              <label className="text-xs text-pnp-textSecondary mb-1 block">Channel</label>
              <select
                value={form.resourceId}
                onChange={e => setForm(f => ({ ...f, resourceId: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Select a channel…</option>
                {channels.map(ch => (
                  <option key={ch.id} value={String(ch.id)}>{ch.name}</option>
                ))}
              </select>
            </div>
          )}

          {form.resourceType === "creator" && (
            <input type="hidden" value={form.resourceId} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-pnp-textSecondary mb-1 block">Duration (hours)</label>
              <input
                type="number" min={1} max={720}
                value={form.durationHours}
                onChange={e => setForm(f => ({ ...f, durationHours: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-pnp-textSecondary mb-1 block">Max uses (blank = unlimited)</label>
              <input
                type="number" min={1}
                placeholder="∞"
                value={form.maxUses}
                onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-pnp-textSecondary mb-1 block">Label (optional)</label>
            <input
              type="text" maxLength={200} placeholder="e.g. Instagram story promo"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </div>

          {formError && <p className="text-xs text-red-400">{formError}</p>}

          <button
            type="submit" disabled={saving}
            className="w-full py-2 rounded-lg text-sm font-semibold bg-pnp-primary text-white disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Link"}
          </button>
        </form>
      )}

      {links.length === 0 ? (
        <div className="text-center py-10 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-pnp-textSecondary text-sm">No invite links yet</p>
          <p className="text-pnp-textSecondary/60 text-xs mt-1">Create one to give fans free trial access</p>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map(l => {
            const expired = isExpired(l);
            return (
              <div key={l.code} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", opacity: expired ? 0.5 : 1 }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-white">{l.code}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${expired ? "bg-white/10 text-pnp-textSecondary" : "bg-green-500/20 text-green-400"}`}>
                        {expired ? "Exhausted" : "Active"}
                      </span>
                    </div>
                    <p className="text-xs text-pnp-textSecondary mt-0.5">{resourceLabel(l)}</p>
                    <p className="text-xs text-pnp-textSecondary/70 mt-0.5">
                      {l.duration_hours}h access · {l.use_count}{l.max_uses !== null ? `/${l.max_uses}` : ""} uses
                      {l.note ? ` · ${l.note}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => copyUrl(l.code)}
                      className="p-1.5 rounded-lg text-xs hover:bg-white/10 text-pnp-textSecondary hover:text-white transition-colors"
                      title="Copy link"
                    >
                      {copied === l.code ? "✓" : "⎘"}
                    </button>
                    {!expired && (
                      deleteConfirm === l.code ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleDelete(l.code)} className="px-2 py-1 rounded text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30">Yes, deactivate</button>
                          <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded text-[10px] bg-white/5 text-pnp-textSecondary">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(l.code)}
                          className="p-1.5 rounded-lg text-xs hover:bg-white/10 text-pnp-textSecondary hover:text-red-400 transition-colors"
                          title="Deactivate"
                        >
                          ✕
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Creator Subscribers Page ──────────────────────────────────────────────────

export function CreatorSubscribers() {
  const [tab, setTab] = React.useState<"profile" | "channels" | "invite-links">("profile");
  const [profileData, setProfileData] = React.useState<any>(null);
  const [channelData, setChannelData] = React.useState<any>(null);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadProfile = React.useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCreatorMySubscribers(p);
      if (res.success) setProfileData(res);
      else setError("Failed to load subscribers.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscribers.");
    }
    setLoading(false);
  }, []);

  const loadChannels = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCreatorChannelSubscribers();
      if (res.success) setChannelData(res);
      else setError("Failed to load channel subscribers.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channel subscribers.");
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (tab === "profile") loadProfile(page);
    else if (tab === "channels") loadChannels();
  }, [tab, page, loadProfile, loadChannels]);

  const handleTabChange = (t: "profile" | "channels" | "invite-links") => {
    setTab(t);
    setPage(1);
    setError(null);
  };

  const isLoadingInitial = loading && !profileData && !channelData;

  return (
    <>
      <Helmet><title>My Subscribers — Creator Studio — PNPtv!</title></Helmet>
      <div className="p-4 lg:p-6">
        <h1 className="text-xl font-bold text-pnp-textPrimary mb-4">My Subscribers</h1>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }}>
          {(["profile", "channels", "invite-links"] as const).map(t => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${tab === t ? "bg-pnp-primary text-white shadow-sm" : "text-pnp-textSecondary hover:text-white"}`}
            >
              {t === "profile" ? "Profile" : t === "channels" ? "Channels" : "Invite Links"}
            </button>
          ))}
        </div>

        {tab === "invite-links" ? (
          <InviteLinksPanel />
        ) : isLoadingInitial ? (
          <div className="animate-pulse space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-20 bg-white/5 rounded-xl" />)}
            </div>
            <div className="h-48 bg-white/5 rounded-xl" />
          </div>
        ) : error ? (
          <div className="text-center py-12 rounded-xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => tab === "profile" ? loadProfile(page) : loadChannels()} className="mt-3 text-xs text-pnp-textSecondary underline">Retry</button>
          </div>
        ) : tab === "profile" && profileData ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="rounded-xl p-4" style={{ background: "rgba(212,0,122,0.08)", border: "1px solid rgba(212,0,122,0.2)" }}>
                <p className="text-2xl font-bold text-white">{profileData.stats.active_count}</p>
                <p className="text-xs text-pnp-textSecondary mt-1">Active</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(91,200,245,0.08)", border: "1px solid rgba(91,200,245,0.2)" }}>
                <p className="text-2xl font-bold text-white">{profileData.stats.total_count}</p>
                <p className="text-xs text-pnp-textSecondary mt-1">Total</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.2)" }}>
                <p className="text-2xl font-bold text-white">{profileData.stats.new_this_month}</p>
                <p className="text-xs text-pnp-textSecondary mt-1">New this month</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(230,145,56,0.08)", border: "1px solid rgba(230,145,56,0.2)" }}>
                <p className="text-2xl font-bold text-white">{profileData.stats.churn_rate}%</p>
                <p className="text-xs text-pnp-textSecondary mt-1">Churn rate</p>
              </div>
            </div>

            {profileData.subscribers.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-pnp-textSecondary text-sm">No profile subscribers yet</p>
                <p className="text-pnp-textSecondary/60 text-xs mt-1">Share your profile to attract subscribers</p>
              </div>
            ) : (
              <div className="space-y-2">
                {profileData.subscribers.map((sub: any) => (
                  <SubscriberRow
                    key={sub.id}
                    username={sub.subscriber_username}
                    firstName={sub.subscriber_first_name}
                    avatar={sub.subscriber_avatar}
                    since={sub.started_at}
                    badge={sub.status}
                    badgeColor={sub.status === "active" ? "bg-green-500/20 text-green-400" : "bg-white/10 text-pnp-textSecondary"}
                    detail={`$${Number(sub.revenue || 0).toFixed(2)}`}
                  />
                ))}
              </div>
            )}

            {profileData.pagination.totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs text-white bg-white/10 disabled:opacity-30">← Prev</button>
                <span className="px-3 py-1.5 text-xs text-pnp-textSecondary">{page} / {profileData.pagination.totalPages}</span>
                <button disabled={page >= profileData.pagination.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs text-white bg-white/10 disabled:opacity-30">Next →</button>
              </div>
            )}
          </>
        ) : tab === "channels" && channelData ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl p-4" style={{ background: "rgba(212,0,122,0.08)", border: "1px solid rgba(212,0,122,0.2)" }}>
                <p className="text-2xl font-bold text-white">{channelData.summary.total_channel_subscribers}</p>
                <p className="text-xs text-pnp-textSecondary mt-1">Total channel subs</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(91,200,245,0.08)", border: "1px solid rgba(91,200,245,0.2)" }}>
                <p className="text-2xl font-bold text-white">{channelData.summary.total_channels}</p>
                <p className="text-xs text-pnp-textSecondary mt-1">Active channels</p>
              </div>
            </div>

            {channelData.channels.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-pnp-textSecondary text-sm">No active channels yet</p>
                <p className="text-pnp-textSecondary/60 text-xs mt-1">Create channels from your Studio to grow your audience</p>
              </div>
            ) : (
              <div className="space-y-5">
                {channelData.channels.map((ch: any) => (
                  <div key={ch.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center gap-3 px-4 py-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                      {ch.cover_image_url ? (
                        <img src={ch.cover_image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-pnp-primary/20 flex items-center justify-center shrink-0">
                          <span className="text-base">📺</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{ch.name}</p>
                        <p className="text-xs text-pnp-textSecondary">
                          {ch.access_type === "subscription" ? `$${ch.price_usd}/mo` : ch.access_type === "prime" ? "PRIME" : "Free"}
                          {" · "}{ch.new_this_month} new this month
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-white">{ch.subscriber_count}</p>
                        <p className="text-[10px] text-pnp-textSecondary">subscribers</p>
                      </div>
                    </div>
                    {ch.subscribers.length > 0 && (
                      <div className="divide-y divide-white/5">
                        {ch.subscribers.map((s: any) => (
                          <SubscriberRow
                            key={s.user_id}
                            username={s.username}
                            firstName={s.first_name}
                            avatar={s.avatar}
                            since={s.created_at}
                            badge="subscribed"
                            badgeColor="bg-pnp-primary/20 text-pnp-primary"
                            detail=""
                          />
                        ))}
                        {ch.subscriber_count > 20 && (
                          <p className="text-center text-xs text-pnp-textSecondary py-2">
                            +{ch.subscriber_count - 20} more subscribers
                          </p>
                        )}
                      </div>
                    )}
                    {ch.subscribers.length === 0 && (
                      <div className="text-center py-6">
                        <p className="text-xs text-pnp-textSecondary">No subscribers yet</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}

// ── Creator Consents Page ─────────────────────────────────────────────────────

type ConsentRowStatus = "accepted" | "pending" | "submitted" | "missing" | "info";
type ConsentRow = {
  label: string;
  status: ConsentRowStatus;
  detail?: string | null;
  date?: string | null;
  href?: string;
  expandContent?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

function statusPillClass(s: ConsentRowStatus): string {
  switch (s) {
    case "accepted":
    case "submitted":
      return "bg-green-500/20 text-green-400";
    case "missing":
      return "bg-red-500/20 text-red-400";
    case "info":
      return "bg-white/10 text-white/70";
    case "pending":
    default:
      return "bg-amber-500/20 text-amber-400";
  }
}

function statusLabel(s: ConsentRowStatus): string {
  switch (s) {
    case "accepted":   return "Accepted";
    case "submitted":  return "Submitted";
    case "missing":    return "Missing";
    case "info":       return "On file";
    case "pending":
    default:           return "Pending";
  }
}

function ConsentRowList({ rows }: { rows: ConsentRow[] }) {
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);
  return (
    <div className="space-y-2">
      {rows.map((item, i) => {
        const isExpanded = expandedIdx === i;
        const isExpandable = !!item.expandContent;
        const isLink = !!item.href;
        const hasAction = !!item.onAction;

        const header = (
          <div className="flex items-center justify-between gap-3 px-4 py-3 w-full">
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium text-white">{item.label}</p>
              {item.detail && (
                <p className="text-xs text-pnp-textSecondary mt-0.5 truncate">{item.detail}</p>
              )}
              {item.date && (
                <p className="text-[10px] text-pnp-textSecondary/70 mt-0.5">
                  {new Date(item.date).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${statusPillClass(item.status)}`}>
                {statusLabel(item.status)}
              </span>
              {isLink && (
                <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              )}
              {isExpandable && (
                <svg className={`w-4 h-4 opacity-50 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          </div>
        );

        return (
          <div key={i} className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
            {isLink ? (
              <a href={item.href} target="_blank" rel="noopener noreferrer" className="block hover:bg-white/5 transition-colors" style={{ textDecoration: "none" }}>
                {header}
              </a>
            ) : isExpandable ? (
              <button className="block w-full hover:bg-white/5 transition-colors text-left" onClick={() => setExpandedIdx(isExpanded ? null : i)}>
                {header}
              </button>
            ) : (
              <div>{header}</div>
            )}

            {isExpanded && item.expandContent && (
              <div className="px-4 pb-4 text-xs leading-relaxed space-y-2" style={{ color: "var(--pnp-text-secondary, #8E8E93)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {item.expandContent}
              </div>
            )}

            {hasAction && (
              <div className="px-4 pb-3">
                <button
                  onClick={item.onAction}
                  className="w-full py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 btn-gradient"
                >
                  {item.actionLabel ?? "Complete"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Date-only strings like "1990-07-15" parse as UTC midnight → they roll back a
// day in western timezones. Anchor at UTC noon so any tz shift stays same-day.
function formatDobSafe(dob: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? `${dob}T12:00:00Z` : dob;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? dob : d.toLocaleDateString();
}

export function CreatorConsents() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [consents, setConsents] = React.useState<any>(null);
  const [userId, setUserId] = React.useState<string | number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [privacyModalOpen, setPrivacyModalOpen] = React.useState(false);
  const [privacyAccepting, setPrivacyAccepting] = React.useState(false);
  const [privacyError, setPrivacyError] = React.useState<string | null>(null);

  // Generic acceptance state for Terms / Content Disclaimer / WoF Photo Consent.
  // Each row used to show "pending" with no way to resolve it from this page.
  // Acceptance is reused across rows; row identified by `kind`.
  const [acceptKind, setAcceptKind] = React.useState<"terms" | "disclaimer" | "creator_terms" | null>(null);
  const [acceptBusy, setAcceptBusy] = React.useState(false);
  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [wofBusy, setWofBusy] = React.useState(false);

  // PNPtv announcement consent — creator opt-in for @pnptv to auto-broadcast
  // new videos/streams on X, Telegram groups, and consented DMs.
  const [announceConsent, setAnnounceConsent] = React.useState<{ consented: boolean; consentedAt: string | null } | null>(null);
  const [announceBusy, setAnnounceBusy] = React.useState(false);
  const [announceExpanded, setAnnounceExpanded] = React.useState(false);
  const [announceError, setAnnounceError] = React.useState<string | null>(null);
  React.useEffect(() => {
    getCreatorAnnounceConsent()
      .then((res) => { if (res.success) setAnnounceConsent({ consented: res.consented, consentedAt: res.consentedAt }); })
      .catch(() => { /* silent — section shows a retry if it stays null */ });
  }, []);
  const toggleAnnounceConsent = async (next: boolean) => {
    setAnnounceBusy(true);
    setAnnounceError(null);
    try {
      const res = await setCreatorAnnounceConsent(next);
      if (res.success) setAnnounceConsent({ consented: res.consented, consentedAt: next ? new Date().toISOString() : null });
    } catch (err) {
      setAnnounceError(err instanceof Error ? err.message : "Failed to update — try again.");
    } finally {
      setAnnounceBusy(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    getCreatorConsents().then(res => {
      if (cancelled) return;
      if (res.success) {
        setConsents(res.consents);
        if (res.userId !== undefined && res.userId !== null) setUserId(res.userId);
      } else {
        setLoadError("Failed to load your consent records.");
      }
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setLoadError(err instanceof Error ? err.message : "Failed to load your consent records.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const acceptWofPhotoConsent = async () => {
    setWofBusy(true);
    try {
      await updateProfile({ wofPhotoConsent: true });
      setConsents((c: any) => c ? { ...c, wof_photo_consent: true } : c);
    } catch { /* swallow — row stays pending, user can retry */ }
    finally { setWofBusy(false); }
  };

  const genericRows: ConsentRow[] = consents ? [
    {
      label: "Terms of Service",
      status: consents.terms_accepted ? "accepted" : "pending",
      detail: consents.terms_accepted ? null : "Required to keep your creator profile active.",
      date: consents.terms_accepted_at || null,
      href: "/terms",
      ...(!consents.terms_accepted
        ? { actionLabel: "Review & Accept", onAction: () => { setAcceptError(null); setAcceptKind("terms"); } }
        : {}),
    },
    {
      label: "Privacy Policy",
      status: consents.privacy_accepted ? "accepted" : "pending",
      detail: consents.privacy_accepted ? null : "Required to keep your creator profile active.",
      date: consents.privacy_accepted_at || null,
      href: "/privacy",
      ...(!consents.privacy_accepted ? { actionLabel: "Review & Accept", onAction: () => setPrivacyModalOpen(true) } : {}),
    },
    {
      label: "Age Verification",
      status: consents.age_verified ? "accepted" : "pending",
      detail: consents.age_verified ? null : "Required before you can publish or stream.",
      date: consents.age_verified_at,
      ...(!consents.age_verified
        ? { actionLabel: "Verify Age", onAction: () => navigate("/2257") }
        : {}),
    },
    {
      label: "Wall of Fame Photo Consent",
      status: consents.wof_photo_consent ? "accepted" : "pending",
      expandContent: (
        <p className="pt-2">Allow your Wall of Fame photos to appear in the Social Feed on the web app. You can toggle this in Settings → App Preferences at any time.</p>
      ),
      // Inline accept — simple toggle, no modal needed. updateProfile keeps
      // a single source of truth with the Settings → App Preferences toggle.
      ...(!consents.wof_photo_consent
        ? { actionLabel: wofBusy ? "Saving…" : "Accept", onAction: acceptWofPhotoConsent }
        : {}),
    },
    {
      label: "Content Disclaimer",
      status: consents.content_disclaimer ? "accepted" : "pending",
      detail: consents.content_disclaimer ? null : "Required before you can publish any video.",
      date: consents.content_disclaimer_accepted_at,
      expandContent: (
        <p className="pt-2">I confirm that all objects, substances, or materials appearing in my videos are props, simulated, or used solely for entertainment purposes. All content must comply with PNPtv! community standards. No illegal content. Explicit content requires age verification to be active on your account.</p>
      ),
      ...(!consents.content_disclaimer
        ? { actionLabel: "Review & Accept", onAction: () => { setAcceptError(null); setAcceptKind("disclaimer"); } }
        : {}),
    },
    {
      label: "Community Guidelines",
      status: "info",
      detail: "Content standards, access types, strike system, and dispute rules. Review before you post.",
      actionLabel: "Read Guidelines",
      onAction: () => navigate("/creators/guidelines"),
    },
  ] : [];

  const hasApplication = !!consents?.application_id;
  const applicationTypeLabel = (() => {
    switch (consents?.application_type) {
      case "live":            return "Live Performer";
      case "content_creator": return "Content Creator";
      case "both":            return "Live Performer + Content Creator";
      default:                return null;
    }
  })();

  // Gov ID front + back share the same source (creator_2257_records or model_app),
  // so consolidate into a single row keyed off "both fields submitted".
  const govIdSubmitted = !!(consents?.id_front_submitted && consents?.id_back_submitted);

  const complianceRows: ConsentRow[] = consents ? [
    {
      label: "Creator Application",
      status: hasApplication
        ? (consents.application_status === "approved" ? "accepted"
          : consents.application_status === "rejected" ? "missing"
          : "pending")
        : "missing",
      detail: hasApplication
        ? `${applicationTypeLabel ?? "Application"} — ${
            consents.application_status === "approved" ? "Approved"
            : consents.application_status === "rejected" ? "Rejected"
            : consents.application_status === "under_review" ? "Under review"
            : "Pending review"
          }`
        : "Required to receive tips, tokens, or subscriptions.",
      date: consents.application_created_at,
      ...(!hasApplication ? { actionLabel: "Start Application", onAction: () => navigate("/creators/apply") } : {}),
    },
    {
      label: "Legal Identity (2257)",
      status: (consents.legal_full_name && consents.date_of_birth) ? "submitted" : "missing",
      detail: consents.legal_full_name
        ? `${consents.legal_full_name}${consents.date_of_birth ? ` — DOB ${formatDobSafe(consents.date_of_birth)}` : ""}`
        : "Legal name + DOB — federally required (18 U.S.C. § 2257). Without it your content cannot stay public.",
      ...(!(consents.legal_full_name && consents.date_of_birth)
        ? { actionLabel: "Complete 2257 Form", onAction: () => navigate("/2257") }
        : {}),
    },
    {
      label: "Government ID Upload",
      status: govIdSubmitted ? "submitted" : "missing",
      detail: govIdSubmitted
        ? "Front + back on file (admin-only, encrypted)."
        : "Upload both front and back of a government-issued ID. Required for 2257.",
      ...(!govIdSubmitted
        ? { actionLabel: "Upload ID", onAction: () => navigate("/2257") }
        : {}),
    },
    {
      label: "Creator Terms Agreement",
      status: consents.creator_terms_agreed ? "accepted" : "pending",
      detail: consents.creator_terms_agreed
        ? (consents.creator_terms_version ? `Version ${consents.creator_terms_version}` : null)
        : "70/30 revenue split, payout schedule, deactivation policy. Required.",
      date: consents.creator_terms_agreed_at,
      ...(consents.creator_terms_agreed
        ? {
            expandContent: (
              <>
                <p className="pt-2">By enrolling as a creator, you agree to PNPtv!'s Creator Program Terms. Subscription revenue is split 70% to you / 30% to PNPtv!. Payouts are processed every Tuesday before 2:00 PM UTC via your selected payment method.</p>
                <p>You retain ownership of all content you upload. PNPtv! reserves the right to deactivate creator profiles for violations of community standards or the strike policy (3 strikes = suspension).</p>
                <p>You may voluntarily deactivate at any time. Active subscribers retain access until their billing period ends. PNPtv! may amend these terms with 30 days written notice.</p>
              </>
            ),
          }
        : { actionLabel: "Review & Accept", onAction: () => { setAcceptError(null); setAcceptKind("creator_terms"); } }),
    },
    {
      label: "Stage Name",
      status: consents.stage_name ? "submitted" : "missing",
      detail: consents.stage_name || "The name shown on your public profile. Editable anytime in Settings.",
      ...(!consents.stage_name
        ? { actionLabel: "Set Stage Name", onAction: () => navigate("/creators/settings") }
        : {}),
    },
    {
      label: "Location Declaration",
      status: consents.country ? "submitted" : "missing",
      detail: consents.country ?? "Country of residence — required for tax and geo-compliance.",
      ...(!consents.country
        ? { actionLabel: "Update Location", onAction: () => navigate("/creators/settings") }
        : {}),
    },
  ] : [];

  const payoutRows: ConsentRow[] = consents ? [
    {
      label: "Fiat Payout Method",
      status: consents.fiat_payout_method ? "info" : "missing",
      detail: consents.fiat_payout_method
        ? `Configured (${String(consents.fiat_payout_method).toUpperCase()})`
        : "Configure at least one payout method (fiat OR crypto) to receive earnings.",
      ...(!consents.fiat_payout_method ? { actionLabel: "Configure Payouts", onAction: () => navigate("/creators/settings") } : {}),
    },
    {
      label: "Crypto Payout Wallet",
      status: consents.wallet_address_set
        ? (consents.creator_wallet_verified ? "accepted" : "info")
        : "missing",
      detail: consents.wallet_address_set
        ? (consents.creator_wallet_verified ? "Connected & verified" : "Connected — pending verification")
        : "Configure at least one payout method (fiat OR crypto) to receive earnings.",
      ...(!consents.wallet_address_set ? { actionLabel: "Configure Payouts", onAction: () => navigate("/creators/settings") } : {}),
    },
  ] : [];

  // Pending-count summary — counts rows that block go-live. Payout rows are OR
  // (fiat OR crypto is enough) so we count them as one pending item if neither
  // is set.
  const allRows = [...genericRows, ...complianceRows];
  const payoutConfigured = !!(consents?.fiat_payout_method || consents?.wallet_address_set);
  const pendingCount = allRows.filter(r => r.status === "pending" || r.status === "missing").length
    + (consents && !payoutConfigured ? 1 : 0);
  const totalActionable = allRows.filter(r => r.status !== "info").length + 1; // +1 for the payout OR-group
  const completedCount = totalActionable - pendingCount;
  const isAdminViewingWithoutApp = !!(consents && !hasApplication && (user?.role === "admin" || user?.role === "superadmin"));

  return (
    <>
      <Helmet><title>Documentation — Creator Studio — PNPtv!</title></Helmet>
      <div className="p-4 lg:p-6">
        <h1 className="text-xl font-bold text-pnp-textPrimary mb-2">Documentation & Compliance</h1>
        <p className="text-sm text-pnp-textSecondary mb-5">
          Every legal agreement, ID form, and payout config you need to keep your creator profile in good standing.
          Rows marked <span className="text-amber-400 font-semibold">Pending</span> or <span className="text-red-400 font-semibold">Missing</span> need your action.
        </p>

        {loading ? (
          <div className="motion-safe:animate-pulse space-y-3">
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
          </div>
        ) : loadError ? (
          <div className="text-center py-8 rounded-xl" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-sm text-red-400">{loadError}</p>
            <button onClick={() => window.location.reload()} className="mt-3 text-xs text-pnp-textSecondary underline">Retry</button>
          </div>
        ) : !consents ? (
          <p className="text-sm text-pnp-textSecondary">Could not load your consents.</p>
        ) : (
          <div className="space-y-6">
            {/* Progress summary */}
            <div
              className="rounded-2xl p-4"
              style={{
                background: pendingCount === 0 ? "rgba(52,199,89,0.08)" : "rgba(212,0,122,0.08)",
                border: `1px solid ${pendingCount === 0 ? "rgba(52,199,89,0.25)" : "rgba(212,0,122,0.3)"}`,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">
                    {pendingCount === 0
                      ? "All set — everything's in order."
                      : `${pendingCount} item${pendingCount === 1 ? "" : "s"} still need your attention`}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {completedCount} of {totalActionable} required steps completed.
                  </p>
                </div>
                <div className="flex-shrink-0" aria-hidden="true">
                  <span
                    className="text-lg font-bold tabular-nums"
                    style={{ color: pendingCount === 0 ? "#34C759" : "#FF4DA6" }}
                  >
                    {completedCount}/{totalActionable}
                  </span>
                </div>
              </div>
              <div className="h-1.5 mt-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full motion-safe:transition-all motion-safe:duration-700"
                  style={{
                    width: `${Math.round((completedCount / Math.max(totalActionable, 1)) * 100)}%`,
                    background: pendingCount === 0
                      ? "#34C759"
                      : "linear-gradient(to right, #D4007A, #E69138)",
                  }}
                />
              </div>
            </div>

            {isAdminViewingWithoutApp && (
              <div
                className="rounded-xl p-3"
                style={{ background: "rgba(94,209,196,0.08)", border: "1px solid rgba(94,209,196,0.25)" }}
              >
                <p className="text-xs text-white">
                  <span className="font-bold" style={{ color: "#5ED1C4" }}>Admin view.</span>{" "}
                  You don't have a creator application on file, so most rows below are informational only.
                </p>
              </div>
            )}

            {/* First-visit banner — shown once (localStorage-flagged) to explain the new opt-in */}
            {announceConsent && !announceConsent.consented && (() => {
              const SEEN_KEY = "pnp_amp_banner_seen_v1";
              let seen = false;
              try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* ignore */ }
              if (seen) return null;
              return (
                <div
                  className="rounded-2xl p-4 flex items-start gap-3"
                  style={{ background: "rgba(212,0,122,0.08)", border: "1px solid rgba(212,0,122,0.35)" }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg" style={{ background: "linear-gradient(135deg,#D4007A,#7B61FF)" }}>📣</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">New: PNPtv can now amplify your drops</p>
                    <p className="text-xs text-pnp-textSecondary mt-1 leading-relaxed">
                      We can post to @PNPTelevision on X and PNPtv Telegram groups every time you publish or go live.
                      It's optional and you keep full control — expand the section below to read what we share and turn it on if you want the boost.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ } setAnnounceExpanded(true); }}
                    className="text-white/60 hover:text-white text-xl leading-none flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              );
            })()}

            {/* PNPtv announcement amplification — creator opt-in */}
            <section>
              <h2 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">PNPtv amplification (optional)</h2>
              <div
                className="rounded-2xl p-4"
                style={{
                  background: announceConsent?.consented ? "rgba(52,199,89,0.06)" : "rgba(94,209,196,0.06)",
                  border: `1px solid ${announceConsent?.consented ? "rgba(52,199,89,0.25)" : "rgba(94,209,196,0.25)"}`,
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white">Let PNPtv announce my new content</p>
                      {announceConsent?.consented && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: "rgba(52,199,89,0.15)", border: "1px solid rgba(52,199,89,0.3)", color: "#34C759" }}>
                          Enabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-pnp-textSecondary mt-1 leading-relaxed">
                      When you publish a new channel video or go live, PNPtv can amplify it across our own social channels — no work from you.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnnounceExpanded((v) => !v)}
                    className="text-[11px] font-semibold text-white/70 hover:text-white transition-colors underline"
                  >
                    {announceExpanded ? "Hide details" : "Read the terms"}
                  </button>
                </div>

                {announceExpanded && (
                  <div className="mt-4 rounded-xl p-3.5 text-[11px] leading-relaxed space-y-3" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)", color: "#c9c9cc" }}>
                    <div>
                      <p className="text-white font-semibold mb-1">Where we announce</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>The <span className="text-white font-semibold">@PNPTelevision</span> account on X (Twitter)</li>
                        <li>PNPtv Telegram groups where our bot is an admin</li>
                        <li>Telegram DMs to users who explicitly opted in to receive creator updates</li>
                      </ul>
                    </div>
                    <div>
                      <p className="text-white font-semibold mb-1">What we share</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Your video / stream title and description</li>
                        <li>Your public creator handle</li>
                        <li>A preview image (GIF or thumbnail)</li>
                        <li>A link back to view it on pnptv.app</li>
                      </ul>
                    </div>
                    <div>
                      <p className="text-white font-semibold mb-1">What we never share</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Exclusive or paid-subscription content — we only announce free posts</li>
                        <li>Anything you flagged as private or unlisted</li>
                        <li>Personal info beyond your public creator profile</li>
                      </ul>
                    </div>
                    <div>
                      <p className="text-white font-semibold mb-1">Your controls</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>Per-video you can still untick "Announce on feed" when publishing</li>
                        <li>You can revoke this consent below at any time — it only affects future announcements</li>
                        <li>We rate-limit to at most one X post per creator per hour to avoid spam</li>
                      </ul>
                    </div>
                    <p className="pt-1 text-[10px] text-pnp-textSecondary">
                      By enabling this, you confirm you have the right to distribute the content you publish and agree that PNPtv may amplify it across the channels above.
                    </p>
                  </div>
                )}

                {announceError && (
                  <p className="mt-3 text-[11px]" style={{ color: "#FF6B6B" }}>{announceError}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {!announceConsent?.consented ? (
                    <button
                      type="button"
                      onClick={() => toggleAnnounceConsent(true)}
                      disabled={announceBusy}
                      className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#5ED1C4,#2DD4BF)", color: "#04252b" }}
                    >
                      {announceBusy ? "Saving…" : "Enable announcements"}
                    </button>
                  ) : (
                    <>
                      <span className="text-[11px] text-pnp-textSecondary self-center">
                        Enabled {announceConsent.consentedAt ? new Date(announceConsent.consentedAt).toLocaleDateString() : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleAnnounceConsent(false)}
                        disabled={announceBusy}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                        style={{ background: "rgba(255,69,58,0.12)", border: "1px solid rgba(255,69,58,0.3)", color: "#FF6B6B" }}
                      >
                        {announceBusy ? "Saving…" : "Revoke consent"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Platform consents */}
            <section>
              <h2 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Platform consents</h2>
              <ConsentRowList rows={genericRows} />
            </section>

            {/* Creator compliance */}
            <section>
              <h2 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Creator compliance (required)</h2>
              <ConsentRowList rows={complianceRows} />
              <p className="text-[10px] text-pnp-textSecondary/60 mt-3 px-1">
                Government ID images are stored encrypted and only visible to platform admins for 2257 compliance review.
              </p>
            </section>

            {/* Payout config */}
            <section>
              <h2 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-3">Payout configuration</h2>
              <p className="text-[11px] mb-3 px-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                Configure at least one method — fiat OR crypto — to receive your earnings. Payouts run every Tuesday.
              </p>
              <ConsentRowList rows={payoutRows} />
            </section>

            {/* Identifiers footer — small, at the bottom */}
            <section className="pt-2">
              <details>
                <summary className="text-[11px] text-pnp-textSecondary/60 cursor-pointer hover:text-pnp-textSecondary transition-colors">
                  Support IDs (for when you contact support)
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <div className="px-3 py-2 rounded-lg bg-white/5">
                    <p className="text-[9px] text-pnp-textSecondary uppercase tracking-wider mb-0.5">User ID</p>
                    <p className="text-xs font-mono text-white/80 break-all">{userId ?? "—"}</p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-white/5">
                    <p className="text-[9px] text-pnp-textSecondary uppercase tracking-wider mb-0.5">Application ID</p>
                    <p className="text-xs font-mono text-white/80 break-all">{consents.application_id ?? "—"}</p>
                  </div>
                </div>
              </details>
            </section>
          </div>
        )}
      </div>

      {privacyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl flex flex-col max-h-[85vh]"
            style={{ background: "linear-gradient(160deg,#1a1a2e 0%,#0f0f1a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <div>
                <p className="text-sm font-bold text-white">Privacy Policy</p>
                <p className="text-xs mt-0.5" style={{ color: "#8E8E93" }}>pnptv.app/privacy</p>
              </div>
              <button onClick={() => setPrivacyModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} aria-label="Close">
                <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Policy summary */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3 text-xs" style={{ color: "#8E8E93" }}>
              <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="font-semibold text-white">What we collect</p>
                <p>PNPtv! collects information you provide directly (profile details, uploaded content, payment information) and data generated by your activity on the platform (interactions, usage patterns, location if granted).</p>
              </div>
              <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="font-semibold text-white">How we use it</p>
                <p>Your data is used to operate and improve the platform, process payments, provide creator analytics, comply with legal obligations (including 18 U.S.C. § 2257), and communicate with you about your account.</p>
              </div>
              <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="font-semibold text-white">Sharing & disclosure</p>
                <p>We do not sell your personal data. We share it only with service providers necessary to operate the platform, or when required by law. Creator identity documents are stored encrypted and accessed only for compliance review.</p>
              </div>
              <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="font-semibold text-white">Your rights</p>
                <p>You may request access, correction, or deletion of your personal data at any time by contacting support@pnptv.app. Note that some data must be retained for legal compliance purposes.</p>
              </div>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="block text-center underline py-1" style={{ color: "#5ED1C4" }}>
                Read the full Privacy Policy ↗
              </a>
              {privacyError && (
                <p className="text-center text-red-400 text-xs pt-1">{privacyError}</p>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 pt-3 flex-shrink-0 space-y-2">
              <button
                onClick={async () => {
                  setPrivacyAccepting(true);
                  setPrivacyError(null);
                  try {
                    await acceptCreatorPrivacyPolicy();
                    setConsents((c: any) => c ? { ...c, privacy_accepted: true, privacy_accepted_at: new Date().toISOString() } : c);
                    setPrivacyModalOpen(false);
                  } catch {
                    setPrivacyError("Could not save your acceptance. Please try again.");
                  } finally {
                    setPrivacyAccepting(false);
                  }
                }}
                disabled={privacyAccepting}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#5ED1C4,#00D4E8)" }}
              >
                {privacyAccepting ? "Saving…" : "I Accept the Privacy Policy"}
              </button>
              <button
                onClick={() => setPrivacyModalOpen(false)}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white/70 transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                I Do Not Accept
              </button>
              <p className="text-[10px] text-center" style={{ color: "#8E8E93" }}>
                Declining means your creator profile cannot be activated. Contact <a href="mailto:support@pnptv.app" className="underline">support@pnptv.app</a> with questions.
              </p>
            </div>
          </div>
        </div>
      )}

      {acceptKind && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl flex flex-col max-h-[85vh]"
            style={{ background: "linear-gradient(160deg,#1a1a2e 0%,#0f0f1a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <div>
                <p className="text-sm font-bold text-white">
                  {acceptKind === "terms" ? "Terms of Service"
                    : acceptKind === "creator_terms" ? "Creator Program Terms"
                    : "Content Disclaimer"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#8E8E93" }}>
                  {acceptKind === "terms" ? "pnptv.app/terms"
                    : acceptKind === "creator_terms" ? "70/30 revenue split · payouts every Tuesday"
                    : "Required for creators"}
                </p>
              </div>
              <button
                onClick={() => setAcceptKind(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.08)" }}
                aria-label="Close"
              >
                <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3 text-xs" style={{ color: "#8E8E93" }}>
              {acceptKind === "terms" ? (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p>PNPtv! Terms of Service govern your use of the platform: community guidelines, content rules, the strike system, and how disputes are handled.</p>
                  <p>By accepting you confirm you have read the full terms at <a href="/terms" target="_blank" rel="noreferrer" className="underline text-white/70">pnptv.app/terms</a> and agree to be bound by them.</p>
                </div>
              ) : acceptKind === "creator_terms" ? (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="font-semibold text-white">Creator Program Terms</p>
                  <p>Subscription revenue is split <strong className="text-white">70% to you / 30% to PNPtv!</strong>. Payouts processed every Tuesday via your selected payment method.</p>
                  <p>You retain ownership of all content you upload. PNPtv! may deactivate profiles for community standard violations (3 strikes = suspension).</p>
                  <p>You may deactivate at any time. Active subscribers retain access until their billing period ends. PNPtv! may amend these terms with 30 days written notice.</p>
                  <a href="/2257" target="_blank" rel="noreferrer" className="block underline text-white/60 text-[10px]">18 U.S.C. § 2257 compliance info ↗</a>
                </div>
              ) : (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p>I confirm that all objects, substances, or materials appearing in my videos are <strong className="text-white/80">props, simulated, or used solely for entertainment purposes</strong>.</p>
                  <p>All content complies with PNPtv! community standards. No illegal content. Explicit content requires age verification to be active on my account.</p>
                </div>
              )}
              {acceptError && (
                <p className="text-center text-red-400 text-xs pt-1">{acceptError}</p>
              )}
            </div>

            <div className="px-5 pb-5 pt-3 flex-shrink-0 space-y-2">
              <button
                onClick={async () => {
                  setAcceptBusy(true);
                  setAcceptError(null);
                  try {
                    if (acceptKind === "terms") {
                      await acceptTerms();
                      setConsents((c: any) => c ? { ...c, terms_accepted: true, terms_accepted_at: new Date().toISOString() } : c);
                    } else if (acceptKind === "creator_terms") {
                      await acceptCreatorTerms();
                      setConsents((c: any) => c ? { ...c, creator_terms_agreed: true, creator_terms_agreed_at: new Date().toISOString() } : c);
                    } else {
                      await updateProfile({ contentDisclaimer: true });
                      setConsents((c: any) => c ? { ...c, content_disclaimer: true, content_disclaimer_accepted_at: new Date().toISOString() } : c);
                    }
                    setAcceptKind(null);
                  } catch {
                    setAcceptError("Could not save your acceptance. Please try again.");
                  } finally {
                    setAcceptBusy(false);
                  }
                }}
                disabled={acceptBusy}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#5ED1C4,#00D4E8)" }}
              >
                {acceptBusy ? "Saving…" : acceptKind === "terms" ? "I Accept the Terms" : acceptKind === "creator_terms" ? "I Accept the Creator Terms" : "I Accept"}
              </button>
              <button
                onClick={() => setAcceptKind(null)}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white/70 transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── My AI Tools Page (X Campaigns agent) ─────────────────────────────────────

type XAccount = { account_id: string; handle: string; display_name: string } | null;

const GROK_MODE_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: "xPost", label: "Regular posts", desc: "General posts about your content and niche." },
  { value: "broadcast", label: "Broadcast announcements", desc: "Announce when you go live or drop new content." },
  { value: "salesPost", label: "Sales posts", desc: "Drive traffic directly to your PNPtv channels." },
];

const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "bilingual", label: "Bilingual (EN + ES)" },
];

function formatHourWindow(start: number, end: number): string {
  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return `${fmt(start)}–${fmt(end)}`;
}

function formatInterval(mins: number): string {
  if (mins < 60) return `every ${mins} min`;
  const hours = mins / 60;
  if (Number.isInteger(hours)) return `every ${hours}h`;
  return `every ${hours.toFixed(1)}h`;
}

export function CreatorMyAITools() {
  const [xAccount, setXAccount] = React.useState<XAccount>(null);
  const [campaigns, setCampaigns] = React.useState<XAutoCampaign[]>([]);
  const [campaignLimit, setCampaignLimit] = React.useState(2);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [linkingOAuth, setLinkingOAuth] = React.useState(false);

  const [showEditor, setShowEditor] = React.useState(false);
  const [editing, setEditing] = React.useState<XAutoCampaign | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formName, setFormName] = React.useState("");
  const [formTopic, setFormTopic] = React.useState("");
  const [formGrokMode, setFormGrokMode] = React.useState("xPost");
  const [formLanguage, setFormLanguage] = React.useState("bilingual");
  const [formInterval, setFormInterval] = React.useState(60);
  const [formHoursStart, setFormHoursStart] = React.useState(9);
  const [formHoursEnd, setFormHoursEnd] = React.useState(22);
  const [formError, setFormError] = React.useState<string | null>(null);

  const [historyFor, setHistoryFor] = React.useState<XAutoCampaign | null>(null);
  const [historyPosts, setHistoryPosts] = React.useState<XAutoCampaignPost[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const [confirmDelete, setConfirmDelete] = React.useState<XAutoCampaign | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acctRes, campsRes] = await Promise.all([
        getCreatorXAccount(),
        getCreatorXCampaigns(),
      ]);
      setXAccount(acctRes.account);
      setCampaigns(campsRes.campaigns || []);
      setCampaignLimit(campsRes.campaignLimit ?? 2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Refresh when returning from OAuth (the callback redirects here)
  React.useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  React.useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(t);
  }, [status]);

  const activeCount = campaigns.filter(c => c.status !== "completed").length;
  const atLimit = activeCount >= campaignLimit;

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormTopic("");
    setFormGrokMode("xPost");
    setFormLanguage("bilingual");
    setFormInterval(60);
    setFormHoursStart(9);
    setFormHoursEnd(22);
    setFormError(null);
    setShowEditor(true);
  };

  const openEdit = (c: XAutoCampaign) => {
    setEditing(c);
    setFormName(c.name);
    setFormTopic(c.topic);
    setFormGrokMode(c.grok_mode || "xPost");
    setFormLanguage(c.language || "bilingual");
    setFormInterval(c.interval_minutes || 60);
    setFormHoursStart(c.active_hours_start ?? 9);
    setFormHoursEnd(c.active_hours_end ?? 22);
    setFormError(null);
    setShowEditor(true);
  };

  const submitForm = async () => {
    setFormError(null);
    const name = formName.trim();
    const topic = formTopic.trim();
    if (!name) { setFormError("Name is required."); return; }
    if (!topic) { setFormError("Topic is required."); return; }
    if (name.length > 200) { setFormError("Name too long (max 200)."); return; }
    if (topic.length > 2000) { setFormError("Topic too long (max 2000)."); return; }
    if (formInterval < 30) { setFormError("Interval must be at least 30 minutes."); return; }
    if (formHoursStart < 0 || formHoursStart > 23 || formHoursEnd < 0 || formHoursEnd > 23) {
      setFormError("Active hours must be between 0 and 23."); return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateCreatorXCampaign(editing.campaign_id, {
          name,
          topic,
          grokMode: formGrokMode,
          language: formLanguage,
          intervalMinutes: formInterval,
          activeHoursStart: formHoursStart,
          activeHoursEnd: formHoursEnd,
        });
        setStatus("Campaign updated.");
      } else {
        if (!xAccount) { setFormError("No X account linked."); setSaving(false); return; }
        await createCreatorXCampaign({
          name,
          accountId: xAccount.account_id,
          topic,
          grokMode: formGrokMode,
          language: formLanguage,
          intervalMinutes: formInterval,
          activeHoursStart: formHoursStart,
          activeHoursEnd: formHoursEnd,
        });
        setStatus("Campaign created.");
      }
      setShowEditor(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save campaign.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const togglePauseResume = async (c: XAutoCampaign) => {
    setBusyId(c.campaign_id);
    try {
      if (c.status === "paused") {
        await resumeCreatorXCampaign(c.campaign_id);
        setStatus("Campaign resumed.");
      } else {
        await pauseCreatorXCampaign(c.campaign_id);
        setStatus("Campaign paused.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setBusyId(target.campaign_id);
    setConfirmDelete(null);
    try {
      await deleteCreatorXCampaign(target.campaign_id);
      setStatus("Campaign deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (c: XAutoCampaign) => {
    setHistoryFor(c);
    setHistoryLoading(true);
    setHistoryPosts([]);
    try {
      const res = await getCreatorXCampaignHistory(c.campaign_id, 1);
      if (res.success) setHistoryPosts(res.posts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const connectX = async () => {
    setLinkingOAuth(true);
    try {
      const res = await startCreatorXOAuth();
      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        setError("Could not start X authentication.");
        setLinkingOAuth(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start X authentication.");
      setLinkingOAuth(false);
    }
  };

  return (
    <>
      <Helmet><title>My AI Tools — Creator Studio — PNPtv!</title></Helmet>
      <div className="p-4 lg:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-white">My AI Tools</h1>
            <p className="text-sm text-pnp-textSecondary mt-1">Automate your content strategy with AI-powered tools.</p>
          </div>
          {xAccount && (
            <div className="text-xs text-pnp-textSecondary">
              <span className="text-white font-semibold">{activeCount}</span> / {campaignLimit} campaigns
            </div>
          )}
        </div>

        {status && (
          <div className="rounded-xl px-4 py-2.5 text-sm text-white" style={{ background: "rgba(52,199,89,0.12)", border: "1px solid rgba(52,199,89,0.3)" }}>
            {status}
          </div>
        )}
        {error && (
          <div className="rounded-xl px-4 py-2.5 text-sm text-white flex items-start justify-between gap-3" style={{ background: "rgba(255,69,58,0.12)", border: "1px solid rgba(255,69,58,0.3)" }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
          </div>
        )}

        {/* X Campaigns Agent card */}
        <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(29,161,242,0.06) 0%, rgba(212,0,122,0.04) 100%)" }} />
          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl" style={{ background: "rgba(29,161,242,0.12)", border: "1px solid rgba(29,161,242,0.2)" }}>
              𝕏
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white">X Campaigns Agent</h3>
              <p className="text-sm text-pnp-textSecondary mt-1.5 leading-relaxed">
                An AI agent that runs your X (Twitter) presence on autopilot — writing posts, scheduling them, and driving traffic to your PNPtv content.
              </p>

              {loading ? (
                <div className="mt-5 text-xs text-pnp-textSecondary">Loading…</div>
              ) : !xAccount ? (
                <div className="mt-5 rounded-xl p-4" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-sm text-white font-semibold">Connect your X account</p>
                  <p className="text-xs text-pnp-textSecondary mt-1 leading-relaxed">
                    Link your X (Twitter) account so the agent can post on your behalf. You can disconnect at any time.
                  </p>
                  <button
                    onClick={connectX}
                    disabled={linkingOAuth}
                    className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #1DA1F2, #0d8bd9)" }}
                  >
                    {linkingOAuth ? "Redirecting…" : "Connect X"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-pnp-textSecondary">Linked as</span>
                      <span className="text-white font-semibold">@{xAccount.handle}</span>
                    </div>
                    <button
                      onClick={openCreate}
                      disabled={atLimit}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: "linear-gradient(135deg, #D4007A, #8B0050)" }}
                    >
                      {atLimit ? `Limit reached (${campaignLimit})` : "New Campaign"}
                    </button>
                  </div>

                  {campaigns.length === 0 ? (
                    <div className="mt-5 text-center py-8 rounded-xl" style={{ background: "rgba(0,0,0,0.2)", border: "1px dashed rgba(255,255,255,0.08)" }}>
                      <p className="text-sm text-white font-semibold">No campaigns yet</p>
                      <p className="text-xs text-pnp-textSecondary mt-1">Create your first campaign to have the agent start posting.</p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {campaigns.map(c => {
                        const isPaused = c.status === "paused";
                        const isCompleted = c.status === "completed";
                        const statusColor = isPaused
                          ? { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)", text: "#F59E0B" }
                          : isCompleted
                            ? { bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.3)", text: "#94A3B8" }
                            : { bg: "rgba(52,199,89,0.15)", border: "rgba(52,199,89,0.3)", text: "#34C759" };
                        return (
                          <div key={c.campaign_id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-white truncate">{c.name}</p>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: statusColor.bg, border: `1px solid ${statusColor.border}`, color: statusColor.text }}>
                                    {c.status}
                                  </span>
                                </div>
                                <p className="text-xs text-pnp-textSecondary mt-1 line-clamp-2 leading-relaxed">{c.topic}</p>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-pnp-textSecondary">
                                  <span>{formatInterval(c.interval_minutes)}</span>
                                  <span>hours {formatHourWindow(c.active_hours_start, c.active_hours_end)}</span>
                                  <span>{GROK_MODE_OPTIONS.find(o => o.value === c.grok_mode)?.label || c.grok_mode}</span>
                                  <span>{LANGUAGE_OPTIONS.find(o => o.value === c.language)?.label || c.language}</span>
                                </div>
                                <div className="mt-2 flex gap-4 text-[11px]">
                                  <span className="text-white"><span className="opacity-60">Posted:</span> {c.total_posted ?? 0}</span>
                                  {(c.total_failed ?? 0) > 0 && (
                                    <span className="text-white"><span className="opacity-60">Failed:</span> {c.total_failed}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {!isCompleted && (
                                  <button
                                    onClick={() => togglePauseResume(c)}
                                    disabled={busyId === c.campaign_id}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                                  >
                                    {isPaused ? "Resume" : "Pause"}
                                  </button>
                                )}
                                <button
                                  onClick={() => openEdit(c)}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => openHistory(c)}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                                >
                                  History
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(c)}
                                  disabled={busyId === c.campaign_id}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50"
                                  style={{ background: "rgba(255,69,58,0.12)", border: "1px solid rgba(255,69,58,0.3)", color: "#FF6B6B" }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* More tools preview grid */}
        <div>
          <p className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wider mb-3">More tools on the way</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: "🤖", title: "Content Idea Generator", desc: "AI suggests post ideas based on your niche and what's trending in the community." },
              { icon: "📊", title: "Audience Insights Agent", desc: "Weekly digest of which content performs best and when your audience is most active." },
              { icon: "✍️", title: "Caption Rewriter", desc: "Turn a rough description into polished bilingual captions in one click." },
              { icon: "📅", title: "Auto-Scheduler", desc: "Queue posts across platforms and let the agent pick the optimal publish times." },
            ].map(tool => (
              <div key={tool.title} className="rounded-xl p-4 relative" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span className="absolute top-3 right-3 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>Soon</span>
                <div className="text-xl mb-2">{tool.icon}</div>
                <p className="text-xs font-bold text-white">{tool.title}</p>
                <p className="text-xs text-pnp-textSecondary mt-1 leading-relaxed pr-12">{tool.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create / Edit modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => !saving && setShowEditor(false)}>
          <div
            className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: "#0F1116", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white">{editing ? "Edit Campaign" : "New Campaign"}</h3>
            <p className="text-xs text-pnp-textSecondary mt-1">The AI agent will follow these instructions to post on your behalf.</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-white/80">Name</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Daily promo posts"
                  className="mt-1.5 w-full px-3 py-2 rounded-lg text-sm text-white bg-transparent"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-white/80">Topic / Instructions</label>
                <textarea
                  value={formTopic}
                  onChange={e => setFormTopic(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe what the agent should post about, tone, style, links to include, etc."
                  className="mt-1.5 w-full px-3 py-2 rounded-lg text-sm text-white bg-transparent resize-y"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
                <p className="text-[10px] text-pnp-textSecondary mt-1">{formTopic.length}/2000</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-white/80">Mode</label>
                <div className="mt-1.5 space-y-2">
                  {GROK_MODE_OPTIONS.map(opt => (
                    <label
                      key={opt.value}
                      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
                      style={{
                        background: formGrokMode === opt.value ? "rgba(29,161,242,0.10)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${formGrokMode === opt.value ? "rgba(29,161,242,0.4)" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      <input
                        type="radio"
                        name="grokMode"
                        value={opt.value}
                        checked={formGrokMode === opt.value}
                        onChange={() => setFormGrokMode(opt.value)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">{opt.label}</p>
                        <p className="text-[11px] text-pnp-textSecondary mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-white/80">Language</label>
                <select
                  value={formLanguage}
                  onChange={e => setFormLanguage(e.target.value)}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg text-sm text-white"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {LANGUAGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value} style={{ background: "#0F1116" }}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-white/80">Interval (minutes)</label>
                  <input
                    type="number"
                    min={30}
                    max={1440}
                    value={formInterval}
                    onChange={e => setFormInterval(Math.max(30, Number(e.target.value) || 60))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg text-sm text-white"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                  <p className="text-[10px] text-pnp-textSecondary mt-1">Min 30 minutes between posts.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/80">Active hours</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={formHoursStart}
                      onChange={e => setFormHoursStart(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                      className="w-full px-3 py-2 rounded-lg text-sm text-white"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                    <span className="text-xs text-pnp-textSecondary">to</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={formHoursEnd}
                      onChange={e => setFormHoursEnd(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                      className="w-full px-3 py-2 rounded-lg text-sm text-white"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                  </div>
                  <p className="text-[10px] text-pnp-textSecondary mt-1">24-hour local time (0–23).</p>
                </div>
              </div>

              {formError && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,69,58,0.12)", border: "1px solid rgba(255,69,58,0.3)", color: "#FF6B6B" }}>
                  {formError}
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => setShowEditor(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white/70 disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Cancel
              </button>
              <button
                onClick={submitForm}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #D4007A, #8B0050)" }}
              >
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History drawer */}
      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setHistoryFor(null)}>
          <div
            className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: "#0F1116", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Post History</h3>
                <p className="text-xs text-pnp-textSecondary mt-0.5">{historyFor.name}</p>
              </div>
              <button
                onClick={() => setHistoryFor(null)}
                className="text-white/60 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="mt-5">
              {historyLoading ? (
                <p className="text-sm text-pnp-textSecondary py-6 text-center">Loading…</p>
              ) : historyPosts.length === 0 ? (
                <p className="text-sm text-pnp-textSecondary py-6 text-center">No posts yet.</p>
              ) : (
                <div className="space-y-3">
                  {historyPosts.map(p => {
                    const isSent = p.status === "sent";
                    const isFailed = p.status === "failed";
                    const pillColor = isSent
                      ? { bg: "rgba(52,199,89,0.15)", border: "rgba(52,199,89,0.3)", text: "#34C759" }
                      : isFailed
                        ? { bg: "rgba(255,69,58,0.15)", border: "rgba(255,69,58,0.3)", text: "#FF6B6B" }
                        : { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)", text: "#F59E0B" };
                    return (
                      <div key={p.post_id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: pillColor.bg, border: `1px solid ${pillColor.border}`, color: pillColor.text }}>
                            {p.status}
                          </span>
                          <span className="text-[10px] text-pnp-textSecondary">
                            {p.sent_at ? new Date(p.sent_at).toLocaleString() : p.scheduled_at ? `Scheduled ${new Date(p.scheduled_at).toLocaleString()}` : new Date(p.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-white whitespace-pre-wrap leading-relaxed">{p.text}</p>
                        {p.error_message && (
                          <p className="mt-2 text-[11px]" style={{ color: "#FF6B6B" }}>{p.error_message}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete campaign?"
        message={confirmDelete ? `"${confirmDelete.name}" will be deleted permanently. Scheduled posts will not be sent.` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}

// ── Creator X Campaigns — legacy alias so router doesn't need updating ────────
export { CreatorMyAITools as CreatorXCampaigns };

// ── Creator My Documents Page ─────────────────────────────────────────────────

export function CreatorMyDocuments() {
  const navigate = useNavigate();
  const [setupItems, setSetupItems] = React.useState<Array<{ key: string; done: boolean }>>([]);
  const [consents, setConsents] = React.useState<{
    terms_accepted?: boolean;
    privacy_accepted?: boolean;
    creator_terms_agreed?: boolean;
    content_disclaimer?: boolean;
  } | null>(null);

  React.useEffect(() => {
    getCreatorSetupStatus()
      .then(res => { if (res?.items) setSetupItems(res.items); })
      .catch(() => {});
    getCreatorConsents()
      .then(res => { if (res?.success) setConsents(res.consents ?? res); })
      .catch(() => {});
  }, []);

  const isDone = (key: string) => setupItems.find(i => i.key === key)?.done ?? null;

  const sections: Array<{
    title: string;
    items: Array<{
      title: string;
      description: string;
      status: "accepted" | "verified" | "pending" | null;
      actionLabel: string;
      onAction: () => void;
    }>;
  }> = [
    {
      title: "Platform Agreements",
      items: [
        {
          title: "PNPtv! Terms of Service",
          description: "Usage rules, community standards, and how disputes are handled.",
          status: consents?.terms_accepted ? "accepted" : null,
          actionLabel: "Read",
          onAction: () => window.open("/terms", "_blank"),
        },
        {
          title: "Privacy Policy",
          description: "How PNPtv! collects, uses, and protects your data.",
          status: consents?.privacy_accepted ? "accepted" : null,
          actionLabel: "Read",
          onAction: () => window.open("/privacy", "_blank"),
        },
        {
          title: "Creator Program Terms",
          description: "Revenue split (70/30), payout schedule, content ownership, deactivation policy.",
          status: consents?.creator_terms_agreed || isDone("creator_terms") ? "accepted" : "pending",
          actionLabel: "View & Accept",
          onAction: () => navigate("/creators/consents"),
        },
      ],
    },
    {
      title: "Content Compliance",
      items: [
        {
          title: "Community Guidelines",
          description: "Content rules, channel types, the strike system, and community standards.",
          status: null,
          actionLabel: "Read",
          onAction: () => navigate("/creators/guidelines"),
        },
        {
          title: "Content Disclaimer",
          description: "Confirms all props and substances shown are simulated, for entertainment purposes only.",
          status: consents?.content_disclaimer ? "accepted" : "pending",
          actionLabel: "View & Accept",
          onAction: () => navigate("/creators/consents"),
        },
        {
          title: "2257 Identity Verification",
          description: "Age verification and record-keeping compliance (18 U.S.C. § 2257).",
          status: isDone("identity") ? "verified" : "pending",
          actionLabel: isDone("identity") ? "View" : "Complete",
          onAction: () => navigate("/creators/apply"),
        },
      ],
    },
  ];

  const statusBadge = (status: "accepted" | "verified" | "pending" | null) => {
    if (!status) return null;
    const colors = {
      accepted: { bg: "rgba(52,199,89,0.15)", color: "#34C759", label: "Accepted" },
      verified: { bg: "rgba(94,209,196,0.15)", color: "#5ED1C4", label: "Verified" },
      pending: { bg: "rgba(245,158,11,0.15)", color: "#F59E0B", label: "Pending" },
    };
    const c = colors[status];
    return (
      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.color }}>
        {c.label}
      </span>
    );
  };

  return (
    <>
      <Helmet><title>My Documents — Creator Studio — PNPtv!</title></Helmet>
      <div className="p-4 lg:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">My Documents</h1>
          <p className="text-sm text-pnp-textSecondary mt-1">Your agreements, compliance records, and creator resources.</p>
        </div>

        {sections.map(section => (
          <div key={section.title} className="space-y-2">
            <p className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wider px-1">{section.title}</p>
            {section.items.map(item => (
              <div
                key={item.title}
                className="flex items-center gap-4 p-4 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(212,0,122,0.1)" }}>
                  <svg className="w-4 h-4" style={{ color: "#D4007A" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-pnp-textSecondary mt-0.5 leading-relaxed">{item.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(item.status)}
                  <button
                    onClick={item.onAction}
                    className="text-xs font-semibold transition-colors hover:opacity-80"
                    style={{ color: "#D4007A" }}
                  >
                    {item.actionLabel} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ── My Benefits Page ──────────────────────────────────────────────────────────

export function CreatorBenefits() {
  const comingSoon = [
    {
      icon: "📚",
      title: "English Language Classes",
      description: "Group and 1-on-1 sessions with certified instructors, tailored for the PNP community.",
      accent: "#5ED1C4",
    },
    {
      icon: "🧠",
      title: "Mental Health & Wellness",
      description: "Confidential access to licensed therapists and wellness professionals.",
      accent: "#9B59B6",
    },
    {
      icon: "💰",
      title: "Financial Education",
      description: "Workshops on savings, investing, and managing your creator income responsibly.",
      accent: "#E69138",
    },
    {
      icon: "🏋️",
      title: "Gym Membership Discounts",
      description: "Exclusive discounts at partner gyms and fitness centers.",
      accent: "#3498DB",
    },
  ];

  return (
    <>
      <Helmet><title>My Benefits — Creator Studio — PNPtv!</title></Helmet>
      <div className="p-4 lg:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">My Benefits</h1>
          <p className="text-sm text-pnp-textSecondary mt-1">Exclusive benefits designed to support your success as a PNPtv! creator.</p>
        </div>

        {/* Active benefit */}
        <div>
          <p className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wider mb-3">Active</p>
          <div
            className="rounded-2xl p-5 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.1), rgba(94,209,196,0.06))", border: "1px solid rgba(212,0,122,0.25)" }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at top right, rgba(212,0,122,0.08) 0%, transparent 70%)" }} />
            <div className="relative flex items-start gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-2xl"
                style={{ background: "rgba(212,0,122,0.15)", border: "1px solid rgba(212,0,122,0.25)" }}
              >
                🛡️
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">Customer Support Handling</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(52,199,89,0.15)", color: "#34C759" }}>Active</span>
                </div>
                <p className="text-xs text-pnp-textSecondary mt-2 leading-relaxed">
                  PNPtv! will be responsible for handling any refunds or feedback about your work.
                  We will work together with you to create a{" "}
                  <span className="text-white/80 font-medium">performance improvement plan</span>{" "}
                  designed to boost your success chances. Terms and conditions apply.
                </p>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: "rgba(94,209,196,0.9)" }}>
                  PNPtv! will cover the fee for any refunds requested by members in cases where they are
                  approved per local legislation or our terms and conditions.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Coming soon benefits */}
        <div>
          <p className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wider mb-3">Coming Soon</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {comingSoon.map(benefit => (
              <div
                key={benefit.title}
                className="rounded-xl p-5 relative"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <span
                  className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" }}
                >
                  Coming Soon
                </span>
                <div className="text-2xl mb-3">{benefit.icon}</div>
                <h3 className="text-sm font-bold text-white">{benefit.title}</h3>
                <p className="text-xs text-pnp-textSecondary mt-1 leading-relaxed pr-20">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Creator Tools & Resources ────────────────────────────────────────────────
// A curated shortlist of the software + hardware that most creators rely on.
// PNPtv is not affiliated with any of these; links go straight to the vendor.

type CreatorToolPricing = "Free" | "Freemium" | "Paid";

interface CreatorTool {
  name: string;
  url: string;
  description: string;
  pricing: CreatorToolPricing;
}

interface CreatorToolSection {
  icon: string;
  title: string;
  subtitle: string;
  accent: string;
  tools: CreatorTool[];
}

const CREATOR_TOOL_SECTIONS: CreatorToolSection[] = [
  {
    icon: "📹",
    title: "Filming",
    subtitle: "Broadcast and record video — desktop and mobile.",
    accent: "#D4007A",
    tools: [
      { name: "OBS Studio",        url: "https://obsproject.com/",                         pricing: "Free",     description: "Open-source recorder + broadcaster. The standard for desktop streaming." },
      { name: "Streamlabs Desktop", url: "https://streamlabs.com/",                        pricing: "Freemium", description: "OBS wrapper with overlays, alerts, and one-click scene setup." },
      { name: "Blackmagic Camera",  url: "https://apps.apple.com/app/id6449580241",         pricing: "Free",     description: "Pro-grade video capture on iPhone — manual exposure, focus, LUTs." },
      { name: "Filmic Pro",         url: "https://www.filmicpro.com/",                     pricing: "Paid",     description: "Cinematographer-grade mobile shooting. iOS + Android." },
      { name: "DJI Mimo",           url: "https://www.dji.com/mimo",                       pricing: "Free",     description: "Pairs with DJI mics/gimbals — clean mobile capture on the go." },
    ],
  },
  {
    icon: "🎬",
    title: "Video Editing",
    subtitle: "Cut, color, caption. Pick one and stick with it.",
    accent: "#E69138",
    tools: [
      { name: "CapCut",            url: "https://www.capcut.com/",                          pricing: "Freemium", description: "Mobile + desktop editor with AI subtitles, transitions, and templates." },
      { name: "DaVinci Resolve",   url: "https://www.blackmagicdesign.com/products/davinciresolve", pricing: "Freemium", description: "Hollywood-grade color and edit suite. Free tier covers 99% of creators." },
      { name: "Descript",          url: "https://www.descript.com/",                        pricing: "Freemium", description: "Edit video by editing a transcript. AI voice cleanup + filler-word removal." },
      { name: "InShot",            url: "https://inshot.com/",                              pricing: "Freemium", description: "Fast mobile edits — reels, shorts, quick cuts." },
      { name: "Adobe Premiere Rush", url: "https://www.adobe.com/products/premiere-rush.html", pricing: "Paid",  description: "Mobile-first cross-device editor with Adobe ecosystem sync." },
    ],
  },
  {
    icon: "🖼️",
    title: "Photo & Thumbnails",
    subtitle: "Cover art, promo cards, retouch.",
    accent: "#5ED1C4",
    tools: [
      { name: "Canva",             url: "https://www.canva.com/",                           pricing: "Freemium", description: "Templates for thumbnails, banners, story cards, posters." },
      { name: "Snapseed",          url: "https://snapseed.online/",                         pricing: "Free",     description: "Free mobile photo editor by Google — pro-level tools, no watermark." },
      { name: "Lightroom Mobile",  url: "https://www.adobe.com/products/photoshop-lightroom-mobile.html", pricing: "Freemium", description: "Color grading + presets on phone. Great for matching your brand look." },
      { name: "Remove.bg",         url: "https://www.remove.bg/",                           pricing: "Freemium", description: "One-click background removal — perfect for stickers, thumbnails, cutouts." },
      { name: "Photopea",          url: "https://www.photopea.com/",                        pricing: "Free",     description: "Browser-based Photoshop clone. Opens PSDs. No signup." },
    ],
  },
  {
    icon: "🎧",
    title: "Audio",
    subtitle: "Clean voice = professional feel.",
    accent: "#9B59B6",
    tools: [
      { name: "Audacity",          url: "https://www.audacityteam.org/",                    pricing: "Free",     description: "Free desktop audio editor — noise reduction, EQ, multi-track." },
      { name: "Adobe Podcast (Enhance)", url: "https://podcast.adobe.com/enhance",          pricing: "Free",     description: "AI voice enhancer — makes any recording sound studio-quality in one click." },
      { name: "Riverside.fm",      url: "https://riverside.fm/",                            pricing: "Freemium", description: "Remote recording with separate audio tracks per guest. Great for collabs." },
      { name: "GarageBand",        url: "https://www.apple.com/mac/garageband/",            pricing: "Free",     description: "macOS + iOS audio production. Loops, effects, mixing." },
      { name: "Krisp",             url: "https://krisp.ai/",                                pricing: "Freemium", description: "Real-time background noise + echo removal for live calls and streams." },
    ],
  },
  {
    icon: "🎥",
    title: "Hardware Essentials",
    subtitle: "The physical gear that makes the biggest visible difference.",
    accent: "#3498DB",
    tools: [
      { name: "Ring light (Neewer 18\")", url: "https://neewer.com/",                       pricing: "Paid",     description: "Even, flattering front light. Adjustable color temperature. ~$50–120." },
      { name: "Key light (Elgato Key Light Air)", url: "https://www.elgato.com/us/en/p/key-light-air", pricing: "Paid", description: "Studio-quality LED panel controlled from your phone. ~$130." },
      { name: "Tripod (Manfrotto / Joby GorillaPod)", url: "https://joby.com/us-en/gorillapod/", pricing: "Paid", description: "Sturdy base for phone or camera. GorillaPod wraps anywhere. ~$30–100." },
      { name: "Wireless lav mic (DJI Mic / Rode Wireless GO II)", url: "https://www.rode.com/microphones/wireless/wirelessgoii", pricing: "Paid", description: "Clean, close audio without cables. Battery-powered. ~$150–300." },
      { name: "Green screen (Elgato Collapsible)", url: "https://www.elgato.com/us/en/p/green-screen", pricing: "Paid", description: "Pop-up chroma-key backdrop. Sets up in seconds. ~$150." },
    ],
  },
  {
    icon: "🤖",
    title: "AI Tools",
    subtitle: "Ship faster. Captions, cleanup, ideation.",
    accent: "#FFB454",
    tools: [
      { name: "Runway ML",         url: "https://runwayml.com/",                            pricing: "Freemium", description: "AI video — bg removal, inpainting, generative fill, motion tracking." },
      { name: "ElevenLabs",        url: "https://elevenlabs.io/",                           pricing: "Freemium", description: "Best-in-class voice cloning + text-to-speech. Great for intros/outros." },
      { name: "Cleanup.pictures",  url: "https://cleanup.pictures/",                        pricing: "Freemium", description: "Erase objects, watermarks, or people from photos with one brushstroke." },
      { name: "Whisper (via MacWhisper)", url: "https://goodsnooze.gumroad.com/l/macwhisper", pricing: "Freemium", description: "Fast, private transcription on your own machine. Export SRT captions." },
      { name: "ChatGPT / Grok",    url: "https://chat.openai.com/",                         pricing: "Freemium", description: "Captions, hooks, hashtag research, DM script drafting." },
    ],
  },
];

const PRICING_BADGE_STYLE: Record<CreatorToolPricing, { bg: string; color: string; border: string }> = {
  Free:     { bg: "rgba(52,199,89,0.12)",  color: "#34C759",  border: "rgba(52,199,89,0.25)" },
  Freemium: { bg: "rgba(59,130,246,0.12)", color: "#60A5FA",  border: "rgba(59,130,246,0.25)" },
  Paid:     { bg: "rgba(245,158,11,0.12)", color: "#F59E0B",  border: "rgba(245,158,11,0.25)" },
};

export function CreatorTools() {
  return (
    <>
      <Helmet><title>Tools — Creator Studio — PNPtv!</title></Helmet>
      <div className="p-4 lg:p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Creator Tools & Resources</h1>
          <p className="text-sm text-pnp-textSecondary mt-1">
            A curated shortlist of the software and gear most creators rely on. Every link opens the vendor directly — PNPtv is not affiliated and earns nothing from your choice.
          </p>
        </div>

        {CREATOR_TOOL_SECTIONS.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
                style={{ background: `${section.accent}22`, border: `1px solid ${section.accent}40` }}
              >
                {section.icon}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white leading-tight">{section.title}</h2>
                <p className="text-xs text-pnp-textSecondary mt-0.5">{section.subtitle}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {section.tools.map((tool) => {
                const badge = PRICING_BADGE_STYLE[tool.pricing];
                return (
                  <a
                    key={tool.name}
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="group rounded-xl p-4 transition-colors hover:brightness-110"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white leading-tight">{tool.name}</h3>
                      <span
                        className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0"
                        style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
                      >
                        {tool.pricing}
                      </span>
                    </div>
                    <p className="text-xs text-pnp-textSecondary mt-1.5 leading-relaxed">{tool.description}</p>
                    <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold" style={{ color: section.accent }}>
                      Open
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        ))}

        <p className="text-[11px] text-pnp-textSecondary/70 text-center pt-2">
          Suggestion for the list? Message support and we'll consider it.
        </p>
      </div>
    </>
  );
}
