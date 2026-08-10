/**
 * The authored-time axis.
 *
 * The intro is one element tree rendered as a pure function of a single
 * authored clock `T`. Scenes are named slices of that axis; `CUES.Name` is a
 * scene's authored start. Nothing mounts or unmounts at a scene boundary, so
 * elements can cross boundaries by ordinary interpolation.
 *
 * `dur` is the *playback* length of a slice and `nat` its authored length. When
 * they differ (a scene retimed without rewriting its choreography), the same
 * authored slice replays over the new playback length — choreography retimes
 * rather than getting cut off. Ported from animations-v3.jsx's ccDerive/ccWarp.
 */

export interface Scene {
  /** Scene name; becomes a key in the cue table. */
  name: string;
  /** Playback length in seconds. */
  dur: number;
  /** Authored length in seconds. Defaults to `dur`. */
  nat?: number;
  /** One plain sentence describing what happens — documentation only. */
  desc?: string;
}

interface Section {
  name: string;
  playStart: number;
  dur: number;
  authStart: number;
  nat: number;
}

export interface DerivedTimeline {
  sections: Section[];
  /** Scene name -> authored start time. First occurrence of a name wins. */
  cues: Record<string, number>;
  /** Total playback length. */
  total: number;
  /** Total authored length. */
  authoredTotal: number;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function deriveTimeline(scenes: Scene[]): DerivedTimeline {
  let playStart = 0;
  let authStart = 0;
  const sections: Section[] = [];
  const cues: Record<string, number> = Object.create(null);

  for (const s of scenes) {
    const nat =
      typeof s.nat === 'number' && isFinite(s.nat) && s.nat > 0 ? s.nat : s.dur;
    sections.push({ name: s.name, playStart, dur: s.dur, authStart, nat });
    if (!Object.prototype.hasOwnProperty.call(cues, s.name)) {
      cues[s.name] = round3(authStart);
    }
    playStart += s.dur;
    authStart += nat;
  }

  return {
    sections,
    cues,
    total: round3(playStart),
    authoredTotal: round3(authStart),
  };
}

/** Map playback time -> authored time `T`. */
export function warp(d: DerivedTimeline, t: number): number {
  const ss = d.sections;
  if (ss.length === 0) return 0;

  let idx = ss.length - 1;
  for (let i = 0; i < ss.length; i++) {
    if (t < ss[i].playStart + ss[i].dur) {
      idx = i;
      break;
    }
  }
  const s = ss[idx];
  const local = Math.min(Math.max(t - s.playStart, 0), s.dur);
  const T = s.authStart + (s.dur > 0 ? local * (s.nat / s.dur) : 0);
  return Math.min(T, d.authoredTotal);
}

/** Validate a scene list the way the prototype's host did. */
export function validateScenes(scenes: unknown): scenes is Scene[] {
  if (!Array.isArray(scenes) || scenes.length === 0 || scenes.length > 40) {
    return false;
  }
  return scenes.every((s) => {
    if (typeof s !== 'object' || s === null) return false;
    const { name, dur } = s as Scene;
    return (
      typeof name === 'string' &&
      name.length > 0 &&
      typeof dur === 'number' &&
      isFinite(dur) &&
      dur > 0 &&
      dur <= 300
    );
  });
}
