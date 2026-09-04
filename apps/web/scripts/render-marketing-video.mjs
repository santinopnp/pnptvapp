#!/usr/bin/env node
/**
 * Renders the /marketing/ Claude Design canvas exports to downloadable MP4s.
 *
 * Reads OM_SCENES from each timeline HTML, records via headless chromium at
 * the orientation's native size, then transcodes the webm to h264 mp4 with
 * faststart so it plays inline on Telegram / X / iOS Safari.
 *
 * Renders from dist/marketing (precompile-marketing.mjs output) so the pages
 * load offline — no unpkg fetch, no CDN latency skewing frame timing. Writes
 * mp4s to public/marketing so they survive the next vite build (dist gets
 * wiped; public gets copied in). See feedback_dist_wiped_by_vite_build.md.
 *
 * Usage: node scripts/render-marketing-video.mjs [name-without-ext ...]
 * With no args, renders all 7 timeline pages.
 *
 * Requires: playwright + chromium (installed one-off in /tmp/marketing-render),
 *           ffmpeg on PATH.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/marketing-render/node_modules/playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '..');
const DIST_DIR = path.join(WEB_ROOT, 'dist', 'marketing');
const OUT_DIR = path.join(WEB_ROOT, 'public', 'marketing');
const TMP_DIR = fs.mkdtempSync(path.join('/tmp', 'marketing-render-'));

// index.html is a landing page and wallet-tour.html is an interactive slideshow
// (no OM_SCENES timeline) — neither is a video.
const SKIP = new Set(['index.html', 'wallet-tour.html']);

const log = (...a) => console.log('[render-marketing]', ...a);
const fail = (msg) => { console.error('[render-marketing] ERROR:', msg); process.exit(1); };

function parsePage(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const orientM = html.match(/OM_ORIENTATION\s*=\s*'([^']+)'/);
  const scenesM = html.match(/OM_SCENES\s*=\s*'(\[[^']+\])'/);
  if (!orientM || !scenesM) return null;
  const scenes = JSON.parse(scenesM[1]);
  const totalSec = scenes.reduce((s, x) => s + Number(x.dur || 0), 0);
  return { orientation: orientM[1], totalSec };
}

function sizeFor(orientation) {
  return orientation === 'horizontal'
    ? { width: 1920, height: 1080 }
    : { width: 1080, height: 1920 };
}

function transcode(webm, mp4) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', webm,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an',
      mp4,
    ];
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exit ${c}`))));
  });
}

// Serve dist/marketing over localhost — the runtime uses fetch() to load
// scene modules, and browsers reject fetch() from file:// URLs. Ephemeral
// port, listens only on 127.0.0.1, dies with the process.
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.mjs': 'application/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.srt': 'text/plain',
};
function startStaticServer(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const full = path.join(root, p);
      if (!full.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404); res.end(err.message); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function renderOne(name, browser, baseUrl) {
  const htmlPath = path.join(DIST_DIR, `${name}.html`);
  if (!fs.existsSync(htmlPath)) fail(`missing ${htmlPath}`);
  const meta = parsePage(htmlPath);
  if (!meta) { log(`SKIP ${name}: no timeline`); return; }

  const size = sizeFor(meta.orientation);
  const durationMs = Math.ceil(meta.totalSec * 1000);
  log(`${name}: ${meta.orientation} ${size.width}x${size.height} · ${meta.totalSec}s scenes`);

  const perFileTmp = fs.mkdtempSync(path.join(TMP_DIR, `${name}-`));
  const ctx = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    recordVideo: { dir: perFileTmp, size },
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();

  const url = `${baseUrl}/${name}.html`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // Hide the preview chrome (tweaks panel + transport scrubber) — both live
  // under [data-omelette-chrome] and belong to the authoring UI, not the ad.
  await page.addStyleTag({ content: '[data-omelette-chrome]{display:none!important}' });
  // Give the runtime a beat to mount React + kick off the timeline. Anything
  // faster than ~600ms and the first frame or two of the Hook scene is missed.
  await page.waitForTimeout(800);
  await page.waitForTimeout(durationMs);
  // 500ms tail so the final scene isn't truncated mid-fade.
  await page.waitForTimeout(500);

  await page.close();
  await ctx.close();

  const webm = fs.readdirSync(perFileTmp).find((f) => f.endsWith('.webm'));
  if (!webm) fail(`${name}: no webm produced`);
  const webmPath = path.join(perFileTmp, webm);

  const mp4Path = path.join(OUT_DIR, `${name}.mp4`);
  await transcode(webmPath, mp4Path);
  const sizeMb = (fs.statSync(mp4Path).size / 1024 / 1024).toFixed(1);
  log(`  → ${path.relative(WEB_ROOT, mp4Path)} (${sizeMb} MB)`);
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) fail(`no dist/marketing — run "vite build" first: ${DIST_DIR}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const requested = process.argv.slice(2);
  const allHtml = fs.readdirSync(DIST_DIR).filter((f) => f.endsWith('.html') && !SKIP.has(f));
  const targets = requested.length
    ? requested.map((n) => n.replace(/\.html$/, ''))
    : allHtml.map((f) => f.replace(/\.html$/, ''));

  const server = await startStaticServer(DIST_DIR);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  log(`serving ${DIST_DIR} at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const name of targets) {
      await renderOne(name, browser, baseUrl);
    }
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  log('done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
