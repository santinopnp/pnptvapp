/**
 * VastAdPlayer — full-screen modal that plays a VAST tag via Google IMA HTML5 SDK.
 *
 * IMA SDK docs: https://developers.google.com/interactive-media-ads/docs/sdks/html5
 *
 * Props:
 *   vastUrl    — the ad tag URL supplied by the backend config endpoint
 *   onComplete — fires with elapsed_ms when the ad fires COMPLETE / ALL_ADS_COMPLETED
 *   onError    — fires with an internal error key when something goes wrong; caller
 *                translates the key to a user-visible message
 *   onClose    — fires when the user dismisses the modal before completion
 *   lang       — "en" | "es" for bilingual copy
 *
 * Design: dark-glass aesthetic, matches FreeTierEntryCard / VideoPaywallOverlay.
 * Never mentions "Google IMA", "TrafficStars", or any ad-network brand in copy.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ── IMA SDK type stubs ─────────────────────────────────────────────────────────
// Minimal hand-rolled stubs — avoids installing @types/google.ima.
// All `addEventListener` overloads accept `(e: any) => void` so callers can
// use their preferred specific event type without a union cast.

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace IMA {
  enum ViewMode { NORMAL = "normal", FULLSCREEN = "fullscreen" }

  interface Settings {
    setDisableCustomPlaybackForIOS10Plus(v: boolean): void;
  }

  interface AdDisplayContainerStatic {
    new (containerElement: HTMLElement, videoElement: HTMLVideoElement): AdDisplayContainer;
  }
  interface AdDisplayContainer {
    initialize(): void;
    destroy(): void;
  }

  interface AdsLoaderStatic {
    new (container: AdDisplayContainer): AdsLoader;
  }
  interface AdsLoader {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener(event: string, handler: (e: any) => void, useCapture?: boolean): void;
    contentComplete(): void;
    destroy(): void;
    getSettings(): Settings;
    requestAds(request: AdsRequest): void;
  }

  interface AdsRequestStatic {
    new (): AdsRequest;
  }
  interface AdsRequest {
    adTagUrl: string;
    linearAdSlotWidth: number;
    linearAdSlotHeight: number;
    nonLinearAdSlotWidth: number;
    nonLinearAdSlotHeight: number;
  }

  interface AdsManagerLoadedEvent {
    getAdsManager(videoElement: HTMLVideoElement): AdsManager;
  }

  interface AdErrorEvent {
    getError(): { getMessage(): string } | null;
  }

  interface AdEvent {
    type: string;
  }

  interface AdsManager {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener(event: string, handler: (e: any) => void, useCapture?: boolean): void;
    init(width: number, height: number, viewMode: ViewMode): void;
    start(): void;
    destroy(): void;
    pause(): void;
    resume(): void;
    setVolume(v: number): void;
  }

  // Event type string constants — mirrors google.ima.AdEvent.Type values
  const AdEventType: {
    STARTED:           "start";
    COMPLETE:          "complete";
    ALL_ADS_COMPLETED: "allAdsCompleted";
    SKIPPED:           "skip";
    PAUSED:            "pause";
    RESUMED:           "resume";
  };

  const AdErrorEventType: {
    AD_ERROR: "adError";
  };

  const AdsManagerLoadedEventType: {
    ADS_MANAGER_LOADED: "adsManagerLoaded";
  };
}

// What `window.google.ima` looks like at runtime
interface ImaNamespace {
  ViewMode: typeof IMA.ViewMode;
  AdDisplayContainer: IMA.AdDisplayContainerStatic;
  AdsLoader: IMA.AdsLoaderStatic;
  AdsRequest: IMA.AdsRequestStatic;
  AdEvent: { Type: typeof IMA.AdEventType };
  AdErrorEvent: { Type: typeof IMA.AdErrorEventType };
  AdsManagerLoadedEvent: { Type: typeof IMA.AdsManagerLoadedEventType };
}

declare global {
  interface Window {
    google?: { ima?: ImaNamespace };
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const IMA_SDK_URL = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
const SDK_LOAD_TIMEOUT_MS = 8_000;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VastAdPlayerProps {
  vastUrl: string;
  onComplete: (elapsedMs: number) => void;
  onError: (msg: string) => void;
  onClose: () => void;
  lang: "en" | "es";
}

type PlayerPhase =
  | "sdk_loading"   // loading IMA SDK script
  | "ad_loading"    // SDK loaded, waiting for VAST response
  | "ad_playing"    // STARTED event fired
  | "complete"      // COMPLETE fired — closing
  | "error";        // unrecoverable

// ── Bilingual copy ─────────────────────────────────────────────────────────────

function useT(lang: "en" | "es") {
  return {
    loadingAd:     lang === "es" ? "Cargando anuncio…"                          : "Loading ad…",
    watchFull:     lang === "es" ? "Mira el anuncio completo para desbloquear"  : "Watch the full ad to unlock",
    closeLocked:   lang === "es" ? "Mira el anuncio completo para continuar"    : "Watch the full ad to continue",
    mute:          lang === "es" ? "Silenciar"                                   : "Mute",
    unmute:        lang === "es" ? "Activar sonido"                              : "Unmute",
    pause:         lang === "es" ? "Pausar"                                      : "Pause",
    play:          lang === "es" ? "Reproducir"                                  : "Play",
    closeAd:       lang === "es" ? "Cerrar"                                      : "Close",
    adLabel:       lang === "es" ? "Anuncio"                                     : "Ad",
    unlockingText: lang === "es" ? "Desbloqueando…"                              : "Unlocking…",
    errorText:     lang === "es" ? "El anuncio no se pudo cargar."               : "The ad could not load.",
  };
}

// ── Helper: load IMA SDK script once ──────────────────────────────────────────

let imaScriptPromise: Promise<void> | null = null;

function loadImaScript(): Promise<void> {
  // Already loaded
  if (window.google?.ima) return Promise.resolve();
  // Return the in-flight promise if we already started loading
  if (imaScriptPromise) return imaScriptPromise;

  imaScriptPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      imaScriptPromise = null;
      reject(new Error("sdk_timeout"));
    }, SDK_LOAD_TIMEOUT_MS);

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${IMA_SDK_URL}"]`
    );
    if (existing) {
      // Script tag is in DOM but google.ima not ready yet — wait for it
      existing.addEventListener("load", () => { clearTimeout(timeout); resolve(); });
      existing.addEventListener("error", () => {
        clearTimeout(timeout);
        imaScriptPromise = null;
        reject(new Error("ad_blocker"));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = IMA_SDK_URL;
    script.async = true;

    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => {
      clearTimeout(timeout);
      imaScriptPromise = null;
      reject(new Error("ad_blocker"));
    };

    document.head.appendChild(script);
  });

  return imaScriptPromise;
}

// ── Spinner ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="w-10 h-10 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ color: "rgba(255,255,255,0.6)" }}
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function VastAdPlayer({
  vastUrl,
  onComplete,
  onError,
  onClose,
  lang,
}: VastAdPlayerProps) {
  const t = useT(lang);

  const [phase, setPhase]   = useState<PlayerPhase>("sdk_loading");
  const [muted, setMuted]   = useState(true);  // start muted for autoplay compat
  const [paused, setPaused] = useState(false);

  // Refs for IMA objects — never held in state to avoid re-renders on setup
  const containerDivRef  = useRef<HTMLDivElement>(null);
  const videoRef         = useRef<HTMLVideoElement>(null);
  const adContainerRef   = useRef<IMA.AdDisplayContainer | null>(null);
  const adsLoaderRef     = useRef<IMA.AdsLoader | null>(null);
  const adsManagerRef    = useRef<IMA.AdsManager | null>(null);
  const startTimeRef     = useRef<number>(0);
  const mountedRef       = useRef(true);
  const completeFiredRef = useRef(false);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    try { adsManagerRef.current?.destroy(); } catch (_) { /* noop */ }
    try { adsLoaderRef.current?.destroy(); } catch (_) { /* noop */ }
    try { adContainerRef.current?.destroy(); } catch (_) { /* noop */ }
    adsManagerRef.current  = null;
    adsLoaderRef.current   = null;
    adContainerRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── IMA setup — runs once when refs are ready ──────────────────────────────
  const initIma = useCallback(() => {
    if (!containerDivRef.current || !videoRef.current || !window.google?.ima) return;

    const ima = window.google.ima;

    const adContainer = new ima.AdDisplayContainer(
      containerDivRef.current,
      videoRef.current,
    );
    adContainer.initialize();
    adContainerRef.current = adContainer;

    const loader = new ima.AdsLoader(adContainer);
    loader.getSettings().setDisableCustomPlaybackForIOS10Plus(false);
    adsLoaderRef.current = loader;

    // AdsManagerLoaded
    loader.addEventListener(
      ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      (e: IMA.AdsManagerLoadedEvent) => {
        if (!mountedRef.current) return;

        const rect = containerDivRef.current?.getBoundingClientRect() ?? { width: 640, height: 360 };
        const manager = e.getAdsManager(videoRef.current!);
        adsManagerRef.current = manager;

        // Event listeners on the manager
        manager.addEventListener(ima.AdEvent.Type.STARTED, () => {
          if (!mountedRef.current) return;
          startTimeRef.current = Date.now();
          setPhase("ad_playing");
        }, false);

        manager.addEventListener(ima.AdEvent.Type.COMPLETE, () => {
          if (!mountedRef.current || completeFiredRef.current) return;
          completeFiredRef.current = true;
          setPhase("complete");
          onComplete(Date.now() - startTimeRef.current);
        }, false);

        manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
          if (!mountedRef.current || completeFiredRef.current) return;
          completeFiredRef.current = true;
          setPhase("complete");
          onComplete(Date.now() - startTimeRef.current);
        }, false);

        manager.addEventListener(ima.AdEvent.Type.SKIPPED, () => {
          if (!mountedRef.current) return;
          // Skipping = did not watch full ad → treat as error
          onError("skipped_early");
        }, false);

        manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, (e: IMA.AdErrorEvent) => {
          if (!mountedRef.current) return;
          const msg = e.getError?.()?.getMessage?.() ?? "unknown_ad_error";
          console.error("[VastAdPlayer] AdsManager error", msg);
          setPhase("error");
          cleanup();
          onError("ad_error");
        }, false);

        manager.addEventListener(ima.AdEvent.Type.PAUSED, () => { if (mountedRef.current) setPaused(true); }, false);
        manager.addEventListener(ima.AdEvent.Type.RESUMED, () => { if (mountedRef.current) setPaused(false); }, false);

        try {
          manager.init(
            Math.round(rect.width),
            Math.round(rect.height),
            ima.ViewMode.NORMAL,
          );
          manager.start();
          // Apply initial muted state to video element (IMA takes over playback)
          if (videoRef.current) videoRef.current.muted = true;
        } catch (err) {
          console.error("[VastAdPlayer] AdsManager.init/start threw", err);
          setPhase("error");
          cleanup();
          onError("ad_init_error");
        }
      },
      false,
    );

    // AdsLoader error
    loader.addEventListener(
      ima.AdErrorEvent.Type.AD_ERROR,
      (e: IMA.AdErrorEvent) => {
        if (!mountedRef.current) return;
        const msg = e.getError?.()?.getMessage?.() ?? "unknown_load_error";
        console.error("[VastAdPlayer] AdsLoader error", msg);
        setPhase("error");
        cleanup();
        onError("vast_load_error");
      },
      false,
    );

    // Request the VAST tag
    const request = new ima.AdsRequest();
    request.adTagUrl = vastUrl;
    request.linearAdSlotWidth  = Math.round(containerDivRef.current.offsetWidth  || 640);
    request.linearAdSlotHeight = Math.round(containerDivRef.current.offsetHeight || 360);
    request.nonLinearAdSlotWidth  = Math.round(containerDivRef.current.offsetWidth  || 640);
    request.nonLinearAdSlotHeight = 150;

    if (mountedRef.current) setPhase("ad_loading");
    loader.requestAds(request);
  }, [vastUrl, onComplete, onError, cleanup]);

  // ── Load SDK then init IMA ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    loadImaScript()
      .then(() => {
        if (cancelled || !mountedRef.current) return;
        // Defer one frame so the DOM refs are ready
        requestAnimationFrame(() => {
          if (cancelled || !mountedRef.current) return;
          initIma();
        });
      })
      .catch((err: Error) => {
        if (cancelled || !mountedRef.current) return;
        console.error("[VastAdPlayer] IMA script load failed:", err.message);
        setPhase("error");
        onError(err.message === "sdk_timeout" ? "sdk_timeout" : "ad_blocker");
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ───────────────────────────────────────────────────────────────
  const handleMuteToggle = useCallback(() => {
    if (!adsManagerRef.current || !videoRef.current) return;
    const nextMuted = !muted;
    setMuted(nextMuted);
    // IMA volume: 0 = muted, 1 = full
    adsManagerRef.current.setVolume(nextMuted ? 0 : 1);
    videoRef.current.muted = nextMuted;
  }, [muted]);

  const handlePauseToggle = useCallback(() => {
    if (!adsManagerRef.current) return;
    if (paused) {
      adsManagerRef.current.resume();
    } else {
      adsManagerRef.current.pause();
    }
  }, [paused]);

  // Close is only allowed once the ad is complete or in error state
  const canClose = phase === "complete" || phase === "error";

  const handleClose = useCallback(() => {
    if (canClose) {
      cleanup();
      onClose();
    }
  }, [canClose, cleanup, onClose]);

  // Soft close attempt during play — show tooltip (handled via aria-label + disabled state)
  const handleCloseAttempt = useCallback(() => {
    if (canClose) {
      handleClose();
    }
    // else: button is disabled; browser will not fire click
  }, [canClose, handleClose]);

  // ── Derived display flags ──────────────────────────────────────────────────
  const showSpinner   = phase === "sdk_loading" || phase === "ad_loading";
  const showControls  = phase === "ad_playing";
  const isPlaying     = phase === "ad_playing";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // Fixed full-screen overlay — above everything (z-[80] matches typical modal stack)
    <div
      className="fixed inset-0 z-[80] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={t.adLabel}
      style={{ background: "#000" }}
    >
      {/* ── Video layer — IMA renders inside containerDivRef ─────────────── */}
      <div
        ref={containerDivRef}
        className="relative flex-1 w-full overflow-hidden"
        style={{ background: "#000" }}
      >
        {/* The actual <video> element IMA controls */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          muted       // always start muted; unmute via control
          autoPlay
          aria-hidden="true"
        />

        {/* Loading overlay — centred spinner + copy */}
        {showSpinner && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
            <Spinner />
            <p
              className="text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.65)" }}
              aria-live="polite"
            >
              {t.loadingAd}
            </p>
          </div>
        )}

        {/* "Watch full ad" instruction — shown while playing */}
        {isPlaying && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-semibold z-10 pointer-events-none"
            style={{
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.75)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            aria-live="polite"
          >
            {t.watchFull}
          </div>
        )}

        {/* Ad label badge — top left */}
        <div
          className="absolute top-3 left-3 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider z-10 pointer-events-none"
          style={{
            background: "rgba(0,0,0,0.55)",
            color: "rgba(255,255,255,0.50)",
          }}
          aria-hidden="true"
        >
          {t.adLabel}
        </div>

        {/* Close button — top right. Disabled during playback. */}
        <button
          type="button"
          onClick={handleCloseAttempt}
          disabled={!canClose}
          aria-label={canClose ? t.closeAd : t.closeLocked}
          title={canClose ? t.closeAd : t.closeLocked}
          className="absolute top-3 right-3 z-20 w-9 h-9 flex items-center justify-center rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: canClose ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          {/* X icon */}
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            style={{ color: "rgba(255,255,255,0.8)" }}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Bottom control bar ───────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 safe-area-bottom"
        style={{
          background: "rgba(0,0,0,0.80)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Left: Pause/Play */}
        <button
          type="button"
          onClick={handlePauseToggle}
          disabled={!showControls}
          aria-label={paused ? t.play : t.pause}
          className="w-11 h-11 flex items-center justify-center rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-20 disabled:cursor-not-allowed active:scale-95"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {paused ? (
            // Play triangle
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style={{ color: "#fff" }} aria-hidden="true">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          ) : (
            // Pause bars
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style={{ color: "#fff" }} aria-hidden="true">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
        </button>

        {/* Center: phase copy */}
        <p
          className="flex-1 text-center text-xs font-medium truncate"
          style={{ color: "rgba(255,255,255,0.55)" }}
          aria-live="polite"
        >
          {phase === "sdk_loading" || phase === "ad_loading"
            ? t.loadingAd
            : phase === "ad_playing"
            ? t.watchFull
            : phase === "complete"
            ? t.unlockingText
            : t.errorText}
        </p>

        {/* Right: Mute/Unmute */}
        <button
          type="button"
          onClick={handleMuteToggle}
          disabled={!showControls}
          aria-label={muted ? t.unmute : t.mute}
          className="w-11 h-11 flex items-center justify-center rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-20 disabled:cursor-not-allowed active:scale-95"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {muted ? (
            // Muted speaker
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#fff" }} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            // Speaker with waves
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#fff" }} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
