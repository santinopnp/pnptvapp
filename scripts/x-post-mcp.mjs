#!/usr/bin/env node
/**
 * x-post-mcp.mjs — CLI wrapper that calls mcp-social x_post via HTTP.
 *
 * Usage:
 *   node x-post-mcp.mjs --en "text" [--es "text"] [--media "url_or_path"]
 *
 * Exits 0 on success (at least one tweet posted), 1 on error.
 * Prints the posted tweet URL(s) to stdout.
 */
import { readFile } from 'node:fs/promises';

const TOKEN_FILE = '/root/.santino-social-mcp-token';
const ENDPOINT   = 'https://pnptv.app/mcp-santino/social';

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const text_en   = get('--en');
const text_es   = get('--es');
const media_url = get('--media');

if (!text_en && !text_es) {
  console.error('Usage: x-post-mcp.mjs --en "text" [--es "text"] [--media "url"]');
  process.exit(1);
}

const token = (await readFile(TOKEN_FILE, 'utf8')).trim();

const toolArgs = {};
if (text_en)   toolArgs.text_en   = text_en;
if (text_es)   toolArgs.text_es   = text_es;
if (media_url) toolArgs.media_url = media_url;

const body = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'x_post', arguments: toolArgs },
};

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify(body),
});

const raw = await res.json();
if (raw.error) {
  console.error('MCP error:', raw.error.message);
  process.exit(1);
}

const text = raw.result?.content?.[0]?.text ?? '{}';
let data;
try { data = JSON.parse(text); } catch { data = { raw: text }; }

const results = data.results ?? [data];
let anyOk = false;
for (const r of results) {
  if (r.ok) {
    console.log(`Posted (${r.lang}): ${r.url}`);
    anyOk = true;
  } else if (r.skipped) {
    console.log(`Skipped (${r.lang}): ${JSON.stringify(r.issues)}`);
  } else if (r.error) {
    console.error(`Error (${r.lang}): ${r.error}`);
  }
}

process.exit(anyOk ? 0 : 1);
