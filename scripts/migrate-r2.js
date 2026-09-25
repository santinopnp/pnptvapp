#!/usr/bin/env node
/**
 * Migrates /app/public/uploads/posts/* to new R2 bucket.
 * Run from inside pnptv-bot container.
 */

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const ENDPOINT = 'https://b86d184ecfe0599f13ec794a74714d14.r2.cloudflarestorage.com';
const ACCESS_KEY = 'e6e7bc6cd46645c80ea55ef231daef4f';
const SECRET_KEY = 'fa41a88b4be1f00ef8bde99d27f178a41ce426c8f12a6e853ba4cc649bb9825d';
const BUCKET = 'pnptv-videos-prod';
const LOCAL_DIR = '/app/public/uploads/posts';
const CONCURRENCY = 5;

const MIME = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  '3gp': 'video/3gpp', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', png: 'image/png',
};

const client = new S3Client({
  region: 'auto',
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

function mime(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

async function exists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function upload(file) {
  const key = 'posts/' + path.basename(file);
  if (await exists(key)) return { file, status: 'skip' };
  const body = fs.createReadStream(file);
  await client.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: body,
    ContentType: mime(file),
  }));
  return { file, status: 'uploaded' };
}

async function run() {
  const files = fs.readdirSync(LOCAL_DIR)
    .filter(f => !f.startsWith('.'))
    .map(f => path.join(LOCAL_DIR, f));

  console.log(`Total files: ${files.length}`);
  let done = 0, uploaded = 0, skipped = 0, errors = 0;

  async function worker(queue) {
    while (queue.length) {
      const file = queue.shift();
      try {
        const r = await upload(file);
        if (r.status === 'uploaded') uploaded++;
        else skipped++;
      } catch (e) {
        errors++;
        console.error(`ERR ${path.basename(file)}: ${e.message}`);
      }
      done++;
      if (done % 100 === 0 || done === files.length) {
        console.log(`${done}/${files.length} | uploaded=${uploaded} skipped=${skipped} errors=${errors}`);
      }
    }
  }

  const queue = [...files];
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
  console.log(`\nDONE. uploaded=${uploaded} skipped=${skipped} errors=${errors}`);
}

run().catch(e => { console.error(e); process.exit(1); });
