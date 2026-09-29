import { useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { browserHandoffStart } from "@/lib/api";
import { getTelegramWebApp, isTelegramContext } from "@/lib/telegram";

// Telegram only honours WebApp.openLink() synchronously inside the tap
// handler, so the signed-in handoff URL is minted ahead of time and kept
// here (shared by every button on the page). Server TTL is 10 min; refresh
// at 8 min so a tap never uses an expired token.
const REFRESH_MS = 8 * 60_000;
let cachedUrl: string | null = null;
let cachedAt = 0;
let inflight: Promise<void> | null = null;

function ensureHandoffUrl(): Promise<void> {
  if (cachedUrl && Date.now() - cachedAt < REFRESH_MS) return Promise.resolve();
  if (inflight) return inflight;
  inflight = browserHandoffStart()
    .then((r) => {
      if (r.success && r.url) { cachedUrl = r.url; cachedAt = Date.now(); }
    })
    .catch(() => { /* fall back to an unauthenticated link */ })
    .finally(() => { inflight = null; });
  return inflight;
}

export function useOpenInBrowser() {
  const { isAuthenticated } = useAuth();
  const inTelegram = typeof window !== "undefined" && isTelegramContext();

  useEffect(() => {
    if (!inTelegram || !isAuthenticated) return;
    ensureHandoffUrl();
    const iv = setInterval(() => { ensureHandoffUrl(); }, 60_000);
    return () => clearInterval(iv);
  }, [inTelegram, isAuthenticated]);

  const open = useCallback(() => {
    // Hash carries Telegram's tgWebAppData — never forward it.
    const returnTo = window.location.pathname + window.location.search;
    const target = cachedUrl
      ? `${cachedUrl}&returnTo=${encodeURIComponent(returnTo)}`
      : `${window.location.origin}${returnTo}`;
    // Tokens are single-use: drop it and mint the next one in the background.
    cachedUrl = null;
    const wa = getTelegramWebApp();
    if (wa?.openLink) wa.openLink(target, { try_instant_view: false });
    else window.open(target, "_blank", "noopener");
    if (isAuthenticated) setTimeout(() => { ensureHandoffUrl(); }, 1500);
  }, [isAuthenticated]);

  return { inTelegram, open };
}
