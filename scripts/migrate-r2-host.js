#!/usr/bin/env node
/**
 * Host-side variant of migrate-directus-to-r2.js.
 *
 * Runs from /opt/pnptvapp (uses root node_modules for pg + @aws-sdk).
 * Uses docker exec against pg-directus for DB access (no host port mapping).
 * Survives pnptv-bot container restarts.
 *
 * Env required in .env: S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET
 *
 * Args:
 *   --pilot=N    migrate only N files
 *   --dry        skip uploads and DB updates
 */

require('dotenv').config({ path: '/opt/pnptvapp/.env' });

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const UPLOAD_ROOT = '/opt/pnptvapp/infrastructure/data/directus/uploads';
const BUCKET = process.env.S3_BUCKET;

const args = process.argv.slice(2);
const pilotArg = args.find(a => a.startsWith('--pilot='));
const dryRun = args.includes('--dry');
const pilotLimit = pilotArg ? parseInt(pilotArg.split('=')[1], 10) : null;

if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !BUCKET) {
  console.error('Missing S3_* env vars');
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

function guessContentType(p) {
  const ext = path.extname(p).toLowerCase();
  return {
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.avif': 'image/avif', '.webp': 'image/webp',
  }[ext] || 'application/octet-stream';
}

async function s3Head(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound') return false;
    throw e;
  }
}

async function s3Put(localPath, key, contentType) {
  const body = fs.createReadStream(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType || guessContentType(localPath),
  }));
}

function pgQueryRows(sql) {
  const out = execFileSync('docker', ['exec', 'pg-directus', 'psql', '-U', 'directus_user', '-d', 'directus_db', '-At', '-F', '|', '-c', sql], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  return out.trim().split('\n').filter(Boolean).map(line => line.split('|'));
}

function pgExec(sql) {
  execFileSync('docker', ['exec', 'pg-directus', 'psql', '-U', 'directus_user', '-d', 'directus_db', '-c', sql], { stdio: ['ignore', 'ignore', 'inherit'] });
}

async function main() {
  const limitClause = pilotLimit ? `LIMIT ${pilotLimit}` : '';
  const orderClause = pilotLimit ? 'ORDER BY filesize ASC NULLS LAST' : 'ORDER BY uploaded_on DESC';
  const rows = pgQueryRows(
    `SELECT id, filename_disk, filesize, type FROM directus_files WHERE storage = 'local' AND filename_disk IS NOT NULL ${orderClause} ${limitClause}`
  );

  console.log(`Found ${rows.length} local files to migrate${dryRun ? ' (DRY RUN)' : ''}.`);

  let ok = 0, skip = 0, fail = 0, missing = 0;
  for (const [i, cols] of rows.entries()) {
    const [id, filename_disk, filesize, type] = cols;
    const idx = `[${i + 1}/${rows.length}]`;
    const localPath = path.join(UPLOAD_ROOT, filename_disk);
    const key = filename_disk;

    if (!fs.existsSync(localPath)) {
      console.log(`${idx} MISS ${id} — no local file`);
      missing++;
      continue;
    }

    try {
      const already = await s3Head(key);
      if (already && !dryRun) {
        pgExec(`UPDATE directus_files SET storage='cloud' WHERE id='${id}'`);
        console.log(`${idx} SKIP-EXISTS ${id}`);
        skip++;
        continue;
      }

      if (dryRun) {
        console.log(`${idx} DRY ${id} (${filename_disk}, ${filesize}B)`);
        ok++;
        continue;
      }

      await s3Put(localPath, key, type);
      const nowExists = await s3Head(key);
      if (!nowExists) {
        console.log(`${idx} FAIL-VERIFY ${id}`);
        fail++;
        continue;
      }

      pgExec(`UPDATE directus_files SET storage='cloud' WHERE id='${id}'`);
      console.log(`${idx} OK ${id} (${filename_disk}, ${filesize}B)`);
      ok++;
    } catch (err) {
      console.log(`${idx} FAIL ${id} — ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDONE ok=${ok} skip=${skip} fail=${fail} missing=${missing} total=${rows.length}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
