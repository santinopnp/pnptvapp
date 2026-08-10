/**
 * Easing + interpolation primitives.
 *
 * Ported verbatim (numerically) from the design prototype's animations-v3.jsx
 * so choreography timings reproduce exactly. Only the easings the intro
 * actually uses are kept, plus the small set needed to stay a drop-in
 * replacement if the choreography changes.
 */

export type EasingFn = (t: number) => number;

export const Easing = {
  linear: (t: number) => t,

  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => {
    const u = t - 1;
    return u * u * u + 1;
  },
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,

  easeInSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t: number) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,

  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
} satisfies Record<string, EasingFn>;

export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * Single-segment tween. Returns `from` at or before `start`, `to` at or after
 * `end`, eased in between — the prototype's `animate()`, including its default
 * ease of easeInOutCubic (the intro relies on that default for its Y offsets).
 */
export function animate(opts: {
  from?: number;
  to?: number;
  start?: number;
  end?: number;
  ease?: EasingFn;
}): (t: number) => number {
  const {
    from = 0,
    to = 1,
    start = 0,
    end = 1,
    ease = Easing.easeInOutCubic,
  } = opts;
  return (t: number) => {
    if (t <= start) return from;
    if (t >= end) return to;
    const local = (t - start) / (end - start);
    return from + (to - from) * ease(local);
  };
}

/** Multi-keyframe map, kept for parity with the prototype's `interpolate()`. */
export function interpolate(
  input: number[],
  output: number[],
  ease: EasingFn | EasingFn[] = Easing.linear,
): (t: number) => number {
  return (t: number) => {
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    for (let i = 0; i < input.length - 1; i++) {
      if (t >= input[i] && t <= input[i + 1]) {
        const span = input[i + 1] - input[i];
        const local = span === 0 ? 0 : (t - input[i]) / span;
        const easeFn = Array.isArray(ease) ? ease[i] ?? Easing.linear : ease;
        return output[i] + (output[i + 1] - output[i]) * easeFn(local);
      }
    }
    return output[output.length - 1];
  };
}

/**
 * Fade in, and optionally back out — the prototype's local `fade()` helper.
 * `min` of the two ramps, so the out-ramp wins once it starts falling.
 */
export function fade(
  T: number,
  inA: number,
  inB: number,
  outA?: number | null,
  outB?: number | null,
): number {
  const fi = animate({
    from: 0,
    to: 1,
    start: inA,
    end: inB,
    ease: Easing.easeOutCubic,
  })(T);
  if (outA == null || outB == null) return fi;
  const fo = animate({
    from: 1,
    to: 0,
    start: outA,
    end: outB,
    ease: Easing.easeInCubic,
  })(T);
  return Math.min(fi, fo);
}
