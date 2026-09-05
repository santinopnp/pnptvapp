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
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ChevronLeft,
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
  Video,
  AtSign,
  Ticket,
  CreditCard,
  Bitcoin,
  Loader2,
} from "lucide-react";
import {
  getPublicCreatorProfile,
  getPublicProfile,
  getTaggedInPosts,
  getCreatorManual,
  blockUser,
  unblockUser,
  isUserBlocked,
  createUserReport,
  togglePostLike,
  getMyCallCredits,
  uploadCoverPhoto,
  deleteCoverPhoto,
  tipTokens,
  getWalletBalance,
  checkoutCrystalGift,
  checkoutCrystalSelf,
  CRYSTAL_UI_ENABLED,
  INTRO_CALL_ENABLED,
  bookIntroCall,
  getIntroCallStatus,
  getCreatorChannelPass,
  checkoutChannelPass,
  type ChannelPassViewerInfo,
  type CreatorPublicProfile,
  type SocialPostItem,
  type ReportCategory,
  type ViewerCreatorSubscription,
  type MyCallCredit,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import { BadgeRow } from "@/components/badges/UserBadges";
import { CrystalServicesPanel } from "@/components/crystal/CrystalServicesPanel";
import { WalletPayCard, TIP_PRESETS_RUSH } from "@/components/payments/PayInWalletChips";
import { BookCallModal } from "@/components/creators/BookCallModal";
import type { CreatorType } from "@/components/creators/CreatorCard";
import CreatorSubscribeWizard from "@/components/creators/CreatorSubscribeWizard";
import { BuyTokensModal } from "@/components/BuyTokensModal";
import PostCard from "@/components/profile/PostCard";
import { PostComposer } from "@/components/PostComposer";
import { SuggestedCreatorRow, useForYou } from "@/components/Layout";
import { useI18n } from "@/lib/i18n";
import { formatBio } from "@/lib/feedI18n";

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

// ─── Right Rail (desktop only) ──────────────────────────────────────────────
// X.com-style side column: "Live now" + "Nearby now". Loads lazily so the
// profile hero isn't blocked. Hides its own sections when empty rather than
// showing empty-state clutter. Purely client-side; reuses existing endpoints.

interface RightRailStream {
  channelRef: string;
  title?: string | null;
  hostUsername?: string | null;
  hostFirstName?: string | null;
  hostPhoto?: string | null;
  viewerCount?: number | null;
}
interface RightRailNearby {
  id: string;
  username?: string | null;
  firstName?: string | null;
  photo?: string | null;
  distanceKm?: number | null;
}

function CreatorRightRail({ excludeCreatorId }: { excludeCreatorId: string }) {
  const [streams, setStreams] = useState<RightRailStream[]>([]);
  const [nearby, setNearby] = useState<RightRailNearby[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Live streams — always attempt, no geo required
      try {
        const { getWebAppLiveStreams } = await import("@/lib/api");
        const res = await getWebAppLiveStreams();
        if (cancelled) return;
        const rows = (res?.streams || [])
          .filter((s: unknown) => {
            const o = s as { hostId?: string | number; host_id?: string | number };
            const hid = String(o.hostId ?? o.host_id ?? "");
            return hid && hid !== String(excludeCreatorId);
          })
          .slice(0, 4)
          .map((s: unknown) => {
            const o = s as Record<string, unknown>;
            return {
              channelRef: String(o.channelRef ?? o.channel_ref ?? o.slug ?? ""),
              title: (o.title as string) ?? (o.streamTitle as string) ?? null,
              hostUsername: (o.hostUsername as string) ?? (o.host_username as string) ?? null,
              hostFirstName: (o.hostFirstName as string) ?? (o.host_first_name as string) ?? null,
              hostPhoto: (o.hostPhoto as string) ?? (o.host_photo as string) ?? null,
              viewerCount: (o.viewerCount as number) ?? (o.viewer_count as number) ?? null,
            } as RightRailStream;
          })
          .filter((s) => s.channelRef);
        setStreams(rows);
      } catch { /* silent — right rail is decorative */ }

      // Nearby users — only if geolocation is available + permitted
      try {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), 2500);
            navigator.geolocation.getCurrentPosition(
              (pos) => { clearTimeout(timer); resolve(pos.coords); },
              () => { clearTimeout(timer); resolve(null); },
              { maximumAge: 5 * 60 * 1000, timeout: 2500, enableHighAccuracy: false }
            );
          });
          if (coords && !cancelled) {
            const { searchNearby } = await import("@/lib/api");
            const res = await searchNearby(coords.latitude, coords.longitude, 25, 12);
            if (cancelled) return;
            const rawUsers = (res as unknown as { users?: unknown[] }).users ?? [];
            const rows: RightRailNearby[] = rawUsers
              .map((u: unknown) => {
                const o = u as Record<string, unknown>;
                return {
                  id: String(o.id ?? ""),
                  username: (o.username as string) ?? null,
                  firstName: (o.firstName as string) ?? (o.first_name as string) ?? null,
                  photo: (o.photoUrl as string) ?? (o.photo_url as string) ?? (o.photo as string) ?? null,
                  distanceKm: (o.distanceKm as number) ?? (o.distance_km as number) ?? null,
                };
              })
              .filter((u) => u.id && u.id !== String(excludeCreatorId))
              .slice(0, 5);
            setNearby(rows);
          }
        }
      } catch { /* silent */ }

      if (!cancelled) setReady(true);
    };
    load();
    return () => { cancelled = true; };
  }, [excludeCreatorId]);

  if (!ready && streams.length === 0 && nearby.length === 0) {
    return (
      <div
        className="rounded-2xl p-4 animate-pulse"
        style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="h-4 w-24 rounded bg-white/10 mb-3" />
        <div className="space-y-2">
          <div className="h-10 rounded bg-white/5" />
          <div className="h-10 rounded bg-white/5" />
          <div className="h-10 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  const nothingToShow = streams.length === 0 && nearby.length === 0;
  if (nothingToShow) return null;

  return (
    <div className="space-y-4">
      {streams.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: "#FF3B30", color: "#fff" }}
            >
              ● Live
            </span>
            <span className="text-[13px] font-semibold text-white">Live now</span>
          </div>
          <ul>
            {streams.map((s) => (
              <li key={s.channelRef}>
                <Link
                  to={`/live/${encodeURIComponent(s.channelRef)}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
                >
                  <UserAvatar
                    userId={s.channelRef}
                    photoUrl={s.hostPhoto || undefined}
                    displayName={s.hostFirstName || s.hostUsername || "Live"}
                    size="sm"
                    showOnline={false}
                    linkToProfile={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-white truncate">
                      {s.hostFirstName || s.hostUsername || "Streaming"}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                      {s.title || "Live now"}
                    </div>
                  </div>
                  {typeof s.viewerCount === "number" && s.viewerCount > 0 && (
                    <span className="text-[10px] shrink-0" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                      {formatCompact(s.viewerCount)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {nearby.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="px-4 pt-3.5 pb-2">
            <span className="text-[13px] font-semibold text-white">Nearby now</span>
          </div>
          <ul>
            {nearby.map((u) => (
              <li key={u.id}>
                <Link
                  to={u.username ? `/@${u.username}` : `/profile/${u.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
                >
                  <UserAvatar
                    userId={u.id}
                    photoUrl={u.photo || undefined}
                    displayName={u.firstName || u.username || "User"}
                    size="sm"
                    showOnline
                    linkToProfile={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-white truncate">
                      {u.firstName || u.username || "Member"}
                    </div>
                    {u.username && (
                      <div className="text-[11px] truncate" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        @{u.username}
                      </div>
                    )}
                  </div>
                  {typeof u.distanceKm === "number" && (
                    <span className="text-[10px] shrink-0" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                      {u.distanceKm < 1 ? "<1 km" : `${Math.round(u.distanceKm)} km`}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CreatorProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const t = useI18n();

  const [creatorForYouId, setCreatorForYouId] = useState<string | null>(null);
  const { data: forYou } = useForYou("creator", creatorForYouId);

  const [data, setData] = useState<CreatorPublicProfile | null>(null);
  const [posts, setPosts] = useState<SocialPostItem[]>([]);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  // "Posts" (author's own wall) vs "Tagged" (every post that @-mentions
  // this creator). Tagged tab is lazy-loaded on first activation.
  const [wallTab, setWallTab] = useState<"posts" | "tagged">("posts");
  const [taggedPosts, setTaggedPosts] = useState<SocialPostItem[]>([]);
  const [taggedCursor, setTaggedCursor] = useState<string | null>(null);
  const [taggedLoading, setTaggedLoading] = useState(false);
  const [taggedError, setTaggedError] = useState<string | null>(null);
  const [taggedLoaded, setTaggedLoaded] = useState(false);
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
  const [callCredits, setCallCredits] = useState<MyCallCredit[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportCategory | "">("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Crystal Creator checkout state.
  // crystalWalletMode: which inline WalletPayCard panel is currently open.
  // 'gift'  = fan gifting this creator; 'self' = creator self-upgrading.
  const [crystalWalletMode, setCrystalWalletMode] = useState<"gift" | "self" | null>(null);
  const [crystalNpLoading, setCrystalNpLoading] = useState<"gift" | "self" | null>(null);
  const [crystalNpError, setCrystalNpError] = useState<string | null>(null);
  const crystalWalletPanelRef = useRef<HTMLDivElement>(null);
  // Inner Circle (VIP audience) — only loaded when the viewer is an active
  // Crystal Creator. Backed by the internal Whale Pig list server-side but
  // NEVER labeled "Whale Pig" in creator-facing UI (staff-only naming).
  const [innerCircle, setInnerCircle] = useState<Array<{ id: string; username: string | null; first_name: string | null; photo_url: string | null }> | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const tipPanelRef = useRef<HTMLDivElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  // Tip panel state
  const [tipPanelOpen, setTipPanelOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [tipMessage, setTipMessage] = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  const [tipResult, setTipResult] = useState<"success" | "error" | null>(null);
  const [tipError, setTipError] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);

  // ── Channel Pass state ───────────────────────────────────────────────────────
  const [channelPass, setChannelPass] = useState<ChannelPassViewerInfo | null>(null);
  const [channelPassLoading, setChannelPassLoading] = useState(false);
  const [channelPassPanelOpen, setChannelPassPanelOpen] = useState(false);
  const [channelPassTab, setChannelPassTab] = useState<"rush" | "card" | "crypto">("rush");
  const [channelPassBuying, setChannelPassBuying] = useState(false);
  const [channelPassResult, setChannelPassResult] = useState<{ expires_at: string } | null>(null);
  const [channelPassError, setChannelPassError] = useState<string | null>(null);
  const channelPassPanelRef = useRef<HTMLDivElement>(null);

  // Detect an injected wallet (MetaMask / TrustWallet in-app browser). Missing
  // wallet → prompt with the "install a wallet first" guide before top-up.
  const hasInjectedWallet = useMemo(() => {
    if (typeof window === "undefined") return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).ethereum) return true;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    return /TrustWallet|MetaMaskMobile|Rainbow/i.test(ua);
  }, []);

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
        if (res.creator?.id) {
          setCreatorForYouId(String(res.creator.id));
        }
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
    setPostsError(null);
    getPublicProfile(creatorId)
      .then((res) => {
        setPosts(res.posts || []);
        setPostsCursor(res.nextCursor);
      })
      .catch((err) => {
        setPostsError(err instanceof Error ? err.message : "Could not load posts");
      })
      .finally(() => setPostsLoading(false));

    if (isAuthenticated && String(user?.dbId || user?.id) !== creatorId) {
      isUserBlocked(creatorId)
        .then((r) => { if (r.success) setIsBlocked(r.isBlocked); })
        .catch(() => {});

      getMyCallCredits(creatorId)
        .then((r) => {
          if (!r.success) return;
          const usable = (r.credits || []).filter(
            (c) =>
              (c.status === "unused" || c.status === "partial") &&
              c.quantity_used + c.quantity_scheduled < c.quantity_total
          );
          setCallCredits(usable);
        })
        .catch(() => {});

      getWalletBalance()
        .then((r) => { if (r.success) setWalletBalance(r.balance); })
        .catch(() => {});
    }

    // Channel Pass info — load for all authenticated viewers (not self-view)
    if (isAuthenticated && String(user?.dbId || user?.id) !== creatorId) {
      setChannelPassLoading(true);
      getCreatorChannelPass(creatorId)
        .then((res) => setChannelPass(res))
        .catch(() => {/* 404 = not enabled, ignore */})
        .finally(() => setChannelPassLoading(false));
    }
  }, [data?.creator?.id, isAuthenticated, user?.dbId, user?.id]);

  const unusedCredit30 = useMemo(
    () => callCredits.find((c) => c.duration_minutes === 30) || null,
    [callCredits]
  );
  const unusedCredit60 = useMemo(
    () => callCredits.find((c) => c.duration_minutes === 60) || null,
    [callCredits]
  );

  // D2: deep-link from MyAccess → auto-open Book Call modal at the credit's duration.
  // Special case: duration=15 opens the free intro-call confirm sheet instead
  // (fired by the Featured Model of the Day interstitial's secondary CTA).
  const [showIntroCall, setShowIntroCall] = useState(false);
  const bookActionHandled = useRef(false);
  useEffect(() => {
    if (bookActionHandled.current) return;
    if (!data?.creator?.id || !isAuthenticated) return;
    if (searchParams.get("action") !== "book") return;
    const durParam = Number(searchParams.get("duration"));
    bookActionHandled.current = true;
    if (durParam === 15) {
      setShowIntroCall(true);
      return;
    }
    const dur: 30 | 60 = durParam === 60 ? 60 : 30;
    setBookCallDuration(dur);
    setShowBookCall(true);
  }, [data?.creator?.id, isAuthenticated, searchParams]);

  const isOnboardingTutorial = searchParams.get("onboarding") === "1";

  const [showVideoUploadModal, setShowVideoUploadModal] = useState(false);

  // Load manual lazily when the collapsible card is first expanded
  useEffect(() => {
    if (!manualExpanded || manualLoaded || !data?.creator?.id) return;
    getCreatorManual(data.creator.id)
      .then((res) => setManualMarkdown(res.markdown || ""))
      .catch(() => setManualMarkdown(""))
      .finally(() => setManualLoaded(true));
  }, [manualExpanded, manualLoaded, data?.creator?.id]);
  // Reset manual state when navigating to a different creator so the previous
  // creator's manual doesn't linger during the fetch of the new one.
  useEffect(() => {
    setManualLoaded(false);
    setManualMarkdown("");
    setManualExpanded(false);
  }, [data?.creator?.id]);

  // Close kebab on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Close tip panel on outside click
  useEffect(() => {
    if (!tipPanelOpen) return;
    const onClick = (e: MouseEvent) => {
      if (tipPanelRef.current && !tipPanelRef.current.contains(e.target as Node)) setTipPanelOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [tipPanelOpen]);

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

  // Deep-link from post-onboarding — auto-open the subscribe wizard so the
  // tutorial flow lands the user directly on "confirm & pay" instead of
  // making them hunt for the CTA. The banner (below) explains the free 180
  // gifted Ru$h; onboarding=1 gates it to first-run only.
  const subscribeActionHandled = useRef(false);
  useEffect(() => {
    if (subscribeActionHandled.current) return;
    if (!data?.creator?.id || !isAuthenticated) return;
    if (searchParams.get("action") !== "subscribe") return;
    if (isSubscribed || isOwnProfile || isPrimeCreator) return;
    subscribeActionHandled.current = true;
    setShowSubscribePanel(true);
  }, [data?.creator?.id, isAuthenticated, searchParams, isSubscribed, isOwnProfile, isPrimeCreator]);

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

  // Reset tagged-tab cache when navigating to a new creator so we don't
  // show the previous creator's tagged-in feed while fetching the new one.
  useEffect(() => {
    setTaggedPosts([]);
    setTaggedCursor(null);
    setTaggedLoaded(false);
    setTaggedError(null);
    setWallTab("posts");
  }, [data?.creator?.id]);

  // Lazy-load Tagged posts the first time the tab is activated. Silent
  // degrade if the backend hasn't shipped /social/tagged-in yet — the
  // empty state renders with the standard "no tags yet" copy.
  useEffect(() => {
    if (wallTab !== "tagged" || taggedLoaded) return;
    if (!data?.creator?.id) return;
    const id = data.creator.id;
    setTaggedLoading(true);
    setTaggedError(null);
    getTaggedInPosts(id)
      .then((res) => {
        setTaggedPosts(res.posts || []);
        setTaggedCursor(res.nextCursor || null);
      })
      .catch((err) => {
        setTaggedError(err instanceof Error ? err.message : "Could not load tags");
      })
      .finally(() => {
        setTaggedLoaded(true);
        setTaggedLoading(false);
      });
  }, [wallTab, taggedLoaded, data?.creator?.id]);

  const loadMoreTagged = useCallback(async () => {
    if (!data?.creator?.id || !taggedCursor || taggedLoading) return;
    setTaggedLoading(true);
    try {
      const res = await getTaggedInPosts(data.creator.id, taggedCursor);
      setTaggedPosts((prev) => [...prev, ...(res.posts || [])]);
      setTaggedCursor(res.nextCursor || null);
    } catch { /* ignore */ }
    finally { setTaggedLoading(false); }
  }, [data?.creator?.id, taggedCursor, taggedLoading]);

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

  async function handleSendTip() {
    if (!data || !tipAmount || tipLoading) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    setTipLoading(true);
    setTipResult(null);
    setTipError("");
    try {
      const res = await tipTokens(data.creator.id, tipAmount, tipMessage.trim() || undefined);
      if (res.success) {
        setWalletBalance(res.newBalance);
        setTipResult("success");
        setTimeout(() => {
          setTipPanelOpen(false);
          setTipResult(null);
          setTipAmount(null);
          setTipMessage("");
        }, 2000);
      } else {
        setTipResult("error");
        setTipError("Could not send tip. Please try again.");
      }
    } catch (err: unknown) {
      setTipResult("error");
      const code = (err as { code?: string })?.code;
      if (code === "INSUFFICIENT_TOKENS") {
        setTipError("INSUFFICIENT_TOKENS");
      } else {
        setTipError(err instanceof Error ? err.message : "Could not send tip. Please try again.");
      }
    } finally {
      setTipLoading(false);
    }
  }

  // Rule (2026-07-24): Message → creator DM, only for active subscribers
  // (or the creator viewing themselves). Non-subscribers get the Subscribe
  // panel. No more "Hang with X" button — moved into the subscribed pill row.
  // PRIME-gated creators (Santino) unlock via PRIME entitlement too.
  function handleMessage() {
    if (!data) return;
    if (!isAuthenticated) { navigate("/login"); return; }
    const isAdminViewer = user?.role === "admin" || user?.role === "superadmin";
    if (!viewerUnlocked && !isOwnProfile && !isAdminViewer) {
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

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setCoverError(null);
    try {
      const res = await uploadCoverPhoto(file);
      setData((prev) => (prev ? { ...prev, creator: { ...prev.creator, cover_url: res.coverUrl } } : prev));
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Failed to upload cover");
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleCoverDelete = async () => {
    setCoverUploading(true);
    setCoverError(null);
    try {
      await deleteCoverPhoto();
      setData((prev) => (prev ? { ...prev, creator: { ...prev.creator, cover_url: null } } : prev));
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Failed to remove cover");
    } finally {
      setCoverUploading(false);
    }
  };

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

  // Load Inner Circle when own-profile Crystal Creator opens their profile.
  // Endpoint is gated to active Crystal Creators server-side.
  useEffect(() => {
    if (!isOwnProfile || !data?.creator?.crystalCreator) {
      setInnerCircle(null);
      return;
    }
    fetch("/api/creator/crystal/inner-circle", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (body?.users) setInnerCircle(body.users); })
      .catch(() => { /* non-fatal */ });
  }, [isOwnProfile, data?.creator?.crystalCreator]);

  // ?renew=1 deep-link → auto-open the self-checkout panel on arrival.
  // Fired by the T-3 Crystal renewal reminder DM/email so one tap → paying.
  // Only opens when the viewer is the invited creator; noop otherwise.
  useEffect(() => {
    if (!data?.creator) return;
    if (searchParams.get("renew") !== "1") return;
    if (!isOwnProfile) return;
    if (!data.creator.crystalInvited) return;
    // Self-mode = renewal for the creator viewing own profile.
    setCrystalWalletMode("self");
    setTimeout(() => {
      crystalWalletPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 200);
  }, [data?.creator, isOwnProfile, searchParams]);

  // Toggle the inline WalletPayCard panel for Crystal gift or self-upgrade.
  // Mirrors Subscribe.tsx's walletPanelPlanId toggle pattern.
  function handleCrystalWalletToggle(mode: "gift" | "self") {
    if (!isAuthenticated) { navigate("/login"); return; }
    setCrystalNpError(null);
    setCrystalWalletMode((prev) => (prev === mode ? null : mode));
    // Auto-scroll to the panel after it opens (100ms for DOM paint).
    setTimeout(() => {
      crystalWalletPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }

  // Open NowPayments hosted checkout in a centered popup (iframe-blocked per memory).
  async function handleCrystalNowPayments(mode: "gift" | "self") {
    if (!isAuthenticated) { navigate("/login"); return; }
    if (!data) return;
    setCrystalNpError(null);
    setCrystalNpLoading(mode);
    try {
      let invoiceUrl: string | undefined;
      if (mode === "gift") {
        const res = await checkoutCrystalGift(data.creator.id, "nowpayments");
        invoiceUrl = res.invoiceUrl;
      } else {
        const res = await checkoutCrystalSelf("nowpayments");
        invoiceUrl = res.invoiceUrl;
      }
      if (!invoiceUrl) throw new Error("No invoice URL returned");
      const w = 520;
      const h = 700;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
      window.open(invoiceUrl, "crystal_np_checkout", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);
    } catch (err) {
      setCrystalNpError(err instanceof Error ? err.message : "Could not open checkout");
    } finally {
      setCrystalNpLoading(null);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--pnp-bg, #121212)" }}>
        <div className="animate-pulse text-white/40">
          {t.lang === "es" ? "Cargando…" : "Loading…"}
        </div>
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

  // Crystal Creator fields come from /api/public/creator/:username (routes.js
  // adds them from users.crystal_creator_active_until + crystal_creator_invited_at).
  // Gated behind CRYSTAL_UI_ENABLED — when off, the profile behaves as if the
  // creator has no Crystal pass, hiding the header band, avatar ring, services
  // panel, and all gift/self CTAs at once.
  const creatorIsCrystal = CRYSTAL_UI_ENABLED && creator.crystalCreator === true;
  const creatorIsFam = (creator as { pnptvFam?: boolean }).pnptvFam === true;
  const crystalActiveUntil = creator.crystalActiveUntil ?? null;
  const crystalInvited = CRYSTAL_UI_ENABLED && creator.crystalInvited === true;

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

      <div className="min-h-screen" style={{ background: "var(--pnp-bg, #121212)", color: "#fff" }}>
        {/* Desktop: 3-col layout — center profile column + sticky right rail
            for "Live now" / "Nearby now". Mobile: unchanged single column
            (the grid classes collapse to normal block flow below lg).       */}
        <div className="lg:mx-auto lg:max-w-[1040px] lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:px-6 lg:py-6">
        <div className="flex flex-col lg:min-w-0 lg:rounded-2xl lg:overflow-hidden lg:border lg:border-white/5" style={{ background: "var(--pnp-bg, #121212)" }}>
        {/* ── Cover + avatar overlay ─────────────────────────────────── */}
        <div className="relative">
          {/* Crystal animated header band — sits above the cover image at 0.4
              opacity so the cover art remains visible beneath. Hidden unless
              the creator is an active Crystal Creator. */}
          {creatorIsCrystal && (
            <div
              className="creator-crystal-header absolute top-0 left-0 right-0 pointer-events-none z-[1]"
              style={{ opacity: 0.55, height: 140 }}
              aria-hidden="true"
            />
          )}
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
          {/* Cover upload controls — creator/self only. Same endpoint + column
              (users.cover_url) as the member profile page. Recommended
              1200×420, resized server-side; jpg/png/webp/gif accepted. */}
          {isOwnProfile && (
            <>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleCoverUpload}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {creator.cover_url && !coverUploading && (
                  <button
                    onClick={handleCoverDelete}
                    aria-label="Remove cover"
                    title="Remove cover"
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity active:scale-95"
                    style={{ background: "rgba(30,30,30,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <X size={16} className="text-white" />
                  </button>
                )}
                <button
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  aria-label={creator.cover_url ? "Change cover" : "Add cover"}
                  title={`${creator.cover_url ? "Change" : "Add"} cover · recommended 1200×420 (jpg, png, webp, gif · max 15MB)`}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity active:scale-95 disabled:opacity-60"
                  style={{ background: "rgba(30,30,30,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {coverUploading ? (
                    <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <Pencil size={14} className="text-white" />
                  )}
                </button>
              </div>
              {coverError && (
                <div
                  className="absolute bottom-14 right-3 max-w-[240px] px-3 py-1.5 rounded-md text-[11px] text-white"
                  style={{ background: "rgba(220,53,69,0.9)" }}
                  role="alert"
                >
                  {coverError}
                </div>
              )}
            </>
          )}
          {/* Avatar overlap (78px per mockup; xl=80 rounds cleanly).
              When creator is Crystal, the crystal-ring animation replaces
              the static accent border — we suppress the wrapper boxShadow
              so both don't stack visually. */}
          <div className="absolute left-4" style={{ bottom: -34 }}>
            {creatorIsFam || creatorIsCrystal ? (
              <UserAvatar
                userId={creator.id}
                photoUrl={creator.photo_url}
                displayName={creator.first_name || creator.username}
                size="xl"
                showOnline={false}
                linkToProfile={false}
                pnptvFam={creatorIsFam}
                crystalCreator={creatorIsCrystal}
              />
            ) : (
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
            )}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="flex-1 px-4 pb-24" style={{ paddingTop: 44 }}>
          {/* Identity row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[18px] font-bold text-white truncate">{displayName}</span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                @{creator.username}
              </div>
              {/* Prominent unified badge row — icon-only w/ hover tooltip */}
              <BadgeRow
                size="md"
                className="mt-2"
                source={{
                  pnptvFam: creatorIsFam,
                  pnptvFamSince: (creator as { pnptvFamSince?: string | null }).pnptvFamSince ?? null,
                  crystalCreator: creatorIsCrystal,
                  creatorVerified: creator.creator_verified,
                  colombiaBadge: (creator as { colombiaBadge?: boolean }).colombiaBadge,
                  partnerBadgeColor: (creator as { partnerBadgeColor?: string | null }).partnerBadgeColor ?? null,
                }}
              />
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
            <p className="text-[13px] leading-relaxed text-white mb-4 whitespace-pre-wrap break-words">{formatBio(creator.bio)}</p>
          )}

          {/* ── Channel Pass CTA ────────────────────────────────────────────────
              Shown when: pass is enabled, viewer is not the creator, and
              (a) they don't yet hold an active pass, OR
              (b) they do hold an active pass → show the "active" badge instead. */}
          {!isOwnProfile && !channelPassLoading && channelPass?.enabled && (
            channelPass.is_active ? (
              /* Active pass — small pill + manage link */
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.25)" }}>
                <Check size={13} strokeWidth={3} style={{ color: "#34C759", flexShrink: 0 }} />
                <span className="text-xs font-semibold" style={{ color: "#34C759" }}>
                  Channel Pass active until {new Date(channelPass.expires_at!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <Link to="/my-subscriptions" className="ml-auto text-[11px] underline"
                  style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  Manage
                </Link>
              </div>
            ) : (
              /* Inactive — sticky CTA card + expandable inline panel */
              <div className="mb-3">
                {/* CTA card */}
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: channelPassPanelOpen ? "rgba(212,0,122,0.4)" : "rgba(212,0,122,0.2)", background: "rgba(212,0,122,0.06)" }}
                >
                  <div className="p-3 flex items-center gap-3">
                    <Ticket size={18} style={{ color: "#D4007A", flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        Unlock @{creator.username}'s exclusive content
                      </p>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        Videos, exclusive posts & DMs — one month of full access.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isAuthenticated) { navigate("/login"); return; }
                        setChannelPassPanelOpen((v) => !v);
                        setChannelPassError(null);
                        setChannelPassResult(null);
                        if (!channelPassPanelOpen) {
                          setTimeout(() => channelPassPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
                        }
                      }}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.97]"
                      style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                    >
                      Get Channel Pass · ${channelPass.price_usd}/mo
                    </button>
                  </div>

                  {/* Inline payment panel — expands below the card */}
                  {channelPassPanelOpen && (
                    <div
                      ref={channelPassPanelRef}
                      className="border-t px-4 pb-4 pt-3"
                      style={{ borderColor: "rgba(212,0,122,0.2)", background: "rgba(0,0,0,0.25)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {channelPassResult ? (
                        /* Success state */
                        <div className="text-center py-4">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
                            style={{ background: "rgba(52,199,89,0.15)", border: "1px solid rgba(52,199,89,0.3)" }}>
                            <Check size={20} strokeWidth={2.5} style={{ color: "#34C759" }} />
                          </div>
                          <p className="text-sm font-bold text-white mb-1">You're subscribed!</p>
                          <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                            Access active until {new Date(channelPassResult.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
                          </p>
                          <Link to="/my-subscriptions"
                            className="inline-block mt-3 text-xs underline"
                            style={{ color: "#D4007A" }}>
                            Manage my subscriptions →
                          </Link>
                        </div>
                      ) : (
                        <>
                          <p className="text-[11px] mb-3" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                            One month of full access to @{creator.username}'s videos, exclusive posts, and DMs.
                          </p>

                          {/* Payment tab strip */}
                          <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
                            {(["rush", "card", "crypto"] as const).map((tab) => (
                              <button
                                key={tab}
                                type="button"
                                onClick={() => setChannelPassTab(tab)}
                                className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
                                style={{
                                  background: channelPassTab === tab ? "rgba(212,0,122,0.3)" : "transparent",
                                  color: channelPassTab === tab ? "#fff" : "rgba(255,255,255,0.5)",
                                  border: channelPassTab === tab ? "1px solid rgba(212,0,122,0.4)" : "1px solid transparent",
                                }}
                              >
                                {tab === "rush" ? "Ru$h Wallet" : tab === "card" ? "Pay with card" : "Pay with crypto"}
                              </button>
                            ))}
                          </div>

                          {/* Ru$h Wallet tab */}
                          {channelPassTab === "rush" && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Price</span>
                                <span className="text-sm font-bold text-white">{channelPass.price_rush} 💎</span>
                              </div>
                              {walletBalance !== null && (
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                  <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>Your Ru$h balance</span>
                                  <span className={`text-sm font-bold ${walletBalance >= channelPass.price_rush ? "text-white" : "text-red-400"}`}>
                                    {walletBalance} 💎
                                  </span>
                                </div>
                              )}
                              {channelPassError && (
                                <p className="text-xs text-red-400 px-1">{channelPassError}</p>
                              )}
                              {walletBalance !== null && walletBalance < channelPass.price_rush ? (
                                <div className="space-y-2">
                                  <p className="text-xs px-1" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                                    You need {channelPass.price_rush - walletBalance} more Ru$h 💎.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setShowTopUpModal(true)}
                                    className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90"
                                    style={{ background: "linear-gradient(135deg, #7B61FF, #D4007A)" }}
                                  >
                                    Get more Ru$h 💎
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={channelPassBuying}
                                  onClick={async () => {
                                    if (!isAuthenticated) { navigate("/login"); return; }
                                    setChannelPassBuying(true);
                                    setChannelPassError(null);
                                    try {
                                      const res = await checkoutChannelPass(creator.id, "rush");
                                      if (res.success && res.expires_at) {
                                        setChannelPassResult({ expires_at: res.expires_at });
                                        setChannelPass((prev) => prev ? { ...prev, is_active: true, expires_at: res.expires_at } : prev);
                                        setWalletBalance((prev) => prev !== null && res.new_balance != null ? res.new_balance : prev);
                                      }
                                    } catch (err) {
                                      const msg = err instanceof Error ? err.message : "Purchase failed";
                                      if (msg.includes("INSUFFICIENT_FUNDS") || msg.includes("balance")) {
                                        setChannelPassError("Insufficient Ru$h 💎. Top up your wallet and try again.");
                                      } else {
                                        setChannelPassError(msg);
                                      }
                                    } finally {
                                      setChannelPassBuying(false);
                                    }
                                  }}
                                  className="w-full py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                                  style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                                >
                                  {channelPassBuying ? (
                                    <><Loader2 size={14} className="animate-spin" /> Processing…</>
                                  ) : (
                                    <>Subscribe for {channelPass.price_rush} 💎</>
                                  )}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Card tab */}
                          {channelPassTab === "card" && (
                            <div className="text-center py-4 space-y-3">
                              <CreditCard size={28} className="mx-auto" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }} />
                              <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                                Card payments coming soon — use Ru$h Wallet for now.
                              </p>
                            </div>
                          )}

                          {/* Crypto tab */}
                          {channelPassTab === "crypto" && (
                            <div className="text-center py-4 space-y-3">
                              <Bitcoin size={28} className="mx-auto" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }} />
                              <p className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                                Crypto payments coming soon — use Ru$h Wallet for now.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {/* Crystal Creator direct-services panel — renders nothing when the
              creator has no services (i.e., non-Crystal). Audience-gated. */}
          {CRYSTAL_UI_ENABLED && (
            <CrystalServicesPanel creatorId={creator.id} creatorUsername={creator.username || null} />
          )}

          {/* Crystal Creator CTA block — three mutually exclusive branches:
              1. Fan (not the creator) + creator is Crystal → "Gift Crystal Creator"
              2. Creator self-view + invited + not yet active → "Upgrade to Crystal Creator"
              3. Creator self-view + already active → "Crystal Creator (active until …)" */}
          {/* Crystal Creator CTA block — three mutually exclusive branches:
              1. Fan (not the creator) + creator is Crystal → "Gift Crystal Creator $150 / 30 days"
                 Two buttons: PNPtv Wallet (inline WalletPayCard) + Any crypto (NP popup)
              2. Creator self-view + invited + not yet active → "Upgrade to Crystal Creator $100 / 30 days"
                 Same two-button pattern, self-upgrade price.
              3. Creator self-view + already active → read-only status pill
              Deep-link ?renew=1 auto-opens the self-checkout panel on mount (for
              the T-3 renewal reminder DM/email). */}
          {creatorIsCrystal && !isOwnProfile && (
            <div
              className="mb-3 rounded-xl border"
              style={{ borderColor: crystalWalletMode === "gift" ? "rgba(52,199,89,0.35)" : "rgba(184,245,255,0.3)", background: "rgba(184,245,255,0.05)" }}
            >
              <div className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white">Crystal Creator</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {t.lang === "es"
                      ? "Regálale a este creador un pase Crystal Creator — $150 por 30 días"
                      : "Gift this creator a Crystal Creator pass — $150 for 30 days"}
                  </p>
                </div>
              </div>
              <div className="px-3 pb-3 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleCrystalWalletToggle("gift")}
                  className={`py-2.5 rounded-lg font-bold text-sm text-white transition-all ${crystalWalletMode === "gift" ? "bg-gradient-to-r from-emerald-400 to-emerald-500 ring-2 ring-emerald-300" : "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"}`}
                >
                  {t.lang === "es" ? "💳 Regalar $150" : "💳 Gift $150"}
                </button>
                <button
                  type="button"
                  onClick={() => handleCrystalNowPayments("gift")}
                  disabled={crystalNpLoading === "gift"}
                  className="py-2.5 rounded-lg font-bold text-sm text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-60"
                >
                  {crystalNpLoading === "gift" ? "…" : (t.lang === "es" ? "₿ Cualquier cripto" : "₿ Any crypto")}
                </button>
              </div>
              {crystalNpError && crystalWalletMode !== "gift" && (
                <p className="px-3 pb-3 text-[11px]" style={{ color: "#ff6b6b" }}>{crystalNpError}</p>
              )}
              {crystalWalletMode === "gift" && (
                <div className="px-3 pb-3" ref={crystalWalletPanelRef} onClick={(e) => e.stopPropagation()}>
                  <WalletPayCard
                    surface="crystal_gift"
                    amountUsd={150}
                    entitlementSpec={{ type: "crystal_gift", creatorId: data?.creator?.id }}
                    metadata={{ source: "creator_profile", creatorId: data?.creator?.id }}
                    label={`Gift Crystal Creator · $150 / 30 days — ${displayName}`}
                    lang={(user?.language as "es" | "en") || "en"}
                    onSuccess={() => {
                      setCrystalWalletMode(null);
                    }}
                    compact
                  />
                </div>
              )}
            </div>
          )}
          {!creatorIsCrystal && isOwnProfile && crystalInvited && (
            <div
              className="mb-3 rounded-xl border"
              style={{ borderColor: crystalWalletMode === "self" ? "rgba(52,199,89,0.35)" : "rgba(184,245,255,0.3)", background: "rgba(184,245,255,0.05)" }}
            >
              <div className="p-3">
                <p className="text-xs font-bold text-white mb-0.5">
                  {t.lang === "es" ? "Fuiste invitado a Crystal Creator" : "You've been invited to Crystal Creator"}
                </p>
                <p className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {t.lang === "es"
                    ? "Desbloquea beneficios exclusivos e insignia animada — $100 por 30 días"
                    : "Unlock exclusive benefits & animated badge — $100 for 30 days"}
                </p>
              </div>
              <div className="px-3 pb-3 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleCrystalWalletToggle("self")}
                  className={`py-2.5 rounded-lg font-bold text-sm text-white transition-all ${crystalWalletMode === "self" ? "bg-gradient-to-r from-emerald-400 to-emerald-500 ring-2 ring-emerald-300" : "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"}`}
                >
                  {t.lang === "es" ? "💳 Suscribirme $100" : "💳 Upgrade $100"}
                </button>
                <button
                  type="button"
                  onClick={() => handleCrystalNowPayments("self")}
                  disabled={crystalNpLoading === "self"}
                  className="py-2.5 rounded-lg font-bold text-sm text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-60"
                >
                  {crystalNpLoading === "self" ? "…" : (t.lang === "es" ? "₿ Cualquier cripto" : "₿ Any crypto")}
                </button>
              </div>
              {crystalNpError && crystalWalletMode !== "self" && (
                <p className="px-3 pb-3 text-[11px]" style={{ color: "#ff6b6b" }}>{crystalNpError}</p>
              )}
              {crystalWalletMode === "self" && (
                <div className="px-3 pb-3" ref={crystalWalletPanelRef} onClick={(e) => e.stopPropagation()}>
                  <WalletPayCard
                    surface="crystal_self"
                    amountUsd={100}
                    entitlementSpec={{ type: "crystal_self" }}
                    metadata={{ source: "creator_profile_self" }}
                    label="Upgrade to Crystal Creator · $100 / 30 days"
                    lang={(user?.language as "es" | "en") || "en"}
                    onSuccess={() => {
                      setCrystalWalletMode(null);
                    }}
                    compact
                  />
                </div>
              )}
            </div>
          )}
          {creatorIsCrystal && isOwnProfile && (
            <div
              className="mb-3 rounded-xl border p-3"
              style={{ borderColor: "rgba(184,245,255,0.3)", background: "rgba(184,245,255,0.05)" }}
            >
              <div className="flex items-center gap-2">
                <span className="creator-crystal-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide shrink-0">
                  <span aria-hidden className="text-[11px] leading-none">❖</span>
                  Crystal Creator
                </span>
                <span className="text-[11px]" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                  {crystalActiveUntil === null || crystalActiveUntil === "infinity"
                    ? (t.lang === "es" ? "Activo — de por vida" : "Active — lifetime")
                    : (t.lang === "es"
                        ? `Activo hasta ${new Date(crystalActiveUntil).toLocaleDateString("es", { month: "short", day: "numeric", year: "numeric" })}`
                        : `Active until ${new Date(crystalActiveUntil).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`)}
                </span>
              </div>

              {/* Inner Circle — VIP audience curated by Santino & Lex. Only
                  visible to active Crystal Creators viewing their own profile.
                  DM deep-link opens the platform DM thread directly. Internal
                  name is "Whale Pig" but that stays staff-only. */}
              {innerCircle && innerCircle.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-[11px] font-bold text-white mb-1.5">
                    {t.lang === "es" ? "◈ Tu Inner Circle" : "◈ Your Inner Circle"}
                  </p>
                  <p className="text-[10px] leading-snug mb-2" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                    {t.lang === "es"
                      ? "Nuestra audiencia VIP — los que más gastan y amigos personales de Santino y Lex. DM directo."
                      : "Our VIP audience — top spenders and personal friends of Santino & Lex. DM them directly."}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {innerCircle.map((wp) => (
                      <a
                        key={wp.id}
                        href={`/dm/${wp.id}`}
                        className="flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition min-w-0"
                      >
                        <img
                          src={wp.photo_url || "/uploads/avatars/default.webp"}
                          alt=""
                          className="w-8 h-8 rounded-full flex-shrink-0 object-cover bg-white/10"
                        />
                        <span className="text-[11px] text-white truncate">
                          @{wp.username || wp.first_name || wp.id.slice(0, 6)}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Onboarding tutorial banner — visible only when arriving via the
              post-signup redirect (?onboarding=1). Explains the 180 gifted
              Ru$h can cover this first sub. Hidden after subscription. */}
          {isOnboardingTutorial && !isSubscribed && !isOwnProfile && creator.username?.toLowerCase() === "santinofurioso" && (
            <div
              className="mb-3 rounded-xl border p-4 flex gap-3 items-start"
              style={{ borderColor: "rgba(212,0,122,0.4)", background: "linear-gradient(135deg,rgba(212,0,122,0.08),rgba(230,145,56,0.06))" }}
            >
              <span className="text-2xl flex-shrink-0" aria-hidden="true">🎁</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-pnp-textPrimary">
                  {user?.language === "es"
                    ? "¡Bienvenido! Tienes 180 Ru$h de regalo"
                    : "Welcome! You have 180 Ru$h on us"}
                </p>
                <p className="text-xs text-pnp-textSecondary mt-1 leading-relaxed">
                  {user?.language === "es"
                    ? "Úsalos para suscribirte al primer mes de Santino — sin costo. Así ves cómo funcionan las compras dentro de PNPtv!."
                    : "Use them to subscribe to Santino's first month — no extra cost. See how purchases work inside PNPtv!."}
                </p>
              </div>
            </div>
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
          {/* Action buttons: on desktop they cap at max-w-md so they don't
              stretch across the full 640px center column and feel balanced. */}
          {!isOwnProfile && !viewerUnlocked && (
            <button
              onClick={() => {
                if (isPrimeCreator) navigate("/subscribe");
                else handleSubscribeCta();
              }}
              className="w-full lg:max-w-md py-3 rounded-xl text-sm font-bold text-white mb-2.5 transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {isPrimeCreator
                ? `Unlock with PRIME 💎`
                : subscribeLabel}
            </button>
          )}
          {viewerUnlocked && !isOwnProfile && (
            <div className="flex gap-2.5 mb-2.5 lg:max-w-md">
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
            <div className="w-full lg:max-w-md flex gap-2 mb-2.5">
              <button
                onClick={() => navigate("/creator?tab=settings")}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white border transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
                style={{ borderColor: "rgba(255,255,255,0.15)", background: "transparent" }}
              >
                <Pencil size={14} /> Edit profile
              </button>
              <button
                onClick={() => setShowVideoUploadModal(true)}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 flex items-center justify-center gap-1.5 shadow-lg"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
              >
                <Video size={14} /> Upload Video
              </button>
            </div>
          )}

          {(unusedCredit30 || unusedCredit60) && (
            <div
              className="lg:max-w-md mb-2.5 px-3 py-2.5 rounded-xl text-xs flex items-center gap-2"
              style={{
                background: "rgba(212,0,122,0.10)",
                border: "1px solid rgba(212,0,122,0.35)",
                color: "#EBEBF5",
              }}
            >
              <Diamond size={14} style={{ color: "#D4007A", flexShrink: 0 }} />
              <span>
                You already have a paid{" "}
                <b>{unusedCredit60 ? "60-min" : "30-min"}</b> call credit — click{" "}
                <b>Book {unusedCredit60 ? "60" : "30"} min call</b> to schedule at no extra cost.
              </span>
            </div>
          )}

          <div className="flex gap-2.5 mb-4 lg:max-w-md">
            <button
              onClick={() => handleBookCall(30)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-90 relative"
              style={
                unusedCredit30
                  ? { borderColor: "#D4007A", color: "#fff", background: "rgba(212,0,122,0.15)" }
                  : { borderColor: "rgba(255,255,255,0.15)", color: "#fff", background: "transparent" }
              }
            >
              Book 30 min call
              {unusedCredit30 && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#D4007A", color: "#fff" }}
                >
                  ✓ PAID
                </span>
              )}
            </button>
            <button
              onClick={() => handleBookCall(60)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-90 relative"
              style={
                unusedCredit60
                  ? { borderColor: "#D4007A", color: "#fff", background: "rgba(212,0,122,0.15)" }
                  : { borderColor: "rgba(255,255,255,0.15)", color: "#fff", background: "transparent" }
              }
            >
              Book 60 min call
              {unusedCredit60 && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#D4007A", color: "#fff" }}
                >
                  ✓ PAID
                </span>
              )}
            </button>
          </div>

          {/* Tip button — only for authenticated non-self viewers who are active performers */}
          {isAuthenticated && !isOwnProfile && (data?.creator?.creator_role === "live" || data?.creator?.creator_role === "both") && (
            <div className="lg:max-w-md mb-4" ref={tipPanelRef}>
              <button
                onClick={() => {
                  if (!isAuthenticated) { navigate("/login"); return; }
                  setTipPanelOpen((v) => !v);
                  setTipResult(null);
                  setTipError("");
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
                style={{ borderColor: "rgba(255,255,255,0.15)", color: "#fff", background: "transparent" }}
              >
                <Diamond size={14} style={{ color: "var(--pnp-accent, #D4007A)" }} />
                Send a tip
              </button>

              {tipPanelOpen && (
                <div
                  className="mt-2 rounded-2xl p-4"
                  style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-white">Send a Rush tip</span>
                    {walletBalance !== null && (
                      <span className="text-xs" style={{ color: "var(--pnp-text-secondary, #8E8E93)" }}>
                        Your balance: {walletBalance} 💎
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {TIP_PRESETS_RUSH.map((amt) => {
                      const usdLabel = amt === 30 ? "$5" : amt === 60 ? "$10" : amt === 150 ? "$25" : amt === 300 ? "$50" : `$${Math.round(amt / 6)}`;
                      const selected = tipAmount === amt;
                      return (
                        <button
                          key={amt}
                          onClick={() => setTipAmount(amt)}
                          className="flex flex-col items-center justify-center py-2 rounded-xl text-[11px] font-semibold border transition-colors"
                          style={
                            selected
                              ? { borderColor: "var(--pnp-accent, #D4007A)", background: "rgba(212,0,122,0.12)", color: "#fff" }
                              : { borderColor: "rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.75)" }
                          }
                        >
                          <span>{amt}💎</span>
                          <span style={{ color: selected ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.4)" }}>{usdLabel}</span>
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    value={tipMessage}
                    onChange={(e) => setTipMessage(e.target.value.slice(0, 140))}
                    placeholder="Add a message… (optional)"
                    maxLength={140}
                    rows={2}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 resize-none outline-none mb-3"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />

                  {tipResult === "success" && (
                    <div className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: "#34C759" }}>
                      <Check size={14} strokeWidth={3} /> Tip sent!
                    </div>
                  )}
                  {tipResult === "error" && tipError === "INSUFFICIENT_TOKENS" && (
                    <div
                      className="rounded-xl p-3 mb-3"
                      style={{
                        background: "rgba(212,0,122,0.08)",
                        border: "1px solid rgba(212,0,122,0.30)",
                      }}
                    >
                      <p className="text-sm font-semibold text-white mb-1">
                        Not enough Ru$h 💎
                      </p>
                      <p className="text-xs mb-2.5" style={{ color: "rgba(255,255,255,0.72)" }}>
                        Buy Ru$h with crypto — it lands in your balance the moment the payment confirms.
                      </p>
                      {!hasInjectedWallet && (
                        <Link
                          to="/crypto-guide"
                          className="flex items-center gap-2 rounded-lg px-3 py-2 mb-2 text-xs font-semibold"
                          style={{
                            background: "rgba(123,97,255,0.10)",
                            border: "1px solid rgba(123,97,255,0.30)",
                            color: "#B8A5FF",
                          }}
                        >
                          <span aria-hidden>🪄</span>
                          <span>New here? Set up a wallet in 2 min →</span>
                        </Link>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowTopUpModal(true)}
                          className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-transform active:scale-95"
                          style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                        >
                          Buy Ru$h with crypto
                        </button>
                        <Link
                          to="/crypto-guide"
                          className="py-2 px-3 rounded-xl text-xs font-semibold flex items-center"
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.10)",
                            color: "rgba(255,255,255,0.85)",
                          }}
                        >
                          2-min guide
                        </Link>
                      </div>
                    </div>
                  )}
                  {tipResult === "error" && tipError !== "INSUFFICIENT_TOKENS" && tipError && (
                    <div className="text-sm mb-3" style={{ color: "#FF6B6B" }}>{tipError}</div>
                  )}

                  <button
                    onClick={handleSendTip}
                    disabled={!tipAmount || tipLoading || tipResult === "success"}
                    className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
                  >
                    {tipLoading ? "Sending…" : "Send tip"}
                  </button>
                </div>
              )}
            </div>
          )}

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
                className="w-full lg:max-w-md py-2.5 rounded-xl text-sm font-semibold mb-4 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
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
                  <div className="py-3 text-xs text-white/40">
                    {t.lang === "es" ? "Cargando…" : "Loading…"}
                  </div>
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

          {/* Wall — Posts / Tagged tabs. */}
          <div className="space-y-3">
            {/* Creator Video Upload Entry Card above the post wall — only on Posts tab */}
            {isOwnProfile && wallTab === "posts" && (
              <div className="mb-4 p-4 rounded-2xl bg-white/5 border border-white/10 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Video className="w-5 h-5 text-pink-500" />
                    <h3 className="text-sm font-bold text-white">Upload Video & Create Post</h3>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-semibold border border-pink-500/30">
                    ✨ AI Generator Enabled
                  </span>
                </div>
                <PostComposer
                  onPostCreated={(newPost) => {
                    setPosts((prev) => [newPost, ...prev]);
                  }}
                  placeholder="What's happening? Attach a video or photo with AI title, description & tags..."
                />
              </div>
            )}

            {/* Video Upload Modal */}
            {showVideoUploadModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setShowVideoUploadModal(false)}>
                <div className="relative w-full max-w-lg bg-[#1C1C1E] border border-white/15 rounded-2xl p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2 text-white font-bold text-base">
                      <Video className="w-5 h-5 text-pink-500" />
                      <span>Upload Video</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowVideoUploadModal(false)}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <PostComposer
                    onPostCreated={(newPost) => {
                      setPosts((prev) => [newPost, ...prev]);
                      setShowVideoUploadModal(false);
                    }}
                    placeholder="Upload video, set title, description & generate AI tags..."
                  />
                </div>
              </div>
            )}

            {/* Tab strip — Posts / Tagged */}
            <div
              className="flex border-b border-white/10 mb-3"
              role="tablist"
              aria-label={t.lang === "es" ? "Secciones del muro" : "Wall sections"}
            >
              <button
                role="tab"
                aria-selected={wallTab === "posts"}
                onClick={() => setWallTab("posts")}
                className={`flex-1 py-2.5 text-sm font-semibold text-center transition-colors relative ${
                  wallTab === "posts" ? "text-white" : "text-white/50 hover:text-white/70"
                }`}
              >
                {t.lang === "es" ? "Publicaciones" : "Posts"}
                {wallTab === "posts" && (
                  <span
                    className="absolute left-4 right-4 bottom-0 h-0.5 rounded-full"
                    style={{ background: "#2DD4BF" }}
                  />
                )}
              </button>
              <button
                role="tab"
                aria-selected={wallTab === "tagged"}
                onClick={() => setWallTab("tagged")}
                className={`flex-1 py-2.5 text-sm font-semibold text-center transition-colors relative inline-flex items-center justify-center gap-1.5 ${
                  wallTab === "tagged" ? "text-white" : "text-white/50 hover:text-white/70"
                }`}
              >
                <AtSign size={14} aria-hidden="true" />
                {t.lang === "es" ? "Etiquetas" : "Tagged"}
                {wallTab === "tagged" && (
                  <span
                    className="absolute left-4 right-4 bottom-0 h-0.5 rounded-full"
                    style={{ background: "#2DD4BF" }}
                  />
                )}
              </button>
            </div>

            {/* ── Posts tab ── */}
            {wallTab === "posts" && (
              <>
                {postsLoading && posts.length === 0 && (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {t.lang === "es" ? "Cargando…" : "Loading…"}
                  </div>
                )}
                {!postsLoading && postsError && posts.length === 0 && (
                  <div
                    className="text-center py-10 rounded-xl"
                    style={{ background: "var(--pnp-surface, #1e1e1e)", color: "var(--pnp-text-secondary, #8E8E93)" }}
                  >
                    <p className="text-sm mb-2">
                      {t.lang === "es"
                        ? "No pudimos cargar las publicaciones."
                        : "We couldn't load the posts."}
                    </p>
                    <button
                      onClick={() => {
                        if (!data?.creator?.id) return;
                        const id = data.creator.id;
                        setPostsLoading(true);
                        setPostsError(null);
                        getPublicProfile(id)
                          .then((res) => { setPosts(res.posts || []); setPostsCursor(res.nextCursor); })
                          .catch((err) => setPostsError(err instanceof Error ? err.message : "Could not load posts"))
                          .finally(() => setPostsLoading(false));
                      }}
                      className="text-xs px-3 py-1 rounded border border-white/20 hover:border-white/40"
                    >
                      {t.lang === "es" ? "Reintentar" : "Retry"}
                    </button>
                  </div>
                )}
                {!postsLoading && !postsError && posts.length === 0 && (
                  <div
                    className="text-center py-10 rounded-xl"
                    style={{ background: "var(--pnp-surface, #1e1e1e)", color: "var(--pnp-text-secondary, #8E8E93)" }}
                  >
                    <p className="text-sm">
                      {t.lang === "es" ? "Aún no hay publicaciones." : "No posts yet."}
                    </p>
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
                    {postsLoading
                      ? (t.lang === "es" ? "Cargando…" : "Loading…")
                      : (t.lang === "es" ? "Cargar más" : "Load more")}
                  </button>
                )}
              </>
            )}

            {/* ── Tagged tab ── */}
            {wallTab === "tagged" && (
              <div role="tabpanel" aria-label={t.lang === "es" ? "Publicaciones etiquetadas" : "Tagged posts"}>
                {taggedLoading && taggedPosts.length === 0 && (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {t.lang === "es" ? "Cargando…" : "Loading…"}
                  </div>
                )}
                {!taggedLoading && taggedError && taggedPosts.length === 0 && (
                  <div
                    className="text-center py-10 rounded-xl"
                    style={{ background: "var(--pnp-surface, #1e1e1e)", color: "var(--pnp-text-secondary, #8E8E93)" }}
                  >
                    <p className="text-sm mb-2">
                      {t.lang === "es"
                        ? "No pudimos cargar las etiquetas."
                        : "We couldn't load tagged posts."}
                    </p>
                    <button
                      onClick={() => {
                        setTaggedLoaded(false);
                        setTaggedError(null);
                      }}
                      className="text-xs px-3 py-1 rounded border border-white/20 hover:border-white/40"
                    >
                      {t.lang === "es" ? "Reintentar" : "Retry"}
                    </button>
                  </div>
                )}
                {!taggedLoading && !taggedError && taggedLoaded && taggedPosts.length === 0 && (
                  <div
                    className="text-center py-10 rounded-xl"
                    style={{ background: "var(--pnp-surface, #1e1e1e)", color: "var(--pnp-text-secondary, #8E8E93)" }}
                  >
                    <AtSign size={22} className="mx-auto mb-2 opacity-60" aria-hidden="true" />
                    <p className="text-sm">
                      {t.lang === "es"
                        ? `Nadie ha etiquetado a @${creator.username ?? ""} todavía.`
                        : `No one has tagged @${creator.username ?? ""} yet.`}
                    </p>
                  </div>
                )}
                {taggedPosts.map((post) => (
                  <div key={post.id} className="relative">
                    <PostCard
                      post={post}
                      isOwn={String(user?.dbId || user?.id) === post.author_id}
                      isAdmin={user?.role === "admin" || user?.role === "superadmin"}
                      isOwnProfile={String(user?.dbId || user?.id) === post.author_id}
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
                ))}
                {taggedCursor && (
                  <button
                    onClick={loadMoreTagged}
                    disabled={taggedLoading}
                    className="w-full py-2.5 rounded-xl text-xs font-medium mt-2 transition-opacity disabled:opacity-40"
                    style={{ background: "rgba(255,255,255,0.06)", color: "#fff" }}
                  >
                    {taggedLoading
                      ? (t.lang === "es" ? "Cargando…" : "Loading…")
                      : (t.lang === "es" ? "Cargar más" : "Load more")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        </div>{/* /center column */}

        {/* ── Right rail: desktop only (X.com pattern) ────────────────── */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            {/* More creators like this — powered by for-you recs */}
            {(forYou?.suggestedCreators ?? []).length > 0 && (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: "var(--pnp-surface, #1e1e1e)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="px-4 pt-3.5 pb-2">
                  <span className="text-[13px] font-semibold text-white">{t.nav.railMoreCreatorsLikeThis}</span>
                </div>
                <ul>
                  {(forYou?.suggestedCreators ?? []).slice(0, 4).map((c) => (
                    <SuggestedCreatorRow
                      key={c.userId}
                      item={c}
                      subscribeLabel={t.nav.railSubscribe}
                      viewLabel={t.nav.railView}
                    />
                  ))}
                </ul>
              </div>
            )}
            <CreatorRightRail excludeCreatorId={creator.id} />
          </div>
        </aside>
        </div>{/* /grid wrapper */}
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

      {/* ── Top-up Ru$h modal — opens on INSUFFICIENT_TOKENS from tip flow ─ */}
      <BuyTokensModal
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
        onSuccess={(newBalance) => {
          setWalletBalance(newBalance);
          setShowTopUpModal(false);
          setTipResult(null);
          setTipError("");
        }}
      />

      {/* ── Book Call Modal ────────────────────────────────────────────── */}
      {showBookCall && data && (
        <BookCallModal
          creator={{
            id: creator.id,
            username: creator.username,
            photo_url: creator.photo_url,
            creator_type: (["ice","crystal","diamond","occasional","full_time"].includes(creator.creator_type as string) ? creator.creator_type : "diamond") as CreatorType,
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

      {/* ── Free 15-min intro-call confirm sheet ────────────────────────── */}
      {showIntroCall && data && (
        <IntroCallConfirmSheet
          creatorId={creator.id}
          creatorName={creator.first_name || creator.username}
          onClose={() => setShowIntroCall(false)}
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

// ── Free 15-min intro call confirm sheet ─────────────────────────────────
// One-tap confirm modal fired by ?action=book&duration=15 (from the Featured
// Model of the Day interstitial). Fetches real eligibility so the sheet can
// render a specific reason ("already used" / "creator doesn't offer this")
// instead of a generic error. On confirm → POST /book-intro-call → redirects
// to /private-call/:bookingId where existing LiveKit UI takes over.
function IntroCallConfirmSheet({
  creatorId,
  creatorName,
  onClose,
}: {
  creatorId: string;
  creatorName: string;
  onClose: () => void;
}) {
  const t = useI18n();
  const es = t.lang === "es";
  const navigate = useNavigate();

  const [status, setStatus] = React.useState<{
    creatorOffers: boolean; viewerEligible: boolean; reason: string | null; isSelf: boolean;
  } | null>(null);
  const [booking, setBooking] = React.useState(false);
  const [bookErr, setBookErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!INTRO_CALL_ENABLED) { onClose(); return; }
    let cancelled = false;
    getIntroCallStatus(creatorId)
      .then((res) => { if (!cancelled) setStatus(res); })
      .catch(() => { if (!cancelled) setStatus({ creatorOffers: false, viewerEligible: false, reason: "load_failed", isSelf: false }); });
    return () => { cancelled = true; };
  }, [creatorId, onClose]);

  const confirm = async () => {
    setBooking(true);
    setBookErr(null);
    const res = await bookIntroCall(creatorId);
    if (res.ok) {
      navigate(`/private-call/${res.bookingId}`);
      return;
    }
    setBookErr(res.error);
    setBooking(false);
  };

  const canBook = !!status && status.creatorOffers && status.viewerEligible && !status.isSelf;
  const errorCopy: string | null = (() => {
    if (!status) return null;
    if (status.isSelf) return es ? "No podés reservar una llamada contigo mismo." : "You can't book a call with yourself.";
    if (!status.creatorOffers) return es ? "Este creador no ofrece intro gratis ahora mismo." : "This creator doesn't offer free intros right now.";
    if (!status.viewerEligible && status.reason === "already_used")
      return es ? "Ya usaste tu intro gratis — sos parte de la casa. Reservá una llamada regular abajo." : "You've already used your free intro — you're part of the family. Book a regular call below.";
    if (!status.viewerEligible) return es ? "No podés reservar en este momento." : "You can't book right now.";
    return null;
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(6,4,12,0.88)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "#111017", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold uppercase tracking-widest" style={{ color: "#5ED1C4" }}>
              {es ? "Intro gratis · 15 min" : "Free intro · 15 min"}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white"
              aria-label={es ? "Cerrar" : "Close"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>

          {!status ? (
            <div className="py-6 text-center text-sm text-white/70">
              {es ? "Cargando…" : "Loading…"}
            </div>
          ) : errorCopy ? (
            <>
              <p className="text-[15px] leading-snug text-white">{errorCopy}</p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-full font-semibold text-sm text-white btn-gradient"
              >
                {es ? "Entendido" : "Got it"}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-black leading-tight text-white">
                {es ? `Un saludo con ${creatorName}` : `Say hi to ${creatorName}`}
              </h2>
              <p className="text-[14px] leading-snug text-white/85">
                {es
                  ? "15 minutos, sin cargo, sin compromiso. Una sola vez por miembro — usá la tuya con el creador que más te llame."
                  : "15 minutes, no charge, no strings. One per member — spend yours on the creator that pulls you in."}
              </p>
              <div className="rounded-xl p-3 text-[12px] text-white/70" style={{ background: "rgba(94,209,196,0.08)", border: "1px solid rgba(94,209,196,0.2)" }}>
                {es
                  ? "Al confirmar te unís a la sala de video. Si el creador todavía no está, esperá unos segundos — vamos a avisarle."
                  : "Confirming drops you into the video room. If the creator isn't there yet, wait a moment — we'll ping them."}
              </div>
              {bookErr && (
                <div className="text-[13px] text-red-400">
                  {bookErr === "already_used"
                    ? (es ? "Ya usaste tu intro gratis." : "You've already used your free intro.")
                    : bookErr === "creator_not_opted_in"
                    ? (es ? "Este creador ya no ofrece intro gratis." : "This creator no longer offers free intros.")
                    : (es ? "No pudimos crear la sala. Intentá de nuevo." : "Couldn't create the room. Try again.")}
                </div>
              )}
              <button
                type="button"
                onClick={confirm}
                disabled={!canBook || booking}
                className="w-full py-3.5 rounded-full font-bold text-[15px] text-white btn-gradient shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {booking
                  ? (es ? "Creando sala…" : "Creating room…")
                  : (es ? "Empezar ahora" : "Start now")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-[13px] font-medium text-white/70 hover:text-white"
              >
                {es ? "Ahora no" : "Not now"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
