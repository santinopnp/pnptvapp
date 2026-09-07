/**
 * Startup service validator.
 *
 * Scans every .js file under apps/backend/services/ and flags any file that
 * contains the "Auto-generated fallback stub" marker left by AI-assisted
 * editors (e.g. Gemini) when they replace a real service with a no-op Proxy.
 *
 * Stubs return null/undefined for every call, causing silent runtime failures
 * that are hard to trace.  Catching them at startup gives a clear, actionable
 * log entry before any request is served.
 *
 * Also validates that a handful of critical services export the expected
 * method names, so a mis-shaped module fails loudly instead of blowing up
 * mid-request.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../../utils/logger');

const SERVICES_DIR = path.resolve(__dirname, '../../../services');

const STUB_MARKERS = [
  'Auto-generated fallback stub',
  'new Proxy({}, {',         // Proxy stubs always open this way
  '// STUB: ',
];

// Critical services and one method each that MUST be a real function (not a
// no-op Proxy trap).  Keep this list small — it's a canary, not exhaustive.
const CRITICAL_METHODS = [
  { file: 'userService.js',        method: 'getById' },
  { file: 'permissionService.js',  method: 'isEnvSuperAdmin' },
  { file: 'roleService.js',        method: 'getUserRole' },
  { file: 'mainStageGateService.js', method: 'getState' },
  { file: 'platformBanService.js', method: 'isBanned' },
];

function scanForStubs() {
  if (!fs.existsSync(SERVICES_DIR)) {
    logger.warn('[serviceValidator] services/ directory not found — skipping scan');
    return [];
  }

  const flagged = [];
  const files = fs.readdirSync(SERVICES_DIR).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const fullPath = path.join(SERVICES_DIR, file);
    try {
      const src = fs.readFileSync(fullPath, 'utf8');
      const hit = STUB_MARKERS.find((m) => src.includes(m));
      if (hit) {
        flagged.push({ file, marker: hit });
      }
    } catch (_) {
      // unreadable file — not a stub problem, skip
    }
  }

  return flagged;
}

function validateCriticalServices() {
  const failures = [];

  for (const { file, method } of CRITICAL_METHODS) {
    const fullPath = path.join(SERVICES_DIR, file);
    try {
      // eslint-disable-next-line import/no-dynamic-require
      const svc = require(fullPath);
      const exported = svc.default || svc;
      // Accept either a class with a static method or an object with the method
      const fn = exported?.[method] ?? exported?.prototype?.[method];
      if (typeof fn !== 'function') {
        failures.push({ file, method, reason: `${method} is ${typeof fn}, not function` });
      }
    } catch (err) {
      failures.push({ file, method, reason: err.message });
    }
  }

  return failures;
}

/**
 * Run all checks.  Always resolves (never throws) so it never blocks startup.
 * Returns a summary object for tests/health endpoints.
 */
function validateServices() {
  let stubs = [];
  let methodFailures = [];

  try {
    stubs = scanForStubs();
  } catch (err) {
    logger.warn('[serviceValidator] stub scan error:', err.message);
  }

  try {
    methodFailures = validateCriticalServices();
  } catch (err) {
    logger.warn('[serviceValidator] method validation error:', err.message);
  }

  const totalFiles = fs.existsSync(SERVICES_DIR)
    ? fs.readdirSync(SERVICES_DIR).filter((f) => f.endsWith('.js')).length
    : 0;

  if (stubs.length === 0 && methodFailures.length === 0) {
    logger.info(`[serviceValidator] ✓ ${totalFiles} services scanned — no stubs or broken methods detected`);
  } else {
    if (stubs.length > 0) {
      logger.error(
        `[serviceValidator] ⚠ STUB FILES DETECTED (${stubs.length}): ${stubs.map((s) => s.file).join(', ')}` +
        ' — these are AI-generated no-op Proxies that return null for every call. ' +
        'Restore from the last good git commit (b9260a3f or later).'
      );
    }
    if (methodFailures.length > 0) {
      logger.error(
        `[serviceValidator] ⚠ CRITICAL SERVICE METHOD FAILURES (${methodFailures.length}): ` +
        methodFailures.map((f) => `${f.file}.${f.method}: ${f.reason}`).join('; ')
      );
    }
  }

  return { totalFiles, stubs, methodFailures, ok: stubs.length === 0 && methodFailures.length === 0 };
}

module.exports = { validateServices };
