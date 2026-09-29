import { useEffect, useState } from "react";
import { useOpenInBrowser } from "@/hooks/useOpenInBrowser";
import { isIOS } from "@/lib/browserEnv";

// One-tap escape from Telegram / in-app browsers / the iOS home-screen app to
// Safari/Chrome, keeping the user signed in. Renders nothing where not needed.
export function OpenInBrowserButton({ es, className = "" }: { es: boolean; className?: string }) {
  const { canEscape, ready, open } = useOpenInBrowser();
  // Don't hold the button hostage if the handoff mint is slow/failing.
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaitedOut(true), 3000); return () => clearTimeout(t); }, []);
  if (!canEscape) return null;
  const enabled = ready || waitedOut;
  const label = isIOS()
    ? (es ? "🧭 Abrir en Safari" : "🧭 Open in Safari")
    : (es ? "🌐 Abrir en el navegador" : "🌐 Open in browser");
  return (
    <button
      type="button"
      onClick={open}
      disabled={!enabled}
      className={`w-full py-2.5 rounded-xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-60 ${className}`}
      style={{ background: "linear-gradient(135deg,#D4007A,#E69138)" }}
    >
      {enabled ? label : (es ? "Preparando…" : "Preparing…")}
    </button>
  );
}
