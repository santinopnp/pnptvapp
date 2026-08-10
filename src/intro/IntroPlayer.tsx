/**
 * IntroPlayer — the drop-in unit.
 *
 * Owns the clock and the fixed 1920x1080 / 1080x1920 canvas, and scales that
 * canvas to whatever box it is given. The canvas is a fixed pixel size on
 * purpose: every dimension in IntroCurtain is an absolute px value from the
 * design, so the piece is authored once at full size and scaled as a whole,
 * which is what keeps a 400px-wide preview and a 1080p render identical.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IntroCurtain } from './IntroCurtain';
import { INTRO_SCENES } from './content';
import { resolveOrientation, type OrientationInput } from './orientation';
import { COLORS, FRAME } from './theme';
import type { Scene } from './timeline';
import { useIntroClock, type ClockMode } from './useIntroClock';

export interface IntroPlayerProps {
  channel?: string;
  title?: string;
  performers?: string;

  /** Explicit orientation, or 'auto' to derive it from the video dimensions. */
  orientation?: OrientationInput;
  videoWidth?: number;
  videoHeight?: number;

  /** Path to the transparent logo lockup. */
  logoSrc?: string;

  /** Scene list; defaults to Title 7s + Disclaimer 9s. */
  scenes?: Scene[];

  /**
   * 'auto' runs a rAF clock. 'manual' freezes time and only moves on seek —
   * used by the headless renderer for exact-timestamp frames.
   */
  mode?: ClockMode;
  autoplay?: boolean;
  loop?: boolean;

  /** Show the Skip button. Off by default in manual mode. */
  showSkip?: boolean;

  /** Fired when the intro reaches its end, or when Skip is pressed. */
  onComplete?: () => void;

  /**
   * 'fit' scales the canvas down to fit its container, letterboxed.
   * 'exact' renders 1:1 with no scaling — for pixel-exact capture.
   */
  scaling?: 'fit' | 'exact';

  /** Fills its positioned parent when true; sizes to the canvas when false. */
  fill?: boolean;
}

/**
 * Exposed on `window.__pnptvIntro` so a headless renderer can drive the piece
 * deterministically without reaching into React internals.
 */
export interface IntroRenderHandle {
  duration: number;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  /** Move to an exact playback timestamp. */
  seek: (t: number) => void;
  /** Resolves once fonts and the logo have loaded. */
  ready: () => Promise<void>;
}

declare global {
  interface Window {
    __pnptvIntro?: IntroRenderHandle;
  }
}

export function IntroPlayer({
  channel,
  title,
  performers,
  orientation = 'auto',
  videoWidth,
  videoHeight,
  logoSrc = 'assets/pnptv-logo2.png',
  scenes = INTRO_SCENES,
  mode = 'auto',
  autoplay = true,
  loop = false,
  showSkip,
  onComplete,
  scaling = 'fit',
  fill = true,
}: IntroPlayerProps) {
  const resolved = resolveOrientation({ orientation, videoWidth, videoHeight });
  const { width, height } = FRAME[resolved];

  const clock = useIntroClock({ scenes, mode, autoplay, loop, onComplete });
  const disclaimerCue = clock.cues.Disclaimer ?? 0;

  const skipVisible = showSkip ?? mode === 'auto';

  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Scale-to-fit. Skipped entirely in 'exact' mode so capture is 1:1.
  useLayoutEffect(() => {
    if (scaling === 'exact') {
      setScale(1);
      return;
    }
    const el = boxRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      setScale(Math.max(0.01, Math.min(w / width, h / height)));
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scaling, width, height]);

  // Publish the render handle. Kept in an effect so it exists only while
  // mounted, and refreshed when the canvas or duration changes.
  useEffect(() => {
    const ready = async () => {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* font loading is best-effort; a fallback face still renders */
        }
      }
      const imgs = Array.from(
        boxRef.current?.querySelectorAll('img') ?? [],
      ) as HTMLImageElement[];
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.addEventListener('load', () => res(), { once: true });
                img.addEventListener('error', () => res(), { once: true });
              }),
        ),
      );
    };

    window.__pnptvIntro = {
      duration: clock.duration,
      width,
      height,
      orientation: resolved,
      seek: clock.seek,
      ready,
    };
    return () => {
      if (window.__pnptvIntro?.seek === clock.seek) delete window.__pnptvIntro;
    };
  }, [clock.duration, clock.seek, width, height, resolved]);

  return (
    <div
      ref={boxRef}
      data-pnptv-intro-root=""
      style={
        fill
          ? {
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              background: COLORS.bg,
            }
          : {
              position: 'relative',
              width,
              height,
              overflow: 'hidden',
              background: COLORS.bg,
            }
      }
    >
      <div
        data-pnptv-intro-canvas=""
        style={{
          width,
          height,
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        <IntroCurtain
          T={clock.T}
          disclaimerCue={disclaimerCue}
          orientation={resolved}
          channel={channel}
          title={title}
          performers={performers}
          logoSrc={logoSrc}
          onSkip={skipVisible ? clock.skipToEnd : undefined}
        />
      </div>
    </div>
  );
}
