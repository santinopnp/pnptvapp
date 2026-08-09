'use strict';

/**
 * Normalize any raw photo URL so it is always safe for the web client:
 *   - null/empty                                  → null
 *   - '/uploads/...' relative path                → passthrough (nginx serves it)
 *   - absolute https://pnptv.app / cms.pnptv.app / app.pnptv.app → passthrough
 *   - absolute URL on a whitelisted external CDN  → '/api/img/proxy?src=<enc>'
 *   - anything else                               → null (client renders letter avatar)
 *
 * Whitelist controls SSRF exposure: only URLs on trusted CDNs are ever fetched
 * by the proxy endpoint. Do not add hosts that resolve to internal networks
 * without also verifying the proxy SSRF guard rejects them.
 */

const APP_HOSTS = new Set(['pnptv.app', 'cms.pnptv.app', 'app.pnptv.app']);

// Exact-match hosts. For subdomain matching, use CDN_HOST_PATTERNS.
const CDN_WHITELIST_HOSTS = new Set([
  't.me',
  'cdn.pnptv.app',
  'directus.pnptv.app',
]);

// Regexes matched against hostname when exact-match fails.
const CDN_HOST_PATTERNS = [
  /\.r2\.cloudflarestorage\.com$/i,
];

function isAppHost(hostname) {
  if (!hostname) return false;
  if (APP_HOSTS.has(hostname)) return true;
  for (const h of APP_HOSTS) if (hostname.endsWith(`.${h}`)) return true;
  return false;
}

function isWhitelistedCdn(hostname) {
  if (!hostname) return false;
  if (CDN_WHITELIST_HOSTS.has(hostname)) return true;
  return CDN_HOST_PATTERNS.some((re) => re.test(hostname));
}

function normalizeImageUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/uploads/')) return trimmed;
  let url;
  try { url = new URL(trimmed); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (isAppHost(url.hostname)) return trimmed;
  if (isWhitelistedCdn(url.hostname)) {
    return `/api/img/proxy?src=${encodeURIComponent(trimmed)}`;
  }
  return null;
}

module.exports = {
  normalizeImageUrl,
  isAppHost,
  isWhitelistedCdn,
  APP_HOSTS,
  CDN_WHITELIST_HOSTS,
  CDN_HOST_PATTERNS,
};
