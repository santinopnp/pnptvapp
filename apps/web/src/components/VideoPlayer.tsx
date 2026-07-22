/**
 * VideoPlayer — drop-in replacement for `<video>` that transparently plays HLS
 * (`.m3u8`) via hls.js on browsers without native HLS support (Chrome/Firefox).
 * Safari plays HLS natively so we skip hls.js there.
 *
 * All standard <video> props pass through; `src` may point to an .m3u8 or an
 * mp4/webm. Used across social feed cards so posts uploaded via the browser→Mux
 * pipeline (mux_playback_id → stream.mux.com/*.m3u8) play everywhere.
 */

import React, { useEffect, useRef } from "react";
import Hls from "hls.js";

type VideoPlayerProps = React.VideoHTMLAttributes<HTMLVideoElement>;

function isHlsSource(src: string | undefined | null): boolean {
  if (!src) return false;
  return /\.m3u8(?:\?|#|$)/i.test(src);
}

export const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, ...rest }, ref) => {
    const localRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);

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

    return <video ref={setRefs} src={passThroughSrc} {...rest} />;
  }
);
VideoPlayer.displayName = "VideoPlayer";
