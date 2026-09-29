import { useOpenInBrowser } from "@/hooks/useOpenInBrowser";

// One-tap escape from Telegram's in-app browser to Safari/Chrome, keeping the
// user signed in. Renders nothing outside Telegram.
export function OpenInBrowserButton({ es, className = "" }: { es: boolean; className?: string }) {
  const { inTelegram, open } = useOpenInBrowser();
  if (!inTelegram) return null;
  return (
    <button
      type="button"
      onClick={open}
      className={`w-full py-2.5 rounded-xl text-sm font-bold text-white transition active:scale-[0.98] ${className}`}
      style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
    >
      {es ? "🌐 Abrir en el navegador" : "🌐 Open in browser"}
    </button>
  );
}
