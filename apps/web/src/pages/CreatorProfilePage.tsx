/**
 * CreatorProfilePage — canonical creator profile at /c/:username
 *
 * Layout matches mockup screen 4 (design-handoff/pnptv_app/screens-a.jsx).
 * Both public visitors AND creator self-view render this page — Profile.tsx
 * redirects active creators here. Edit affordances live in Creator Studio.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ChevronLeft,
  CheckCircle2,
  MoreVertical,
  MessageCircle,
  Flag,
  Ban,
  Gift,
  Check,
  Pencil,
  ChevronDown,
  ChevronUp,
  Diamond,
  X,
} from "lucide-react";
import {
  getPublicCreatorProfile,
  getPublicProfile,
  getCreatorManual,
  blockUser,
  unblockUser,
  isUserBlocked,
  createUserReport,
  togglePostLike,
  type CreatorPublicProfile,
  type SocialPostItem,
  type ReportCategory,
  type ViewerCreatorSubscription,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { BookCallModal } from "@/components/creators/BookCallModal";
import CreatorSubscribeWizard from "@/components/creators/CreatorSubscribeWizard";
import PostCard from "@/components/profile/PostCard";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(usd);
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  harassment: "Acoso",
  hate: "Discurso de odio",
  spam_scam: "Spam o estafa",
  impersonation: "Suplantación",
  nudity_nonconsensual: "Desnudez no consentida",
  csam: "Menores",
  self_harm: "Autolesión",
  other: "Otro",
};

// Ice/Crystal/Diamond tier labels removed 2026-07-24 — creators set their own
// price. Subscribe wizard moved to the shared CreatorSubscribeWizard component.

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CreatorProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const [data, setData] = useState<CreatorPublicProfile | null>(null);
  const [posts, setPosts] = useState<SocialPostItem[]>([]);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [manualMarkdown, setManualMarkdown] = useState<string>("");
  const [manualLoaded, setManualLoaded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [viewerSub, setViewerSub] = useState<ViewerCreatorSubscription | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);
  const [showSubInfoModal, setShowSubInfoModal] = useState(false);

  const [showSubscribePanel, setShowSubscribePanel] = useState(false);
  const [showBookCall, setShowBookCall] = useState(false);
  const [bookCallDuration, setBookCallDuration] = useState<30 | 60>(30);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory | "">("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Load creator profile
  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(null);
    getPublicCreatorProfile(username)
      .then((res) => {
        setData(res);
        setIsSubscribed(!!res.isSubscribed);
        setViewerSub(res.viewerSubscription || null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Creator not found");
      })
      .finally(() => setLoading(false));
  }, [username]);

  // Load posts + block status once we have creator ID
  useEffect(() => {
    if (!data?.creator?.id) return;
    const creatorId = data.creator.id;
    setPostsLoading(true);
    getPublicProfile(creatorId)
      .then((res) => {
        setPosts(res.posts || []);
        setPostsCursor(res.nextCursor);
      })
      .catch(() => {})
      .finally(() => setPostsLoading(false));

    if (isAuthenticated && String(user?.dbId || user?.id) !== creatorId) {
      isUserBlocked(creatorId)
        .then((r) => { if (r.success) setIsBlocked(r.isBlocked); })
        .catch(() => {});
    }
  }, [data?.creator?.id, isAuthenticated, user?.dbId, user?.id]);

  // Load manual lazily when the collapsible card is first expanded
  useEffect(() => {
    if (!manualExpanded || manualLoaded || !data?.creator?.id) return;
    getCreatorManual(data.creator.id)
      .then((res) => setManualMarkdown(res.markdown || ""))
      .catch(() => setManualMarkdown(""))
      .finally(() => setManualLoaded(true));
  }, [manualExpanded, manualLoaded, data?.creator?.id]);

  // Close kebab on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const isOwnProfile = useMemo(() => {
    if (!data || !user) return false;
    return String(user.dbId || user.id) === data.creator.id
      || (!!user.username && data.creator.username?.toLowerCase() === user.username.toLowerCase());
  }, [data, user]);

  // Special-treatment creators (e.g. Santino) unlock via platform PRIME
  // entitlement instead of a per-creator subscription. Signal: their canonical
  // channel has access_type='prime'. In that case a viewer with tier='prime'
  // unlocks everything and the Subscribe CTA points to /subscribe (PRIME plan)
  // instead of the creator monthly flow.
  const isPrimeCreator = data?.channels?.[0]?.access_type === "prime";
  const viewerHasPrime = ((user?.tier as string) || "").toLowerCase() === "prime";
  const viewerUnlocked = isSubscribed || (isPrimeCreator && viewerHasPrime);

  const canSeeExclusives = viewerUnlocked || isOwnProfile || user?.role === "admin" || user?.role === "superadmin";

  // Load more posts
  const loadMorePosts = useCallback(async () => {
    if (!data?.creator?.id || !postsCursor || postsLoading) return;
    setPostsLoading(true);
    try {
      const res = await getPublicProfile(data.creator.id, postsCursor);
      setPosts((prev) => [...prev, ...(res.posts || [])]);
      setPostsCursor(res.nextCursor);
    } catch { /* ignore */ }
    finally { setPostsLoading(false); }
  }, [data?.creator?.id, postsCursor, postsLoading]);

  // Actions
  function handleSubscribeCta() {
    if (!isAuthenticated) { navigate("/login"); return; }
    setShowSubscribePanel((v) => !v);
  }

  function handleSubscribeSuccess() {
    setIsSubscribed(true);
    setShowSubscribePanel(false);
    // Re-fetch posts to unblur exclusives
    if (data?.creator?.id) {
      getPublicProfile(data.creator.id)
        .then((res) => { setPosts(res.posts || []); setPostsCursor(res.nextCursor); })
        .catch(() => {});
    }
  }

  function handleBookCall(duration: 30 | 60) {
    if (!isAuthenticated) { navigate("/login"); return; }
    setBookCallDuration(duration);
    setShowBookCall(true);
  }

  function handleHangout() {
    if (!data) return;
    if (data.hangouts?.[0]) {
      if (viewerUnlocked || isOwnProfile) navigate(`/hangouts/${data.hangouts[0].id}`);
      else if (isPrimeCreator) navigate("/subscribe");
      else handleSubscribeCta();
    } else if (isPrimeCreator) {
      navigate("/subscribe");
    } else {
      handleSubscribeCta();
    }
  }

  // Rule (2026-07-24): Message → creator DM, only for active subscribers
  // (or the creator viewing themselves). Non-subscribers get the Subscribe
  // panel. No more "Hang with X" button — moved into the subscribed pill row.
  // PRIME-gated creators (Santino) unlock via PRIME entitlement too.
  function handleMessage() {
    if (!data) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    if (!viewerUnlocked && !isOwnProfile) {
      if (isPrimeCreator) navigate("/subscribe");
      else handleSubscribeCta();
      return;
    }
    navigate(`/dm/${data.creator.id}`);
    setMenuOpen(false);
  }

  async function handleToggleBlock() {
    if (!data) return;
    setBlockLoading(true);
    try {
      if (isBlocked) { await unblockUser(data.creator.id); setIsBlocked(false); }
      else { await blockUser(data.creator.id); setIsBlocked(true); }
      setShowBlockConfirm(false);
      setMenuOpen(false);
    } catch { /* silent */ }
    finally { setBlockLoading(false); }
  }

  async function handleSubmitReport() {
    if (!data || !reportCategory || reportSending) return;
    setReportSending(true);
    setReportError(null);
    try {
      const res = await createUserReport({
        reportedUserId: data.creator.id,
        category: reportCategory,
        description: reportDescription.trim() || undefined,
        evidenceType: "profile",
        evidenceId: data.creator.id,
      });
      if (res.success) setReportSent(true);
      else setReportError(res.error || "No se pudo enviar el reporte.");
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "No se pudo enviar el reporte.");
    } finally {
      setReportSending(false);
    }
  }

  async function handleLike(postId: number) {
    try {
      const res = await togglePostLike(postId);
      setPosts((prev) => prev.map((p) => (
        Number(p.id) === postId
          ? { ...p, liked_by_me: res.liked, likes_count: res.likes_count ?? p.likes_count }
          : p
      )));
    } catch { /* ignore */ }
  }

  function handleAuthorTap(userId: string) {
    navigate(`/profile/${userId}`);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--pnp-bg, #121212)" }}>
        <div className="animate-pulse text-white/40">Cargando…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6" style={{ background: "var(--pnp-bg, #121212)" }}>
        <p className="text-white/60 text-sm">{error || "Creator not found"}</p>
        <button onClick={() => navigate("/")} className="text-sm underline" style={{ color: "var(--pnp-accent, #D4007A)" }}>
          Volver al inicio
        </button>
      </div>
    );
  }

  const { creator } = data;
  const displayName = creator.first_name || creator.username;
  // Legacy Ice/Crystal/Diamond tier label removed 2026-07-24 — creators set
  // their own price. CTA copy prioritises the concrete offer: price + content
  // volume + benefit summary.
  const videoSummary = (() => {
    const vc = creator.videoCount ?? 0;
    const vm = creator.videoMinutes ?? 0;
    if (vc <= 0) return "";
    if (vm > 0) return ` — ${vc} ${vc === 1 ? "video" : "videos"} · ${vm} min`;
    return ` — ${vc} ${vc === 1 ? "video" : "videos"}`;
  })();
  const subscribeLabel = `Subscribe · ${formatPrice(creator.creator_price_usd)}/mo${videoSummary}`;

  return (
    <>
      <Helmet>
        <title>{displayName} · PNPtv!</title>
        <meta name="description" content={creator.bio || `${displayName} on PNPtv!`} />
      </Helmet>

      <div className="min-h-screen flex flex-col" style={{ background: "var(--pnp-bg, #121212)", color: "#fff" }}>
        {/* ── Cover + avatar overlay ─────────────────────────────────── */}
        <div className="relative">
          <div
            className="w-full"
            style={{
              height: 140,
              background: creator.cover_url
                ? `url(${creator.cover_url}) center/cover no-repeat`
                : "linear-gradient(135deg, #2a2a2a, #1a1a1a)",
            }}
          />
          {/* Back button */}
          <button
            onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
            aria-label="Back"
            className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(30,30,30,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
          {/* Kebab / Edit */}
          <div className="absolute top-3 right-3" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More"
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(30,30,30,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <MoreVertical size={18} className="text-white" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-11 min-w-[180px] rounded-xl overflow-hidden z-30"
                style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
              >
                {isOwnProfile ? (
                  <Link
                    to="/creator?tab=settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/5"
                  >
                    <Pencil size={14} /> Edit profile
                  </Link>
                ) : (
                  <>
                    <button
                      onClick={handleMessage}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/5"
                    >
                      <MessageCircle size={14} /> Message
                    </button>
                    {creator.amazon_wishlist_url && (
                      <a
                        href={creator.amazon_wishlist_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/5"
                      >
                        <Gift size={14} /> Wishlist
                      </a>
                    )}
                    <button
                      onClick={() => { setMenuOpen(false); setShowReportModal(true); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/5"
                    >
                      <Flag size={14} /> Report
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); setShowBlockConfirm(true); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm hover:bg-white/5"
                      style={{ color: "#FF6B6B" }}
                    >
                      <Ban size={14} /> {isBlocked ? "Unblock" : "Block"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Avatar overlap (78px per mockup; xl=80 rounds cleanly) */}
          <div className="absolute left-4" style={{ bottom: -34 }}>
            <div
              className="rounded-full"
              style={{
                padding: 3,
                background: "var(--pnp-bg, #121212)",
                boxShadow: "0 0 0 2px var(--pnp-accent, #D4007A)",
              }}
            >
              <UserAvatar
                userId={creator.id}
                photoUrl={creator.photo_url}
                displayName={creator.first_name || creator.username}
                size="xl"
                showOnline={false}
                linkToProfile={false}
              />
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="flex-1 px-4 pb-24" style={{ paddingTop: 44 }}>
          {/* Identity row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[18px] font-bold text-white truncate">{displayName}</span>
                {creator.creator_verified && (
                  <span
                    className="inline-flex items-center justify-center rounded-full w-5 h-5 shrink-0"
                    style={{ background: "var(--pnp-accent, #D4007A)" }}
                    aria-label="Verified"
                  >
                    <CheckCircle2 size={12} className="text-white" strokeWidth={3} />
                  </span>
                )}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                @{creator.username}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                onClick={handleMessage}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-opacity hover:opacity-90 flex items-center gap-1.5"
                style={{ borderColor: "rgba(255,255,255,0.15)", color: "#fff", background: "transparent" }}
              >
                <MessageCircle size={12} />
                Message
              </button>
              {!viewerUnlocked && !isOwnProfile && (
                <span className="text-[9px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {isPrimeCreator ? "🔒 PRIME members only" : "🔒 Subscribers only"}
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-5 py-4">
            <div>
              <div className="text-[15px] font-bold text-white">{formatCompact(creator.postCount || 0)}</div>
              <div className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Posts</div>
            </div>
            <div>
              <div className="text-[15px] font-bold text-white">{formatCompact(creator.creator_subscriber_count || 0)}</div>
              <div className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Subscribers</div>
            </div>
            <div>
              <div className="text-[15px] font-bold text-white">{formatCompact(creator.followerCount || 0)}</div>
              <div className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Followers</div>
            </div>
            <div>
              <div className="text-[15px] font-bold text-white">{formatCompact(creator.completedCallsCount || 0)}</div>
              <div className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Calls done</div>
            </div>
          </div>

          {/* Bio */}
          {creator.bio && (
            <p className="text-[13px] leading-relaxed text-white mb-4">{creator.bio}</p>
          )}

          {/* Inline CreatorSubscribeWizard opens above the subscribe CTA when
              tapped. Same widget used in the feed banner and channel paywall. */}
          {showSubscribePanel && !isSubscribed && !isOwnProfile && !isPrimeCreator && (
            <div className="mb-3">
              <CreatorSubscribeWizard
                creatorId={creator.id}
                creatorName={creator.first_name || creator.username}
                username={creator.username}
                priceUsd={creator.creator_price_usd}
                lang={((user?.language as "en" | "es") || "en")}
                onSuccess={handleSubscribeSuccess}
                onClose={() => setShowSubscribePanel(false)}
                returnUrl={`/c/${creator.username}`}
              />
            </div>
          )}

          {/* CTA stack — 2026-07-24: subscribed users see two pills instead
              of the plain Subscribe button. Left pill opens sub-info modal,
              right pill enters the creator's private hangout.
              PRIME-gated creators (Santino): CTA points to /subscribe (PRIME plan)
              and viewers with active PRIME see the "PRIME Access" pill instead
              of a per-creator sub. */}
          {!isOwnProfile && !viewerUnlocked && (
            <button
              onClick={() => {
                if (isPrimeCreator) navigate("/subscribe");
                else handleSubscribeCta();
              }}
              className="w-full py-3 rounded-xl text-sm font-bold text-white mb-2.5 transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {isPrimeCreator
                ? `Unlock with PRIME 💎`
                : subscribeLabel}
            </button>
          )}
          {viewerUnlocked && !isOwnProfile && (
            <div className="flex gap-2.5 mb-2.5">
              <button
                onClick={() => (isPrimeCreator && !isSubscribed
                  ? navigate("/subscribe")
                  : setShowSubInfoModal(true))}
                className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                style={{
                  background: "rgba(52,199,89,0.14)",
                  color: "#34C759",
                  border: "1px solid rgba(52,199,89,0.3)",
                }}
              >
                <Check size={14} strokeWidth={3} />
                {isPrimeCreator && !isSubscribed ? "PRIME Access" : "Subscribed"}
              </button>
              <button
                onClick={handleHangout}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
              >
                Private Hangout
              </button>
            </div>
          )}
          {isOwnProfile && (
            <button
              onClick={() => navigate("/creator?tab=settings")}
              className="w-full py-3 rounded-xl text-sm font-bold text-white mb-2.5 border transition-opacity hover:opacity-90"
              style={{ borderColor: "rgba(255,255,255,0.15)", background: "transparent" }}
            >
              <Pencil size={14} className="inline mr-2" /> Edit profile & settings
            </button>
          )}

          <div className="flex gap-2.5 mb-4">
            <button
              onClick={() => handleBookCall(30)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-90"
              style={{ borderColor: "rgba(255,255,255,0.15)", color: "#fff", background: "transparent" }}
            >
              Book 30 min call
            </button>
            <button
              onClick={() => handleBookCall(60)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-90"
              style={{ borderColor: "rgba(255,255,255,0.15)", color: "#fff", background: "transparent" }}
            >
              Book 60 min call
            </button>
          </div>

          {/* Channel deep-link — takes subscribers straight to the videos in
              the creator's canonical channel (skips the /channels landing).
              Button label uses the actual channel name. PRIME-gated channels
              (Santino) get a 💎 marker to signal the access tier. */}
          {data.channels && data.channels[0] && (() => {
            const ch = data.channels[0];
            const isPrimeCh = ch.access_type === "prime";
            return (
              <button
                onClick={() => navigate(`/channels?channel=${encodeURIComponent(ch.slug)}`)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold mb-4 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{
                  background: "rgba(212,0,122,0.10)",
                  color: "#fff",
                  border: "1px solid rgba(212,0,122,0.25)",
                }}
                aria-label={`Ver videos de ${ch.name}`}
              >
                <span>{isPrimeCh ? "💎" : "▶"}</span>
                <span className="truncate">{ch.name}</span>
              </button>
            );
          })()}

          {/* About me — collapsible card above the wall */}
          <div
            className="rounded-xl mb-4 overflow-hidden"
            style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid var(--pnp-border, #2a2a2a)" }}
          >
            <button
              onClick={() => setManualExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              aria-expanded={manualExpanded}
            >
              <span className="text-sm font-semibold text-white">About me</span>
              {manualExpanded
                ? <ChevronUp size={16} className="text-white/60" />
                : <ChevronDown size={16} className="text-white/60" />}
            </button>
            {manualExpanded && (
              <div className="px-4 pb-4">
                {!manualLoaded ? (
                  <div className="py-3 text-xs text-white/40">Cargando…</div>
                ) : manualMarkdown ? (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-white/90">
                    {manualMarkdown}
                  </div>
                ) : (
                  <div className="py-3 text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {isOwnProfile
                      ? "Aún no has publicado tu About me. Ve a Studio → Settings para redactarlo (con ayuda de la IA)."
                      : "Este creador aún no ha publicado su About me."}
                    {isOwnProfile && (
                      <button
                        onClick={() => navigate("/creator?tab=settings")}
                        className="ml-2 underline"
                        style={{ color: "var(--pnp-accent, #D4007A)" }}
                      >
                        Redactar ahora
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          {/* Wall — single chronological list of every post. Exclusive posts
              are locked for non-subscribers (with Subscribe CTA); unlocked
              exclusives get a small 💎 PAID badge so viewers know it's
              premium content they've unlocked. */}
          <div className="space-y-3">
            {postsLoading && posts.length === 0 && (
              <div className="text-center py-8 text-white/40 text-sm">Cargando…</div>
            )}
            {!postsLoading && posts.length === 0 && (
              <div
                className="text-center py-10 rounded-xl"
                style={{ background: "var(--pnp-surface, #1e1e1e)", color: "var(--pnp-text-secondary, #8E8E93)" }}
              >
                <p className="text-sm">Aún no hay publicaciones.</p>
              </div>
            )}
            {posts.map((post) => {
              const isExclusiveUnlocked = post.is_exclusive && !post.content_locked;
              return (
                <div key={post.id} className="relative">
                  {isExclusiveUnlocked && (
                    <span
                      className="absolute z-10 top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-lg"
                      style={{
                        background: "linear-gradient(135deg, #D4007A, #E69138)",
                        color: "#fff",
                      }}
                      aria-label="Paid content — unlocked"
                    >
                      <Diamond size={10} />
                      PAID
                    </span>
                  )}
                  <PostCard
                    post={post}
                    isOwn={String(user?.dbId || user?.id) === post.author_id}
                    isAdmin={user?.role === "admin" || user?.role === "superadmin"}
                    isOwnProfile={isOwnProfile}
                    isSubscribed={canSeeExclusives}
                    creatorPriceUsd={creator.creator_price_usd}
                    currentUserId={String(user?.dbId || user?.id || "")}
                    userLang={(user?.language as string) || "en"}
                    onLike={handleLike}
                    onDelete={() => { /* delete from Studio, not here */ }}
                    onAuthorTap={handleAuthorTap}
                    onSubscribeCta={handleSubscribeCta}
                    hideCreatorCta
                  />
                </div>
              );
            })}
            {postsCursor && (
              <button
                onClick={loadMorePosts}
                disabled={postsLoading}
                className="w-full py-2.5 rounded-xl text-xs font-medium mt-2 transition-opacity disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.06)", color: "#fff" }}
              >
                {postsLoading ? "Cargando…" : "Cargar más"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Subscription info modal (opened from the Subscribed pill) ─── */}
      {showSubInfoModal && viewerSub && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setShowSubInfoModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "var(--pnp-surface-raised, #1e1e2e)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Your subscription</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  to @{creator.username}
                </p>
              </div>
              <button
                onClick={() => setShowSubInfoModal(false)}
                aria-label="Close"
                className="text-white/60 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Amount paid</dt>
                <dd className="text-white font-semibold">{formatPrice(viewerSub.price_usd)} / 30 days</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Subscriber since</dt>
                <dd className="text-white">{new Date(viewerSub.since).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Expires</dt>
                <dd className="text-white">{new Date(viewerSub.expires_at).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Auto-renewal</dt>
                <dd className="text-white">Off — renew manually anytime</dd>
              </div>
            </dl>

            <div className="mt-5 space-y-2">
              <button
                onClick={() => { setShowSubInfoModal(false); handleSubscribeCta(); }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
              >
                Renew for another 30 days
              </button>
              <button
                onClick={() => navigate("/creator-subscriptions")}
                className="w-full py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
                style={{ color: "#8E8E93" }}
              >
                Manage all subscriptions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Book Call Modal ────────────────────────────────────────────── */}
      {showBookCall && data && (
        <BookCallModal
          creator={{
            id: creator.id,
            username: creator.username,
            photo_url: creator.photo_url,
            creator_type: (creator.creator_type as never) || "diamond",
            creator_price_usd: creator.creator_price_usd,
            bio: creator.bio,
          }}
          isOnline={false}
          open={showBookCall}
          onClose={() => setShowBookCall(false)}
          initialDuration={bookCallDuration}
          skipPackageStep
        />
      )}

      {/* ── Block confirm modal ────────────────────────────────────────── */}
      {showBlockConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => setShowBlockConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: "var(--pnp-surface-raised, #1e1e2e)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-white text-center">
              {isBlocked ? `¿Desbloquear a ${displayName}?` : `¿Bloquear a ${displayName}?`}
            </h3>
            {!isBlocked && (
              <p className="text-sm text-center" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                No podrán contactarte ni ver tu perfil. Puedes desbloquear en cualquier momento.
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowBlockConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-white/80 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleToggleBlock}
                disabled={blockLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#EF4444" }}
              >
                {blockLoading ? "…" : isBlocked ? "Desbloquear" : "Bloquear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report modal ───────────────────────────────────────────────── */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => !reportSending && setShowReportModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: "var(--pnp-surface-raised, #1e1e2e)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {reportSent ? (
              <div className="text-center space-y-2 py-4">
                <Check size={28} className="text-green-400 mx-auto" aria-hidden="true" />
                <p className="text-sm font-semibold text-white">Reporte enviado</p>
                <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Gracias — nuestro equipo lo revisará.</p>
                <button
                  onClick={() => { setShowReportModal(false); setReportSent(false); setReportCategory(""); setReportDescription(""); }}
                  className="mt-2 px-5 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: "var(--pnp-accent, #D4007A)" }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-base font-bold text-white text-center">Reportar a {displayName}</h3>
                <div className="space-y-2">
                  {(["harassment", "hate", "spam_scam", "impersonation", "nudity_nonconsensual", "csam", "self_harm", "other"] as ReportCategory[]).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setReportCategory(cat)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm text-left border transition-colors"
                      style={
                        reportCategory === cat
                          ? { borderColor: "#FFB454", background: "rgba(255,180,84,0.08)", color: "#fff" }
                          : { borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }
                      }
                    >
                      <span
                        className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                        style={{ borderColor: reportCategory === cat ? "#FFB454" : "rgba(255,255,255,0.25)" }}
                      >
                        {reportCategory === cat && <span className="w-2 h-2 rounded-full" style={{ background: "#FFB454" }} />}
                      </span>
                      {REPORT_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value.slice(0, 500))}
                  placeholder="Detalles adicionales (opcional)"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#EBEBF5", outline: "none" }}
                />
                {reportError && <p className="text-xs" style={{ color: "#FF6B6B" }}>{reportError}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-white/80 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    disabled={!reportCategory || reportSending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ background: "#EF4444" }}
                  >
                    {reportSending ? "Enviando…" : "Enviar reporte"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
