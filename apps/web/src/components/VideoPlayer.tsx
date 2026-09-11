/**
 * VideoPlayer — drop-in replacement for `<video>` that transparently plays HLS
 * (`.m3u8`) via hls.js on browsers without native HLS support (Chrome/Firefox).
 * Safari plays HLS natively so we skip hls.js there.
 *
 * Enhanced with dynamic aspect ratio orientation detection (portrait vs landscape),
 * ambient blurred poster backdrop for letterbox elimination, and modern responsive
 * scaling for vertical/portrait videos (Reels/TikTok/Shorts format).
 *
 * When `creatorDisclaimer` is true (creator-authored content), a bilingual
 * compliance overlay appears when playback ends, linking to /self-care.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import Hls from "hls.js";
import { useI18n } from "@/lib/i18n";
import { IntroPlayer } from "@/components/intro";
import { VideoPaywallOverlay } from "@/components/VideoPaywallOverlay";
import { getVideoAccess, type VideoAccessInfo } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/**
 * Metadata burned into the IntroPlayer curtain that plays before qualifying
 * videos. `channel` is the eyebrow line, `title` is the big title (omit for
 * social posts per product spec), `performers` is the "Uploader feat. X y Z"
 * credit line. Pass `null` (or omit `intro`) to skip the curtain entirely.
 */
export interface VideoIntroData {
  channel: string;
  title?: string;
  performers: string;
}

type VideoPlayerProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  /** When true, render an end-of-video compliance overlay for creator content. */
  creatorDisclaimer?: boolean;
  /** When true (default), render an ambient blurred backdrop behind portrait/letterboxed videos. */
  ambientBlur?: boolean;
  /**
   * When present, gate the video behind a 16s branded intro curtain. Skip is
   * always visible. Callers are responsible for the duration threshold — pass
   * `null` for videos too short to warrant the intro (< 30s per product spec).
   */
  intro?: VideoIntroData | null;
  /**
   * When present, the player fetches `GET /api/videos/:videoId/access` on mount
   * and renders a paywall overlay if the viewer doesn't have a grant.
   * Pass `undefined` (or omit) to skip the paywall check entirely (free videos,
   * non-social-post contexts like admin previews).
   */
  videoId?: string | number;
  /**
   * The uploader's user ID. When it matches the authenticated user, the paywall
   * is bypassed even if `has_grant` is false (owners always see their content).
   */
  uploaderId?: string;
  /** When provided, shows a view count badge overlay in the top-left corner. */
  viewCount?: number;
};

function isHlsSource(src: string | undefined | null): boolean {
  if (!src) return false;
  return /\.m3u8(?:\?|#|$)/i.test(src);
}

export const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  (
    {
      src,
      poster,
      creatorDisclaimer = false,
      ambientBlur = true,
      intro = null,
      onEnded,
      onPlay,
      onLoadedMetadata,
      onError,
      className = "",
      style,
      autoPlay,
      videoId,
      uploaderId,
      viewCount,
      ...rest
    },
    ref
  ) => {
    const { user } = useAuth();
    const localRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const [isPortrait, setIsPortrait] = useState(false);
    const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(null);
    const [playbackError, setPlaybackError] = useState<string | null>(null);

    // ── Paywall state ──────────────────────────────────────────────────────
    const [accessLoading, setAccessLoading] = useState(false);
    const [access, setAccess] = useState<VideoAccessInfo | null>(null);
    // Tracks the src actually loaded into the <video> element. On grant success
    // we append a cache-bust param so the browser re-fetches the protected URL.
    const [activeSrc, setActiveSrc] = useState<string | undefined>(
      typeof src === "string" ? src : undefined
    );

    const isOwner =
      !!uploaderId && !!user?.id && String(user.id) === String(uploaderId);

    // Fetch access info when videoId is provided and viewer is not the owner.
    useEffect(() => {
      if (!videoId || isOwner) {
        setAccess(null);
        return;
      }
      let cancelled = false;
      setAccessLoading(true);
      getVideoAccess(videoId)
        .then((info) => {
          if (!cancelled) setAccess(info);
        })
        .catch(() => {
          // On error (network, 401 pre-auth) treat as accessible — the video
          // element's own error handler will surface a playback failure if
          // the stream is actually protected.
          if (!cancelled) setAccess(null);
        })
        .finally(() => {
          if (!cancelled) setAccessLoading(false);
        });
      return () => { cancelled = true; };
    }, [videoId, isOwner]);

    // Sync activeSrc whenever src changes (e.g. different video in same mount).
    useEffect(() => {
      setActiveSrc(typeof src === "string" ? src : undefined);
    }, [src]);

    const handleGranted = useCallback(() => {
      // Refetch access to confirm has_grant=true, then cache-bust the src.
      if (videoId) {
        getVideoAccess(videoId)
          .then((info) => setAccess(info))
          .catch(() => setAccess(null));
      }
      setActiveSrc((prev) => {
        const base = (typeof src === "string" ? src : prev) ?? "";
        const sep = base.includes("?") ? "&" : "?";
        return `${base}${sep}_=${Date.now()}`;
      });
    }, [videoId, src]);

    // Determine whether to show the paywall:
    // - videoId is set AND access has been loaded
    // - viewer is not the owner
    // - has_grant is false
    // - at least one purchase option exists
    const showPaywall =
      !isOwner &&
      !accessLoading &&
      access !== null &&
      !access.has_grant &&
      (
        (access.prices?.rent_price_rush ?? 0) > 0 ||
        (access.prices?.buy_price_rush ?? 0) > 0 ||
        access.creator?.channel_pass_enabled
      );
    // When an intro is configured, gate playback until the curtain completes
    // (or the user hits Skip). Once dismissed, the intro never re-shows for
    // this mount — replays go straight to video.
    const [introDone, setIntroDone] = useState<boolean>(intro == null);
    // Reset gate when src changes (e.g. re-open a different video in the same
    // player mount) — otherwise the intro from the previous video would be
    // considered already dismissed for the new one.
    useEffect(() => {
      setIntroDone(intro == null);
    }, [src, intro]);

    const setRefs = (el: HTMLVideoElement | null) => {
      localRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    };

    useEffect(() => {
      const video = localRef.current;
      if (!video || !activeSrc) return;

      setPlaybackError(null);
      hlsRef.current?.destroy();
      hlsRef.current = null;

      if (!isHlsSource(activeSrc)) {
        return;
      }

      // Mux serves with `access-control-allow-origin: *`; keeping crossOrigin
      // explicit makes hls.js reuse fetched manifests as texture data without
      // an opaque-response CORS downgrade.
      video.crossOrigin = "anonymous";

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = activeSrc;
        return;
      }

      if (Hls.isSupported()) {
        // VOD tuning — no live-edge params. Generous retries so transient
        // network jitter (Mux CDN hiccup, mobile Wi-Fi flap) self-heals
        // instead of surfacing a fatal error to the user.
        const hls = new Hls({
          enableWorker: true,
          manifestLoadingMaxRetry: 6,
          manifestLoadingRetryDelay: 1000,
          levelLoadingMaxRetry: 6,
          levelLoadingRetryDelay: 1000,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 500,
        });
        let mediaErrorCount = 0;
        let networkErrorCount = 0;
        const MAX_RECOVERY = 3;
        hls.loadSource(activeSrc);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          console.warn("[VideoPlayer] HLS fatal:", data.type, data.details, "src:", activeSrc);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            networkErrorCount += 1;
            if (networkErrorCount <= MAX_RECOVERY) {
              hls.startLoad();
              return;
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            mediaErrorCount += 1;
            if (mediaErrorCount <= MAX_RECOVERY) {
              hls.recoverMediaError();
              return;
            }
          }
          setPlaybackError(data.details || "playback_error");
          // Bubble to the parent so consumers (PostCard etc.) can render
          // their own "video unavailable" affordance in place of ours.
          if (onError) {
            try {
              onError({} as React.SyntheticEvent<HTMLVideoElement>);
            } catch { /* swallow — the internal overlay still renders */ }
          }
        });
        hlsRef.current = hls;
        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      }
    }, [activeSrc]);

    const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget;
      console.warn("[VideoPlayer] native video error:", el?.error?.code, el?.error?.message, "src:", src);
      setPlaybackError("playback_error");
      onError?.(e);
    };

    const handleRetry = () => {
      const video = localRef.current;
      if (!video) return;
      setPlaybackError(null);
      video.load();
      video.play().catch(() => {});
    };

    const passThroughSrc = isHlsSource(activeSrc) ? undefined : (activeSrc ?? undefined);

    const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget;
      if (video.videoWidth && video.videoHeight) {
        setIsPortrait(video.videoHeight > video.videoWidth * 1.05);
        setVideoDims({ w: video.videoWidth, h: video.videoHeight });
      }
      onLoadedMetadata?.(e);
    };

    const handleEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (creatorDisclaimer) setShowDisclaimer(true);
      onEnded?.(e);
    };

    const handlePlay = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (showDisclaimer) setShowDisclaimer(false);
      onPlay?.(e);
    };

    const castSupported = typeof window !== "undefined" && "remote" in HTMLVideoElement.prototype;
    const pipSupported = typeof window !== "undefined" && !!document.pictureInPictureEnabled;
    const showOverlayControls = !showPaywall && !accessLoading && introDone && !playbackError;

    const handleCast = useCallback(async () => {
      const video = localRef.current;
      if (!video) return;
      try {
        await (video as HTMLVideoElement & { remote: { prompt(): Promise<void> } }).remote.prompt();
      } catch { /* user cancelled */ }
    }, []);

    const handlePiP = useCallback(async () => {
      const video = localRef.current;
      if (!video) return;
      try {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch { /* not supported or user declined */ }
    }, []);

    const containerClasses = [
      "relative overflow-hidden bg-black/90 rounded-xl transition-all duration-300 flex items-center justify-center",
      isPortrait ? "max-h-[72vh] md:max-h-[680px]" : "max-h-[520px] lg:max-h-[640px]",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={containerClasses} style={style}>
        {/* Ambient Blur Background — eliminates harsh black bars on portrait/letterboxed videos */}
        {ambientBlur && poster && (
          <div
            className="absolute inset-0 pointer-events-none overflow-hidden z-0"
            aria-hidden="true"
          >
            <img
              src={poster}
              alt=""
              className="w-full h-full object-cover filter blur-3xl opacity-40 scale-125 saturate-150 transition-opacity duration-500"
            />
            <div className="absolute inset-0 bg-black/30 backdrop-blur-md" />
          </div>
        )}

        {/* Primary Video Element — autoplay is deferred until the intro
            curtain (if any) finishes. When introDone becomes true, we call
            .play() explicitly so mobile autoplay policies still cooperate.
            autoPlay is also blocked while the paywall is shown so the video
            element stays paused at the poster frame. */}
        <video
          ref={setRefs}
          src={passThroughSrc}
          poster={poster}
          className={`relative z-10 w-full h-full object-contain mx-auto transition-all duration-300 ${
            isPortrait ? "max-h-[72vh] md:max-h-[680px]" : "max-h-[520px] lg:max-h-[640px]"
          }`}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={handlePlay}
          onError={handleVideoError}
          autoPlay={intro || showPaywall ? false : autoPlay}
          {...rest}
        />

        {/* Access-check loading skeleton — shown while fetching grant status */}
        {accessLoading && videoId && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.70)" }}
            aria-label="Checking access…"
          >
            <svg
              className="w-7 h-7 animate-spin text-white/50"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Paywall overlay — rendered when viewer lacks a grant and prices exist */}
        {showPaywall && access && (
          <VideoPaywallOverlay
            videoId={videoId!}
            access={access}
            poster={poster}
            onGranted={handleGranted}
          />
        )}

        {/* Playback error overlay with retry */}
        {playbackError && !showPaywall && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}>
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="text-white text-sm font-semibold">Video unavailable</div>
            <p className="text-white/70 text-xs max-w-xs">This video couldn't be played. It may still be processing or the source is temporarily unreachable.</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Intro curtain — 16s branded opener with the video's channel/title/
            performers burned in. Sits above the video, hides it visually and
            blocks pointer events until Skip or auto-complete. */}
        {intro && !introDone && (
          <div className="absolute inset-0 z-20">
            <IntroPlayer
              channel={intro.channel}
              title={intro.title}
              performers={intro.performers}
              videoWidth={videoDims?.w}
              videoHeight={videoDims?.h}
              onComplete={() => {
                setIntroDone(true);
                // Kick playback the moment the curtain lifts. If autoPlay was
                // requested by the caller, respect it; otherwise stay paused.
                if (autoPlay) {
                  localRef.current?.play().catch(() => {});
                }
              }}
            />
          </div>
        )}

        {/* View count badge — top-left, only when video is active */}
        {showOverlayControls && viewCount != null && viewCount > 0 && (
          <div
            className="absolute top-2 left-2 z-[15] flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-white/80 pointer-events-none select-none"
            style={{ background: "rgba(0,0,0,0.52)", backdropFilter: "blur(6px)" }}
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {fmtViews(viewCount)}
          </div>
        )}

        {/* Cast / PiP controls — top-right, only when video is active */}
        {showOverlayControls && (castSupported || pipSupported) && (
          <div className="absolute top-2 right-2 z-[15] flex items-center gap-1">
            {castSupported && (
              <button
                type="button"
                onClick={handleCast}
                title="Cast to another screen"
                aria-label="Cast to another screen"
                className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
                style={{ background: "rgba(0,0,0,0.52)", backdropFilter: "blur(6px)" }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 8V6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2h-6"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 12a9 9 0 019 9"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 16a5 5 0 015 5"/>
                  <circle cx="2" cy="20" r="1.2" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            {pipSupported && (
              <button
                type="button"
                onClick={handlePiP}
                title="Picture in picture"
                aria-label="Picture in picture"
                className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
                style={{ background: "rgba(0,0,0,0.52)", backdropFilter: "blur(6px)" }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v5"/>
                  <rect x="13" y="13" width="8" height="6" rx="1"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* End-of-video Creator Compliance Overlay */}
        {showDisclaimer && (
          <VideoDisclaimerOverlay
            onReplay={() => {
              setShowDisclaimer(false);
              localRef.current?.play().catch(() => {});
            }}
            onDismiss={() => setShowDisclaimer(false)}
          />
        )}
      </div>
    );
  }
);
VideoPlayer.displayName = "VideoPlayer";

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function VideoDisclaimerOverlay({ onReplay, onDismiss }: { onReplay: () => void; onDismiss: () => void }) {
  const t = useI18n();
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-white text-sm font-semibold uppercase tracking-wider opacity-70">
        {t.common.videoDisclaimerTitle}
      </div>
      <p className="text-white text-sm leading-relaxed max-w-md">
        {t.common.videoDisclaimerBody}
      </p>
      <div className="flex flex-wrap gap-2 justify-center mt-2">
        <Link
          to="/self-care"
          className="px-4 py-2 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors"
        >
          {t.common.videoDisclaimerCta}
        </Link>
        <button
          type="button"
          onClick={onReplay}
          className="px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
        >
          {t.common.videoDisclaimerReplay}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-4 py-2 rounded-full text-white/60 text-sm hover:text-white/90 transition-colors"
        >
          {t.common.videoDisclaimerDismiss}
        </button>
      </div>
    </div>
  );
}

/**
 * Persistent one-line disclaimer footer for live streams and other surfaces
 * where an end-of-video overlay doesn't apply.
 */
export function VideoDisclaimerFooter({ className = "" }: { className?: string }) {
  const t = useI18n();
  return (
    <div className={`text-[11px] leading-snug text-white/50 px-3 py-2 ${className}`}>
      {t.common.videoDisclaimerBody}{" "}
      <Link to="/self-care" className="text-emerald-400 hover:text-emerald-300 underline">
        {t.common.videoDisclaimerCta}
      </Link>
      .
    </div>
  );
}
