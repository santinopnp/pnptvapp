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

