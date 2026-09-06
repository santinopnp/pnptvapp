import { useEffect, useRef, useState, useCallback } from "react";
import {
  getRewardedAdConfig,
  issueRewardedAdNonce,
  verifyRewardedAdCompletion,
} from "@/lib/api";
import { trackAdEvent } from "@/components/AdSlot";

const SURFACE = "prime_trial_24h";
const REQUIRED_ADS = 3;
const AD_MIN_MS = 5_000;
const COUNTER_KEY = "pnpapp:rewarded:prime_trial:count";

interface Props {
  onClose: () => void;
  onGranted: (expiresAt: string) => void;
}

interface VastMedia {
  url: string;
  type: string;
}

/**
 * Parses a VAST 3.0 XML string and returns the first playable MediaFile.
 * Prefers MP4 over HLS since <video> playback of mp4 has the widest browser
 * support (Safari mobile + everything). Wrapper VASTs are followed one hop.
 */
async function fetchVastMedia(vastUrl: string): Promise<VastMedia | null> {
  const res = await fetch(vastUrl, { credentials: "omit" });
  if (!res.ok) return null;
  const xmlText = await res.text();
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");

  // Follow one Wrapper hop if present.
  const wrapper = doc.querySelector("Wrapper VASTAdTagURI");
  if (wrapper && wrapper.textContent) {
    const nextUrl = wrapper.textContent.trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    if (nextUrl && nextUrl !== vastUrl) return fetchVastMedia(nextUrl);
  }

  const mediaNodes = Array.from(doc.querySelectorAll("MediaFile"));
  const candidates: VastMedia[] = mediaNodes
    .map((n) => ({
      url: (n.textContent || "").trim().replace(/^<!\[CDATA\[|\]\]>$/g, ""),
      type: (n.getAttribute("type") || "").toLowerCase(),
    }))
    .filter((m) => m.url);
  // MP4 first, then anything else (webm/hls). Prefer progressive over HLS to
  // avoid needing hls.js just for a 30s ad.
  candidates.sort((a, b) => {
    const rank = (t: string) => (t.includes("mp4") ? 0 : t.includes("webm") ? 1 : t.includes("hls") ? 3 : 2);
    return rank(a.type) - rank(b.type);
  });
  return candidates[0] || null;
}

export function PrimeRewardedModal({ onClose, onGranted }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startedAtRef = useRef<number>(0);
  const [count, setCount] = useState<number>(() => {
    try { return parseInt(sessionStorage.getItem(COUNTER_KEY) || "0", 10) || 0; }
    catch { return 0; }
  });
  const [state, setState] = useState<"loading" | "ready" | "playing" | "granting" | "granted" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [media, setMedia] = useState<VastMedia | null>(null);

  const loadNextAd = useCallback(async () => {
    setState("loading");
    setErrorMsg(null);
    try {
      const cfg = await getRewardedAdConfig(SURFACE);
      if (!cfg.success || !cfg.enabled || !cfg.vast_url) {
        setErrorMsg("Rewarded ads not available");
        setState("error");
        return;
      }
      const found = await fetchVastMedia(cfg.vast_url);
      if (!found) {
        setErrorMsg("No playable ad found");
        setState("error");
        return;
      }
      setMedia(found);
      setState("ready");
    } catch (err) {
      setErrorMsg((err as Error).message || "load failed");
      setState("error");
    }
  }, []);

  useEffect(() => {
    trackAdEvent("prime_reward_modal", "upgrade_shown", { surface: "rewarded" });
    // Lock scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    loadNextAd();
    return () => { document.body.style.overflow = prev; };
  }, [loadNextAd]);

  const grantUnlock = useCallback(async () => {
    setState("granting");
    try {
      const nonceResp = await issueRewardedAdNonce(SURFACE);
      if (!nonceResp.success || !nonceResp.nonce) {
        setErrorMsg(nonceResp.error || "Could not issue reward");
        setState("error");
        return;
      }
      const elapsedMs = Math.max(AD_MIN_MS, REQUIRED_ADS * 10_000);
      const verify = await verifyRewardedAdCompletion(SURFACE, nonceResp.nonce, elapsedMs);
      if (!verify.success || !verify.expiresAt) {
        setErrorMsg(verify.error || "Verify failed");
        setState("error");
        return;
      }
      trackAdEvent("prime_reward_modal", "upgrade_click", { surface: "rewarded_unlocked" });
      sessionStorage.removeItem(COUNTER_KEY);
      setState("granted");
      onGranted(verify.expiresAt);
    } catch (err) {
      setErrorMsg((err as Error).message || "grant failed");
      setState("error");
    }
  }, [onGranted]);

  const onEnded = useCallback(() => {
    const elapsed = Date.now() - startedAtRef.current;
    if (elapsed < AD_MIN_MS) return; // guard against instant-skip attempts
    const next = count + 1;
    setCount(next);
    try { sessionStorage.setItem(COUNTER_KEY, String(next)); } catch { /* silent */ }
    trackAdEvent("prime_reward_modal", "impression", { surface: "rewarded_ad_complete", index: next });
    if (next >= REQUIRED_ADS) {
      grantUnlock();
    } else {
      loadNextAd();
    }
  }, [count, grantUnlock, loadNextAd]);

  const onPlay = () => { startedAtRef.current = Date.now(); setState("playing"); };

  const startAd = () => {
    const v = videoRef.current;
    if (!v || !media) return;
    v.src = media.url;
    v.play().catch(() => {
      // Autoplay blocked — surface a user-tap CTA
      setErrorMsg("Toca reproducir para empezar");
    });
  };

  useEffect(() => {
    if (state === "ready" && media && videoRef.current) {
      startAd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, media]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
      style={{ background: "rgba(6, 4, 12, 0.92)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl p-5 text-white"
        style={{
          background: "linear-gradient(160deg, #14091F 0%, #24102E 45%, #0F0817 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >✕</button>

        <div className="text-center space-y-2 mt-1">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase"
            style={{ background: "linear-gradient(90deg, #D4007A, #FF6B9D)", color: "#fff" }}
          >★ PRIME</div>
          <h2 className="text-lg font-bold leading-tight">
            {count} / {REQUIRED_ADS} ads — desbloqueá 24h de PRIME
          </h2>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: REQUIRED_ADS }).map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.10)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: i < count ? "100%" : "0%", background: "linear-gradient(90deg, #D4007A, #FF6B9D)" }}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 aspect-video w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center">
          {state === "loading" && <div className="text-sm text-white/60">Cargando ad…</div>}
          {state === "error" && (
            <div className="p-4 text-sm text-white/80 text-center">
              <div className="mb-2">{errorMsg || "Algo falló"}</div>
              <button type="button" onClick={loadNextAd} className="text-xs underline text-white/60 hover:text-white">Reintentar</button>
            </div>
          )}
          {state === "granting" && <div className="text-sm text-white/60">Desbloqueando PRIME…</div>}
          {state === "granted" && (
            <div className="p-4 text-center">
              <div className="text-2xl mb-1">🎉</div>
              <div className="text-sm font-bold">PRIME activo por 24 horas</div>
            </div>
          )}
          {(state === "ready" || state === "playing") && (
            <video
              ref={videoRef}
              className="w-full h-full"
              controls={false}
              playsInline
              muted={false}
              onPlay={onPlay}
              onEnded={onEnded}
              onError={() => {
                setErrorMsg("Error reproduciendo ad");
                setState("error");
              }}
            />
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-white/40">
          <span>Sin cargo · sin tarjeta</span>
          {state !== "granted" && (
            <button
              type="button"
              onClick={onClose}
              className="underline hover:text-white/70 transition-colors"
            >Cancelar</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PrimeRewardedModal;
