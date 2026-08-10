/**
 * Entry point, serving two roles:
 *
 *   - default: a preview harness with the fields the design's Tweaks panel had
 *     (channel / title / performers / orientation) plus a scrub bar.
 *   - ?render=1: a bare canvas on a manual clock, which is what the headless
 *     renderer opens. No chrome, no autoplay, 1:1 scaling.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IntroPlayer } from '../intro';
import { DemoHarness } from './DemoHarness';
import { resolveOrientation, type OrientationInput } from '../intro/orientation';
import { COLORS } from '../intro/theme';

const params = new URLSearchParams(window.location.search);
const isRenderMode = params.get('render') === '1';

const root = createRoot(document.getElementById('root')!);

if (isRenderMode) {
  const orientationParam = (params.get('orientation') ?? 'auto') as OrientationInput;
  const vw = Number(params.get('vw'));
  const vh = Number(params.get('vh'));

  const resolved = resolveOrientation({
    orientation: orientationParam,
    videoWidth: isFinite(vw) ? vw : undefined,
    videoHeight: isFinite(vh) ? vh : undefined,
  });

  // Let the canvas size the document rather than being clipped by the fixed
  // full-viewport #root the preview harness uses.
  document.body.style.background = COLORS.bg;
  document.documentElement.style.background = COLORS.bg;
  const rootEl = document.getElementById('root')!;
  rootEl.style.position = 'static';
  rootEl.style.inset = 'auto';

  root.render(
    <IntroPlayer
      channel={params.get('channel') ?? undefined}
      title={params.get('title') ?? undefined}
      performers={params.get('performers') ?? undefined}
      orientation={resolved}
      mode="manual"
      autoplay={false}
      showSkip={false}
      scaling="exact"
      fill={false}
    />,
  );
} else {
  root.render(
    <StrictMode>
      <DemoHarness />
    </StrictMode>,
  );
}
