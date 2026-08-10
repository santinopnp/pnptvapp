/**
 * Orientation selection.
 *
 * The pipeline passes the source video's pixel dimensions and the intro picks
 * the matching canvas; an explicit `orientation` always wins. Mirrors the
 * prototype's renderVals() logic: portrait only when height > width, so square
 * sources land on landscape.
 */

export type Orientation = 'landscape' | 'portrait';
export type OrientationInput = Orientation | 'auto';

export function resolveOrientation(opts: {
  orientation?: OrientationInput;
  videoWidth?: number;
  videoHeight?: number;
}): Orientation {
  const { orientation = 'auto', videoWidth, videoHeight } = opts;

  if (orientation === 'portrait' || orientation === 'landscape') {
    return orientation;
  }

  const w = Number(videoWidth);
  const h = Number(videoHeight);
  const usable = isFinite(w) && isFinite(h) && w > 0 && h > 0;

  return usable && h > w ? 'portrait' : 'landscape';
}
