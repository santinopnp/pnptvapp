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
export function shouldPreferMoonPay(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_MOONPAY_ONRAMP_ENABLED === "false") return false;
  const ua = navigator.userAgent || "";
  // Android Telegram WebApp
  if (/Android/i.test(ua) && isTelegramWebApp()) return true;
  // iOS Telegram WebApp
  if (isIOS() && isTelegramWebApp()) return true;
  // iOS social webviews (Instagram/TikTok/Snapchat)
  if (isIOS() && /Instagram|TikTok|musical_ly|Snapchat/i.test(ua)) return true;
  // Android social webviews (Instagram/TikTok/Facebook)
  if (isAndroidSocialWebview()) return true;
  return false;
}

