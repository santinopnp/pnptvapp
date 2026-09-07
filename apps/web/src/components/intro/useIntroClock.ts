/**
 * The playback clock.
 *
 * Exactly one clock ever drives the piece. In `auto` mode a rAF loop advances
 * playback time; in `manual` mode time only moves when `seek()` is called,
 * which is what the headless renderer uses so every captured frame is an exact
 * timestamp rather than whatever the loop happened to reach.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clamp } from './easing';
import { deriveTimeline, warp, type Scene } from './timeline';

export type ClockMode = 'auto' | 'manual';

export interface IntroClock {
  /** Playback time in seconds. */
  time: number;
  /** Authored time — key all choreography to this. */
  T: number;
  /** Scene name -> authored start. */
  cues: Record<string, number>;
  duration: number;
  playing: boolean;
  finished: boolean;
  seek: (t: number) => void;
  setPlaying: (p: boolean) => void;
  /** Jump to the last frame and stop — what the Skip button does. */
  skipToEnd: () => void;
}

export function useIntroClock(opts: {
  scenes: Scene[];
  mode?: ClockMode;
  autoplay?: boolean;
  loop?: boolean;
  /** Called once when playback first reaches the end (not called on loop). */
  onComplete?: () => void;
}): IntroClock {
  const { scenes, mode = 'auto', autoplay = true, loop = false, onComplete } = opts;

  const derived = useMemo(() => deriveTimeline(scenes), [scenes]);
  const duration = derived.total;

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(mode === 'auto' && autoplay);
  const [finished, setFinished] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  // onComplete is read from a ref so an unstable callback identity from the
  // caller can't restart the rAF loop mid-playback.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRef = useRef(false);

  const seek = useCallback(
    (t: number) => {
      setTime(clamp(t, 0, duration));
    },
    [duration],
  );

  const skipToEnd = useCallback(() => {
    setPlaying(false);
    setTime(duration);
    if (!completedRef.current) {
      completedRef.current = true;
      setFinished(true);
      onCompleteRef.current?.();
    }
  }, [duration]);

  useEffect(() => {
    if (mode !== 'auto' || !playing) {
      lastTsRef.current = null;
      return;
    }
    const step = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      setTime((t) => {
        const next = t + dt;
        if (next < duration) return next;
        if (loop) return next % duration;
        setPlaying(false);
        if (!completedRef.current) {
          completedRef.current = true;
          setFinished(true);
          onCompleteRef.current?.();
        }
        return duration;
      });

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [mode, playing, duration, loop]);

  const T = warp(derived, time);

  return {
    time,
    T,
    cues: derived.cues,
    duration,
    playing,
    finished,
    seek,
    setPlaying,
    skipToEnd,
  };
}
