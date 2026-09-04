#!/usr/bin/env node
/**
 * Renders the /marketing/ animations to MP4.
 *
 * WHY THIS EXISTS
 * ---------------
 * The pages carry an "Export video" button, but it only does this:
 *
 *     window.parent.postMessage({ type: 'omelette:request-video-export' }, '*')
 *
 * The encoder lives in the Claude Design canvas editor, not in the export, so
 * on a standalone host window.parent === window and the click is a silent
 * no-op. This script is the encoder for the hosted copies.
 *
 * HOW IT WORKS
 * ------------
 * Every composition is driven purely by the requestAnimationFrame timestamp --
 * animations-v3.jsx advances its clock with `dt = (ts - lastTs) / 1000` and
 * derives every visual from that. There are no CSS keyframes and no CSS
 * transitions outside the player chrome, which is hidden before capture. So
 * rAF is replaced with a virtual clock the renderer steps by exactly 1/fps:
 * frames are deterministic and perfectly spaced regardless of how slow the
 * machine is. A realtime screen capture would drop and duplicate frames here.
 *
 * The stage is authored at native 1080x1920 (vertical) or 1920x1080
 * (horizontal) and scaled down to fit the window via a transform on the SVG
 * that wraps its foreignObject. The renderer pins that SVG to the viewport
 * origin at native size with the transform removed, so capture is 1:1 with no
 * resampling.
 *
 * Frames stream straight into ffmpeg as PNG over stdin -- nothing hits disk
 * between Chrome and the encoder.
 *
 * Usage:
 *   node scripts/render-marketing-videos.mjs [options]
 *     --base <url>     page origin (default http://localhost:8099/marketing)
 *     --out <dir>      output directory (default apps/web/dist/marketing/video)
 *     --fps <n>        default 30
 *     --only <name>    render one page, e.g. --only rush-wallet-vertical
 *     --seconds <n>    cap duration, for quick checks
 *     --crf <n>        x264 quality, default 18 (lower = better)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const BASE = arg('base', 'http://localhost:8099/marketing').replace(/\/$/, '');
const OUT_DIR = path.resolve(arg('out', path.join(REPO, 'apps/web/dist/marketing/video')));
const FPS = Number(arg('fps', 30));
const CRF = Number(arg('crf', 18));
const ONLY = arg('only', null);
const MAX_SECONDS = Number(arg('seconds', 0)) || null;

// wallet-tour.html is deliberately absent: it is a tap-to-advance interactive
// tour with no timeline (no OM_SCENES), so it has no intrinsic duration to
// render. It needs its own treatment, not a frame dump.
const PAGES = [
  'rush-wallet-vertical',
  'rush-wallet-horizontal',
  'rush-tutorial-vertical',
  'rush-tutorial-horizontal',
  'subscribe-pnptv',
  'subscribe-creator',
  'book-a-call',
];

const log = (...a) => console.log('[render]', ...a);

/**
 * Installed before any page script runs, so animations-v3 captures the fake
 * rAF rather than the real one. cancelAnimationFrame is a no-op: the loop
 * re-registers every step and dropping the callback would stall the clock.
 * The native rAF is kept so the harness can still wait for real paints.
 */
function installVirtualClock() {
  const native = window.requestAnimationFrame.bind(window);
  window.__nativeRAF = native;
  // Seeded from the real clock: the loop is already running with real
  // timestamps by the time this is installed, and starting at 0 would make the
  // next dt hugely negative and corrupt the timeline.
  window.__vt = performance.now();
  let queue = [];
  window.requestAnimationFrame = (cb) => queue.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__step = (dtMs) => {
    window.__vt += dtMs;
    const due = queue;
    queue = [];
    for (const cb of due) {
      try {
        cb(window.__vt);
      } catch (e) {
        /* a scene throwing must not stall the render */
      }
    }
    return due.length;
  };
}

/** Strip the player chrome and pin the composition 1:1 at the viewport origin. */
function prepareStage(w, h) {
  // Several outer wrappers also measure w x h; the real composition is the
  // one inside the <foreignObject>, so require that rather than taking the
  // first match and ending up pinning a layout container.
  const stage = [...document.querySelectorAll('body *')].find(
    (e) => e.offsetWidth === w && e.offsetHeight === h && e.closest('foreignObject')
  );
  if (!stage) return { ok: false, reason: `no ${w}x${h} stage element found` };

  const fo = stage.closest('foreignObject');
  const svg = fo ? fo.ownerSVGElement : null;
  if (!svg) return { ok: false, reason: 'stage is not inside an <svg><foreignObject>' };

  // Hide every top-level sibling of the svg's chain: transport bar, tweaks
  // panel, anything else the runtime paints around the composition.
  const keep = new Set();
  for (let n = svg; n; n = n.parentElement) keep.add(n);
  document.querySelectorAll('body *').forEach((el) => {
    if (!keep.has(el) && !svg.contains(el) && !el.contains(svg)) {
      el.style.setProperty('display', 'none', 'important');
    }
  });

  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.style.cssText =
    `position:fixed;top:0;left:0;width:${w}px;height:${h}px;transform:none;margin:0;z-index:2147483647`;
  document.documentElement.style.cssText = 'margin:0;padding:0;overflow:hidden;background:#0a0a0a';
  document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:#0a0a0a';

  const r = svg.getBoundingClientRect();
  return { ok: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
}

async function renderPage(browser, name) {
  const url = `${BASE}/${name}.html`;
  const page = await browser.newPage();
  page.on('pageerror', (e) => log(`  page error: ${e.message.split('\n')[0]}`));

  // networkidle0 never settles on these pages (a keep-alive connection stays
  // open), so wait for load and then for the stage itself to exist.
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });

  // Orientation and duration come from the page itself, so a re-exported
  // canvas with different scenes still renders correctly.
  const meta = await page.evaluate(() => {
    const vertical = window.OM_ORIENTATION !== 'horizontal';
    let dur = 0;
    try {
      dur = (JSON.parse(window.OM_SCENES) || []).reduce((a, s) => a + (s.dur || 0), 0);
    } catch (e) {}
    return { vertical, duration: dur };
  });
  if (!meta.duration) {
    await page.close();
    throw new Error(`${name}: no OM_SCENES duration -- not a timed composition`);
  }

  const W = meta.vertical ? 1080 : 1920;
  const H = meta.vertical ? 1920 : 1080;
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

  await page.waitForFunction(
    (w, h) => [...document.querySelectorAll('body *')].some((e) => e.offsetWidth === w && e.offsetHeight === h && e.closest('foreignObject')),
    { timeout: 60000 },
    W,
    H
  );

  // Freeze the clock only once the composition has mounted. Installing it up
  // front stalls React: the stage measures itself through requestAnimationFrame
  // during mount, so a frozen rAF means the stage never appears at all.
  await page.evaluate(installVirtualClock);
  // Let the in-flight real frame fire so the running loop re-registers itself
  // into the virtual queue.
  await page.evaluate(() => new Promise((r) => window.__nativeRAF(() => setTimeout(r, 0))));
  // Mount took real wall-clock time, so the timeline has already advanced.
  // Rewind to 0 (the player's own "Return to start" shortcut) before capture.
  await page.keyboard.press("Digit0");
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

  const prep = await page.evaluate(prepareStage, W, H);
  if (!prep.ok) {
    await page.close();
    throw new Error(`${name}: ${prep.reason}`);
  }
  if (Math.round(prep.rect.w) !== W || Math.round(prep.rect.h) !== H) {
    await page.close();
    throw new Error(
      `${name}: stage is ${Math.round(prep.rect.w)}x${Math.round(prep.rect.h)}, expected ${W}x${H} -- capture would resample`
    );
  }

  const duration = MAX_SECONDS ? Math.min(meta.duration, MAX_SECONDS) : meta.duration;
  const frames = Math.round(duration * FPS);
  const outFile = path.join(OUT_DIR, `${name}.mp4`);
  log(`${name}: ${W}x${H}, ${duration}s, ${frames} frames @ ${FPS}fps`);

  const ffmpeg = spawn(
    require('ffmpeg-static'),
    [
      '-y',
      '-f', 'image2pipe',
      '-framerate', String(FPS),
      '-i', '-',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', String(CRF),
      // yuv420p + even dimensions is what makes the file play on phones and
      // in every social uploader; without it QuickTime and Android silently
      // refuse the stream.
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outFile,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] }
  );
  let ffErr = '';
  ffmpeg.stderr.on('data', (d) => (ffErr += d.toString()));
  const done = new Promise((res, rej) => {
    ffmpeg.on('close', (code) =>
      code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}\n${ffErr.slice(-1500)}`))
    );
    ffmpeg.on('error', rej);
  });

  const stepMs = 1000 / FPS;
  const clip = { x: 0, y: 0, width: W, height: H };
  for (let i = 0; i < frames; i++) {
    // Advance the clock, then let React commit before the pixels are read --
    // the state update from setTime is asynchronous, and screenshotting too
    // early captures the previous frame.
    await page.evaluate((dt) => window.__step(dt), stepMs);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));

    const png = await page.screenshot({ clip, type: 'png', optimizeForSpeed: true });
    if (!ffmpeg.stdin.write(png)) {
      await new Promise((r) => ffmpeg.stdin.once('drain', r));
    }
    if (i % (FPS * 5) === 0) process.stdout.write(`\r[render] ${name}: ${i}/${frames}`);
  }
  process.stdout.write(`\r[render] ${name}: ${frames}/${frames}\n`);

  ffmpeg.stdin.end();
  await done;
  await page.close();

  const size = fs.statSync(outFile).size;
  log(`${name}: wrote ${path.basename(outFile)} (${(size / 1048576).toFixed(1)} MB)`);
  return { name, file: outFile, size, frames, duration, w: W, h: H };
}

(async () => {
  const puppeteer = require('puppeteer');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const targets = ONLY ? [ONLY] : PAGES;
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Without this the compositor throttles or skips paints for an
      // offscreen/background page and screenshots come back stale.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--font-render-hinting=none',
    ],
  });

  const results = [];
  const failures = [];
  try {
    for (const name of targets) {
      try {
        results.push(await renderPage(browser, name));
      } catch (e) {
        log(`FAILED ${name}: ${e.message}`);
        failures.push({ name, error: e.message });
      }
    }
  } finally {
    await browser.close();
  }

  console.log('\n[render] === summary ===');
  for (const r of results) {
    console.log(`  OK   ${r.name}.mp4  ${r.w}x${r.h}  ${r.duration}s  ${(r.size / 1048576).toFixed(1)} MB`);
  }
  for (const f of failures) console.log(`  FAIL ${f.name}: ${f.error}`);
  console.log(`[render] ${results.length} rendered, ${failures.length} failed -> ${OUT_DIR}`);
  process.exit(failures.length ? 1 : 0);
})();
