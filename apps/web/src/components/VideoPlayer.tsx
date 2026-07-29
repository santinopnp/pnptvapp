/**
 * VideoPlayer — drop-in replacement for `<video>` that transparently plays HLS
 * (`.m3u8`) via hls.js on browsers without native HLS support (Chrome/Firefox).
 * Safari plays HLS natively so we skip hls.js there.
 *
 * All standard <video> props pass through; `src` may point to an .m3u8 or an
 * mp4/webm. Used across social feed cards so posts uploaded via the browser→Mux
 * pipeline (mux_playback_id → stream.mux.com/*.m3u8) play everywhere.
 *
 * When `creatorDisclaimer` is true (creator-authored content), a bilingual
 * compliance overlay appears when playback ends, linking to /self-care.
 * Layout note: opting into the overlay wraps the <video> in a positioned
 * container that inherits `className` and `style`.
 */

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Hls from "hls.js";
import { useI18n } from "@/lib/i18n";

type VideoPlayerProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  /** When true, render an end-of-video compliance overlay for creator content. */
  creatorDisclaimer?: boolean;
};

function isHlsSource(src: string | undefined | null): boolean {
  if (!src) return false;
  return /\.m3u8(?:\?|#|$)/i.test(src);
}

export const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, creatorDisclaimer = false, onEnded, onPlay, className, style, ...rest }, ref) => {
    const localRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [showDisclaimer, setShowDisclaimer] = useState(false);

    const setRefs = (el: HTMLVideoElement | null) => {
      localRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    };

    useEffect(() => {
      const video = localRef.current;
      if (!video || !src) return;

      // Clean up any previous hls.js instance
      hlsRef.current?.destroy();
      hlsRef.current = null;

      if (!isHlsSource(src)) {
        // Regular file (mp4/webm) — let the <video src> attribute handle it
        return;
      }

      // Safari + iOS play HLS natively — no hls.js needed
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        return;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(src);
        hls.attachMedia(video);
        hlsRef.current = hls;
        return () => { hls.destroy(); hlsRef.current = null; };
      }
    }, [src]);

    // For non-HLS sources, use the standard src attribute so the browser
    // handles range requests, poster fallback, etc. For HLS on Safari we set
    // video.src imperatively above, so we must omit the attribute here to
    // avoid a double-load.
    const passThroughSrc = isHlsSource(src) ? undefined : (src ?? undefined);

    const handleEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (creatorDisclaimer) setShowDisclaimer(true);
      onEnded?.(e);
    };

    const handlePlay = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (showDisclaimer) setShowDisclaimer(false);
      onPlay?.(e);
    };

    // Fast path: existing callers (no disclaimer) get exactly the previous behavior.
    if (!creatorDisclaimer) {
      return (
        <video
          ref={setRefs}
          src={passThroughSrc}
          className={className}
          style={style}
          onEnded={handleEnded}
          onPlay={handlePlay}
          {...rest}
        />
      );
    }

    return (
      <div className={className} style={{ position: "relative", ...(style || {}) }}>
        <video
          ref={setRefs}
          src={passThroughSrc}
          className="w-full h-full object-contain bg-black"
          onEnded={handleEnded}
          onPlay={handlePlay}
          {...rest}
        />
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
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
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
