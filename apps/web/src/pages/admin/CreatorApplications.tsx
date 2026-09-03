import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import {
  getCreatorApplications,
  approveCreatorApplication,
  rejectCreatorApplication,
  getCastingApplications,
  reviewCastingApplication,
  getCreatorTriageSummary,
  adminListFeaturedCreators,
  adminUpsertFeaturedCreator,
  adminDeleteFeaturedCreator,
  adminListCrystalCreatorPool,
  adminPreviewFeaturedAlbum,
  adminRunFeaturedPromoNow,
  type CreatorApplication,
  type CastingApplication,
  type CreatorTriageSummary,
  type CreatorRejectionReason,
  type FeaturedCreatorAdminPick,
  type CrystalCreatorPoolEntry,
} from "@/lib/api";

// Rejection-reason picklist — mirrors backend CHECK constraint on
// model_applications.rejection_reason. Feeds Zoho CRM Application_Rejection_Reason
// segment + Rejected_Applicants Campaigns list for nurture.
const REJECTION_REASONS: { value: CreatorRejectionReason; label: string }[] = [
  { value: "identity_issue",            label: "Identity issue (ID unclear / mismatched)" },
  { value: "underage_docs",             label: "Underage documents" },
  { value: "duplicate_account",         label: "Duplicate account" },
  { value: "off_platform_solicitation", label: "Off-platform solicitation" },
  { value: "incomplete_docs",           label: "Incomplete documents" },
  { value: "other",                     label: "Other (see notes)" },
];
import ActiveCreatorsTab from "@/components/admin/ActiveCreatorsTab";
import EnrollmentsList from "@/components/admin/EnrollmentsList";

function resolvePhotoUrl(photo: string | null | undefined): string | null {
  if (!photo || typeof photo !== "string") return null;
  if (photo.startsWith("/") || photo.startsWith("http")) return photo;
  return null;
}

function getTypeLabels(t: ReturnType<typeof useI18n>["admin"]): Record<string, string> {
  return {
    live: t.creators.livePerformer,
    content_creator: t.creators.contentCreator,
    both: t.creators.liveAndContent,
    ice: "Ice",
    crystal: "Crystal",
    diamond: "Diamond",
    occasional: "Occasional",
    full_time: "Full Time",
  };
}

/** Returns "X days ago", "X hours ago", "just now" etc. */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (isNaN(diffMs)) return "";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  return `${diffMonths} months ago`;
}

/** Sort an array so pending/pending_review items come first, then by created_at DESC. */
function sortPendingFirst<T extends { status: string; created_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aPending = a.status === "pending" || a.status === "pending_review" ? 0 : 1;
    const bPending = b.status === "pending" || b.status === "pending_review" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ── Creator status badge ───────────────────────────────────────────────────────

function CreatorStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const cfg: Record<string, { bg: string; color: string }> = {
    active:         { bg: "rgba(74,222,128,0.14)",   color: "#4ADE80" },
    eligible:       { bg: "rgba(94,209,196,0.14)",   color: "#5ED1C4" },
    pending_review: { bg: "rgba(255,180,84,0.14)",   color: "#FFB454" },
    suspended:      { bg: "rgba(239,68,68,0.14)",    color: "#EF4444" },
  };
  const style = cfg[status] ?? { bg: "rgba(255,255,255,0.08)", color: "#8E8E93" };
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: style.bg, color: style.color }}
      title="Current creator_status"
    >
      {status}
    </span>
  );
}

// ── Triage banner ─────────────────────────────────────────────────────────────

interface TriageChipProps {
  label: string;
  count: number;
  urgency: "error" | "warning" | "amber" | "muted";
}

function TriageChip({ label, count, urgency }: TriageChipProps) {
  const styles: Record<TriageChipProps["urgency"], { bg: string; color: string; border: string }> = {
    error:   { bg: "rgba(239,68,68,0.14)",   color: "#EF4444", border: "rgba(239,68,68,0.3)" },
    warning: { bg: "rgba(255,180,84,0.14)",  color: "#FFB454", border: "rgba(255,180,84,0.3)" },
    amber:   { bg: "rgba(230,145,56,0.14)",  color: "#E69138", border: "rgba(230,145,56,0.3)" },
    muted:   { bg: "rgba(255,255,255,0.04)", color: "#8E8E93", border: "rgba(255,255,255,0.08)" },
  };
  const s = styles[urgency];
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      <span className="text-base font-bold leading-none">{count}</span>
      <span className="opacity-90">{label}</span>
    </div>
  );
}

function TriageBanner({
  triage,
  loading,
}: {
  triage: CreatorTriageSummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-white/5 animate-pulse flex-shrink-0" />
        ))}
      </div>
    );
  }

  if (!triage) return null;

  if (triage.total === 0) {
    return (
      <div
        className="mb-5 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2"
        style={{ background: "rgba(74,222,128,0.10)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.2)" }}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        All clear — no pending actions
      </div>
    );
  }

  return (
    <div className="mb-5">
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "#8E8E93" }}>
        Needs Action
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <TriageChip
          label="Casting"
          count={triage.pendingCasting}
          urgency={triage.pendingCasting > 0 ? "warning" : "muted"}
        />
        <TriageChip
          label="Enrollments"
          count={triage.pendingEnrollments}
          urgency={triage.pendingEnrollments > 0 ? "warning" : "muted"}
        />
        <TriageChip
          label="Applications"
          count={triage.pendingModelApps}
          urgency={triage.pendingModelApps > 0 ? "warning" : "muted"}
        />
        <TriageChip
          label="Identity (2257)"
          count={triage.pending2257}
          urgency={triage.pending2257 > 0 ? "error" : "muted"}
        />
        <TriageChip
          label="Awaiting Activation"
          count={triage.approvedHoldPast48h}
          urgency={triage.approvedHoldPast48h > 0 ? "amber" : "muted"}
        />
      </div>
    </div>
  );
}

// ── Main tab type ─────────────────────────────────────────────────────────────

type MainTab = "applications" | "active" | "enrollments" | "casting" | "featured";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreatorApplications() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const t = useI18n().admin;
  const [mainTab, setMainTab] = useState<MainTab>("applications");
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("pending");
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, CreatorRejectionReason | "">>({});
  const [processing, setProcessing] = useState<string | null>(null);

  // Casting tab state
  const [castingApps, setCastingApps] = useState<CastingApplication[]>([]);
  const [castingCounts, setCastingCounts] = useState<Record<string, number>>({});
  const [castingLoading, setCastingLoading] = useState(true);
  const [castingFilter, setCastingFilter] = useState("pending");
  const [castingNotes, setCastingNotes] = useState<Record<string, string>>({});

  // Triage banner state
  const [triage, setTriage] = useState<CreatorTriageSummary | null>(null);
  const [triageLoading, setTriageLoading] = useState(true);
  const triageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTriage = useCallback(async () => {
    try {
      const data = await getCreatorTriageSummary();
      setTriage(data);
    } catch {
      // Endpoint may not be live yet — silently hide the banner
      setTriage(null);
    } finally {
      setTriageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchTriage();
    triageIntervalRef.current = setInterval(fetchTriage, 60_000);
    return () => {
      if (triageIntervalRef.current) clearInterval(triageIntervalRef.current);
    };
  }, [isAdmin, fetchTriage]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCreatorApplications(filter || undefined);
      // Sort: pending first, then by date desc (backend may already filter by status;
      // this ensures correct order even when "all" is selected)
      setApplications(sortPendingFirst(res.applications));
      if (res.statusCounts) setStatusCounts(res.statusCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isAdmin && mainTab === "applications") load();
  }, [isAdmin, load, mainTab]);

  const loadCasting = useCallback(async () => {
    setCastingLoading(true);
    try {
      const res = await getCastingApplications(castingFilter || undefined);
      setCastingApps(sortPendingFirst(res.applications));
      if (res.statusCounts) setCastingCounts(res.statusCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load casting applications");
    } finally {
      setCastingLoading(false);
    }
  }, [castingFilter]);

  useEffect(() => {
    if (isAdmin && mainTab === "casting") loadCasting();
  }, [isAdmin, loadCasting, mainTab]);

  const handleCastingReview = async (appId: string, decision: "approved" | "rejected") => {
    if (processing) return;
    setProcessing(appId);
    try {
      await reviewCastingApplication(appId, decision, castingNotes[appId]);
      await loadCasting();
      // Refresh triage counts after any action
      fetchTriage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setProcessing(null);
    }
  };

  const handleApprove = async (id: string) => {
    if (processing) return;
    setProcessing(id);
    try {
      await approveCreatorApplication(id, actionNotes[id]);
      await load();
      fetchTriage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (processing) return;
    const reason = rejectReasons[id];
    if (!reason) {
      setError("Pick a rejection reason before rejecting — it feeds Zoho CRM segments.");
      return;
    }
    setProcessing(id);
    try {
      await rejectCreatorApplication(id, actionNotes[id], reason);
      await load();
      fetchTriage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setProcessing(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-white/60">{t.creators.adminRequired}</p>
      </div>
    );
  }

  const TYPE_LABELS = getTypeLabels(t);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button
        onClick={() => navigate("/admin")}
        className="flex items-center gap-2 text-sm mb-4 hover:text-pnp-accent transition-colors"
        style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {t.creators.adminDashboard}
      </button>

      <h1 className="text-2xl font-bold text-white mb-1">{t.creators.title}</h1>
      <p className="text-sm mb-5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
        {t.creators.subtitle}
      </p>

      {/* Triage banner */}
      <TriageBanner triage={triage} loading={triageLoading} />

      {/* Main tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        {(
          [
            { value: "applications", label: t.creators.tabApplications },
            { value: "casting",      label: t.creators.tabCasting },
            { value: "active",       label: t.creators.tabActiveCreators },
            { value: "enrollments",  label: t.creators.tabEnrollments },
            { value: "featured",     label: "Model of the Day" },
          ] as { value: MainTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setMainTab(tab.value)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
            style={
              mainTab === tab.value
                ? {
                    background: "linear-gradient(135deg, rgba(212,0,122,0.25), rgba(230,145,56,0.18))",
                    color: "#fff",
                    border: "1px solid rgba(212,0,122,0.3)",
                  }
                : { color: "var(--pnp-text-secondary, #8E8E93)" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mainTab === "active" ? (
        <ActiveCreatorsTab />
      ) : mainTab === "enrollments" ? (
        <EnrollmentsList />
      ) : mainTab === "featured" ? (
        <FeaturedModelOfTheDayPanel />
      ) : mainTab === "casting" ? (
        <>
          {/* Casting filter tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {[
              { value: "pending",  label: t.shared.pending },
              { value: "approved", label: t.shared.approve },
              { value: "rejected", label: t.shared.reject },
              { value: "",         label: t.shared.all },
            ].map((tab) => {
              const count = tab.value
                ? castingCounts[tab.value]
                : Object.values(castingCounts).reduce((a, b) => a + b, 0);
              return (
                <button
                  key={tab.value}
                  onClick={() => setCastingFilter(tab.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 flex items-center gap-1.5"
                  style={
                    castingFilter === tab.value
                      ? { background: "rgba(212,0,122,0.15)", color: "#D4007A" }
                      : { background: "rgba(255,255,255,0.05)", color: "var(--pnp-text-secondary, #8E8E93)" }
                  }
                >
                  {tab.label}
                  {count != null && count > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: "rgba(255,255,255,0.1)" }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {castingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : castingApps.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/40 text-sm">{t.creators.noCasting}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {castingApps.map((app) => (
                <div key={app.id} className="glass-card-sm p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      {resolvePhotoUrl(app.photo_file_id) ? (
                        <img
                          src={resolvePhotoUrl(app.photo_file_id)!}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff" }}
                        >
                          {(app.first_name || app.username || "?")[0].toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <button
                          onClick={() => navigate(`/profile/${app.user_id}`)}
                          className="text-sm font-semibold text-white hover:underline"
                        >
                          {app.first_name || app.username}
                        </button>
                        {app.username && (
                          <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                            @{app.username}
                          </span>
                        )}
                        {/* Casting application status */}
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background:
                              app.status === "pending"
                                ? "rgba(255,180,84,0.15)"
                                : app.status === "approved"
                                ? "rgba(94,209,196,0.15)"
                                : "rgba(239,68,68,0.15)",
                            color:
                              app.status === "pending"
                                ? "#FFB454"
                                : app.status === "approved"
                                ? "#5ED1C4"
                                : "#EF4444",
                          }}
                        >
                          {app.status}
                        </span>
                        {/* Current creator_status — highlights mismatches */}
                        <CreatorStatusBadge status={app.creator_status} />
                      </div>

                      <p className="text-xs mb-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        Tier: <strong className="text-white">{app.tier}</strong>
                        {" · "}
                        Posts: <strong className="text-white">{app.post_count}</strong>
                        {" · "}
                        Applied:{" "}
                        <span
                          className="text-white"
                          title={new Date(app.created_at).toLocaleDateString()}
                        >
                          {formatRelativeTime(app.created_at)}
                        </span>
                      </p>

                      {app.admin_notes && (
                        <p className="text-xs text-white/50 italic mb-2">Notes: {app.admin_notes}</p>
                      )}

                      {app.status === "pending" && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            placeholder={t.creators.notesPlaceholder}
                            value={castingNotes[app.id] || ""}
                            onChange={(e) =>
                              setCastingNotes((prev) => ({ ...prev, [app.id]: e.target.value }))
                            }
                            style={{ fontSize: "16px" }}
                            className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30 placeholder:text-white/20"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCastingReview(app.id, "approved")}
                              disabled={processing === app.id}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                              style={{
                                background: "rgba(94,209,196,0.15)",
                                color: "#5ED1C4",
                                border: "1px solid rgba(94,209,196,0.3)",
                              }}
                            >
                              {processing === app.id ? t.shared.processing : t.shared.approve}
                            </button>
                            <button
                              onClick={() => handleCastingReview(app.id, "rejected")}
                              disabled={processing === app.id}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                              style={{
                                background: "rgba(239,68,68,0.1)",
                                color: "#EF4444",
                                border: "1px solid rgba(239,68,68,0.2)",
                              }}
                            >
                              {processing === app.id ? t.shared.processing : t.shared.reject}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Applications tab */
        <>
          {error && (
            <div
              className="mb-4 px-4 py-3 rounded-lg text-sm text-red-300"
              style={{ background: "rgba(239,68,68,0.1)" }}
            >
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400">
                Dismiss
              </button>
            </div>
          )}

          {/* Application status filter tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {[
              { value: "pending",  label: t.shared.pending },
              { value: "approved", label: t.shared.approve },
              { value: "rejected", label: t.shared.reject },
              { value: "",         label: t.shared.all },
            ].map((tab) => {
              const count = tab.value
                ? statusCounts[tab.value]
                : Object.values(statusCounts).reduce((a, b) => a + b, 0);
              return (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 flex items-center gap-1.5"
                  style={
                    filter === tab.value
                      ? { background: "rgba(212,0,122,0.15)", color: "#D4007A" }
                      : { background: "rgba(255,255,255,0.05)", color: "var(--pnp-text-secondary, #8E8E93)" }
                  }
                >
                  {tab.label}
                  {count != null && count > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: "rgba(255,255,255,0.1)" }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/40 text-sm">{t.creators.noApplications}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <div key={app.id} className="glass-card-sm p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {resolvePhotoUrl(app.photo_file_id) ? (
                        <img
                          src={resolvePhotoUrl(app.photo_file_id)!}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff" }}
                        >
                          {(app.stage_name || app.first_name || app.username || "?")[0].toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <button
                          onClick={() => navigate(`/profile/${app.user_id}`)}
                          className="text-sm font-semibold text-white hover:underline"
                        >
                          {app.stage_name || app.first_name || app.username}
                        </button>
                        {app.username && (
                          <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                            @{app.username}
                          </span>
                        )}
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background:
                              app.status === "pending"
                                ? "rgba(255,180,84,0.15)"
                                : app.status === "approved"
                                ? "rgba(94,209,196,0.15)"
                                : app.status === "rejected"
                                ? "rgba(239,68,68,0.15)"
                                : "rgba(255,255,255,0.08)",
                            color:
                              app.status === "pending"
                                ? "#FFB454"
                                : app.status === "approved"
                                ? "#5ED1C4"
                                : app.status === "rejected"
                                ? "#EF4444"
                                : "#8E8E93",
                          }}
                        >
                          {app.status}
                        </span>
                      </div>

                      <p className="text-xs mb-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        {t.creators.type}{" "}
                        <strong className="text-white">
                          {TYPE_LABELS[app.application_type] || app.application_type}
                        </strong>
                        {app.requested_price_usd != null && (
                          <>
                            {" · "}
                            {t.creators.price}{" "}
                            <strong className="text-white">
                              ${app.requested_price_usd}{t.creators.perMonth}
                            </strong>
                          </>
                        )}
                        {" · "}
                        {t.creators.submitted}{" "}
                        <span
                          className="text-white"
                          title={new Date(app.created_at).toLocaleDateString()}
                        >
                          {formatRelativeTime(app.created_at)}
                        </span>
                      </p>

                      {app.bio && (
                        <p className="text-xs text-white/70 mb-2 line-clamp-3">{app.bio}</p>
                      )}

                      {app.call_scheduled && (
                        <p className="text-xs mb-2" style={{ color: "#5ED1C4" }}>
                          {t.creators.callScheduled}
                          {app.call_scheduled_at
                            ? ` ${t.creators.onDate.replace("{0}", new Date(app.call_scheduled_at).toLocaleDateString())}`
                            : ""}
                        </p>
                      )}

                      {app.admin_notes && (
                        <p className="text-xs text-white/50 italic mb-2">
                          {t.creators.adminNotes} {app.admin_notes}
                        </p>
                      )}

                      {/* Actions for pending applications */}
                      {app.status === "pending" && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            placeholder={t.creators.notesPlaceholder}
                            value={actionNotes[app.id] || ""}
                            onChange={(e) =>
                              setActionNotes((prev) => ({ ...prev, [app.id]: e.target.value }))
                            }
                            style={{ fontSize: "16px" }}
                            className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30 placeholder:text-white/20"
                          />
                          <select
                            value={rejectReasons[app.id] || ""}
                            onChange={(e) =>
                              setRejectReasons((prev) => ({
                                ...prev,
                                [app.id]: e.target.value as CreatorRejectionReason | "",
                              }))
                            }
                            style={{ fontSize: "14px" }}
                            className="w-full bg-white/5 text-white rounded-lg px-3 py-2 outline-none border border-white/10 focus:border-white/30"
                            title="Required only if rejecting — feeds Zoho CRM segments"
                          >
                            <option value="">— Rejection reason (required to reject) —</option>
                            {REJECTION_REASONS.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(app.id)}
                              disabled={processing === app.id}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                              style={{
                                background: "rgba(94,209,196,0.15)",
                                color: "#5ED1C4",
                                border: "1px solid rgba(94,209,196,0.3)",
                              }}
                            >
                              {processing === app.id ? t.shared.processing : t.shared.approve}
                            </button>
                            <button
                              onClick={() => handleReject(app.id)}
                              disabled={processing === app.id || !rejectReasons[app.id]}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{
                                background: "rgba(239,68,68,0.1)",
                                color: "#EF4444",
                                border: "1px solid rgba(239,68,68,0.2)",
                              }}
                              title={!rejectReasons[app.id] ? "Pick a rejection reason first" : "Reject application"}
                            >
                              {processing === app.id ? t.shared.processing : t.shared.reject}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Featured Model of the Day panel ──────────────────────────────────────────

function todayUtcYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function FeaturedModelOfTheDayPanel() {
  const [pool, setPool] = useState<CrystalCreatorPoolEntry[]>([]);
  const [picks, setPicks] = useState<FeaturedCreatorAdminPick[]>([]);
  const [date, setDate] = useState<string>(todayUtcYmd());
  const [creatorId, setCreatorId] = useState<string>("");
  const [pitchEn, setPitchEn] = useState<string>("");
  const [pitchEs, setPitchEs] = useState<string>("");
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [ctaIntroCall, setCtaIntroCall] = useState<boolean>(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [runSummary, setRunSummary] = useState<Awaited<ReturnType<typeof adminRunFeaturedPromoNow>> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, list] = await Promise.all([
        adminListCrystalCreatorPool(),
        adminListFeaturedCreators(),
      ]);
      setPool(p.creators);
      setPicks(list.picks);
      // Prefill from an existing pick for the current date, if any.
      const existing = list.picks.find((x) => String(x.date).slice(0, 10) === date);
      if (existing) {
        setCreatorId(String(existing.creator_id));
        setPitchEn(existing.pitch_en || "");
        setPitchEs(existing.pitch_es || "");
        setMediaUrl(existing.media_url || "");
        setCtaIntroCall(!!existing.cta_intro_call);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    }
  }, [date]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!creatorId) { setPreview([]); return; }
    setPreviewLoading(true);
    adminPreviewFeaturedAlbum(creatorId)
      .then((r) => setPreview(r.photos || []))
      .catch(() => setPreview([]))
      .finally(() => setPreviewLoading(false));
  }, [creatorId]);

  const handleSave = async () => {
    if (!creatorId || !pitchEn.trim() || !pitchEs.trim()) {
      setError("creator + both pitches required"); return;
    }
    setBusy(true); setStatus(null); setError(null);
    try {
      await adminUpsertFeaturedCreator(date, {
        creatorId, pitchEn, pitchEs,
        mediaUrl: mediaUrl.trim() || null,
        ctaIntroCall,
      });
      setStatus("saved");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete pick for ${date}?`)) return;
    setBusy(true); setStatus(null); setError(null);
    try {
      await adminDeleteFeaturedCreator(date);
      setStatus("deleted");
      setCreatorId(""); setPitchEn(""); setPitchEs(""); setMediaUrl(""); setCtaIntroCall(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete_failed");
    } finally { setBusy(false); }
  };

  const handleRunNow = async () => {
    if (!confirm("Force-run today's promo now? Posts to X and DMs every eligible user.")) return;
    setBusy(true); setStatus(null); setError(null); setRunSummary(null);
    try {
      const summary = await adminRunFeaturedPromoNow();
      setRunSummary(summary);
      setStatus("fired");
    } catch (err) {
      setError(err instanceof Error ? err.message : "run_failed");
    } finally { setBusy(false); }
  };

  const chosen = pool.find((c) => String(c.id) === String(creatorId)) || null;

  return (
    <div className="space-y-6">
      <div className="glass-card-sm p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            <div className="mb-1">Date (UTC)</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
            />
          </label>
          <label className="flex-1 min-w-[180px] text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            <div className="mb-1">Crystal Creator ({pool.length} eligible)</div>
            <select
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
            >
              <option value="">— pick one —</option>
              {pool.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name || c.username || c.id}{c.username ? ` (@${c.username})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            <div className="mb-1">Pitch (EN)</div>
            <textarea
              value={pitchEn}
              onChange={(e) => setPitchEn(e.target.value)}
              rows={3}
              maxLength={220}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
              placeholder="Featured today on PNPtv — the ones setting the pace."
            />
          </label>
          <label className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            <div className="mb-1">Pitch (ES)</div>
            <textarea
              value={pitchEs}
              onChange={(e) => setPitchEs(e.target.value)}
              rows={3}
              maxLength={220}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
              placeholder="Modelo del día en PNPtv — marca el ritmo."
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex-1 min-w-[220px] text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            <div className="mb-1">Media URL override (optional)</div>
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
              placeholder="https://pnptv.app/uploads/..."
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-white/80 pb-1.5">
            <input
              type="checkbox"
              checked={ctaIntroCall}
              onChange={(e) => setCtaIntroCall(e.target.checked)}
            />
            Include intro-call CTA
          </label>
        </div>

        <div>
          <div className="text-xs mb-2" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            Album preview {chosen ? `for ${chosen.first_name || chosen.username || chosen.id}` : ""} — hero uses first pic if no override
          </div>
          {previewLoading ? (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="w-16 h-16 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          ) : preview.length === 0 ? (
            <div className="text-xs text-white/40">
              {creatorId ? "No album pics or channel-video thumbs for this creator." : "Pick a creator to preview."}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {preview.map((url, i) => (
                <img
                  key={url}
                  src={url.startsWith("/") ? url : url}
                  alt=""
                  className="w-16 h-16 rounded object-cover border"
                  style={{ borderColor: i === 0 ? "#D4007A" : "rgba(255,255,255,0.1)" }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: "linear-gradient(135deg, #D4007A, #E69138)", color: "#fff", opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Working…" : "Save pick"}
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)", opacity: busy ? 0.5 : 1 }}
          >
            Delete pick
          </button>
          <button
            onClick={handleRunNow}
            disabled={busy}
            className="px-3 py-1.5 rounded text-xs font-semibold ml-auto"
            style={{ background: "rgba(94,209,196,0.15)", color: "#5ED1C4", border: "1px solid rgba(94,209,196,0.3)", opacity: busy ? 0.5 : 1 }}
            title="Clears today's dedup key + runs the full promo (X + Telegram) immediately"
          >
            Force run now
          </button>
        </div>

        {status && <div className="text-xs text-emerald-400">✓ {status}</div>}
        {error && <div className="text-xs text-red-400">✗ {error}</div>}

        {runSummary && (
          <div className="text-xs text-white/70 bg-white/5 rounded p-2">
            {runSummary.skipped
              ? <>Skipped: {runSummary.skipped}</>
              : <>
                  Fired for <b>{runSummary.creator}</b> ({runSummary.source}) —
                  album:{runSummary.albumSize ?? 0},
                  X:{runSummary.x?.ok ? "✓" : `✗ ${runSummary.x?.reason || ""}`},
                  TG:{runSummary.telegram?.sent ?? 0}/{runSummary.telegram?.total ?? 0} sent
                  {runSummary.telegram?.failed ? ` (${runSummary.telegram.failed} failed)` : ""}
                </>
            }
          </div>
        )}
      </div>

      <div>
        <div className="text-xs mb-2" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
          Last 30 days
        </div>
        <div className="space-y-2">
          {picks.length === 0 ? (
            <div className="text-xs text-white/40">No picks scheduled.</div>
          ) : picks.map((p) => (
            <div
              key={p.date}
              className="glass-card-sm p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5"
              onClick={() => setDate(String(p.date).slice(0, 10))}
            >
              <div className="text-xs text-white/60 w-24">{String(p.date).slice(0, 10)}</div>
              <div className="flex-1 text-sm text-white">
                {p.first_name || p.username || p.creator_id}
                {p.username && <span className="text-white/40 text-xs ml-1">@{p.username}</span>}
              </div>
              {p.cta_intro_call && <div className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400">CTA</div>}
              {p.media_url && <div className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">override</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
