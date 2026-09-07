import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PostComposer } from "@/components/PostComposer";
import SocialPostCard from "@/components/social/SocialPostCard";
import {
  getSocialFeedPosts,
  getPostsByHashtag,
  getHangoutFeed,
  getNewMembers,
  togglePostLike,
  deleteSocialPost,
  updateProfile,
  getMainStageCammers,
  type SocialPostItem,
  type MainStageCammer,
  type FeedFilter,
  type NewMember,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useNearbyDistances } from "@/components/NearbyBadge";
import { getSocket, connectSocket } from "@/lib/socket";

export interface SocialFeedTabsProps {
  currentUserId: string;
  isAdmin: boolean;
  isAuthenticated: boolean;
  userLang?: string;
  viewerCity?: string | null;
  viewerCountry?: string | null;
  contentDisclaimerAccepted: boolean;
  onAcceptDisclaimer: () => Promise<void>;
  onNavigate: (path: string) => void;
  showComposer?: boolean;
  /** When set, the feed only shows posts containing this hashtag (without #) */
  hashtagFilter?: string;
  /** When set, the feed only shows posts from this hangout group */
  hangoutGroupId?: number;
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="glass-card-sm p-4 animate-pulse">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-white/10 rounded w-32" />
              <div className="h-3 bg-white/10 rounded w-full" />
              <div className="h-3 bg-white/10 rounded w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SocialFeedTabs({
  currentUserId,
  isAdmin,
  isAuthenticated,
  userLang = "en",
  viewerCity,
  viewerCountry,
  contentDisclaimerAccepted,
  onAcceptDisclaimer,
  onNavigate,
  showComposer = true,
  hashtagFilter,
  hangoutGroupId,
}: SocialFeedTabsProps) {
  const navigate = useNavigate();
  const { feed: t } = useI18n();

  // All-posts feed state
  const [posts, setPosts] = useState<SocialPostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [freeUserLimited, setFreeUserLimited] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [needsLocation, setNeedsLocation] = useState(false);
  // New-members tab state (separate from posts)
  const [newMembers, setNewMembers] = useState<NewMember[]>([]);
  const [newMembersCursor, setNewMembersCursor] = useState<string | null>(null);
  // Feed tabs. Default = 'latest' (pure chronological). User can pick another
  // tab (persisted in localStorage) and can reorder the tab strip.
  const FEED_STORAGE_KEY = "pnptv:feed:tab";
  const FEED_ORDER_STORAGE_KEY = "pnptv:feed:tabOrder";
  type TabKey = Exclude<FeedFilter, "all">;
  const DEFAULT_TAB_ORDER: TabKey[] = ["latest", "subscribed", "following", "new", "nearby", "hot", "slam"];
  const isTabKey = (v: unknown): v is TabKey =>
    v === "latest" || v === "subscribed" || v === "following" || v === "new" || v === "nearby" || v === "hot" || v === "slam";
  const [feedMode, setFeedMode] = useState<TabKey>(() => {
    try {
      const saved = localStorage.getItem(FEED_STORAGE_KEY);
      if (isTabKey(saved)) return saved;
    } catch { /* ignore */ }
    return "latest";
  });
  const [tabOrder, setTabOrder] = useState<TabKey[]>(() => {
    try {
      const raw = localStorage.getItem(FEED_ORDER_STORAGE_KEY);
      if (!raw) return DEFAULT_TAB_ORDER;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return DEFAULT_TAB_ORDER;
      const kept = parsed.filter(isTabKey) as TabKey[];
      // Append any tab keys the user hasn't seen yet (e.g. we ship a new tab).
      const missing = DEFAULT_TAB_ORDER.filter((k) => !kept.includes(k));
      return [...kept, ...missing];
    } catch {
      return DEFAULT_TAB_ORDER;
    }
  });
  const [isEditingTabs, setIsEditingTabs] = useState(false);
  const dragKeyRef = useRef<TabKey | null>(null);

  const persistTabOrder = useCallback((next: TabKey[]) => {
    setTabOrder(next);
    try { localStorage.setItem(FEED_ORDER_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const moveTab = useCallback((from: TabKey, to: TabKey) => {
    if (from === to) return;
    setTabOrder((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = prev.slice();
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      try { localStorage.setItem(FEED_ORDER_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resetTabOrder = useCallback(() => {
    persistTabOrder(DEFAULT_TAB_ORDER);
  }, [persistTabOrder]);
  const canShowTabs = !hashtagFilter && !hangoutGroupId && isAuthenticated;

  // Content disclaimer local mirror
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(contentDisclaimerAccepted);

  // Spotlight — live streams AND online (heartbeat-active) performers, shown
  // above the feed on every filter tab and even when a hashtag filter is
  // active. Hidden only for hangout-scoped feeds (their audience is already
  // in a private room, the community-wide spotlight would be off-topic).
  // Spotlight source: creators currently publishing (cammer role) in the
  // Main Stage LiveKit room. Replaces the legacy web-streaming + online-
  // performer twin fetch. Backed by Redis queue on the backend (15s cache),
  // safe to poll at 20s from the client.
  const [mainStageCammers, setMainStageCammers] = useState<MainStageCammer[]>([]);
  const [sheetCammer, setSheetCammer] = useState<MainStageCammer | null>(null);
  const showRails = !hashtagFilter && !hangoutGroupId;

  // Custom hashtag filter input. Types a tag → navigates to /?tag=xxx. When
  // ?tag= is active the input pre-fills; a clear button drops the filter.
  const [tagInput, setTagInput] = useState(hashtagFilter || "");
  useEffect(() => { setTagInput(hashtagFilter || ""); }, [hashtagFilter]);
  const submitTagFilter = useCallback(() => {
    const clean = tagInput.trim().replace(/^#+/, "").toLowerCase();
    if (!clean) { navigate("/"); return; }
    navigate(`/?tag=${encodeURIComponent(clean)}`);
  }, [tagInput, navigate]);
  useEffect(() => {
    if (!showRails) return;
    let cancelled = false;
    const load = () => {
      getMainStageCammers().then((res) => {
        if (cancelled) return;
        setMainStageCammers(res?.cammers || []);
      }).catch(() => {
        if (!cancelled) setMainStageCammers([]);
      });
    };
    load();
    const iv = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [showRails]);

  // Nearby distance lookup
  const allAuthorIds = useMemo(() => {
    const ids = new Set<string>();
    posts.forEach((p) => ids.add(String(p.author_id)));
    return Array.from(ids);
  }, [posts]);
  const nearbyDistances = useNearbyDistances(allAuthorIds);

  // Sync prop changes
  useEffect(() => {
    setDisclaimerAccepted(contentDisclaimerAccepted);
  }, [contentDisclaimerAccepted]);

  // ── Load feed ───────────────────────────────────────────────────────────────

  const loadFeed = useCallback(async (cursor?: string) => {
    try {
      setNeedsLocation(false);

      if (!hangoutGroupId && !hashtagFilter && feedMode === "new") {
        const res = await getNewMembers(cursor, 20);
        if (res.success) {
          if (cursor) {
            setNewMembers((prev) => [...prev, ...res.members]);
          } else {
            setNewMembers(res.members);
          }
          setNewMembersCursor(res.nextCursor);
        }
        return;
      }

      const res = hangoutGroupId
        ? await getHangoutFeed(hangoutGroupId, cursor, 20)
        : hashtagFilter
          ? await getPostsByHashtag(hashtagFilter, cursor, 20)
          : await getSocialFeedPosts(cursor, 20, feedMode);
      if (res.success) {
        if (cursor) {
          setPosts((prev) => [...prev, ...res.posts]);
        } else {
          setPosts(res.posts);
        }
        setNextCursor(res.nextCursor);
        if ('freeUserLimited' in res) setFreeUserLimited(!!(res as { freeUserLimited?: boolean }).freeUserLimited);
        if ('needsLocation' in res) setNeedsLocation(!!(res as { needsLocation?: boolean }).needsLocation);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  }, [hashtagFilter, hangoutGroupId, feedMode]);

  // Reset and reload whenever the filter/hashtag changes
  useEffect(() => {
    setPosts([]);
    setNextCursor(null);
    setNewMembers([]);
    setNewMembersCursor(null);
    setError(null);
    setIsLoading(true);
    loadFeed();
  }, [loadFeed]);

  // ── Real-time socket events ─────────────────────────────────────────────────
  const [hasNewPosts, setHasNewPosts] = useState(false);

  useEffect(() => {
    // Skip real-time updates for hashtag/hangout filtered feeds (too specific)
    if (hashtagFilter || hangoutGroupId) return;
    const socket = connectSocket();

    const onNewPost = () => setHasNewPosts(true);
    const onReaction = (data: { postId: number; reactions: any[] }) => {
      setPosts((prev) => prev.map((p) => p.id === data.postId ? { ...p, reactions: data.reactions } : p));
    };

    socket.on("feed:new_post", onNewPost);
    socket.on("reaction:post", onReaction);
    return () => {
      socket.off("feed:new_post", onNewPost);
      socket.off("reaction:post", onReaction);
    };
  }, [hashtagFilter, hangoutGroupId]);

  const handleLoadMore = useCallback(() => {
    if (feedMode === "new") {
      if (!newMembersCursor || loadingMore) return;
      setLoadingMore(true);
      loadFeed(newMembersCursor);
    } else {
      if (!nextCursor || loadingMore) return;
      setLoadingMore(true);
      loadFeed(nextCursor);
    }
  }, [feedMode, nextCursor, newMembersCursor, loadingMore, loadFeed]);

  // ── Post actions ────────────────────────────────────────────────────────────

  const handleLike = useCallback(async (postId: number) => {
    // Optimistic flip — keep the UI responsive; reconcile or roll back on response.
    let prevLiked: boolean | undefined;
    let prevCount: number | undefined;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        prevLiked = !!p.liked_by_me;
        prevCount = p.likes_count;
        const nowLiked = !p.liked_by_me;
        return { ...p, liked_by_me: nowLiked, likes_count: Math.max(0, p.likes_count + (nowLiked ? 1 : -1)) };
      })
    );
    try {
      const res = await togglePostLike(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: res.liked, likes_count: res.likes_count ?? p.likes_count }
            : p
        )
      );
    } catch {
      // Roll back the optimistic update so the user can retry.
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId && prevLiked !== undefined && prevCount !== undefined
            ? { ...p, liked_by_me: prevLiked, likes_count: prevCount }
            : p
        )
      );
    }
  }, []);

  const handleDelete = useCallback(async (postId: number) => {
    await deleteSocialPost(postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const handleAcceptDisclaimer = useCallback(async () => {
    await updateProfile({ contentDisclaimer: true });
    setDisclaimerAccepted(true);
    await onAcceptDisclaimer();
  }, [onAcceptDisclaimer]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Section header removed — the tabs + composer are self-explanatory and
          the redundant "PNP Feed" title was eating ~64px of prime mobile
          real-estate before any content appeared. */}

      {/* Persistent hashtag filter input — visible on every tab. Enter to apply. */}
      {!hangoutGroupId && (
        <div className="mb-3 flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 flex-1 px-3 py-2 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "#D4007A" }}>#</span>
            <input
              id="feed-hashtag-filter"
              name="hashtag"
              type="text"
              autoComplete="off"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value.replace(/^#+/, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") submitTagFilter(); }}
              placeholder={hashtagFilter ? hashtagFilter : "filter by hashtag"}
              className="flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none"
              aria-label="Filter feed by hashtag"
            />
            {(tagInput || hashtagFilter) && (
              <button
                type="button"
                onClick={() => { setTagInput(""); navigate("/"); }}
                aria-label="Clear hashtag filter"
                className="text-white/50 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={submitTagFilter}
            className="px-3 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
          >
            Filter
          </button>
        </div>
      )}

      {/* Spotlight — 132×176 cards for creators currently publishing in Main
          Stage. Tapping opens an action sheet with "Book private call" +
          "View profile" — no navigation on tap, since the user is likely to
          want the sheet options over a plain profile jump. */}
      {showRails && mainStageCammers.length > 0 && (
        <div className="mb-4">
          <div
            className="mb-2"
            style={{ fontSize: 11, letterSpacing: "0.08em", color: "#a1a1a3", textTransform: "uppercase", fontWeight: 700 }}
          >
            Spotlight
          </div>
          <div className="-mx-4 px-4">
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
              {mainStageCammers.slice(0, 8).map((c) => {
                const initial = (c.displayName || "?").charAt(0).toUpperCase();
                const photo = c.photoUrl && (c.photoUrl.startsWith("/") || c.photoUrl.startsWith("http")) ? c.photoUrl : null;
                return (
                  <button
                    key={`onstage-${c.userId}`}
                    onClick={() => setSheetCammer(c)}
                    className="relative flex-shrink-0 overflow-hidden text-left active:scale-[0.98] transition-transform"
                    style={{ width: 132, height: 176, borderRadius: 14, background: "linear-gradient(135deg,rgba(212,0,122,0.7),rgba(230,145,56,0.7))" }}
                    aria-label={`Open actions for ${c.displayName}`}
                  >
                    <span
                      className="absolute inset-0 flex items-center justify-center text-white text-4xl font-bold pointer-events-none"
                      aria-hidden="true"
                    >
                      {initial}
                    </span>
                    {photo && (
                      <img src={photo} alt={c.displayName} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <span
                      className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-white text-[10px] font-bold shadow-lg"
                      style={{ background: "#D4007A" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
                      ON STAGE
                    </span>
                    <span
                      className="absolute bottom-0 left-0 right-0 px-2 pb-2 pt-6 text-white text-xs font-semibold truncate"
                      style={{ background: "linear-gradient(transparent,rgba(0,0,0,0.8))" }}
                    >
                      {c.displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cammer action sheet — appears above everything when a Spotlight card
          is tapped. Book Call CTA uses the existing deep-link pattern
          (/c/{slug}?action=book&duration=30) so the target profile auto-opens
          the booking modal on land. */}
      {sheetCammer && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setSheetCammer(null)}
        >
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
            style={{ background: "var(--pnp-surface, #1a1a1f)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-lg font-bold">
                {sheetCammer.photoUrl
                  ? <img src={sheetCammer.photoUrl} alt={sheetCammer.displayName} className="w-full h-full object-cover" />
                  : (sheetCammer.displayName || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-pnp-textPrimary truncate">{sheetCammer.displayName}</p>
                <p className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                  On Main Stage now
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const slug = sheetCammer.slug;
                setSheetCammer(null);
                navigate(`/c/${slug}?action=book&duration=30`);
              }}
              disabled={sheetCammer.isAcceptingCalls === false}
              className="w-full min-h-[52px] rounded-xl font-bold text-white flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: sheetCammer.isAcceptingCalls === false ? "#333" : "linear-gradient(135deg,#D4007A,#E69138)" }}
              title={sheetCammer.isAcceptingCalls === false ? "This creator isn't taking calls right now" : undefined}
            >
              <span aria-hidden="true">📞</span>
              <span>Book private call</span>
              {sheetCammer.creatorPriceUsd != null && sheetCammer.creatorPriceUsd > 0 && (
                <span className="text-xs font-semibold opacity-80">· ${sheetCammer.creatorPriceUsd.toFixed(0)}/mo</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                const slug = sheetCammer.slug;
                setSheetCammer(null);
                navigate(`/c/${slug}`);
              }}
              className="w-full min-h-[52px] rounded-xl font-semibold text-pnp-textPrimary bg-white/[0.06] hover:bg-white/[0.10] transition active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span aria-hidden="true">👤</span>
              <span>View profile</span>
            </button>

            <button
              type="button"
              onClick={() => setSheetCammer(null)}
              className="w-full text-xs text-pnp-textSecondary hover:text-pnp-textPrimary transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Feed selector (2026-07-24). Default = Latest. Users can reorder tabs
          via the pen-icon button; the order persists in localStorage.
          Restyled 2026-08-01: active tab uses a filled pill instead of the
          bottom-border underline for a cleaner, more modern look. */}
      {canShowTabs && (
        <div className="flex items-center gap-1 mb-3">
          <div
            className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar py-1"
            role="tablist"
            aria-label="Feed filters"
          >
            {tabOrder.map((key) => {
              const label =
                key === "latest"     ? t.tabLatest     :
                key === "subscribed" ? t.tabSubscribed :
                key === "following"  ? t.tabFollowing  :
                key === "new"        ? t.tabNew        :
                key === "nearby"     ? t.tabNearby     :
                key === "slam"       ? "💉 Slam"       :
                                       t.tabHot;
              const isActive = feedMode === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={isActive}
                  draggable={isEditingTabs}
                  onDragStart={(e) => {
                    if (!isEditingTabs) return;
                    dragKeyRef.current = key;
                    e.dataTransfer.effectAllowed = "move";
                    try { e.dataTransfer.setData("text/plain", key); } catch { /* ignore */ }
                  }}
                  onDragOver={(e) => {
                    if (!isEditingTabs || !dragKeyRef.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    if (!isEditingTabs) return;
                    e.preventDefault();
                    const from = dragKeyRef.current;
                    if (from && from !== key) moveTab(from, key);
                    dragKeyRef.current = null;
                  }}
                  onDragEnd={() => { dragKeyRef.current = null; }}
                  onClick={() => {
                    if (isEditingTabs) return;
                    if (feedMode === key) return;
                    setFeedMode(key);
                    try { localStorage.setItem(FEED_STORAGE_KEY, key); } catch { /* ignore */ }
                    setPosts([]);
                    setNextCursor(null);
                    setNewMembers([]);
                    setNewMembersCursor(null);
                    setIsLoading(true);
                  }}
                  className={`flex-shrink-0 px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap rounded-full transition-all ${
                    isActive
                      ? "text-white bg-white/10 shadow-sm"
                      : "text-pnp-textSecondary hover:text-white hover:bg-white/[0.04]"
                  } ${isEditingTabs ? "cursor-grab active:cursor-grabbing ring-1 ring-white/15" : ""}`}
                  style={isActive ? { boxShadow: "inset 0 0 0 1px rgba(212,0,122,0.35)" } : undefined}
                  title={isEditingTabs ? t.dragToReorder : undefined}
                >
                  {isEditingTabs && (
                    <span className="mr-1.5 text-pnp-textSecondary" aria-hidden="true">⋮⋮</span>
                  )}
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isEditingTabs && (
              <button
                type="button"
                onClick={resetTabOrder}
                className="text-[11px] font-medium text-pnp-textSecondary hover:text-white px-2 py-1 rounded-md"
              >
                {t.resetTabOrder}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsEditingTabs((v) => !v)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                isEditingTabs ? "text-white bg-pnp-accent" : "text-pnp-textSecondary hover:text-white hover:bg-white/5"
              }`}
              aria-pressed={isEditingTabs}
              aria-label={isEditingTabs ? t.doneEditingOrder : t.editTabOrder}
              title={isEditingTabs ? t.doneEditingOrder : t.editTabOrder}
            >
              {isEditingTabs ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Nearby: no location shared → CTA to enable */}
      {canShowTabs && feedMode === "nearby" && needsLocation && !isLoading && (
        <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: "rgba(212,0,122,0.08)", border: "1px solid rgba(212,0,122,0.2)" }}>
          <p className="text-sm text-white font-semibold mb-2">Activa tu ubicación para ver publicaciones cercanas</p>
          <p className="text-xs mb-3" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            El feed "Cerca" solo muestra usuarios dentro de ~50 km.
          </p>
          <button
            onClick={() => onNavigate("/settings")}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
            style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
          >
            Ir a ajustes
          </button>
        </div>
      )}

      {/* Hashtag filter banner removed — the persistent input at the top now
          displays the active tag (as placeholder) and provides the clear ✕. */}

      {/* Post Composer */}
      {showComposer && isAuthenticated && (
        <div className="mb-4">
          <PostComposer
            compact
            onPostCreated={(newPost) => {
              setPosts((prev) => [newPost, ...prev]);
            }}
          />
        </div>
      )}

      {/* New posts pill */}
      {hasNewPosts && !isLoading && (
        <button
          onClick={() => { setHasNewPosts(false); setPosts([]); setNextCursor(null); setIsLoading(true); loadFeed(); }}
          className="w-full mb-3 py-2 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
        >
          <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          New posts — tap to refresh
        </button>
      )}

      {/* Feed */}
      {isLoading ? (
        <FeedSkeleton />
      ) : error ? (
        <div className="glass-card-sm p-8 text-center">
          <svg
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-white font-medium mb-1">{t.feedUnavailable}</p>
          <p className="text-sm mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {error}
          </p>
          <button
            onClick={() => {
              setError(null);
              setIsLoading(true);
              loadFeed();
            }}
            className="btn-gradient px-4 py-1.5 rounded-lg text-white text-sm font-semibold"
          >
            {t.retry}
          </button>
        </div>
      ) : feedMode === "new" && !hashtagFilter && !hangoutGroupId ? (
        /* ── New members grid ── */
        newMembers.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(212,0,122,0.06), rgba(230,145,56,0.04))",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <p className="text-white font-semibold mb-1">{userLang === "es" ? "No hay nuevos miembros" : "No new members yet"}</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-3">
              {newMembers.map((m) => {
                const joinedMs = Date.now() - new Date(m.created_at).getTime();
                const joinedDays = Math.floor(joinedMs / 86_400_000);
                const joinedHours = Math.floor(joinedMs / 3_600_000);
                const joinedLabel = joinedHours < 24
                  ? (userLang === "es" ? `hace ${joinedHours}h` : `${joinedHours}h ago`)
                  : (userLang === "es" ? `hace ${joinedDays}d` : `${joinedDays}d ago`);
                const displayName = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.username;
                return (
                  <button
                    key={m.id}
                    onClick={() => onNavigate(`/profile/${m.username}`)}
                    className="glass-card-sm p-3 flex flex-col items-center gap-2 text-center hover:bg-white/5 transition-colors active:scale-95"
                  >
                    <div className="relative">
                      {m.photo_url ? (
                        <img
                          src={m.photo_url}
                          alt={displayName}
                          className="w-14 h-14 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white"
                          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                        >
                          {(displayName[0] || "?").toUpperCase()}
                        </div>
                      )}
                      {m.is_online && (
                        <span
                          className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-pnp-bg"
                          style={{ background: "#34C759" }}
                        />
                      )}
                    </div>
                    <div className="w-full min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{displayName}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>@{m.username}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>{joinedLabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {newMembersCursor && (
              <div className="text-center pt-2 pb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="text-sm font-medium px-6 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                  style={{ color: "#D4007A" }}
                >
                  {loadingMore ? t.loading : t.loadMore}
                </button>
              </div>
            )}
          </div>
        )
      ) : posts.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(212,0,122,0.06), rgba(230,145,56,0.04))",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.15), rgba(230,145,56,0.10))" }}
          >
            <svg
              className="w-7 h-7"
              style={{ color: "#D4007A" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
            </svg>
          </div>
          <p className="text-white font-semibold mb-1">{t.noPostsYet}</p>
          <p className="text-sm" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
            {t.beTheFirst}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <SocialPostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              userLang={userLang}
              onLike={handleLike}
              onDelete={handleDelete}
              onNavigate={onNavigate}
              contentDisclaimerAccepted={disclaimerAccepted}
              onAcceptDisclaimer={handleAcceptDisclaimer}
              viewerCity={viewerCity}
              viewerCountry={viewerCountry}
              distanceKm={nearbyDistances.get(String(post.author_id)) ?? null}
            />
          ))}
          {freeUserLimited && (
            <div
              className="rounded-2xl p-5 text-center mx-1"
              style={{ background: "linear-gradient(135deg, rgba(212,0,122,0.12), rgba(230,145,56,0.08))", border: "1px solid rgba(212,0,122,0.25)" }}
            >
              <p className="text-base font-bold text-white mb-1">You're seeing 5 of many posts</p>
              <p className="text-xs mb-4" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                Become a PNPtv! member to unlock the full community feed, browse all profiles, and access channels.
              </p>
              <button
                onClick={() => onNavigate("/subscribe")}
                className="text-sm font-semibold px-6 py-2.5 rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
              >
                Join the community →
              </button>
            </div>
          )}
          {!freeUserLimited && nextCursor && (
            <div className="text-center pt-2 pb-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-sm font-medium px-6 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                style={{ color: "#D4007A" }}
              >
                {loadingMore ? t.loading : t.loadMore}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
