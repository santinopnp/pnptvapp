import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveOrientation } from '../src/intro/orientation.ts';
import { FRAME } from '../src/intro/theme.ts';

describe('resolveOrientation', () => {
  it('honours an explicit choice over the video dimensions', () => {
    assert.equal(
      resolveOrientation({ orientation: 'portrait', videoWidth: 1920, videoHeight: 1080 }),
      'portrait',
    );
    assert.equal(
      resolveOrientation({ orientation: 'landscape', videoWidth: 1080, videoHeight: 1920 }),
      'landscape',
    );
  });

  it('picks portrait only when the source is taller than it is wide', () => {
    assert.equal(resolveOrientation({ videoWidth: 1080, videoHeight: 1920 }), 'portrait');
    assert.equal(resolveOrientation({ videoWidth: 720, videoHeight: 1280 }), 'portrait');
    assert.equal(resolveOrientation({ videoWidth: 1920, videoHeight: 1080 }), 'landscape');
    assert.equal(resolveOrientation({ videoWidth: 3840, videoHeight: 2160 }), 'landscape');
  });

  it('treats a square source as landscape', () => {
    assert.equal(resolveOrientation({ videoWidth: 1080, videoHeight: 1080 }), 'landscape');
  });

  it('falls back to landscape when dimensions are missing or unusable', () => {
    assert.equal(resolveOrientation({}), 'landscape');
    assert.equal(resolveOrientation({ orientation: 'auto' }), 'landscape');
    assert.equal(resolveOrientation({ videoWidth: 0, videoHeight: 0 }), 'landscape');
    assert.equal(resolveOrientation({ videoHeight: 1920 }), 'landscape');
    assert.equal(
      resolveOrientation({ videoWidth: NaN, videoHeight: 1920 }),
      'landscape',
    );
  });
});

describe('FRAME', () => {
  it('matches the design canvases', () => {
    assert.deepEqual(FRAME.landscape, { width: 1920, height: 1080 });
    assert.deepEqual(FRAME.portrait, { width: 1080, height: 1920 });
  });
});
