#!/usr/bin/env node
/**
 * Headless intro renderer.
 *
 * Opens the built page in render mode, seeks to an exact timestamp per frame,
 * screenshots the canvas, then muxes the frames. Time advances by explicit
 * seeks rather than real playback, so output is deterministic and independent
 * of how fast the machine renders.
 *
 *   node render/render-intro.mjs \
 *     --title "Midnight Sessions" \
 *     --channel "PNPTV! PRESENTS" \
 *     --performers "Alex Vale  •  Rio Sun" \
 *     --video-width 1080 --video-height 1920 \
 *     --out out/intro
 *
 * Run `npm run build` first — the renderer serves ./dist.
 *
 * Flags:
 *   --channel --title --performers    text burned into the title card
 *   --orientation auto|landscape|portrait   (default auto)
 *   --video-width --video-height      source dimensions, used when auto
 *   --fps N                           default 30
 *   --out DIR                         default out/intro
 *   --format auto|mp4|webm|frames     default auto
 *   --keep-frames                     don't delete the frame sequence
 *   --ffmpeg PATH                     override encoder binary
 *
 * Encoder selection. The frame format follows the encoder, because encoders
 * differ in what they can read: a full ffmpeg reads a numbered PNG sequence
 * (lossless, the production path), while Playwright's bundled build is a
 * minimal VP8/WebM build with no PNG decoder and no image2 demuxer — it can
 * only take piped MJPEG. So a bundled-ffmpeg render captures JPEG frames and
 * is preview-grade; use --format frames plus a real ffmpeg for masters.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

// ── Args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const eq = key.indexOf('=');
    if (eq !== -1) {
      out[key.slice(0, eq)] = key.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[key] = argv[++i];
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help === 'true' || args.h === 'true') {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  process.exit(0);
}

const opts = {
  channel: args.channel ?? '',
  title: args.title ?? '',
  performers: args.performers ?? '',
  orientation: args.orientation ?? 'auto',
  videoWidth: args['video-width'] ? Number(args['video-width']) : undefined,
  videoHeight: args['video-height'] ? Number(args['video-height']) : undefined,
  fps: args.fps ? Number(args.fps) : 30,
  out: args.out ?? 'out/intro',
  format: args.format ?? 'auto',
  keepFrames: args['keep-frames'] === 'true',
  ffmpeg: args.ffmpeg,
};

if (!['auto', 'landscape', 'portrait'].includes(opts.orientation)) {
  console.error('--orientation must be auto|landscape|portrait');
  process.exit(1);
}
if (!['auto', 'mp4', 'webm', 'frames'].includes(opts.format)) {
  console.error('--format must be auto|mp4|webm|frames');
  process.exit(1);
}
if (!Number.isFinite(opts.fps) || opts.fps < 1 || opts.fps > 120) {
  console.error('--fps must be between 1 and 120');
  process.exit(1);
}
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}

// ── Subprocess helper ───────────────────────────────────────────────────────

function run(cmd, cmdArgs, { stdinFrom } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, cmdArgs, {
      stdio: [stdinFrom ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', (e) => res({ code: -1, stdout, stderr: stderr + e.message }));
    p.on('close', (code) => res({ code, stdout, stderr }));
    if (stdinFrom) {
      stdinFrom(p.stdin).catch(() => {});
    }
  });
}

// ── Chromium discovery ──────────────────────────────────────────────────────

/**
 * Locate a Chromium to drive. Returns null so Playwright falls back to its own
 * managed download, which is the right answer on a normal dev machine. Managed
 * environments ship a browser whose build number rarely matches the installed
 * Playwright, and re-downloading is slow and often network-blocked.
 */
function findChromium() {
  if (process.env.PNPTV_CHROMIUM) return process.env.PNPTV_CHROMIUM;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const direct = [
    join(base, 'chromium'),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const c of direct) if (existsSync(c)) return c;

  try {
    for (const e of readdirSync(base)) {
      if (!e.startsWith('chromium-')) continue;
      const p = join(base, e, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  } catch {
    /* no browsers path — let Playwright decide */
  }
  return null;
}

// ── Encoder discovery ───────────────────────────────────────────────────────

async function probeEncoder(bin) {
  const [enc, dec, dem] = await Promise.all([
    run(bin, ['-hide_banner', '-encoders']),
    run(bin, ['-hide_banner', '-decoders']),
    run(bin, ['-hide_banner', '-demuxers']),
  ]);
  if (enc.code !== 0) return null;

  const encoders = enc.stdout + enc.stderr;
  const decoders = dec.stdout + dec.stderr;
  const demuxers = dem.stdout + dem.stderr;

  return {
    bin,
    h264: /\blibx264\b/.test(encoders),
    vp9: /\blibvpx-vp9\b/.test(encoders),
    vp8: /\blibvpx(?!-)/.test(encoders) || /\blibvpx_vp8\b/.test(encoders),
    pngDecoder: /^\s*\S+\s+png\s/m.test(decoders),
    mjpegDecoder: /^\s*\S+\s+mjpeg\s/m.test(decoders),
    // image2 and image2pipe are distinct: only the former reads a numbered
    // file sequence off disk, and the trailing space is what tells them apart.
    image2: /^\s*\S+\s+image2\s/m.test(demuxers),
    image2pipe: /\bimage2pipe\b/.test(demuxers),
  };
}

async function findBundledFfmpeg() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  let entries;
  try {
    entries = await readdir(base);
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.startsWith('ffmpeg')) continue;
    for (const name of ['ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg-win64.exe', 'ffmpeg']) {
      const p = join(base, e, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Decide the whole pipeline up front — including the frame image format, since
 * that has to be chosen before a single frame is captured.
 */
async function planEncode() {
  if (opts.format === 'frames') {
    return { frameFormat: 'png', encoder: null, container: null };
  }

  const candidates = [];
  if (opts.ffmpeg) candidates.push(opts.ffmpeg);
  candidates.push('ffmpeg');
  const bundled = await findBundledFfmpeg();
  if (bundled) candidates.push(bundled);

  for (const c of candidates) {
    const caps = await probeEncoder(c);
    if (!caps) continue;

    const canSequencePng = caps.image2 && caps.pngDecoder;
    const canPipeJpeg = caps.image2pipe && caps.mjpegDecoder;
    if (!canSequencePng && !canPipeJpeg) continue;

    const container =
      opts.format === 'mp4'
        ? caps.h264
          ? 'mp4'
          : null
        : opts.format === 'webm'
          ? caps.vp9 || caps.vp8
            ? 'webm'
            : null
          : caps.h264
            ? 'mp4'
            : caps.vp9 || caps.vp8
              ? 'webm'
              : null;

    if (!container) continue;

    return {
      encoder: caps,
      container,
      frameFormat: canSequencePng ? 'png' : 'jpeg',
      input: canSequencePng ? 'sequence' : 'pipe',
    };
  }

  return { frameFormat: 'png', encoder: null, container: null };
}

// ── Static server for dist/ ─────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
  '.json': 'application/json',
};

function serveDist() {
  return new Promise((res) => {
    const server = createServer((req, rq) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';

      // Contain path traversal: resolve first, then require the result to be
      // inside DIST.
      const filePath = resolve(join(DIST, pathname));
      if (filePath !== DIST && !filePath.startsWith(DIST + '/')) {
        rq.writeHead(403).end('forbidden');
        return;
      }
      if (!existsSync(filePath)) {
        rq.writeHead(404).end('not found');
        return;
      }
      try {
        const body = readFileSync(filePath);
        rq.writeHead(200, {
          'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
          'Content-Length': body.length,
        }).end(body);
      } catch {
        rq.writeHead(500).end('error');
      }
    });
    server.listen(0, '127.0.0.1', () => res(server));
  });
}

// ── Capture ─────────────────────────────────────────────────────────────────

async function captureFrames(plan, framesDir) {
  const { chromium } = await import('playwright');

  const server = await serveDist();
  const port = server.address().port;

  const query = new URLSearchParams({ render: '1' });
  if (opts.channel) query.set('channel', opts.channel);
  if (opts.title) query.set('title', opts.title);
  if (opts.performers) query.set('performers', opts.performers);
  query.set('orientation', opts.orientation);
  if (opts.videoWidth) query.set('vw', String(opts.videoWidth));
  if (opts.videoHeight) query.set('vh', String(opts.videoHeight));

  const url = `http://127.0.0.1:${port}/index.html?${query}`;

  const browser = await chromium.launch({
    executablePath: findChromium() ?? undefined,
    args: ['--force-color-profile=srgb', '--disable-lcd-text'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1920 },
      deviceScaleFactor: 1,
    });

    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__pnptvIntro, null, { timeout: 15000 });
    if (errors.length) {
      throw new Error(`page errors during load:\n${errors.join('\n')}`);
    }

    const meta = await page.evaluate(async () => {
      const h = window.__pnptvIntro;
      await h.ready();
      return {
        duration: h.duration,
        width: h.width,
        height: h.height,
        orientation: h.orientation,
      };
    });

    // Warn loudly rather than silently shipping fallback type: an exported
    // video with the wrong display face is a brand defect, not a nitpick.
    const fontOk = await page.evaluate(() =>
      document.fonts.check("16px 'Ethnocentric Rg'"),
    );
    if (!fontOk) {
      console.warn(
        "! 'Ethnocentric Rg' did not load — display type falls back to Roboto Mono.\n" +
          '  See FONTS.md to make this deterministic.',
      );
    }

    await page.setViewportSize({ width: meta.width, height: meta.height });

    const canvas = page.locator('[data-pnptv-intro-canvas]');
    await canvas.waitFor({ state: 'visible' });

    // Inclusive of the final frame: a 16s piece at 30fps is 481 frames and the
    // last one sits exactly at t = duration.
    const total = Math.round(meta.duration * opts.fps) + 1;
    const pad = String(total).length;
    const ext = plan.frameFormat === 'jpeg' ? 'jpg' : 'png';

    console.log(
      `Rendering ${total} frames — ${meta.width}x${meta.height} ${meta.orientation}, ` +
        `${meta.duration}s @ ${opts.fps}fps (${ext})`,
    );

    const files = [];
    for (let i = 0; i < total; i++) {
      const t = Math.min(i / opts.fps, meta.duration);
      await page.evaluate((time) => window.__pnptvIntro.seek(time), t);
      // Two rAF ticks so React's commit for that seek has painted.
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );

      const file = join(framesDir, `frame-${String(i).padStart(pad, '0')}.${ext}`);
      await canvas.screenshot(
        plan.frameFormat === 'jpeg'
          ? { path: file, type: 'jpeg', quality: 96, animations: 'disabled' }
          : { path: file, type: 'png', animations: 'disabled' },
      );
      files.push(file);

      if (i % 30 === 0 || i === total - 1) {
        process.stdout.write(`\r  ${i + 1}/${total} frames`);
      }
    }
    process.stdout.write('\n');

    if (errors.length) {
      console.warn(`! page errors during render:\n${errors.join('\n')}`);
    }

    return { meta, files, pad, ext };
  } finally {
    await browser.close();
    server.close();
  }
}

// ── Mux ─────────────────────────────────────────────────────────────────────

function mp4Args(pattern, outFile) {
  return [
    '-y',
    '-framerate', String(opts.fps),
    '-i', pattern,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outFile,
  ];
}

async function pipeFrames(stdin, files) {
  for (const f of files) {
    await new Promise((res, rej) => {
      const rs = createReadStream(f);
      rs.on('error', rej);
      rs.on('end', res);
      rs.pipe(stdin, { end: false });
    });
  }
  stdin.end();
}

async function mux(plan, outDir, framesDir, capture) {
  const { encoder, container } = plan;
  const seqPattern = join(framesDir, `frame-%0${capture.pad}d.${capture.ext}`);

  if (!encoder || !container) {
    const script =
      '#!/bin/sh\n# Mux the rendered frames on a machine with a full ffmpeg.\n' +
      `ffmpeg ${mp4Args(seqPattern, join(outDir, 'intro.mp4'))
        .map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a))
        .join(' ')}\n`;
    const p = join(outDir, 'mux.sh');
    await writeFile(p, script, { mode: 0o755 });
    console.log(
      `No usable encoder found — kept the ${capture.ext.toUpperCase()} sequence.\n` +
        `  frames: ${framesDir}\n` +
        `  mux with: sh ${p}`,
    );
    return { produced: null, framesKept: true };
  }

  const codec =
    container === 'mp4' ? 'libx264' : encoder.vp9 ? 'libvpx-vp9' : 'libvpx';
  const outFile = join(outDir, `intro.${container}`);

  const codecArgs =
    container === 'mp4'
      ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart']
      : ['-c:v', codec, '-b:v', '0', '-crf', '28', '-pix_fmt', 'yuv420p'];

  const inputArgs =
    plan.input === 'sequence'
      ? ['-framerate', String(opts.fps), '-i', seqPattern]
      : // The input codec is stated explicitly: minimal ffmpeg builds are
        // compiled with autodetect off and cannot probe a piped stream.
        ['-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(opts.fps),
         '-i', 'pipe:0'];

  console.log(`Encoding ${codec} ${container}…`);
  const r = await run(
    encoder.bin,
    ['-y', ...inputArgs, ...codecArgs, outFile],
    plan.input === 'pipe'
      ? { stdinFrom: (stdin) => pipeFrames(stdin, capture.files) }
      : undefined,
  );

  if (r.code !== 0) {
    console.error(r.stderr.split('\n').slice(-14).join('\n'));
    throw new Error(`${container} encode failed`);
  }
  console.log(`✓ ${outFile}`);

  if (container !== 'mp4') {
    const script =
      '#!/bin/sh\n# Produce an H.264 mp4 from the frames on a host with a full ffmpeg.\n' +
      `ffmpeg ${mp4Args(seqPattern, join(outDir, 'intro.mp4'))
        .map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a))
        .join(' ')}\n`;
    const p = join(outDir, 'mux.sh');
    await writeFile(p, script, { mode: 0o755 });
    console.log(
      `  This environment has no H.264 encoder, so the output is ${container}.\n` +
        `  For mp4, run on a host with a full ffmpeg: sh ${p}`,
    );
    if (capture.ext === 'jpg') {
      console.log(
        '  Note: those frames are JPEG, because the only available encoder\n' +
          '  cannot read PNG. For a true master, run the whole render on a host\n' +
          '  with a full ffmpeg — it captures lossless PNG frames instead.',
      );
    }
    // Keep the frames: mux.sh is useless without them.
    return { produced: outFile, framesKept: true };
  }

  return { produced: outFile, framesKept: false };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const outDir = resolve(ROOT, opts.out);
  const framesDir = join(outDir, 'frames');
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const plan = await planEncode();
  const capture = await captureFrames(plan, framesDir);
  const result = await mux(plan, outDir, framesDir, capture);

  if (!opts.keepFrames && !result.framesKept && result.produced) {
    rmSync(framesDir, { recursive: true, force: true });
  } else {
    console.log(`  frames kept at ${framesDir}`);
  }

  await writeFile(
    join(outDir, 'intro.json'),
    JSON.stringify(
      {
        channel: opts.channel,
        title: opts.title,
        performers: opts.performers,
        orientation: capture.meta.orientation,
        width: capture.meta.width,
        height: capture.meta.height,
        durationSeconds: capture.meta.duration,
        fps: opts.fps,
        frames: capture.files.length,
        frameFormat: capture.ext,
        output: result.produced,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
