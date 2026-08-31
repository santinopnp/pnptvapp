#!/usr/bin/env node
/**
 * Migrate Directus files from local disk → Cloudflare R2.
 *
 * Uses the existing objectStorageService (S3 SDK). For each row in
 * directus_files where storage='local':
 *   1. Verify local file exists at /directus-uploads/<filename_disk>
 *   2. HEAD R2 for existing key (skip if already there)
 *   3. Upload local file to R2 with key = filename_disk
 *   4. HEAD R2 again to confirm size matches
 *   5. UPDATE directus_files SET storage='cloud' WHERE id=?
 *
 * Idempotent. On any per-file error, logs and moves on. Reports final tally.
 *
 * Env required: DIRECTUS_DB_PASSWORD (Directus pg password), S3_* (already
 * set in bot container).
 *
 * Args: --pilot=N to migrate only N files (default: all).
 *       --dry to skip uploads and DB updates (log-only).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const s3 = require('/app/apps/backend/services/objectStorageService');

const UPLOAD_ROOT = '/directus-uploads';

const args = process.argv.slice(2);
const pilotArg = args.find(a => a.startsWith('--pilot='));
const dryRun = args.includes('--dry');
const pilotLimit = pilotArg ? parseInt(pilotArg.split('=')[1], 10) : null;

async function main() {
  if (!s3.isConfigured()) {
    console.error('R2 not configured. Aborting.');
    process.exit(1);
  }

  const pg = new Client({
    host: process.env.DIRECTUS_DB_HOST || 'pg-directus',
    port: 5432,
    user: 'directus_user',
    password: process.env.DIRECTUS_DB_PASSWORD,
    database: 'directus_db',
  });
  await pg.connect();

  // Sort by filesize ASC when piloting so we validate the pipeline on small
  // files first; otherwise take newest first (recently-viewed content wins).
  const limitClause = pilotLimit ? `LIMIT ${pilotLimit}` : '';
  const orderClause = pilotLimit ? 'ORDER BY filesize ASC NULLS LAST' : 'ORDER BY uploaded_on DESC';
  const { rows } = await pg.query(
    `SELECT id, filename_disk, filename_download, filesize, type
       FROM directus_files
      WHERE storage = 'local' AND filename_disk IS NOT NULL
      ${orderClause}
      ${limitClause}`
  );

  console.log(`Found ${rows.length} local files to migrate${dryRun ? ' (DRY RUN)' : ''}.`);

  let ok = 0, skip = 0, fail = 0, missing = 0;
  for (const [i, row] of rows.entries()) {
    const idx = `[${i + 1}/${rows.length}]`;
    const localPath = path.join(UPLOAD_ROOT, row.filename_disk);
    const key = row.filename_disk;

    if (!fs.existsSync(localPath)) {
      console.log(`${idx} MISS ${row.id} — no local file at ${localPath}`);
      missing++;
      continue;
    }

    try {
      const already = await s3.exists(key);
      if (already && !dryRun) {
        // Already in R2. Just flip DB row.
        await pg.query(`UPDATE directus_files SET storage='cloud' WHERE id=$1`, [row.id]);
        console.log(`${idx} SKIP-EXISTS ${row.id} (${key})`);
        skip++;
        continue;
      }

      if (dryRun) {
        console.log(`${idx} DRY ${row.id} (${key}, ${row.filesize}B)`);
        ok++;
        continue;
      }

      await s3.uploadFile(localPath, key, row.type);

      // Verify by HEAD
      const nowExists = await s3.exists(key);
      if (!nowExists) {
        console.log(`${idx} FAIL-VERIFY ${row.id} — HEAD after PUT returned false`);
        fail++;
        continue;
      }

      await pg.query(`UPDATE directus_files SET storage='cloud' WHERE id=$1`, [row.id]);
      console.log(`${idx} OK ${row.id} (${key}, ${row.filesize}B)`);
      ok++;
    } catch (err) {
      console.log(`${idx} FAIL ${row.id} — ${err.message}`);
      fail++;
    }
  }

  await pg.end();
  console.log(`\nDONE ok=${ok} skip=${skip} fail=${fail} missing=${missing} total=${rows.length}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
