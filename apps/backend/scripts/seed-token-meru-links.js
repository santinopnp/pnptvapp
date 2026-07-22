#!/usr/bin/env node
/**
 * seed-token-meru-links.js — Seed meru_payment_links rows for /live token packages.
 *
 * Meru does not have a REST API, so payment URLs must be created manually in the
 * Meru merchant dashboard (one URL per package tier per unit of expected volume).
 * This script bulk-inserts them into meru_payment_links so the /live activation
 * flow can reserve them via meruLinkService.reserveRandomLink({ product: 'token_pkg_XX' }).
 *
 * Usage:
 *   1. Create Meru payment links in the dashboard, one per unit you want available.
 *      Each URL corresponds to a FIXED amount that must match the package price:
 *        pkg_10  → $10  →  60   tokens
 *        pkg_25  → $25  →  156  tokens
 *        pkg_50  → $50  →  315  tokens
 *        pkg_100 → $100 →  660  tokens
 *        pkg_500 → $500 →  3450 tokens
 *   2. Edit URLS below (or pass --file <csv>) with the format:
 *        pkg_10,https://pay.getmeru.com/AbCdEf123
 *   3. Dry run:    node apps/backend/scripts/seed-token-meru-links.js
 *   4. Apply:      node apps/backend/scripts/seed-token-meru-links.js --apply
 *
 * Idempotent: the meru_link column has a UNIQUE constraint, so re-runs are safe.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query } = require('../config/postgres');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const fileIdx = args.indexOf('--file');
const FILE = fileIdx >= 0 ? args[fileIdx + 1] : null;

const VALID_PACKAGES = new Set(['pkg_10', 'pkg_25', 'pkg_50', 'pkg_100', 'pkg_500']);

// Edit this array OR pass --file <csv-path>. Format: [packageKey, meruUrl]
const URLS = [
  // ['pkg_10',  'https://pay.getmeru.com/XXXX'],
  // ['pkg_25',  'https://pay.getmeru.com/XXXX'],
  // ['pkg_50',  'https://pay.getmeru.com/XXXX'],
  // ['pkg_100', 'https://pay.getmeru.com/XXXX'],
  // ['pkg_500', 'https://pay.getmeru.com/XXXX'],
];

function loadFromFile(csvPath) {
  const abs = path.resolve(csvPath);
  const text = fs.readFileSync(abs, 'utf8');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [pkg, url] = l.split(',').map((s) => s && s.trim());
      return [pkg, url];
    });
}

function shortCode() {
  return crypto.randomBytes(4).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
}

async function main() {
  const rows = FILE ? loadFromFile(FILE) : URLS;
  if (rows.length === 0) {
    console.error('No URLs provided. Edit URLS array or pass --file <csv>.');
    process.exit(1);
  }

  const invalid = rows.filter(([pkg, url]) => !VALID_PACKAGES.has(pkg) || !/^https?:\/\/pay\.getmeru\.com\//i.test(url || ''));
  if (invalid.length) {
    console.error('Invalid rows:');
    invalid.forEach((r) => console.error(' ', r));
    process.exit(1);
  }

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Rows: ${rows.length}`);
  const byPkg = rows.reduce((m, [p]) => ({ ...m, [p]: (m[p] || 0) + 1 }), {});
  Object.entries(byPkg).forEach(([p, n]) => console.log(`  ${p}: ${n}`));

  if (!APPLY) {
    console.log('\nDry run — nothing written. Add --apply to insert.');
    process.exit(0);
  }

  let inserted = 0;
  let skipped = 0;
  for (const [pkg, url] of rows) {
    const code = shortCode();
    try {
      const result = await query(
        `INSERT INTO meru_payment_links (code, meru_link, product, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (meru_link) DO NOTHING
         RETURNING id`,
        [code, url, `token_${pkg}`]
      );
      if (result.rowCount > 0) {
        inserted++;
      } else {
        skipped++;
        console.log(`  skip (already exists): ${url}`);
      }
    } catch (err) {
      console.error(`  ERROR inserting ${url}: ${err.message}`);
    }
  }

  console.log(`\nInserted: ${inserted}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
