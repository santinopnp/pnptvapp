import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveTimeline, validateScenes, warp } from '../src/intro/timeline.ts';
import { INTRO_SCENES } from '../src/intro/content.ts';

describe('deriveTimeline', () => {
  it('derives the intro cue table from the scene list', () => {
    const d = deriveTimeline(INTRO_SCENES);
    assert.equal(d.total, 16);
    assert.equal(d.authoredTotal, 16);
    assert.equal(d.cues.Title, 0);
    assert.equal(d.cues.Disclaimer, 7);
  });

  it('binds a duplicate scene name to its first occurrence', () => {
    const d = deriveTimeline([
      { name: 'A', dur: 2 },
      { name: 'B', dur: 3 },
      { name: 'A', dur: 4 },
    ]);
    assert.equal(d.cues.A, 0);
    assert.equal(d.cues.B, 2);
    assert.equal(d.total, 9);
  });

  it('separates authored from playback totals when nat differs', () => {
    const d = deriveTimeline([
      { name: 'A', dur: 4, nat: 2 },
      { name: 'B', dur: 3, nat: 3 },
    ]);
    assert.equal(d.total, 7);
    assert.equal(d.authoredTotal, 5);
    // B's cue is on the authored axis, not the playback one.
    assert.equal(d.cues.B, 2);
  });
});

describe('warp', () => {
  const d = deriveTimeline(INTRO_SCENES);

  it('is the identity when every scene plays at its authored length', () => {
    for (const t of [0, 0.5, 3, 6.999, 7, 10, 15.5, 16]) {
      assert.ok(Math.abs(warp(d, t) - t) < 1e-9, `t=${t}`);
    }
  });

  it('clamps outside the timeline', () => {
    assert.equal(warp(d, -5), 0);
    assert.equal(warp(d, 999), 16);
  });

  it('replays the same authored slice over a retimed playback length', () => {
    // Title stretched to 14s of playback but still 7s of authored motion:
    // playback 7s should sit halfway through the authored slice.
    const r = deriveTimeline([
      { name: 'Title', dur: 14, nat: 7 },
      { name: 'Disclaimer', dur: 9, nat: 9 },
    ]);
    assert.equal(r.total, 23);
    assert.equal(r.authoredTotal, 16);
    assert.ok(Math.abs(warp(r, 7) - 3.5) < 1e-9);
    assert.ok(Math.abs(warp(r, 14) - 7) < 1e-9);
    // And the disclaimer still starts at authored 7.
    assert.equal(r.cues.Disclaimer, 7);
  });

  it('returns 0 for an empty scene list', () => {
    assert.equal(warp(deriveTimeline([]), 5), 0);
  });
});

describe('validateScenes', () => {
  it('accepts the intro scene list', () => {
    assert.equal(validateScenes(INTRO_SCENES), true);
  });

  it('rejects malformed lists', () => {
    assert.equal(validateScenes([]), false);
    assert.equal(validateScenes('nope'), false);
    assert.equal(validateScenes([{ name: 'A', dur: 0 }]), false);
    assert.equal(validateScenes([{ name: 'A', dur: -1 }]), false);
    assert.equal(validateScenes([{ name: 'A', dur: 301 }]), false);
    assert.equal(validateScenes([{ name: '', dur: 3 }]), false);
    assert.equal(validateScenes([{ dur: 3 }]), false);
  });
});
