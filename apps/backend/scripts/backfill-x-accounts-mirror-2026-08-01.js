#!/usr/bin/env node
'use strict';

/**
 * One-shot backfill: for every user who OAuth-linked X before migration 339
 * shipped, mirror their token+handle into `x_accounts` (Option A schema).
 * This gives them a functioning row that xPostService / xAutoCampaignService
 * can post from, so the opt-in auto-post flags become usable without
 * requiring the creator to re-link X.
 *
 * Idempotent: skips users that already have an `x_accounts` row where
 * `created_by = users.id`.
 *
 * Usage (from repo root):
 *   docker exec pnptv-bot node /app/apps/backend/scripts/backfill-x-accounts-mirror-2026-08-01.js
 */

const crypto = require('crypto');
const db = require('../utils/db');
const logger = require('../utils/logger');
const XOAuthService = require('../services/xOAuthService');

// Inverse of encryptXToken() in bot/api/controllers/webAppController.js — same
// ENCRYPTION_KEY, same AES-256-GCM parameters. Copied rather than exported
// because this is a one-shot script and the controller shouldn't grow a
// utility-export surface for it.
function decryptXToken(ciphertextJson) {
  if (!ciphertextJson) return null;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) return null;
  const key = Buffer.from(raw, 'hex');
  let parsed;
  try {
    parsed = JSON.parse(ciphertextJson);
  } catch {
    return null;
  }
  if (!parsed?.data || !parsed?.iv || !parsed?.authTag) return null;
  try {
    const iv = Buffer.from(parsed.iv, 'hex');
    const authTag = Buffer.from(parsed.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let plaintext = decipher.update(parsed.data, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  } catch {
    return null;
  }
}

async function main() {
  const started = Date.now();
  const { rows: users } = await db.query(
    `SELECT id, x_username, x_id, x_user_id,
            x_access_token_encrypted, x_refresh_token_encrypted,
            x_token_expires_at, x_oauth_scopes
       FROM users
      WHERE x_id IS NOT NULL
        AND x_access_token_encrypted IS NOT NULL
        AND is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM x_accounts WHERE created_by = users.id
        )`
  );

  let mirrored = 0;
  let skippedDecrypt = 0;
  let failedUpsert = 0;

  for (const u of users) {
    const accessToken = decryptXToken(u.x_access_token_encrypted);
    if (!accessToken) {
      skippedDecrypt++;
      logger.warn('[backfill] decrypt failed', { userId: u.id, handle: u.x_username });
      continue;
    }
    const refreshToken = u.x_refresh_token_encrypted
      ? decryptXToken(u.x_refresh_token_encrypted)
      : null;

    const expiresIn = u.x_token_expires_at
      ? Math.max(0, Math.floor((new Date(u.x_token_expires_at).getTime() - Date.now()) / 1000))
      : null;

    try {
      await XOAuthService.upsertAccount({
        adminId: u.id,
        adminUsername: u.x_username || null,
        accessToken,
        refreshToken,
        expiresIn,
        tokenScope: u.x_oauth_scopes || null,
        tokenType: 'bearer',
        profile: {
          id: u.x_user_id || u.x_id,
          username: u.x_username,
          name: u.x_username,
        },
      });
      mirrored++;
    } catch (err) {
      failedUpsert++;
      logger.warn('[backfill] upsert failed', { userId: u.id, handle: u.x_username, error: err.message });
    }
  }

  const elapsedMs = Date.now() - started;
  console.log(JSON.stringify({
    scanned: users.length,
    mirrored,
    skippedDecrypt,
    failedUpsert,
    elapsedMs,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backfill fatal:', err);
    process.exit(1);
  });
