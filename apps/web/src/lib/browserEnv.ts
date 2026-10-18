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
// Android Telegram WebApp, iOS in-app browsers (Instagram/TikTok/Snapchat),
// and iOS standalone PWA. Returns true → show pre-emptive warning before addFunds.
export function smsVerifLikelyBlocked(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isTelegramAndroid =
    /Android/i.test(ua) &&
    !!(window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  if (isTelegramAndroid) return true;
  if (isIOSStandalone()) return true;
  if (isIOS() && /Instagram|TikTok|musical_ly|Snapchat/i.test(ua)) return true;
  return false;
}

// Contexts where we should route the card onramp through MoonPay (useFundWallet)
// instead of Stripe (useAddFunds). MoonPay handles Android Telegram WebApp
// and iOS social in-app browsers without SMS verification. Returns false when
// VITE_MOONPAY_ONRAMP_ENABLED=false so the kill switch suppresses both paths.
export function shouldPreferMoonPay(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_MOONPAY_ONRAMP_ENABLED === "false") return false;
  const ua = navigator.userAgent || "";
  const isTelegramAndroid =
    /Android/i.test(ua) &&
    !!(window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  if (isTelegramAndroid) return true;
  if (isIOS() && /Instagram|TikTok|musical_ly|Snapchat/i.test(ua)) return true;
  return false;
}

