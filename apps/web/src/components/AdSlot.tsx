import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTier } from "@/hooks/useTier";
import { getAdsConfig, type AdSlotConfig, type AdSlotFormat, type AdsUxFlags } from "@/lib/api";
import { UpgradeChip } from "@/components/UpgradeChip";
import { UpgradeModal } from "@/components/UpgradeModal";

interface Props {
  slot: string;
  className?: string;
  style?: React.CSSProperties;
  onVastUrl?: (url: string) => void;
  /** Set to false when the surrounding layout has its own upgrade CTA and we
   *  don't want the pill to duplicate it (default: true). */
  showChip?: boolean;
}

const loadedScripts = new Set<string>();
function loadScriptOnce(src: string, attrs: Record<string, string> = {}) {
  if (loadedScripts.has(src)) return;
  loadedScripts.add(src);
  const s = document.createElement("script");
  s.async = true;
  s.type = "application/javascript";
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
  s.src = src;
  document.head.appendChild(s);
}

const DISPLAY_FORMATS: ReadonlySet<AdSlotFormat> = new Set([
  "banner",
  "sticky_banner",
  "mobile_banner",
  "in_content_banner",
  "recommendation_widget",
  "multi_format",
  "instant_message",
  "push_inpage",
  "video_slider",
  "outstream_video",
  "vertical_video",
]);

const POPUNDER_FORMATS: ReadonlySet<AdSlotFormat> = new Set(["popunder", "mobile_popunder"]);

// Routes where ads are hard-suppressed regardless of tier — checkout, payment
// confirmation, and pending-wallet screens. Ads on these pages destroy
// conversion far more than they earn, so we drop them silently.
const NO_AD_ROUTE_PATTERNS: RegExp[] = [
  /^\/subscribe/,
  /^\/confirm-payment/,
  /^\/lifetime100/,
  /^\/join(\/|$)/,
  /^\/onboarding/,
  /^\/auth/,
];

const LIVE_GRACE_MS = 60 * 1000;
const TIP_GRACE_MS = 5 * 60 * 1000;

function isRouteSuppressed(pathname: string): boolean {
  return NO_AD_ROUTE_PATTERNS.some((r) => r.test(pathname));
}

function isLiveActivelyEngaged(pathname: string): boolean {
  if (!/^\/(live|stream)(\/|$)/.test(pathname)) return false;
  const landedAtStr = sessionStorage.getItem(`pnpapp:live:landed_at:${pathname}`);
  if (!landedAtStr) {
    sessionStorage.setItem(`pnpapp:live:landed_at:${pathname}`, String(Date.now()));
    return true;
  }
  const landedAt = parseInt(landedAtStr, 10);
  if (Date.now() - landedAt < LIVE_GRACE_MS) return true;
  const lastTipStr = sessionStorage.getItem("pnpapp:live:last_tip_at");
  if (lastTipStr) {
    const lastTip = parseInt(lastTipStr, 10);
    if (Date.now() - lastTip < TIP_GRACE_MS) return true;
  }
  return false;
}

function getOrCreateSessionId(): string {
  const KEY = "pnpapp:ads:sid";
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, sid);
  }
  return sid;
}

// ── Analytics batching ────────────────────────────────────────────────────
interface QueuedEvent { slot: string; type: string; metadata?: Record<string, unknown> }
const eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
async function flushEvents() {
  if (!eventQueue.length) return;
  const batch = eventQueue.splice(0, eventQueue.length);
  try {
    await fetch("/api/ads/event", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getOrCreateSessionId(), events: batch }),
      keepalive: true,
    });
  } catch { /* silent */ }
}
function ensureFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(flushEvents, 15_000);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushEvents();
    });
    window.addEventListener("pagehide", flushEvents);
  }
}
// Module-scope variant cache — set by the first AdSlot that gets the config.
// Every tracked event auto-injects this so ad_events.metadata.variant is
// consistent across all events in the session for post-hoc A/B analysis.
let cachedVariant: string | null = null;
export function setTrackedVariant(v: string | null) { cachedVariant = v; }

export function trackAdEvent(slot: string, type: string, metadata?: Record<string, unknown>) {
  const meta = cachedVariant
    ? { ...(metadata || {}), variant: cachedVariant }
    : metadata;
  eventQueue.push({ slot, type, metadata: meta });
  ensureFlushLoop();
  if (eventQueue.length >= 20) flushEvents();
}

// ── Session-scoped impression counter for interstitial trigger ─────────────
const SESSION_IMP_KEY = "pnpapp:ads:session_impressions";
const INTERSTITIAL_SHOWN_KEY = "pnpapp:ads:interstitial_shown_at";
const INTERSTITIAL_WEEK_KEY = "pnpapp:ads:interstitial_week_count";

function incrementSessionImpressions(): number {
  const cur = parseInt(sessionStorage.getItem(SESSION_IMP_KEY) || "0", 10) + 1;
  sessionStorage.setItem(SESSION_IMP_KEY, String(cur));
  return cur;
}

function canShowInterstitial(capPerWeek: number): boolean {
  if (capPerWeek <= 0) return false;
  const shownAtStr = sessionStorage.getItem(INTERSTITIAL_SHOWN_KEY);
  if (shownAtStr) return false; // already shown this session
  try {
    const weekRaw = localStorage.getItem(INTERSTITIAL_WEEK_KEY);
    const week = weekRaw ? JSON.parse(weekRaw) as { weekStart: number; count: number } : null;
    const now = Date.now();
    const weekStart = week?.weekStart ?? 0;
    if (!week || now - weekStart > 7 * 24 * 60 * 60 * 1000) return true; // fresh week
    return week.count < capPerWeek;
  } catch { return true; }
}

function recordInterstitialShown() {
  sessionStorage.setItem(INTERSTITIAL_SHOWN_KEY, String(Date.now()));
  try {
    const weekRaw = localStorage.getItem(INTERSTITIAL_WEEK_KEY);
    const week = weekRaw ? JSON.parse(weekRaw) as { weekStart: number; count: number } : null;
    const now = Date.now();
    if (!week || now - week.weekStart > 7 * 24 * 60 * 60 * 1000) {
      localStorage.setItem(INTERSTITIAL_WEEK_KEY, JSON.stringify({ weekStart: now, count: 1 }));
    } else {
      localStorage.setItem(INTERSTITIAL_WEEK_KEY, JSON.stringify({ ...week, count: week.count + 1 }));
    }
  } catch { /* silent */ }
}

// Fires an actual ExoClick popunder (fallback when user dismisses the upgrade modal).
function mountRealPopunder(zoneId: string, className: string) {
  loadScriptOnce("https://a.magsrv.com/ad-provider.js", { "data-cfasync": "false" });
  const ins = document.createElement("ins");
  ins.className = className;
  ins.setAttribute("data-zoneid", String(zoneId));
  document.body.appendChild(ins);
  const push = document.createElement("script");
  push.type = "application/javascript";
  push.textContent = `(AdProvider = window.AdProvider || []).push({"serve": {}});`;
  document.body.appendChild(push);
}

function sessionCapKey(slot: string) { return `pnpapp:adslot:${slot}:shown`; }

export function AdSlot({ slot, className, style, onVastUrl, showChip = true }: Props) {
  const { isPrime, isAdmin } = useTier();
  const location = useLocation();
  const routeSuppressed = isRouteSuppressed(location.pathname);
  const liveSuppressed = isLiveActivelyEngaged(location.pathname);
  const adsBlocked = isPrime || isAdmin || routeSuppressed || liveSuppressed;
  const ref = useRef<HTMLDivElement | null>(null);
  const [cfg, setCfg] = useState<AdSlotConfig | null>(null);
  const [scriptUrl, setScriptUrl] = useState<string | null>(null);
  const [ux, setUx] = useState<AdsUxFlags | null>(null);
  const [modalMode, setModalMode] = useState<"popunder_replacement" | "interstitial" | null>(null);

  useEffect(() => {
    if (adsBlocked) { setCfg(null); return; }
    let cancelled = false;
    getAdsConfig().then((r) => {
      if (cancelled) return;
      if (r.ux?.variant) setTrackedVariant(r.ux.variant);
      if (!r.showAds) return;
      const s = r.slots?.[slot];
      if (!s || !s.zoneId) return;
      setCfg(s);
      setScriptUrl(r.scriptUrl);
      setUx(r.ux || null);
    });
    return () => { cancelled = true; };
  }, [slot, adsBlocked]);

  const dismissModal = useCallback((reason: "closed" | "fallback_popunder") => {
    setModalMode(null);
    if (reason === "fallback_popunder" && cfg && POPUNDER_FORMATS.has(cfg.format)) {
      const insClass = "eas6a97888e17";
      mountRealPopunder(String(cfg.zoneId), insClass);
    }
    trackAdEvent(slot, "dismiss", { reason });
  }, [cfg, slot]);

  useEffect(() => {
    if (!cfg || adsBlocked) return;

    if (cfg.format === "vast") {
      if (cfg.vastUrl && onVastUrl) onVastUrl(cfg.vastUrl);
      trackAdEvent(slot, "impression", { format: "vast" });
      return;
    }

    if (POPUNDER_FORMATS.has(cfg.format)) {
      if (cfg.capPerSession > 0 && sessionStorage.getItem(sessionCapKey(slot))) return;
      // Replace popunder with UpgradeModal for logged-in free users.
      if (ux?.upgradeModalMode === "replace_popunder") {
        if (cfg.capPerSession > 0) sessionStorage.setItem(sessionCapKey(slot), "1");
        setModalMode("popunder_replacement");
        return;
      }
      // Otherwise fire the real popunder (default legacy path for anon).
      mountRealPopunder(String(cfg.zoneId), "eas6a97888e17");
      if (cfg.capPerSession > 0) sessionStorage.setItem(sessionCapKey(slot), "1");
      trackAdEvent(slot, "popunder_fired", { format: cfg.format });
      return;
    }

    if (DISPLAY_FORMATS.has(cfg.format) && ref.current) {
      if (cfg.capPerSession > 0 && sessionStorage.getItem(sessionCapKey(slot))) return;
      if (scriptUrl) loadScriptOnce(scriptUrl);
      const host = ref.current;
      host.innerHTML = "";
      const ins = document.createElement("ins");
      ins.className = "eas6a97888e2";
      ins.setAttribute("data-zoneid", String(cfg.zoneId));
      host.appendChild(ins);
      const push = document.createElement("script");
      push.type = "application/javascript";
      push.textContent = `(AdProvider = window.AdProvider || []).push({"serve": {}});`;
      host.appendChild(push);
      if (cfg.capPerSession > 0) sessionStorage.setItem(sessionCapKey(slot), "1");
      trackAdEvent(slot, "impression", { format: cfg.format, size: cfg.size });

      // Bump session impression count + maybe fire the interstitial upgrade
      // modal (fresh, not this ad). Cap: 1/session + N/week per user.
      const total = incrementSessionImpressions();
      const threshold = ux?.interstitialAfterN ?? 0;
      const capWeek = ux?.interstitialCapPerWeek ?? 0;
      if (threshold > 0 && total >= threshold && canShowInterstitial(capWeek)) {
        recordInterstitialShown();
        setModalMode("interstitial");
      }

      // Any click within the ad container counts as a click event.
      const onClick = () => trackAdEvent(slot, "click", { format: cfg.format });
      host.addEventListener("click", onClick, { once: false });
    }
  }, [cfg, scriptUrl, slot, adsBlocked, onVastUrl, ux]);

  if (adsBlocked) return null;

  const modalPortal = modalMode
    ? createPortal(
        <UpgradeModal slot={slot} mode={modalMode} onDismiss={dismissModal} />,
        document.body,
      )
    : null;

  if (!cfg) return modalPortal;
  if (cfg.format === "vast") return modalPortal;
  if (POPUNDER_FORMATS.has(cfg.format)) return modalPortal;

  const [w, h] = (cfg.size || "").split("x").map((n) => parseInt(n, 10));
  const dimStyle: React.CSSProperties =
    Number.isFinite(w) && Number.isFinite(h) ? { minWidth: w, minHeight: h } : {};

  return (
    <>
      <div className="inline-flex flex-col items-center gap-1">
        <div
          ref={ref}
          className={className}
          style={{ ...dimStyle, ...style }}
          data-ad-slot={slot}
          aria-hidden="true"
        />
        {showChip && ux?.showUpgradeChip ? <UpgradeChip slot={slot} /> : null}
      </div>
      {modalPortal}
    </>
  );
}

export default AdSlot;
