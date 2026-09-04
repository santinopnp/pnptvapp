#!/usr/bin/env node
/**
 * Precompiles the /marketing/ Claude Design canvas exports for production.
 *
 * WHY
 * ---
 * The exports ship raw .jsx and let the browser compile it at runtime: the
 * dc-runtime (support.js) sees a `.jsx` extension in an <x-import from="...">
 * list and pulls @babel/standalone from unpkg -- 3 MB, on top of React, before
 * a single frame renders. Compiling ahead of time removes that download
 * entirely, because support.js only calls ensureBabel() when kindOf(url)
 * returns "jsx":
 *
 *     const kindOf = (u) => /\.(jsx|tsx)(\?|#|$)/i.test(u) ? "jsx" : "js";
 *
 * So a `from=` list pointing at .js never loads Babel and executes the source
 * verbatim. This script emits those .js files and rewrites the attribute.
 *
 * It also self-hosts React/ReactDOM via support.js's own `window.__resources`
 * override (see cdnScriptFor), which lets the CSP drop https://unpkg.com
 * altogether.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It never touches apps/web/public/marketing/. Those files stay byte-identical
 * to what Claude Design exports, so re-exporting the canvas is a plain copy and
 * this script just runs again over the new output. All rewriting happens in
 * dist/.
 *
 * 'unsafe-eval' still cannot be dropped from the CSP: the runtime evaluates
 * every module through `new Function(...)` (see external.load and evalDcLogic),
 * which CSP treats the same as eval regardless of whether Babel is present.
 *
 * Usage: node scripts/precompile-marketing.mjs [--out <dir>]
 * Runs automatically via the `postbuild` script in package.json.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');

const SRC_DIR = path.join(WEB_ROOT, 'public', 'marketing');
const argOut = process.argv.indexOf('--out');
const OUT_DIR =
  argOut !== -1 && process.argv[argOut + 1]
    ? path.resolve(process.argv[argOut + 1])
    : path.join(WEB_ROOT, 'dist', 'marketing');

// The exact CDN URLs support.js requests, mapped to their self-hosted copies.
// Keys must match cdn.ts verbatim -- __resources is looked up by exact string.
const VENDOR = [
  {
    cdn: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
    pkg: 'react',
    sub: 'umd/react.production.min.js',
    to: 'vendor/react.production.min.js',
  },
  {
    cdn: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
    pkg: 'react-dom',
    sub: 'umd/react-dom.production.min.js',
    to: 'vendor/react-dom.production.min.js',
  },
];

// react@18's package.json "exports" map does not expose ./umd/*, so the UMD
// bundle cannot be require.resolve'd directly. Resolve the manifest (which the
// exports map does allow) and walk to the file from its directory instead.
function resolveVendorFile(v) {
  const manifest = require.resolve(`${v.pkg}/package.json`, {
    paths: [WEB_ROOT, REPO_ROOT],
  });
  const file = path.join(path.dirname(manifest), v.sub);
  if (!fs.existsSync(file)) {
    fail(`${v.pkg} resolved to ${path.dirname(manifest)} but ${v.sub} is missing`);
  }
  // The CDN URL pins a version; shipping a different one would be a silent
  // mismatch with what the export was authored against.
  const want = v.cdn.match(/@(\d+\.\d+\.\d+)\//)?.[1];
  const got = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
  if (want && got !== want) {
    fail(`${v.pkg} is ${got} but the export pins ${want} -- refusing to vendor a mismatch`);
  }
  return file;
}

const log = (...a) => console.log('[precompile-marketing]', ...a);
const fail = (msg) => {
  console.error('[precompile-marketing] ERROR:', msg);
  process.exit(1);
};

if (!fs.existsSync(SRC_DIR)) fail(`source not found: ${SRC_DIR}`);

// Vite copies public/ into dist/ before postbuild runs. When invoked directly
// (local verification) that has not happened, so seed the output ourselves.
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(SRC_DIR)) {
    fs.copyFileSync(path.join(SRC_DIR, f), path.join(OUT_DIR, f));
  }
  log(`seeded ${OUT_DIR} from public/marketing`);
}

// ---- 1. compile .jsx -> .js ------------------------------------------------
const babel = require('@babel/core');
const jsxPlugin = require.resolve('@babel/plugin-transform-react-jsx', {
  paths: [WEB_ROOT],
});

const jsxFiles = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.jsx'));
if (!jsxFiles.length) fail('no .jsx files found -- did the export layout change?');

let compiled = 0;
for (const file of jsxFiles) {
  const src = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
  let out;
  try {
    out = babel.transformSync(src, {
      filename: file,
      configFile: false,
      babelrc: false,
      // The runtime executes modules as `new Function(React, module, exports,
      // require, code)`, i.e. classic CommonJS -- never ESM. 'script' keeps
      // Babel from injecting "use strict" or interop helpers that would change
      // how these files assign their globals (e.g. `window.App = App`).
      sourceType: 'script',
      // classic runtime => React.createElement, matching the `React` argument
      // the runtime injects. The automatic runtime would emit a bare import of
      // react/jsx-runtime, which nothing here can resolve.
      plugins: [[jsxPlugin, { runtime: 'classic' }]],
      compact: false,
    });
  } catch (e) {
    fail(`failed to compile ${file}: ${e.message}`);
  }
  const outName = file.replace(/\.jsx$/, '.js');
  fs.writeFileSync(path.join(OUT_DIR, outName), out.code, 'utf8');
  // Drop the source form so nothing can silently fall back to the slow path.
  const stale = path.join(OUT_DIR, file);
  if (fs.existsSync(stale)) fs.unlinkSync(stale);
  compiled++;
}
log(`compiled ${compiled} .jsx -> .js`);

// ---- 2. self-host React ----------------------------------------------------
fs.mkdirSync(path.join(OUT_DIR, 'vendor'), { recursive: true });
for (const v of VENDOR) {
  fs.copyFileSync(resolveVendorFile(v), path.join(OUT_DIR, v.to));
}
log(`vendored ${VENDOR.length} UMD bundles`);

const resourceMap = Object.fromEntries(VENDOR.map((v) => [v.cdn, `./${v.to}`]));
// Assigned before support.js runs so cdnScriptFor() sees it at lookup time.
const OVERRIDE = `<script>window.__resources=${JSON.stringify(resourceMap)};</script>`;

// ---- 3. repair the runtime's componentDidUpdate arity ----------------------
// React calls componentDidUpdate(prevProps, prevState). The dc-runtime's
// wrapper forwards only the first argument:
//
//     this.logic.componentDidUpdate(prevProps);
//
// so any page whose logic reads prevState throws on every update. The Wallet
// Tour does exactly that (`if (prevState.index !== this.state.index)`), and
// the throw is swallowed by the wrapper's try/catch — playback looks fine
// while every screen_view analytics event is silently lost across all 38
// screens.
//
// The wrapper already has the value: __setLogicState captures the logic's
// previous state as `prev` and then discards it. Stash it and pass it on.
// It is consumed (set back to null) on read, so a props-only update reports
// prevState === current state — i.e. "state did not change", which is
// exactly right and keeps the equality checks in page logic honest.
{
  const p = path.join(OUT_DIR, 'support.js');
  let js = fs.readFileSync(p, 'utf8');

  const captureFrom = '      __setLogicState(update, cb) {\n        const prev = this.logic.state;';
  const captureTo =
    '      __setLogicState(update, cb) {\n        const prev = this.logic.state;\n' +
    '        this.__prevLogicState = prev;';

  const callFrom = '            this.logic.componentDidUpdate(prevProps);';
  const callTo =
    '            const prevLogicState = this.__prevLogicState ?? this.logic.state;\n' +
    '            this.__prevLogicState = null;\n' +
    '            this.logic.componentDidUpdate(prevProps, prevLogicState);';

  // Fail loudly rather than shipping a half-patched runtime: a support.js
  // whose shape changed must be re-examined, not silently passed through.
  if (!js.includes(captureFrom)) fail('support.js: __setLogicState shape changed');
  if (!js.includes(callFrom)) fail('support.js: componentDidUpdate call shape changed');
  if (js.includes('__prevLogicState')) fail('support.js: already patched?');

  js = js.split(captureFrom).join(captureTo);
  js = js.split(callFrom).join(callTo);

  if (!js.includes('componentDidUpdate(prevProps, prevLogicState)')) {
    fail('support.js: lifecycle patch did not apply');
  }
  fs.writeFileSync(p, js, 'utf8');
  log('patched support.js componentDidUpdate to forward prevState');
}

// ---- 4. rewrite the HTML ---------------------------------------------------
const htmlFiles = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.html'));
let rewritten = 0;
for (const file of htmlFiles) {
  const p = path.join(OUT_DIR, file);
  const before = fs.readFileSync(p, 'utf8');
  let html = before;

  // Only the paths inside an x-import `from=` list -- never prose elsewhere.
  html = html.replace(/from="([^"]*)"/g, (m, list) =>
    /\.jsx(\s|$)/.test(list) ? `from="${list.replace(/\.jsx(?=\s|$)/g, '.js')}"` : m
  );

  // index.html carries noindex from source, but the exported pages cannot --
  // Claude Design owns their <head> and a re-export would drop anything added
  // there by hand. Inject it at build time so the whole directory is
  // consistent: these are bare animation players with no crawlable copy, and
  // indexing them would put contentless pages in search results ahead of the
  // real marketing surface. Delete this block to let them be indexed.
  if (!/<meta name="robots"/i.test(html)) {
    html = html.replace(
      /<meta charset="utf-8">/i,
      '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">'
    );
  }

  if (!html.includes('window.__resources')) {
    const tag = '<script src="./support.js"></script>';
    if (html.includes(tag)) html = html.replace(tag, OVERRIDE + '\n' + tag);
  }

  if (html !== before) {
    fs.writeFileSync(p, html, 'utf8');
    rewritten++;
  }
}
log(`rewrote ${rewritten} html file(s)`);

// ---- 5. verify -------------------------------------------------------------
const problems = [];
for (const file of fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(OUT_DIR, file), 'utf8');
  const from = html.match(/from="([^"]*)"/);
  if (from && /\.jsx(\s|$|")/.test(from[1])) {
    problems.push(`${file}: still imports .jsx -> would pull 3 MB of Babel`);
  }
  for (const ref of from ? from[1].trim().split(/\s+/) : []) {
    const rel = ref.replace(/^\.\//, '');
    if (rel && !fs.existsSync(path.join(OUT_DIR, rel))) {
      problems.push(`${file}: imports missing file ${ref}`);
    }
  }
}
if (fs.readdirSync(OUT_DIR).some((f) => f.endsWith('.jsx'))) {
  problems.push('stray .jsx left in output');
}
for (const v of VENDOR) {
  if (!fs.existsSync(path.join(OUT_DIR, v.to))) problems.push(`missing ${v.to}`);
}
{
  const js = fs.readFileSync(path.join(OUT_DIR, 'support.js'), 'utf8');
  if (!js.includes('componentDidUpdate(prevProps, prevLogicState)')) {
    problems.push('support.js: prevState fix missing -- page analytics would break');
  }
}
if (problems.length) fail(problems.join('\n  '));

log(`OK -- ${OUT_DIR} serves no .jsx and no unpkg requests`);
