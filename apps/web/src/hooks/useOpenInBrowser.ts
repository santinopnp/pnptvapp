import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { browserHandoffStart } from "@/lib/api";
import { getTelegramWebApp, isTelegramContext } from "@/lib/telegram";
import { isIOS, popupsUnsupported } from "@/lib/browserEnv";

// Telegram only honours WebApp.openLink() synchronously inside the tap
// handler (and iOS scheme hand-offs must also run in the tap), so the
// signed-in handoff URL is minted ahead of time and shared by every button
// on the page. Server TTL is 10 min; refresh at 8 min.
const REFRESH_MS = 8 * 60_000;
let cachedUrl: string | null = null;
let cachedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function ensureHandoffUrl(): Promise<void> {
  if (cachedUrl && Date.now() - cachedAt < REFRESH_MS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = browserHandoffStart()
    .then((r) => {
      if (r.success && r.url) { cachedUrl = r.url; cachedAt = Date.now(); }
    })
    .catch(() => { /* fall back to an unauthenticated link */ })
    .finally(() => { inflight = null; listeners.forEach((l) => l()); });
  return inflight;
}

// Hand a URL to the real browser from wherever we are.
function openExternally(target: string) {
  const wa = getTelegramWebApp();
  if (isTelegramContext() && wa?.openLink) {
    wa.openLink(target, { try_instant_view: false });
    return;
  }
  const a = document.createElement("a");
  if (isIOS()) {
    // iOS 17+: x-safari-https:// opens Safari itself, escaping the
    // home-screen app and in-app browsers (Instagram, TikTok, …).
    a.href = target.replace(/^https:\/\//, "x-safari-https://");
  } else if (/Android/i.test(navigator.userAgent)) {
    const u = new URL(target);
    a.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
  } else {
    a.href = target;
    a.target = "_blank";
    a.rel = "noopener";
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (isIOS()) {
    // iOS < 17 ignores x-safari-https://. If we're still in the foreground,
    // fall back to a new-tab link (opens Safari's in-app sheet from the
    // home-screen app; the token wasn't consumed so it's still valid).
    setTimeout(() => {
      // Skip if Safari took over (hidden) or iOS is showing an "Open in
      // Safari?" prompt (window loses focus) — avoids opening twice.
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const b = document.createElement("a");
      b.href = target;
      b.target = "_blank";
      b.rel = "noopener";
      document.body.appendChild(b);
      b.click();
      b.remove();
    }, 1200);
  }
}

export function useOpenInBrowser() {
  const { isAuthenticated } = useAuth();
  const canEscape = typeof window !== "undefined" && (isTelegramContext() || popupsUnsupported());
  const [, force] = useState(0);

  useEffect(() => {
    if (!canEscape || !isAuthenticated) return;
    const l = () => force((n) => n + 1);
    listeners.add(l);
    ensureHandoffUrl();
    const iv = setInterval(() => { ensureHandoffUrl(); }, 60_000);
    return () => { listeners.delete(l); clearInterval(iv); };
  }, [canEscape, isAuthenticated]);

  const open = useCallback(() => {
    // Hash carries Telegram's tgWebAppData — never forward it.
    const returnTo = window.location.pathname + window.location.search;
    const target = cachedUrl
      ? `${cachedUrl}&returnTo=${encodeURIComponent(returnTo)}`
      : `${window.location.origin}${returnTo}`;
    // Tokens are single-use: drop it and mint the next one in the background.
    cachedUrl = null;
    openExternally(target);
    if (isAuthenticated) setTimeout(() => { ensureHandoffUrl(); }, 1500);
  }, [isAuthenticated]);

  // Signed-out users just get the plain URL, so they're always "ready".
  const ready = !isAuthenticated || !!cachedUrl;
  return { inTelegram: typeof window !== "undefined" && isTelegramContext(), canEscape, ready, open };
}
