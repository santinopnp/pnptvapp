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

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Hls from "hls.js";
import { useI18n } from "@/lib/i18n";

type VideoPlayerProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  /** When true, render an end-of-video compliance overlay for creator content. */
  creatorDisclaimer?: boolean;
  /** When true (default), render an ambient blurred backdrop behind portrait/letterboxed videos. */
  ambientBlur?: boolean;
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
      onEnded,
      onPlay,
      onLoadedMetadata,
      className = "",
      style,
      ...rest
    },
    ref
  ) => {
    const localRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const [isPortrait, setIsPortrait] = useState(false);

    const setRefs = (el: HTMLVideoElement | null) => {
      localRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    };

    useEffect(() => {
      const video = localRef.current;
      if (!video || !src) return;

      hlsRef.current?.destroy();
      hlsRef.current = null;

      if (!isHlsSource(src)) {
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        return;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(src);
        hls.attachMedia(video);
        hlsRef.current = hls;
        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      }
    }, [src]);

    const passThroughSrc = isHlsSource(src) ? undefined : (src ?? undefined);

    const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget;
      if (video.videoWidth && video.videoHeight) {
        setIsPortrait(video.videoHeight > video.videoWidth * 1.05);
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

        {/* Primary Video Element */}
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
          {...rest}
        />

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
