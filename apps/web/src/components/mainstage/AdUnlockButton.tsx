import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getRewardedAdConfig,
  getRewardedAdActive,
  type RewardedAdConfig,
} from "@/lib/api";

// ── SDK URLs — operator must verify these with each network's account rep ──
// TODO: confirm TrafficJunky rewarded SDK URL with TJ account rep before go-live
const SDK_URL: Record<"trafficjunky" | "exoclick", string> = {
  trafficjunky: "https://ads.trafficjunky.com/sdk/rewarded.min.js",
  exoclick:     "https://a.magsrv.com/ad-sdk-rewarded.js",
};
const SDK_LOAD_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS    = 1_500;
const POLL_TIMEOUT_MS     = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

export interface AdUnlockButtonProps {
  surface: "mainstage_extend";
  onGranted: () => void;
  onError?: (msg: string) => void;
  lang: "en" | "es";
  variant?: "primary" | "secondary";
}

type Phase =
  | "loading_config"
  | "ready"
  | "exhausted"
  | "ad_loading"
  | "ad_playing"
  | "polling"
  | "success"
  | "error"
  | "hidden";

// Minimal typings for the two ad SDKs — both expose a similar constructor API.
interface RewardedAdSDK {
  new (opts: {
    zoneId: string;
    onComplete?: () => void;
    onReward?: () => void;
    onError?: (err: unknown) => void;
    onClose?: () => void;
  }): { show: () => void };
}

declare global {
  interface Window {
    TrafficJunkyRewarded?: RewardedAdSDK;
    ExoClickRewarded?: RewardedAdSDK;
  }
}

export function AdUnlockButton({
  surface,
  onGranted,
  onError,
  lang,
  variant = "secondary",
}: AdUnlockButtonProps) {
  const navigate = useNavigate();

  const [phase, setPhase]             = useState<Phase>("loading_config");
  const [config, setConfig]           = useState<RewardedAdConfig | null>(null);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [adBlocked, setAdBlocked]     = useState(false);
  const [failCount, setFailCount]     = useState(0);

  const scriptRef     = useRef<HTMLScriptElement | null>(null);
  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline  = useRef<number>(0);
  const mountedRef    = useRef(true);

  // ── i18n strings ──────────────────────────────────────────────────────────
  const t = {
    watchAd:        lang === "es" ? "Mira un anuncio · desbloquea 30 min"          : "Watch an ad · unlock 30 min",
    exhausted:      lang === "es" ? "Sin anuncios hoy — vuelve mañana"             : "No ads left today — try tomorrow",
    loading:        lang === "es" ? "Cargando…"                                     : "Loading…",
    adLoading:      lang === "es" ? "Preparando anuncio…"                           : "Preparing ad…",
    adPlaying:      lang === "es" ? "Mira el anuncio completo"                      : "Watch the full ad",
    polling:        lang === "es" ? "Verificando…"                                  : "Verifying…",
    success:        lang === "es" ? "¡Desbloqueado! Disfruta 30 min"               : "Unlocked! Enjoy 30 min",
    retry:          lang === "es" ? "Reintentar"                                    : "Retry",
    goPrime:        lang === "es" ? "Hazte PRIME"                                   : "Go PRIME",
    adBlocker:      lang === "es"
      ? "Desactiva tu bloqueador de anuncios para continuar, o actualiza a PRIME"
      : "Please disable your ad blocker to watch, or upgrade to PRIME",
    errorPrefix:    lang === "es" ? "Algo salió mal."                              : "Something went wrong.",
    leftToday: (n: number) =>
      lang === "es" ? `(quedan ${n} hoy)` : `(${n} left today)`,
  };

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
      removeScript();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch config on mount ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getRewardedAdConfig(surface);
        if (cancelled || !mountedRef.current) return;
        setConfig(res);
        if (!res.enabled || !res.ad_network || !res.zone_id) {
          setPhase("hidden");
        } else if (res.remaining_today <= 0) {
          setPhase("exhausted");
        } else {
          setPhase("ready");
        }
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        // Config fetch failed — hide silently; don't surface to user
        console.error("[AdUnlockButton] config fetch failed", err);
        setPhase("hidden");
      }
    })();
    return () => { cancelled = true; };
  }, [surface]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function stopPolling() {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function removeScript() {
    if (scriptRef.current && scriptRef.current.parentNode) {
      scriptRef.current.parentNode.removeChild(scriptRef.current);
      scriptRef.current = null;
    }
  }

  function handleFailure(userMsg: string, internalMsg?: string) {
    stopPolling();
    console.error("[AdUnlockButton]", internalMsg ?? userMsg);
    onError?.(userMsg);
    setErrorMsg(userMsg);
    setFailCount((c) => {
      const next = c + 1;
      if (next >= MAX_CONSECUTIVE_FAILURES) {
        setPhase("hidden");
      } else {
        setPhase("error");
      }
      return next;
    });
  }

  // ── Poll /active until server confirms the grant ──────────────────────────
  function startPolling() {
    if (!mountedRef.current) return;
    setPhase("polling");
    pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;

    pollTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) { stopPolling(); return; }

      if (Date.now() > pollDeadline.current) {
        stopPolling();
        handleFailure(
          lang === "es"
            ? "No se pudo confirmar el desbloqueo. Intenta de nuevo."
            : "Could not confirm your unlock. Please try again.",
          "poll timeout — /active never returned active=true",
        );
        return;
      }

      try {
        const res = await getRewardedAdActive(surface);
        if (!mountedRef.current) return;
        if (res.active) {
          stopPolling();
          setPhase("success");
          setFailCount(0);
          onGranted();
        }
      } catch (err) {
        // poll error — keep trying until deadline
        console.warn("[AdUnlockButton] poll error (will retry)", err);
      }
    }, POLL_INTERVAL_MS);
  }

  // ── Inject SDK script dynamically ─────────────────────────────────────────
  function loadSdk(network: "trafficjunky" | "exoclick"): Promise<void> {
    return new Promise((resolve, reject) => {
      // If already loaded, resolve immediately
      const alreadyLoaded =
        (network === "trafficjunky" && typeof window.TrafficJunkyRewarded === "function") ||
        (network === "exoclick"     && typeof window.ExoClickRewarded     === "function");
      if (alreadyLoaded) { resolve(); return; }

      const url = SDK_URL[network];
      const script = document.createElement("script");
      script.src   = url;
      script.async = true;

      const timeout = setTimeout(() => {
        reject(new Error(`SDK load timeout after ${SDK_LOAD_TIMEOUT_MS}ms`));
      }, SDK_LOAD_TIMEOUT_MS);

      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`SDK script failed to load — possible ad blocker`));
      };

      scriptRef.current = script;
      document.head.appendChild(script);
    });
  }

  // ── Show the rewarded ad unit ─────────────────────────────────────────────
  function showAd(network: "trafficjunky" | "exoclick", zoneId: string) {
    const SDKCtor =
      network === "trafficjunky"
        ? window.TrafficJunkyRewarded
        : window.ExoClickRewarded;

    if (typeof SDKCtor !== "function") {
      handleFailure(
        lang === "es"
          ? "No se pudo iniciar el anuncio. Intenta más tarde."
          : "Could not start the ad. Please try again later.",
        `SDK constructor not found on window after script load (network: ${network})`,
      );
      return;
    }

    if (!mountedRef.current) return;
    setPhase("ad_playing");

    try {
      const ad = new SDKCtor({
        zoneId,
        onComplete: () => {
          if (!mountedRef.current) return;
          startPolling();
        },
        onReward: () => {
          if (!mountedRef.current) return;
          startPolling();
        },
        onError: (err: unknown) => {
          if (!mountedRef.current) return;
          handleFailure(
            lang === "es"
              ? "El anuncio no se pudo reproducir. Intenta de nuevo."
              : "The ad could not play. Please try again.",
            `ad SDK onError: ${String(err)}`,
          );
        },
        onClose: () => {
          // User closed without completing — if polling hasn't started, surface retry
          if (!mountedRef.current) return;
          if (phase !== "polling" && phase !== "success") {
            handleFailure(
              lang === "es"
                ? "Debes ver el anuncio completo para desbloquear el acceso."
                : "You need to watch the full ad to unlock access.",
              "ad closed before onComplete/onReward fired",
            );
          }
        },
      });
      ad.show();
    } catch (err) {
      handleFailure(
        lang === "es"
          ? "Error al mostrar el anuncio. Intenta más tarde."
          : "Error showing the ad. Please try again later.",
        `SDKCtor threw: ${String(err)}`,
      );
    }
  }

  // ── Main click handler ────────────────────────────────────────────────────
  const handleClick = useCallback(async () => {
    if (!config || !config.ad_network || !config.zone_id) return;
    if (phase !== "ready" && phase !== "error") return;

    setPhase("ad_loading");
    setErrorMsg(null);
    setAdBlocked(false);

    try {
      await loadSdk(config.ad_network);
    } catch (err) {
      if (!mountedRef.current) return;
      const isAdBlocker =
        err instanceof Error &&
        err.message.toLowerCase().includes("ad blocker");
      if (isAdBlocker) {
        setAdBlocked(true);
        setPhase("error");
        setErrorMsg(t.adBlocker);
        onError?.(t.adBlocker);
        return;
      }
      handleFailure(
        lang === "es"
          ? "No se pudo cargar el anuncio. Verifica tu conexión."
          : "Could not load the ad. Check your connection.",
        `SDK load error: ${String(err)}`,
      );
      return;
    }

    if (!mountedRef.current) return;
    showAd(config.ad_network, config.zone_id);
  }, [config, phase, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  if (phase === "hidden" || phase === "loading_config") return null;

  const isPrimary  = variant === "primary";
  const isDisabled = phase !== "ready" && phase !== "error";

  // Base wrapper: mobile-first, full-width on small screens
  const baseWrapper = "flex flex-col items-center gap-2 w-full";

  // Button style variants — dark glass aesthetic matching FreeTierOverlay
  const btnBase =
    "relative flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed";

  const btnPrimary =
    "bg-gradient-to-r from-[#D4007A] to-[#7B61FF] text-white shadow-lg hover:brightness-110 disabled:opacity-50 disabled:brightness-75";

  const btnSecondary =
    "border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40";

  const btnStyle = isPrimary ? btnPrimary : btnSecondary;

  // ── Exhausted state ────────────────────────────────────────────────────
  if (phase === "exhausted") {
    return (
      <div className={baseWrapper}>
        <button disabled className={`${btnBase} ${btnSecondary} cursor-not-allowed`}>
          <span className="text-xs">{t.exhausted}</span>
        </button>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────
  if (phase === "success") {
    return (
      <div className={baseWrapper}>
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 bg-emerald-500/20 border border-emerald-500/30 w-full">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span className="text-sm font-semibold text-emerald-300">{t.success}</span>
        </div>
      </div>
    );
  }

  // ── Error / ad-blocker state ───────────────────────────────────────────
  const showRemaining =
    config &&
    config.remaining_today > 0 &&
    config.remaining_today < 3 &&
    (phase === "ready");

  return (
    <div className={baseWrapper}>
      {/* Main CTA button */}
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={`${btnBase} ${btnStyle}`}
        aria-busy={phase === "ad_loading" || phase === "ad_playing" || phase === "polling"}
      >
        {/* Icon */}
        {phase === "ad_loading" || phase === "polling" ? (
          <svg
            className="w-4 h-4 shrink-0 animate-spin text-current"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364-2.121 2.121M8.757 15.243l-2.121 2.121M18.364 18.364l-2.121-2.121M8.757 8.757 6.636 6.636" />
          </svg>
        ) : (
          // Play / MonitorPlay icon (lucide-style inline SVG, no import needed)
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="m10 8 5 3-5 3V8Z" fill="currentColor" stroke="none" />
            <path strokeLinecap="round" d="M8 21h8M12 17v4" />
          </svg>
        )}

        {/* Label */}
        <span>
          {phase === "ad_loading"  ? t.adLoading :
           phase === "ad_playing"  ? t.adPlaying  :
           phase === "polling"     ? t.polling    :
           phase === "error"       ? t.retry      :
           t.watchAd}
        </span>

        {/* Remaining today badge */}
        {showRemaining && (
          <span className="ml-1 text-xs opacity-60 font-normal">
            {t.leftToday(config!.remaining_today)}
          </span>
        )}
      </button>

      {/* Error message */}
      {phase === "error" && errorMsg && !adBlocked && (
        <p className="text-xs text-red-400/90 text-center px-2 leading-snug">
          {t.errorPrefix}{" "}
          <button
            onClick={() => navigate("/subscribe")}
            className="underline underline-offset-2 text-white/60 hover:text-white transition-colors"
          >
            {t.goPrime}
          </button>
        </p>
      )}

      {/* Ad-blocker specific message */}
      {adBlocked && (
        <p className="text-xs text-amber-400/90 text-center px-2 leading-snug">
          {t.adBlocker}{" — "}
          <button
            onClick={() => navigate("/subscribe")}
            className="underline underline-offset-2 text-white/70 hover:text-white transition-colors"
          >
            {t.goPrime}
          </button>
        </p>
      )}
    </div>
  );
}
