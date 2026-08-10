/**
 * Guards the numbers the design depends on: the easing curves, the tween
 * boundaries, and the exact opacity/offset values the intro's choreography
 * produces at its cue points. These are the values that make the port faithful
 * rather than merely similar.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { animate, clamp, Easing, fade, interpolate } from '../src/intro/easing.ts';

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

describe('Easing', () => {
  it('pins every curve to 0 and 1 at its endpoints', () => {
    for (const [name, fn] of Object.entries(Easing)) {
      close(fn(0), 0, 1e-12);
      close(fn(1), 1, 1e-12);
      assert.ok(Number.isFinite(fn(0.5)), name);
    }
  });

  it('reproduces easeOutCubic', () => {
    close(Easing.easeOutCubic(0.5), 0.875);
  });

  it('overshoots on easeOutBack, which is what gives the logo its pop', () => {
    assert.ok(Easing.easeOutBack(0.7) > 1);
  });
});

describe('animate', () => {
  it('holds `from` before start and `to` after end', () => {
    const a = animate({ from: 10, to: 20, start: 2, end: 4 });
    assert.equal(a(0), 10);
    assert.equal(a(2), 10);
    assert.equal(a(4), 20);
    assert.equal(a(99), 20);
  });

  it('defaults to easeInOutCubic — the intro relies on that default', () => {
    const a = animate({ from: 0, to: 1, start: 0, end: 1 });
    close(a(0.5), Easing.easeInOutCubic(0.5));
    close(a(0.25), Easing.easeInOutCubic(0.25));
  });

  it('is monotonic across a plain ramp', () => {
    const a = animate({ from: 0, to: 100, start: 0, end: 1, ease: Easing.linear });
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const v = a(i / 20);
      assert.ok(v >= prev);
      prev = v;
    }
  });
});

describe('interpolate', () => {
  it('maps across keyframes and clamps at the ends', () => {
    const f = interpolate([0, 0.5, 1], [0, 100, 50]);
    assert.equal(f(-1), 0);
    assert.equal(f(0.5), 100);
    close(f(0.75), 75);
    assert.equal(f(2), 50);
  });
});

describe('fade', () => {
  it('ramps in and stays up with no out-window', () => {
    assert.equal(fade(0, 1, 2), 0);
    assert.equal(fade(1, 1, 2), 0);
    assert.equal(fade(2, 1, 2), 1);
    assert.equal(fade(50, 1, 2), 1);
  });

  it('ramps back down across the out-window', () => {
    assert.equal(fade(4, 1, 2, 4, 5), 1);
    assert.equal(fade(5, 1, 2, 4, 5), 0);
    assert.ok(fade(4.5, 1, 2, 4, 5) < 1);
    assert.ok(fade(4.5, 1, 2, 4, 5) > 0);
  });

  it('takes the lower of the two ramps when they overlap', () => {
    // In-ramp 0..4 and out-ramp 2..6 cross: at t=3 the falling ramp wins.
    const v = fade(3, 0, 4, 2, 6);
    const rising = animate({
      from: 0, to: 1, start: 0, end: 4, ease: Easing.easeOutCubic,
    })(3);
    const falling = animate({
      from: 1, to: 0, start: 2, end: 6, ease: Easing.easeInCubic,
    })(3);
    close(v, Math.min(rising, falling));
  });
});

describe('intro choreography values', () => {
  // The disclaimer cue for the shipped 7s/9s scene list.
  const d = 7;

  const titleOp = (T: number) => fade(T, 0.1, 0.9, d - 0.7, d + 0.1);
  const discOp = (T: number) => fade(T, d - 0.4, d + 0.5);
  const skipOp = (T: number) => fade(T, 0.3, 1);

  it('opens on an empty frame', () => {
    assert.equal(titleOp(0), 0);
    assert.equal(discOp(0), 0);
    assert.equal(skipOp(0), 0);
  });

  it('has the title card fully up through the middle of its scene', () => {
    assert.equal(titleOp(0.9), 1);
    assert.equal(titleOp(3), 1);
    assert.equal(titleOp(6), 1);
  });

  it('cross-fades the two cards around the cue', () => {
    // Title starts leaving at 6.3, disclaimer starts arriving at 6.6.
    assert.ok(titleOp(6.3) === 1);
    assert.ok(titleOp(6.9) < 1);
    assert.ok(discOp(6.6) === 0);
    assert.ok(discOp(6.9) > 0);
    // Both are partly visible in the overlap — that is the intended dissolve.
    assert.ok(titleOp(6.9) > 0 && discOp(6.9) > 0);
  });

  it('ends on the disclaimer alone, fully opaque', () => {
    assert.equal(titleOp(7.1), 0);
    assert.equal(titleOp(16), 0);
    assert.equal(discOp(7.5), 1);
    assert.equal(discOp(16), 1);
  });

  it('keeps the skip affordance up for the whole piece after its ramp', () => {
    assert.equal(skipOp(1), 1);
    assert.equal(skipOp(16), 1);
  });

  it('lands the logo, rule, title and performers within the title scene', () => {
    const logoProg = animate({
      from: 0, to: 1, start: 0.25, end: 1.1, ease: Easing.easeOutBack,
    });
    const lineW = animate({
      from: 0, to: 88, start: 1.15, end: 1.7, ease: Easing.easeOutCubic,
    });
    const titleTextY = animate({ from: 16, to: 0, start: 1.6, end: 2.3 });
    const performersY = animate({ from: 14, to: 0, start: 2.1, end: 2.8 });

    assert.equal(logoProg(1.1), 1);
    assert.equal(lineW(1.7), 88);
    assert.equal(titleTextY(2.3), 0);
    assert.equal(performersY(2.8), 0);
    // Everything is settled well before the 7s cut.
    assert.ok(2.8 < d);
  });
});

describe('clamp', () => {
  it('bounds both ways', () => {
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(50, 0, 10), 10);
  });
});
