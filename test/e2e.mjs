#!/usr/bin/env node
/**
 * Browser checks that unit tests can't cover: that the piece mounts, that props
 * reach the rendered card, that scale-to-fit letterboxes the canvas, and that
 * the Skip button is actually clickable.
 *
 * That last one is not hypothetical — the title card is a full-frame overlay
 * that comes after the button in DOM order, so without the z-index and
 * pointer-events rules in IntroCurtain it silently swallows every Skip click.
 *
 *   npm run build && npm run test:e2e
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const c of [
    process.env.PNPTV_CHROMIUM,
    process.env.CHROME_PATH,
    join(base, 'chromium'),
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ]) {
    if (c && existsSync(c)) return c;
  }
  return undefined;
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = resolve(join(DIST, p));
  if (!f.startsWith(DIST) || !existsSync(f)) {
    res.writeHead(404).end('not found');
    return;
  }
  const body = readFileSync(f);
  res
    .writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream' })
    .end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;

const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: findChromium() });

try {
  // ── Preview harness ───────────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('[data-pnptv-intro-canvas]');
    check('harness mounts without a page error', pageErrors.length === 0, pageErrors.join('; '));

    const box = await page.locator('[data-pnptv-intro-canvas]').boundingBox();
    // 1120x900 viewport area for a 16:9 canvas -> width-bound, 1120x630.
    const ratio = box.width / box.height;
    check(
      'canvas letterboxes at 16:9',
      Math.abs(ratio - 16 / 9) < 0.02,
      `${box.width.toFixed(0)}x${box.height.toFixed(0)}`,
    );
    check('canvas is scaled down to fit', box.width < 1920);

    await page.fill('#title', 'Harness Check');
    await page.waitForTimeout(150);
    check('title prop reaches the card', (await page.locator('text=HARNESS CHECK').count()) > 0);

    // The whole point: Skip must be reachable while the title card is up.
    await page.waitForTimeout(500);
    await page.locator('button:has-text("SKIP")').click({ timeout: 4000 });
    await page.waitForTimeout(150);
    check('Skip is clickable and fires onComplete', (await page.locator('text=fired').count()) > 0);
    check('Skip lands on the disclaimer', (await page.locator('text=VIEWER DISCLAIMER').count()) > 0);

    await page.close();
  }

  // ── Render mode ───────────────────────────────────────────────────────────
  for (const [label, query, expect] of [
    ['landscape', 'render=1&orientation=landscape', { w: 1920, h: 1080 }],
    ['portrait', 'render=1&orientation=auto&vw=1080&vh=1920', { w: 1080, h: 1920 }],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1920 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(`${base}?${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__pnptvIntro);
    check(`${label}: render mode mounts cleanly`, pageErrors.length === 0, pageErrors.join('; '));

    const meta = await page.evaluate(() => ({
      duration: window.__pnptvIntro.duration,
      width: window.__pnptvIntro.width,
      height: window.__pnptvIntro.height,
      orientation: window.__pnptvIntro.orientation,
    }));
    check(`${label}: canvas is ${expect.w}x${expect.h}`, meta.width === expect.w && meta.height === expect.h,
      `${meta.width}x${meta.height}`);
    check(`${label}: duration is 16s`, meta.duration === 16, String(meta.duration));

    check(`${label}: no Skip button in render mode`,
      (await page.locator('button:has-text("SKIP")').count()) === 0);

    const box = await page.locator('[data-pnptv-intro-canvas]').boundingBox();
    check(`${label}: canvas renders 1:1`, box.width === expect.w && box.height === expect.h,
      `${box.width}x${box.height}`);

    // Seeking is what the renderer relies on: the same timestamp must always
    // produce the same frame, and the two cards must swap across the cue.
    const at = async (t) => {
      await page.evaluate((time) => window.__pnptvIntro.seek(time), t);
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      return page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-pnptv-intro-canvas] > div > div');
        // Title group and disclaimer wrapper are the last two children.
        const opacity = (el) => (el ? Number(getComputedStyle(el).opacity) : -1);
        return {
          title: opacity(nodes[nodes.length - 2]),
          disclaimer: opacity(nodes[nodes.length - 1]),
        };
      });
    };

    const t0 = await at(0);
    check(`${label}: opens on an empty frame`, t0.title === 0 && t0.disclaimer === 0,
      JSON.stringify(t0));

    const t3 = await at(3);
    check(`${label}: title card is up at t=3`, t3.title === 1 && t3.disclaimer === 0,
      JSON.stringify(t3));

    const t12 = await at(12);
    check(`${label}: disclaimer is up at t=12`, t12.title === 0 && t12.disclaimer === 1,
      JSON.stringify(t12));

    const again = await at(3);
    check(`${label}: seeking is deterministic`, again.title === t3.title && again.disclaimer === t3.disclaimer);

    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
