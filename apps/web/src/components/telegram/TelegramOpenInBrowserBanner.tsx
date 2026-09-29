import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOpenInBrowser } from "@/hooks/useOpenInBrowser";
import { getTelegramWebApp } from "@/lib/telegram";

const DISMISS_KEY = "pnptv:tgBrowserBannerDismissed";

// Shown on every session that starts inside Telegram's in-app browser, which
// blocks card-payment windows and other popups. One tap opens the same page
// in Safari/Chrome already signed in. Dismissal only lasts for this session.
export function TelegramOpenInBrowserBanner() {
  const { user } = useAuth();
  const { inTelegram, open } = useOpenInBrowser();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  if (!inTelegram || dismissed) return null;

  const lang = user?.language
    || getTelegramWebApp()?.initDataUnsafe?.user?.language_code
    || (typeof navigator !== "undefined" ? navigator.language : "en");
  const es = (lang || "").toLowerCase().startsWith("es");

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9990] w-[calc(100%-2rem)] max-w-sm"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      role="region"
      aria-label={es ? "Abrir en el navegador" : "Open in browser"}
    >
      <div
        className="flex items-center gap-2 pl-3 pr-1.5 py-2 rounded-2xl shadow-2xl"
        style={{ background: "rgba(18,18,32,0.96)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        <p className="flex-1 text-[12px] leading-snug text-white/85">
          {es
            ? "Estás en el navegador de Telegram. Para pagar con Apple Pay o Google Pay, ábrelo en tu navegador."
            : "You're in Telegram's browser. To pay with Apple Pay or Google Pay, open it in your browser."}
        </p>
        <button
          type="button"
          onClick={open}
          className="flex-shrink-0 px-3 py-2 rounded-xl text-[12px] font-bold text-white active:scale-[0.97]"
          style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
        >
          {es ? "Abrir" : "Open"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={es ? "Cerrar" : "Dismiss"}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-white/50 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
