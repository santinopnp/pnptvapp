import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTier } from "@/hooks/useTier";
import { getAdsConfig, type AdSlotConfig, type AdSlotFormat } from "@/lib/api";

interface Props {
  slot: string;
  className?: string;
  style?: React.CSSProperties;
  onVastUrl?: (url: string) => void;
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

// Live pages get 60 seconds of grace at the top (viewer just landed — don't
// interrupt engagement). Also suppresses during an active tipping session
// (last tip < 5 min ago) to protect the highest-revenue moment.
const LIVE_GRACE_MS = 60 * 1000;
const TIP_GRACE_MS = 5 * 60 * 1000;

function isRouteSuppressed(pathname: string): boolean {
  return NO_AD_ROUTE_PATTERNS.some((r) => r.test(pathname));
}

function isLiveActivelyEngaged(pathname: string): boolean {
  if (!/^\/(live|stream)(\/|$)/.test(pathname)) return false;
  // Landing on live: use sessionStorage marker set on first mount by the page
  const landedAtStr = sessionStorage.getItem(`pnpapp:live:landed_at:${pathname}`);
  if (!landedAtStr) {
    sessionStorage.setItem(`pnpapp:live:landed_at:${pathname}`, String(Date.now()));
    return true; // first mount ⇒ grace window
  }
  const landedAt = parseInt(landedAtStr, 10);
  if (Date.now() - landedAt < LIVE_GRACE_MS) return true;
  // Active tipping window
  const lastTipStr = sessionStorage.getItem("pnpapp:live:last_tip_at");
  if (lastTipStr) {
    const lastTip = parseInt(lastTipStr, 10);
    if (Date.now() - lastTip < TIP_GRACE_MS) return true;
  }
  return false;
}

// Cache the anonymous/user session id so all events share it. Persisted in
// sessionStorage so it survives navigation but resets per browser session.
function getOrCreateSessionId(): string {
  const KEY = "pnpapp:ads:sid";
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, sid);
  }
  return sid;
}

// Client-side batched analytics — collects impression/click events, flushes
// every 15s or on visibilityChange=hidden, whichever comes first. Silent
// failures — instrumentation must never break rendering.
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
export function trackAdEvent(slot: string, type: string, metadata?: Record<string, unknown>) {
  eventQueue.push({ slot, type, metadata });
  ensureFlushLoop();
  if (eventQueue.length >= 20) flushEvents();
}

function sessionCapKey(slot: string) { return `pnpapp:adslot:${slot}:shown`; }

export function AdSlot({ slot, className, style, onVastUrl }: Props) {
  const { isPrime, isAdmin } = useTier();
  const location = useLocation();
  const routeSuppressed = isRouteSuppressed(location.pathname);
  const liveSuppressed = isLiveActivelyEngaged(location.pathname);
  const adsBlocked = isPrime || isAdmin || routeSuppressed || liveSuppressed;
  const ref = useRef<HTMLDivElement | null>(null);
  const [cfg, setCfg] = useState<AdSlotConfig | null>(null);
  const [scriptUrl, setScriptUrl] = useState<string | null>(null);

  useEffect(() => {
    if (adsBlocked) { setCfg(null); return; }
    let cancelled = false;
    getAdsConfig().then((r) => {
      if (cancelled) return;
      if (!r.showAds) return;
      // Server filters slots by tier — member only receives sticky_footer_*.
      // If this slot isn't in the response for the user's tier, it's silently skipped.
      const s = r.slots?.[slot];
      if (!s || !s.zoneId) return;
      setCfg(s);
      setScriptUrl(r.scriptUrl);
    });
    return () => { cancelled = true; };
  }, [slot, adsBlocked]);

  useEffect(() => {
    if (!cfg || adsBlocked) return;

    if (cfg.format === "vast") {
      if (cfg.vastUrl && onVastUrl) onVastUrl(cfg.vastUrl);
      trackAdEvent(slot, "impression", { format: "vast" });
      return;
    }

    if (POPUNDER_FORMATS.has(cfg.format)) {
      if (cfg.capPerSession > 0 && sessionStorage.getItem(sessionCapKey(slot))) return;
      loadScriptOnce(
        `https://a.magsrv.com/ad-provider.js`,
        { "data-cfasync": "false" },
      );
      const ins = document.createElement("ins");
      ins.className = "eas6a97888e17";
      ins.setAttribute("data-zoneid", String(cfg.zoneId));
      document.body.appendChild(ins);
      const push = document.createElement("script");
      push.type = "application/javascript";
      push.textContent = `(AdProvider = window.AdProvider || []).push({"serve": {}});`;
      document.body.appendChild(push);
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
      // Any click within the ad container counts as a click event.
      const onClick = () => trackAdEvent(slot, "click", { format: cfg.format });
      host.addEventListener("click", onClick, { once: false });
    }
  }, [cfg, scriptUrl, slot, adsBlocked, onVastUrl]);

  if (adsBlocked) return null;
  if (!cfg) return null;
  if (cfg.format === "vast") return null;
  if (POPUNDER_FORMATS.has(cfg.format)) return null;

  const [w, h] = (cfg.size || "").split("x").map((n) => parseInt(n, 10));
  const dimStyle: React.CSSProperties =
    Number.isFinite(w) && Number.isFinite(h) ? { minWidth: w, minHeight: h } : {};

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...dimStyle, ...style }}
      data-ad-slot={slot}
      aria-hidden="true"
    />
  );
}

export default AdSlot;
