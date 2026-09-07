export { IntroPlayer } from './IntroPlayer';
export type { IntroPlayerProps, IntroRenderHandle } from './IntroPlayer';

export { IntroCurtain } from './IntroCurtain';
export type { IntroCurtainProps } from './IntroCurtain';

export { useIntroClock } from './useIntroClock';
export type { IntroClock, ClockMode } from './useIntroClock';

export {
  INTRO_SCENES,
  DISCLAIMER_CLAUSES,
  DISCLAIMER_HEADING,
  DISCLAIMER_BADGE,
  LEGAL_ENTITY,
  COPYRIGHT_LINE,
  DEFAULTS,
} from './content';
export type { Clause } from './content';

export { resolveOrientation } from './orientation';
export type { Orientation, OrientationInput } from './orientation';

export { deriveTimeline, warp, validateScenes } from './timeline';
export type { Scene, DerivedTimeline } from './timeline';

export { Easing, animate, interpolate, fade, clamp } from './easing';
export type { EasingFn } from './easing';

export { COLORS, FRAME, FONT_BODY, FONT_DISPLAY } from './theme';
