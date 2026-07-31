import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, Skeleton, Button } from "@pnptv/ui-kit";
import { useAuth } from "@/hooks/useAuth";
import { useTutorial } from "@/hooks/useTutorial";
import { TutorialOverlay } from "@/components/tutorial/TutorialOverlay";
import { useLiveSocket } from "@/hooks/useLiveSocket";
import { useI18n } from "@/lib/i18n";
import { EventDetailModal } from "@/components/events";
import type { EventItem } from "@/components/events/EventCard";
import { BuyTokensModal } from "@/components/BuyTokensModal";
import { loadPersistedActivation } from "@/components/TokenActivationForm";
import { getUpcomingEvents, getCastingStatus, submitCastingApplication, type CastingStatus, getTokenActivationStatus } from "@/lib/api";
import {
  getAllPerformers,
  getLiveStreams,
  getWalletBalance,
  getTokenPackages,
  buyTokens,
  assertPaymentUrl,
  getLiveSchedule,
  subscribeToSlotReminder,
  unsubscribeFromSlotReminder,
  getSlotNotifyStatus,
  listCreatorMedia,
  type FeaturedPerformer,
  type LiveStream,
  type LiveScheduleSlot,
  type TokenPackage,
  type CreatorMediaItem,
} from "@/lib/api";
import { PerformerDrawer } from "@/components/live/PerformerDrawer";
import { AppShell, RightRail, SuggestedCreatorRow, SuggestedFollowRow, useForYou } from "@/components/Layout";

const ALLOWED_IMAGE_HOSTS = ["cms.pnptv.app", "app.pnptv.app", "pnptv.app"];
function isValidPhotoUrl(photo: string | null | undefined): photo is string {
  if (!photo) return false;
  if (photo.startsWith("/uploads/")) return true;
  try {
    const url = new URL(photo);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      ALLOWED_IMAGE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
}

export default function Live() {
  const { isAuthenticated, user, login } = useAuth();
  const t = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { showTutorial, dismissTutorial, dismissForever } = useTutorial("live");
  const { data: forYou } = useForYou("live");
  const [liveEvents, setLiveEvents] = useState<EventItem[]>([]);
  const [detailEvent, setDetailEvent] = useState<EventItem | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearchQuery(val.trim()), 150);
  };
  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  };

  // Category filtering
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"popular" | "featured">("popular");
  const CATEGORIES = [
    { id: "all", label: "All" },
    { id: "clouds", label: t.live.tagClouds || "Clouds" },
    { id: "slamming", label: t.live.tagSlamming || "Slamming" },
    { id: "kinks", label: t.live.tagKinks || "Kinks" },
    { id: "chill", label: t.live.tagChill || "Chill" },
    { id: "party", label: t.live.tagParty || "Party" },
    { id: "hookups", label: t.live.tagHookups || "Hookups" },
    { id: "after-hours", label: t.live.tagAfterHours || "After Hours" },
  ];

  // Casting application
  const [castingStatus, setCastingStatus] = useState<CastingStatus | null>(null);
  const [castingSubmitting, setCastingSubmitting] = useState(false);

  // Performers & streams
  const [performers, setPerformers] = useState<FeaturedPerformer[]>([]);
  const [performersLoading, setPerformersLoading] = useState(true);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [prime247Live, setPrime247Live] = useState(false);

  // Dash token wallet
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [giftedBalance, setGiftedBalance] = useState<number>(0);
  const [dpnsHandle, setDpnsHandle] = useState<string | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);

  // Handle ?activate=CODE deep-link: open BuyTokensModal on the activation screen.
  // We MUST verify ownership on the backend first — otherwise an attacker could
  // craft /live?activate=THEIR_CODE and trick a victim into activating it under
  // the victim's session. Backend returns 401 UNAUTHORIZED if the code belongs
  // to a different user; we surface a clear message instead of silently loading.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const activateCode = params.get("activate");
    if (!activateCode) return;

    // Clean the URL param FIRST so a refresh doesn't re-trigger the attack path
    const newSearch = new URLSearchParams(location.search);
    newSearch.delete("activate");
    const newUrl =
      window.location.pathname +
      (newSearch.toString() ? "?" + newSearch.toString() : "") +
      window.location.hash;
    window.history.replaceState({}, "", newUrl);

    // If the user already has a persisted reservation for this exact code, just
    // reopen the modal — this is the legitimate "returning from Meru" case.
    const existing = loadPersistedActivation();
    if (existing && existing.activationCode === activateCode) {
      setShowBuyModal(true);
      return;
    }

    // Otherwise verify ownership via the status endpoint. If the response is
    // 401 the code isn't ours; do NOT open the modal or write to localStorage.
    (async () => {
      try {
        const status = await getTokenActivationStatus(activateCode);
        if (!status || status.status === "expired") {
          // Silently ignore — the code is either expired or unknown.
          return;
        }
        // Ownership confirmed by the backend (401 would have thrown). Synthesize
        // a minimal entry so the form renders; the real meruUrl will be blank
        // (button hidden by TokenActivationForm when empty).
        const expiresAt = status.expiresAt
          ? new Date(status.expiresAt).toISOString()
          : new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const synthetic = {
          code: activateCode,
          activationCode: activateCode,
          meruUrl: "",
          activationUrl: "",
          expiresAt,
          tokens: status.tokens ?? 0,
          packageKey: "",
        };
        localStorage.setItem("pnptv:token_activation:pending", JSON.stringify(synthetic));
        setShowBuyModal(true);
      } catch {
        // 401 or network error — do not open the modal. User can still use the
        // regular Buy Tokens flow if they want to purchase.
      }
    })();
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tokenPackages, setTokenPackages] = useState<TokenPackage[]>([]);
  const [buyingPackage, setBuyingPackage] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buyMethod, setBuyMethod] = useState<"dash">("dash");

  // Performer drawer
  const [drawerPerformer, setDrawerPerformer] = useState<FeaturedPerformer | null>(null);
  const [drawerStreamId, setDrawerStreamId] = useState<string | null>(null);
  const [drawerOpenInEditMode, setDrawerOpenInEditMode] = useState(false);
  // Album thumbnail cache: creatorId → first 2 thumbs
  const [albumThumbs, setAlbumThumbs] = useState<Record<string, CreatorMediaItem[]>>({});
  const thumbLoadedRef = useRef<Set<string>>(new Set());

  // Next Up schedule hero
  const [nextSlot, setNextSlot] = useState<LiveScheduleSlot | null>(null);
  const [nextSlotSubscribed, setNextSlotSubscribed] = useState(false);
  const [nextSlotNotifying, setNextSlotNotifying] = useState(false);
  const [countdownLabel, setCountdownLabel] = useState<string>("");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Socket (null stream — connected only for wallet push events)
  const {
    walletBalance: socketBalance,
    socketBalanceReceived,
  } = useLiveSocket(null);

  const fetchStreams = useCallback(() => {
    return getLiveStreams()
      .catch(() => ({ streams: [] }))
      .then((data) => (data.streams || []).filter((s: LiveStream) => s.isLive));
  }, []);

  const loadLiveEvents = useCallback(() => {
    getUpcomingEvents({ type: "live_stream", limit: 8 })
      .then((res) => { if (res.success) setLiveEvents(res.events); })
      .catch(() => {});
  }, []);

  // Check if the 24/7 Prime channel is live by querying the streams list.
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch("/api/proxy/live/streams", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) { if (!cancelled) setPrime247Live(false); return; }
        const data = await res.json();
        const mainStream = (data.streams || []).find((s: { id: string; isLive: boolean }) => s.id === "pnptv-main");
        if (!cancelled) setPrime247Live(!!mainStream?.isLive);
      } catch {
        if (!cancelled) setPrime247Live(false);
      }
    };
    probe();
    const iv = setInterval(probe, 45_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPerformersLoading(true);
    setLoadError(false);
    Promise.all([
      getAllPerformers(),
      fetchStreams(),
    ]).then(([perfData, mergedStreams]) => {
      const perf = perfData.performers || [];
      setPerformers(perf);
      setLiveStreams(mergedStreams as LiveStream[]);
      // Preload first 2 album thumbs for each performer (fire-and-forget)
      for (const p of perf) {
        const cid = p.userId || p.id;
        if (!cid || thumbLoadedRef.current.has(cid)) continue;
        thumbLoadedRef.current.add(cid);
        listCreatorMedia(cid, 2).then((res) => {
          setAlbumThumbs((prev) => ({ ...prev, [cid]: res.items || [] }));
        }).catch(() => {});
      }
    }).catch(() => {
      setLoadError(true);
    }).finally(() => setPerformersLoading(false));
    loadLiveEvents();

    // Refresh streams + featured (for isOnline/isPrime/hlsUrl) periodically,
    // paused when tab is hidden. Featured must be re-polled or the isOnline dot
    // and late-connect isLive fallback would go stale until the next page load.
    const refresh = () => {
      Promise.all([fetchStreams(), getAllPerformers().catch(() => null)])
        .then(([merged, perfData]) => {
          setLiveStreams(merged as LiveStream[]);
          if (perfData?.performers) setPerformers(perfData.performers);
        })
        .catch(() => {});
    };
    intervalRef.current = setInterval(refresh, 30000);

    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        refresh();
        intervalRef.current = setInterval(refresh, 30000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [fetchStreams, loadLiveEvents]);

  // Load wallet balance + packages when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    getWalletBalance()
      .then((data) => {
        // FE-M1: only apply the HTTP-fetched balance if the socket has not yet
        // delivered an authoritative value — prevents a stale HTTP response
        // from overwriting a more recent socket-pushed balance.
        if (!socketBalanceReceived) {
          setTokenBalance(data.balance);
        }
        setGiftedBalance(data.giftedBalance ?? 0);
        setDpnsHandle(data.dpnsHandle);
      })
      .catch(() => {});
    getTokenPackages()
      .then((data) => setTokenPackages(data.packages || []))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Sync socket-pushed balance updates — socket value always wins (FE-M1)
  useEffect(() => {
    if (socketBalance !== null) setTokenBalance(socketBalance);
  }, [socketBalance]);

  // Load casting status
  useEffect(() => {
    if (!isAuthenticated) return;
    getCastingStatus().then(setCastingStatus).catch(() => {});
  }, [isAuthenticated]);

  // Load next upcoming slot
  useEffect(() => {
    getLiveSchedule()
      .then((res) => {
        if (!res.success || !res.slots?.length) return;
        const now = Date.now();
        // Exclude currently-live slots (edge case — performer grid handles those)
        const upcoming = res.slots
          .filter((s) => !s.is_live && new Date(s.start_time).getTime() > now)
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        const slot = upcoming[0] ?? null;
        setNextSlot(slot);
        if (slot) {
          return getSlotNotifyStatus(slot.id)
            .then((r) => setNextSlotSubscribed(r.subscribed))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // Countdown ticker — recomputes every 30s, cleaned up on unmount
  useEffect(() => {
    if (!nextSlot) {
      setCountdownLabel("");
      return;
    }
    const compute = () => {
      const diffMs = new Date(nextSlot.start_time).getTime() - Date.now();
      if (diffMs <= 0) {
        setCountdownLabel("Starting now");
        return;
      }
      const totalMinutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0) {
        setCountdownLabel(`Starts in ${hours}h ${minutes}m`);
      } else {
        setCountdownLabel(`Starts in ${minutes}m`);
      }
    };
    compute();
    countdownRef.current = setInterval(compute, 30000);
    return () => {
      if (countdownRef.current !== null) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [nextSlot]);

  const handleBuyTokens = async (pkg: TokenPackage) => {
    setBuyingPackage(pkg.id);
    setBuyError(null);
    try {
      let checkoutUrl: string;
      // Dash — BTCPay has its own checkout page
      const result = await buyTokens(pkg.id);
      checkoutUrl = assertPaymentUrl(result.checkoutUrl);
      const openedPopup = window.open(checkoutUrl, "_blank", "noopener,noreferrer,width=600,height=700");
      if (!openedPopup) {
        setBuyError("Your browser blocked the payment popup. Please allow popups for this site and try again.");
        return; // don't close modal — user can retry
      }
      setShowBuyModal(false);
      // Fallback balance refresh 15s after checkout opens (in case Socket.IO event is missed)
      setTimeout(() => {
        getWalletBalance().then((res) => {
          if (typeof res.balance === 'number') setTokenBalance(res.balance);
        }).catch(() => {});
      }, 15_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("not available") || msg.includes("not configured")) {
        setBuyError(t.live.errorDashUnavailable);
      } else if (msg.includes("temporarily unavailable")) {
        setBuyError(t.live.errorPaymentServerDown);
      } else {
        setBuyError(msg || t.live.errorFailedToOpenCheckout);
      }
    } finally {
      setBuyingPackage(null);
    }
  };

  const handleCastingApply = async () => {
    setCastingSubmitting(true);
    try {
      const res = await submitCastingApplication();
      if (res.success) {
        setCastingStatus((prev) => prev ? { ...prev, application: res.application } : prev);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to submit application");
    } finally {
      setCastingSubmitting(false);
    }
  };

  const handleSlotNotify = async () => {
    if (!nextSlot || nextSlotNotifying) return;
    setNextSlotNotifying(true);
    try {
      if (nextSlotSubscribed) {
        await unsubscribeFromSlotReminder(nextSlot.id);
        setNextSlotSubscribed(false);
      } else {
        await subscribeToSlotReminder(nextSlot.id);
        setNextSlotSubscribed(true);
      }
    } catch {
      // ignore — state stays as-is
    } finally {
      setNextSlotNotifying(false);
    }
  };

  // Match a performer to their live stream by hlsUrl (injected by backend) or
  // exact userId. Fuzzy name/slug matching is intentionally excluded — it
  // caused false positives when multiple performers had similar display names.
  const findLiveStream = (p: FeaturedPerformer): LiveStream | undefined => {
    // Fast path: backend already injected hlsUrl — find the matching stream
    if (p.hlsUrl) {
      const match = liveStreams.find((s) => s.hlsUrl === p.hlsUrl);
      if (match) return match;
    }
    // Race-safe fallback: the featured endpoint fires once at mount, but streams
    // poll every 30s. If a creator went live AFTER page load, their performer
    // card has no hlsUrl — match on the owner IDs the streams endpoint now returns.
    const perfId = p.userId ? String(p.userId) : null;
    if (!perfId) return undefined;
    const byOwner = liveStreams.find(
      (s) => s.userId === perfId || s.pnptvId === perfId,
    );
    if (byOwner) return byOwner;
    // Legacy fallback: exact id match (kept for admin-visible orphan streams
    // whose owner row wasn't resolvable in the backend join).
    return liveStreams.find((s) => s.id === perfId);
  };

  // PNP Live is open to every viewer as of 2026-07-09 — no tier gate on the
  // discovery page. Monetization happens per-interaction: tips + private-call
  // bookings via tokens, and creators can still ticket individual streams if
  // they choose. Login is still required upstream to bind sessions to
  // wallets/entitlements; the previous isFree upsell block lived here.

  // Sort: live > online > offline. Within each state, featured (curated) first.
  // isLive is derived from liveStreams (polled), isOnline from presence heartbeat
  // — both authoritative per feedback_presence_state_hierarchy.md.
  const sortedPerformers = [...performers].sort((a, b) => {
    const aLive = !!findLiveStream(a);
    const bLive = !!findLiveStream(b);
    if (aLive !== bLive) return aLive ? -1 : 1;
    const aOnline = !!a.isOnline && !aLive;
    const bOnline = !!b.isOnline && !bLive;
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
    return 0;
  });

  // Magic search — matches query against displayName, name, bio, city, country,
  // slug. Category matching is handled below by auto-detecting when the query
  // exactly matches a category label.
  const searchedPerformers = searchQuery
    ? sortedPerformers.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          (p.displayName?.toLowerCase().includes(q) ?? false) ||
          (p.name?.toLowerCase().includes(q) ?? false) ||
          (p.bio?.toLowerCase().includes(q) ?? false) ||
          (p.city?.toLowerCase().includes(q) ?? false) ||
          (p.country?.toLowerCase().includes(q) ?? false) ||
          (p.slug?.toLowerCase().includes(q) ?? false)
        );
      })
    : sortedPerformers;

  // Live Now shows only live + online performers. Offline models are reachable
  // via the ⭐ All Models link in the header.
  const filteredPerformers = searchedPerformers.filter(
    (p) => !!findLiveStream(p) || !!p.isOnline,
  );

  // Auto-detect: when the user types a category label, surface the chip as the
  // "detected" suggestion so tapping it applies + clears the free-text query.
  const detectedCategory = searchInput
    ? CATEGORIES.find(
        (c) => c.id !== "all" && c.label.toLowerCase() === searchInput.trim().toLowerCase()
      )
    : null;
  const activeCategory = CATEGORIES.find((c) => c.id === selectedCategory);

  const liveCount = filteredPerformers.filter((p) => !!findLiveStream(p)).length;
  const onlineCount = filteredPerformers.filter((p) => p.isOnline && !findLiveStream(p)).length;
  const offlineCount = filteredPerformers.length - liveCount - onlineCount;

  const liveRail = (
    <RightRail
      sections={[
        {
          title: t.nav.railCreatorsToSubscribe,
          viewAllHref: "/models",
          viewAllLabel: t.nav.railViewAll,
          items: (forYou?.suggestedCreators ?? []).slice(0, 4).map((c) => (
            <SuggestedCreatorRow
              key={c.userId}
              item={c}
              subscribeLabel={t.nav.railSubscribe}
              viewLabel={t.nav.railView}
            />
          )),
        },
        {
          title: t.nav.railLiveViewersToFollow,
          items: (forYou?.suggestedFollows ?? []).slice(0, 4).map((f) => (
            <SuggestedFollowRow
              key={f.userId}
              item={f}
              followLabel={t.nav.railFollow}
              viewLabel={t.nav.railView}
            />
          )),
        },
      ]}
    />
  );

  return (
    <AppShell rightRail={liveRail}>
    <div className="page-container">
      <Helmet>
        <title>{t.live.pageTitle}</title>
        <meta name="description" content={t.live.pageDescription} />
      </Helmet>
      {showTutorial && <TutorialOverlay section="live" onDismiss={dismissTutorial} onDismissForever={dismissForever} />}

      {/* ── Header ── (design: LIVE NOW + amber ● N live counter) */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1
            className="text-white leading-none truncate"
            style={{ fontFamily: "'Ethnocentric Rg', 'Roboto Mono', monospace", fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            Live Now
          </h1>
          {liveCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold whitespace-nowrap" style={{ color: "#E69138" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#E69138" }} aria-hidden="true" />
              {liveCount} live
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate("/models")}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold text-pnp-textPrimary transition-colors hover:bg-white/10"
          style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)" }}
        >
          ⭐ All Models
        </button>
      </div>

      {/* ── Token wallet CTA — balance + buy + crypto-guide onramp ── */}
      {isAuthenticated && (() => {
        const es = t.lang === "es";
        return (
          <div
            className="mb-4 rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(212,0,122,0.10) 0%, rgba(0,141,228,0.10) 55%, rgba(247,147,26,0.10) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.03) inset",
            }}
          >
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-pnp-textSecondary/70">
                  {es ? "Tu saldo" : "Your balance"}
                </p>
                <p className="text-2xl font-black text-pnp-textPrimary leading-tight mt-0.5">
                  {tokenBalance == null ? "—" : tokenBalance.toLocaleString()}
                  <span className="ml-1.5 text-xs font-semibold text-pnp-textSecondary">
                    {es ? "tokens" : "tokens"}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setShowBuyModal(true)}
                className="flex-shrink-0 px-4 py-2.5 rounded-xl btn-gradient text-white text-sm font-bold shadow-lg transition-transform active:scale-[0.98]"
              >
                {es ? "Comprar tokens" : "Buy tokens"}
              </button>
            </div>
            <a
              href="/crypto-guide"
              className="group flex items-center gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/5 transition-colors"
            >
              <div className="relative flex-shrink-0" style={{ width: 44, height: 28 }}>
                {[
                  { bg: "#F7931A", letter: "₿", offset: 0,  z: 40 },
                  { bg: "#26A17B", letter: "₮", offset: 10, z: 30 },
                  { bg: "#008DE4", letter: "Đ", offset: 20, z: 20 },
                ].map((c) => (
                  <div
                    key={c.letter}
                    className="absolute top-0 w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-xs"
                    style={{ left: c.offset, zIndex: c.z, background: c.bg, border: "2px solid #0D0D0D" }}
                    aria-hidden="true"
                  >
                    {c.letter}
                  </div>
                ))}
              </div>
              <p className="flex-1 min-w-0 text-xs text-pnp-textPrimary leading-snug">
                <span className="font-bold">{es ? "¿Nuevo en crypto?" : "New to crypto?"}</span>{" "}
                <span className="text-pnp-textSecondary">
                  {es
                    ? "Configura una wallet (Trust o MetaMask) y paga con cripto en 7 pasos."
                    : "Set up a wallet (Trust or MetaMask) and pay with crypto in 7 steps."}
                </span>
              </p>
              <svg className="w-4 h-4 text-pnp-textSecondary group-hover:translate-x-0.5 transition-transform flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        );
      })()}

      {/* ── Magic Search — single sticky container: input + selected-category pill + chip rail ── */}
      <div
        className="sticky top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 mb-1"
        style={{ background: "linear-gradient(to bottom, var(--color-background, #0d0d0d) 80%, transparent)" }}
      >
        <div
          className="rounded-2xl border border-white/10 overflow-hidden group focus-within:border-pnp-accent/60 focus-within:shadow-[0_0_0_3px_rgba(212,0,122,0.15)] transition-all duration-200"
          style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
        >
          {/* Input row */}
          <div className="flex items-center gap-2 pl-3.5 pr-2 py-2.5">
            <svg
              className="w-4 h-4 flex-shrink-0 text-pnp-textSecondary group-focus-within:text-pnp-accent transition-colors duration-200"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7 7 0 104.65 4.65a7 7 0 0011.9 11.9z" />
            </svg>

            {/* Selected category pill (single-select) — removable */}
            {activeCategory && activeCategory.id !== "all" && (
              <button
                onClick={() => setSelectedCategory("all")}
                aria-label={`Remove ${activeCategory.label} filter`}
                className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-bold text-white flex-shrink-0 transition-transform active:scale-95"
                style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
              >
                {activeCategory.label}
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/25" aria-hidden="true">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              </button>
            )}

            <input
              type="search"
              inputMode="search"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={
                activeCategory && activeCategory.id !== "all"
                  ? `Search in ${activeCategory.label}…`
                  : performers.length > 0
                  ? `Ask or search ${performers.length} performers…`
                  : "Search performers or vibe…"
              }
              aria-label="Search live performers"
              style={{ fontSize: "16px" }}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-pnp-textPrimary placeholder-pnp-textSecondary/60"
            />

            {/* Right side: LIVE count when idle, results count when searching, clear */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {liveCount > 0 && !searchInput && (
                <span
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold text-white"
                  style={{ background: "rgba(239,68,68,0.85)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" aria-hidden="true" />
                  {liveCount} LIVE
                </span>
              )}
              {searchInput && filteredPerformers.length > 0 && (
                <span
                  className="px-2 py-1 rounded-full text-[10px] font-semibold text-pnp-textSecondary"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  {filteredPerformers.length}
                </span>
              )}
              {searchInput && (
                <button
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="w-6 h-6 rounded-full flex items-center justify-center text-pnp-textSecondary hover:text-white hover:bg-white/10 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Detected-category smart suggestion — appears when typed query matches a category label */}
          {detectedCategory && detectedCategory.id !== selectedCategory && (
            <div className="px-3 pb-2 border-t border-white/5 pt-2">
              <button
                onClick={() => { setSelectedCategory(detectedCategory.id); clearSearch(); }}
                className="flex items-center gap-1.5 text-[11px] text-pnp-textSecondary hover:text-white transition-colors"
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" style={{ color: "#E69138" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Filter by{" "}
                <span className="font-bold text-white px-1.5 py-0.5 rounded-full ml-0.5" style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}>
                  {detectedCategory.label}
                </span>
              </button>
            </div>
          )}

          {/* Category chip rail — inside the container, divided by hairline */}
          <div className="border-t border-white/5 px-2 py-2 flex gap-1.5 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-all duration-150 border ${
                    isActive
                      ? "text-white border-transparent shadow-sm"
                      : "text-pnp-textSecondary border-white/10 hover:border-pnp-accent/40 hover:text-pnp-textPrimary"
                  }`}
                  style={isActive ? { background: "linear-gradient(135deg, #D4007A, #E69138)", borderColor: "transparent" } : { background: "rgba(255,255,255,0.04)" }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {loadError && (
        <div className="mb-4 p-3 rounded-xl bg-pnp-error/10 border border-pnp-error/20 flex items-center justify-between">
          <p className="text-xs text-pnp-error">{t.live.failedToLoadStreams}</p>
          <button onClick={() => window.location.reload()} className="text-xs font-semibold text-pnp-accent">
            {t.live.retryLoading}
          </button>
        </div>
      )}
      {/* ── Casting Banner ── */}
      {isAuthenticated && castingStatus && (
        <div
          className="rounded-2xl p-4 mb-4 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(212,0,122,0.12) 0%, rgba(94,209,196,0.08) 100%)",
            border: "1px solid rgba(212,0,122,0.25)",
          }}
        >
          {castingStatus.application?.status === "pending" ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,179,64,0.1)", border: "1px solid rgba(255,179,64,0.25)" }}>
              <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#FFB340" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-medium" style={{ color: "#FFB340" }}>Application pending review</span>
            </div>
          ) : castingStatus.application?.status === "approved" ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(52,199,89,0.1)", border: "1px solid rgba(52,199,89,0.25)" }}>
              <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#34C759" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-medium" style={{ color: "#34C759" }}>Approved! Welcome to the team.</span>
            </div>
          ) : castingStatus.application?.status === "rejected" ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.25)" }}>
              <span className="text-xs" style={{ color: "#FF3B30" }}>Not approved this time. Keep posting and try again!</span>
            </div>
          ) : castingStatus.eligible ? (
            <button
              onClick={handleCastingApply}
              disabled={castingSubmitting}
              className="px-5 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #D4007A, #E69138)" }}
            >
              {castingSubmitting ? "Submitting..." : "Apply Now"}
            </button>
          ) : (
            <div>
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2 text-xs" style={{ color: castingStatus.hasPhoto ? "#34C759" : "#FF3B30" }}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    {castingStatus.hasPhoto ? (
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    )}
                  </svg>
                  Profile picture
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: castingStatus.postCount >= castingStatus.requiredPosts ? "#34C759" : "#FF3B30" }}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    {castingStatus.postCount >= castingStatus.requiredPosts ? (
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    )}
                  </svg>
                  {castingStatus.postCount}/{castingStatus.requiredPosts} posts
                </div>
              </div>
              <button
                disabled
                className="px-5 py-2 rounded-xl text-sm font-bold text-white/40 cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                Apply Now
              </button>
            </div>
          )}
        </div>
      )}




      {/* Compact status summary — one quiet line, no sort UI */}
      {!performersLoading && performers.length > 0 && (liveCount > 0 || onlineCount > 0 || offlineCount > 0) && (
        <div className="flex items-center gap-2 mb-3 mt-1 flex-wrap">
          {liveCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-bold"
              style={{ background: "#D4007A" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
              {liveCount} live
            </span>
          )}
          {onlineCount > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ color: "#34C759", background: "rgba(52,199,89,0.12)", border: "1px solid rgba(52,199,89,0.3)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#34C759" }} aria-hidden="true" />
              {onlineCount} online
            </span>
          )}
          {offlineCount > 0 && (
            <span className="text-[10px] font-medium text-pnp-textSecondary px-2 py-0.5">
              {offlineCount} offline
            </span>
          )}
        </div>
      )}
      {performersLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 mb-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-pnp-surface animate-pulse" />
          ))}
        </div>
      ) : performers.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 mb-4">
          {filteredPerformers.map((p) => {
            // isLive is derived exclusively from liveStreams (polled every 30 s from
            // /api/proxy/live/streams, which requires bitrate > 0). The featured
            // performers response is only fetched once on load, so p.isLive can go
            // stale and must not be used as an independent source of truth.
            // findLiveStream() matches by hlsUrl OR owner userId/pnptvId so late
            // connects still light up their card without a page refresh.
            const stream = findLiveStream(p);
            const isLive = !!stream;
            // Navigate using the stream's channel ref (e.g. "pnptv-santino") — simple,
            // URL-safe, and directly resolvable by the Stream page.
            const watchUrl = stream
              ? `/live/${stream.id}`
              : p.hlsUrl && p.userId
              ? `/live/${String(p.userId)}`
              : null;
            const cid = p.userId || p.id;
            const thumbs = cid ? (albumThumbs[cid] || []) : [];
            const thumb1 = thumbs[0];
            const isOwnCard = !!(user?.id && cid && String(user.id) === String(cid));

            // Image source priority: live thumbnail → album thumb → avatar → gradient
            const imgSrc = isLive && stream?.thumbnailUrl
              ? stream.thumbnailUrl
              : (thumb1?.thumbUrl || thumb1?.url)
              ? (thumb1.thumbUrl || thumb1.url)
              : isValidPhotoUrl(p.photoUrl)
              ? (p.photoUrl as string)
              : null;

            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${p.displayName} profile`}
                onClick={() => {
                  setDrawerOpenInEditMode(false);
                  setDrawerPerformer(p);
                  setDrawerStreamId(stream ? stream.id : p.hlsUrl && p.userId ? String(p.userId) : null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setDrawerOpenInEditMode(false);
                    setDrawerPerformer(p);
                    setDrawerStreamId(stream ? stream.id : p.hlsUrl && p.userId ? String(p.userId) : null);
                  }
                }}
                className={`group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform bg-pnp-surface ${!isLive && !p.isOnline ? "opacity-70" : ""}`}
              >
                {/* Full-bleed image (dimmed for offline performers) */}
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={p.displayName}
                    className={`absolute inset-0 w-full h-full object-cover ${!isLive && !p.isOnline ? "grayscale-[0.4]" : ""}`}
                    loading="lazy"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-pnp-accent/70 to-purple-600/70 flex items-center justify-center text-white text-3xl font-bold select-none"
                    aria-hidden="true"
                  >
                    {(p.displayName || "?").charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Bottom scrim gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

                {/* Top-left status badge — accurate live/online/offline */}
                {isLive ? (
                  <span
                    className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full text-white text-[10px] font-bold shadow-lg"
                    style={{ background: "#D4007A" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" aria-hidden="true" />
                    LIVE
                  </span>
                ) : p.isOnline ? (
                  <span
                    className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full text-white text-[10px] font-bold shadow-lg"
                    style={{ background: "#34C759" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" aria-hidden="true" />
                    Online
                  </span>
                ) : (
                  <span
                    className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold"
                    style={{ background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.65)", backdropFilter: "blur(4px)" }}
                  >
                    Offline
                  </span>
                )}

                {/* Top-right: viewer count when live */}
                {isLive && stream?.viewerCount && stream.viewerCount > 0 && (
                  <span className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold">
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {stream.viewerCount}
                  </span>
                )}

                {/* Bottom overlay: name + location */}
                <div className="absolute bottom-0 left-0 right-0 z-10 px-2.5 pb-2.5 pt-8">
                  <p className="text-white text-xs font-bold truncate drop-shadow-md leading-tight">
                    {p.displayName}
                  </p>
                  {(p.city || p.country) && (
                    <p className="text-white/70 text-[10px] truncate drop-shadow-sm leading-tight mt-0.5">
                      {[p.city, p.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>

                {/* Hover CTA overlay (desktop) */}
                <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto">
                  {isLive ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (watchUrl) navigate(watchUrl);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all shadow-lg"
                      aria-label={`Watch ${p.displayName} live`}
                    >
                      Watch Live
                    </button>
                  ) : p.isAvailable ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDrawerOpenInEditMode(false);
                        setDrawerPerformer(p);
                        setDrawerStreamId(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white btn-gradient active:scale-95 transition-all shadow-lg"
                      aria-label={`Book a session with ${p.displayName}`}
                    >
                      Book Now
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDrawerOpenInEditMode(false);
                        setDrawerPerformer(p);
                        setDrawerStreamId(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white active:scale-95 transition-all shadow-lg"
                      style={{ background: "rgba(212,0,122,0.80)" }}
                      aria-label={`View ${p.displayName} profile`}
                    >
                      View Profile
                    </button>
                  )}
                </div>

                {/* Edit shortcut — own card only */}
                {isOwnCard && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrawerOpenInEditMode(true);
                      setDrawerPerformer(p);
                      setDrawerStreamId(stream ? stream.id : p.hlsUrl && p.userId ? String(p.userId) : null);
                    }}
                    className="absolute bottom-2 right-2 z-30 w-7 h-7 rounded-full bg-pnp-accent/90 flex items-center justify-center shadow"
                    aria-label="Edit profile photos"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Search empty state */}
      {!performersLoading && searchQuery && filteredPerformers.length === 0 && performers.length > 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-pnp-textSecondary mb-2">No results for "{searchQuery}"</p>
          <button onClick={clearSearch} className="text-xs font-semibold text-pnp-accent hover:underline">
            Clear search
          </button>
        </div>
      )}

      {/* ── Community Live — streams not matched to any performer ── */}
      {(() => {
        // A stream is "matched" if a performer card already shows it — either via
        // findLiveStream() name/id match, or because the performer's own hlsUrl
        // points to it (backend-injected live users).
        const matchedStreamIds = new Set(
          performers.map((p) => findLiveStream(p)?.id).filter(Boolean)
        );
        const communityStreams = liveStreams.filter((s) => {
          if (matchedStreamIds.has(s.id)) return false;
          if (selectedCategory !== "all" && !s.tags?.includes(selectedCategory)) return false;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
              s.name?.toLowerCase().includes(q) ||
              s.title?.toLowerCase().includes(q) ||
              s.performerName?.toLowerCase().includes(q) ||
              s.tags?.some((tag) => tag.toLowerCase().includes(q))
            );
          }
          return true;
        });
        if (!performersLoading && communityStreams.length === 0 && performers.length === 0) {
          return (
            <p className="text-sm text-pnp-textSecondary text-center py-8">{t.live.noStreamsAvailable}</p>
          );
        }
        if (communityStreams.length === 0) return null;
        return (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold text-pnp-textSecondary uppercase tracking-wider">{t.live.communityLive}</h2>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                {communityStreams.length} LIVE
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {communityStreams.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Watch ${s.name || "live stream"}`}
                  onClick={() => navigate(`/live/${s.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter") navigate(`/live/${s.id}`); }}
                  className="group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform bg-pnp-surface"
                >
                  {/* Full-bleed thumbnail */}
                  {(s.thumbnailUrl && (isValidPhotoUrl(s.thumbnailUrl as string) || (s.thumbnailUrl as string).startsWith("data:"))) ? (
                    <img
                      src={s.thumbnailUrl as string}
                      alt={s.name || "Live stream"}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-red-900/60 to-pnp-surface flex items-center justify-center" aria-hidden="true">
                      <svg className="w-10 h-10 text-red-500/50" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
                      </svg>
                    </div>
                  )}

                  {/* Bottom scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

                  {/* Top-left: LIVE badge */}
                  <span className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" aria-hidden="true" />
                    LIVE
                  </span>

                  {/* Top-right: viewer count */}
                  {s.viewerCount && s.viewerCount > 0 ? (
                    <span className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold">
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {s.viewerCount}
                    </span>
                  ) : null}

                  {/* Bottom overlay: name + tags */}
                  <div className="absolute bottom-0 left-0 right-0 z-10 px-2.5 pb-2.5 pt-8">
                    <p className="text-white text-xs font-bold truncate drop-shadow-md leading-tight">
                      {s.name || s.title || s.performerName || "Live"}
                    </p>
                    {s.tags && s.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-black/50 backdrop-blur-sm border border-white/20 text-white/80"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hover CTA overlay */}
                  <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/live/${s.id}`); }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all shadow-lg"
                      aria-label={`Watch ${s.name || "live stream"}`}
                    >
                      {t.live.watchLive || "Watch Live"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Buy Tokens Modal */}
      <BuyTokensModal
        isOpen={showBuyModal}
        onClose={() => setShowBuyModal(false)}
        onSuccess={(newBalance) => setTokenBalance(newBalance)}
        dpnsHandle={dpnsHandle}
      />


      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
          onRsvp={async (eventId, shouldRsvp) => {
            setLiveEvents((prev) =>
              prev.map((e) => e.id === eventId ? { ...e, userRsvpd: shouldRsvp, rsvpCount: e.rsvpCount + (shouldRsvp ? 1 : -1) } : e)
            );
          }}
          onUpdated={(updated) => {
            setLiveEvents((prev) => prev.map((e) => e.id === updated.id ? updated : e));
            setDetailEvent(updated);
          }}
        />
      )}

      {/* ── Performer Drawer ── */}
      {drawerPerformer && (
        <PerformerDrawer
          performer={drawerPerformer}
          liveStreamId={drawerStreamId}
          onClose={() => { setDrawerPerformer(null); setDrawerStreamId(null); setDrawerOpenInEditMode(false); }}
          currentUserId={user?.id}
          openInEditMode={drawerOpenInEditMode}
          onAlbumUpdate={(cid, items) => {
            setAlbumThumbs((prev) => ({ ...prev, [cid]: items.slice(0, 2) }));
          }}
        />
      )}
    </div>
    </AppShell>
  );
}
