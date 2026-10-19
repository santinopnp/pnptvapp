// Browser-context detection for payment flows (see PayInWalletChips'
// onramp notes): where window.open popups can't work.

// Embedded webviews where window.open is unsupported.
export function isInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData) return true;
  } catch { /* ignore */ }
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|TikTok|musical_ly|Line\/|Snapchat|Twitter|; wv\)/i.test(ua);
}

// True when running inside the Telegram WebApp container (any OS).
// Detected via the Telegram.WebApp.initData sentinel injected by the TG client.
export function isTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!(window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData;
  } catch {
    return false;
  }
}

// True when the user agent indicates an Android Instagram, TikTok, or Facebook
// in-app browser (applicable to both iOS and Android — the regex covers both,
// but callers that need OS discrimination combine this with /Android/i separately).
function isAndroidSocialWebview(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && /FBAN|FBAV|Instagram|TikTok|musical_ly/i.test(ua);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1);
}

export function isIOSStandalone(): boolean {
  if (typeof window === "undefined" || !isIOS()) return false;
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

// Contexts where MoonPay's popup cannot open, so only Stripe works in place.
export function popupsUnsupported(): boolean {
  return isInAppBrowser() || isIOSStandalone();
}

// Contexts where Stripe's SMS verification iframe is likely blocked or broken:
// Android Telegram WebApp, iOS Telegram WebApp, iOS in-app browsers
// (Instagram/TikTok/Snapchat), Android social webviews (IG/TikTok/FB),
// and iOS standalone PWA. Returns true → show pre-emptive warning before addFunds.
export function smsVerifLikelyBlocked(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Android Telegram WebApp
  if (/Android/i.test(ua) && isTelegramWebApp()) return true;
  // iOS Telegram WebApp
  if (isIOS() && isTelegramWebApp()) return true;
  // iOS standalone PWA
  if (isIOSStandalone()) return true;
  // iOS social webviews (Instagram/TikTok/Snapchat)
  if (isIOS() && /Instagram|TikTok|musical_ly|Snapchat/i.test(ua)) return true;
  // Android social webviews (Instagram/TikTok/Facebook)
  if (isAndroidSocialWebview()) return true;
  return false;
}

// Contexts where we should route the card onramp through MoonPay (useFundWallet)
// instead of Stripe (useAddFunds). MoonPay handles Telegram WebApp (both OS),
// and iOS/Android social in-app browsers without SMS verification. Returns false
// when VITE_MOONPAY_ONRAMP_ENABLED=false so the kill switch suppresses both paths.
// Stripe Link rate-limit cache. When Privy's addFunds returns
// "rate_limited" (Stripe SMS OTP throttled on the user's phone), we persist
// a flag with 4h TTL so subsequent visits skip Stripe entirely and go
// straight to MoonPay. Previously each new session re-tried Stripe → got
// rate-limited again → auto-switched → user still waited through the whole
// SMS OTP timeout. Now we never hit Stripe again until the window clears.
const STRIPE_RL_KEY = "pnp:stripe_rate_limited_until";
const STRIPE_RL_MS = 4 * 60 * 60 * 1000; // 4h

export function markStripeRateLimited(): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(STRIPE_RL_KEY, String(Date.now() + STRIPE_RL_MS)); } catch { /* private */ }
}

export function isStripeRateLimited(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(STRIPE_RL_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= Date.now()) {
      localStorage.removeItem(STRIPE_RL_KEY);
      return false;
    }
    return true;
  } catch { return false; }
}

// Apple Pay available in this browser. Reads synchronously — if the user's
// iPhone has Apple Pay cards registered AND they're in Safari, MoonPay's
// Apple Pay flow is one tap (no SMS OTP), far better UX than Stripe Link.
export function hasApplePay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ApplePaySession = (window as unknown as { ApplePaySession?: { canMakePayments: () => boolean } }).ApplePaySession;
    return !!ApplePaySession && typeof ApplePaySession.canMakePayments === "function" && ApplePaySession.canMakePayments();
  } catch { return false; }
}

// Reads the LATAM flag the useLatam() hook writes to sessionStorage after
// hitting /api/webapp/geo. If the fetch hasn't resolved yet (first page
// load before App bootstrap), returns false → falls back to current
// Stripe-default behavior. No regression; eventual-consistency is fine
// because `shouldPreferMoonPay()` is re-evaluated on every Pay click.
export function isLatamUserCached(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try { return sessionStorage.getItem("pnptv_geo_latam") === "1"; } catch { return false; }
}

export function shouldPreferMoonPay(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_MOONPAY_ONRAMP_ENABLED === "false") return false;
  const ua = navigator.userAgent || "";
  // Prior Stripe rate-limit on this device → skip Stripe for 4h
  if (isStripeRateLimited()) return true;
  // Android Telegram WebApp
  if (/Android/i.test(ua) && isTelegramWebApp()) return true;
  // iOS Telegram WebApp
  if (isIOS() && isTelegramWebApp()) return true;
  // iOS social webviews (Instagram/TikTok/Snapchat)
  if (isIOS() && /Instagram|TikTok|musical_ly|Snapchat/i.test(ua)) return true;
  // Android social webviews (Instagram/TikTok/Facebook)
  if (isAndroidSocialWebview()) return true;
  // iOS Safari with Apple Pay registered → MoonPay's Apple Pay tap is
  // better UX than Stripe Link's forced SMS OTP first step.
  if (isIOS() && hasApplePay()) return true;
  // LATAM users → MoonPay supports local currency rails (COP/MXN/BRL) and
  // Stripe Link OTP has a much higher failure rate on LATAM phone numbers.
  if (isLatamUserCached()) return true;
  return false;
}

