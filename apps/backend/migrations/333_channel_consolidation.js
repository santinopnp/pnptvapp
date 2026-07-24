#!/usr/bin/env node
'use strict';

/**
 * One-shot data migration for channel consolidation (2026-07-24).
 *
 * For each active creator:
 *   - Pick canonical paid channel:
 *       * If they have a user-created paid channel (slug NOT matching the
 *         auto-provisioned `*-exclusive-XXXX` pattern), pick the oldest by
 *         created_at. That one is the keeper.
 *       * Else if they have ONLY the auto-provisioned "Exclusive", keep it.
 *       * Else (no paid channel at all): no canonical. Skip — creator will
 *         have 0 channels after migration. Auto-mirror service will noop.
 *   - Move every post in ALL their other channels (free + extra paid) to
 *     the canonical; force is_exclusive=true for those coming from free
 *     channels (they become premium content in the paid channel).
 *   - Backfill: posts with is_exclusive=true and channel_id IS NULL get
 *     assigned to the canonical channel.
 *   - Delete all non-canonical channels owned by the creator.
 *   - Also disable provisionDefaultChannels' free-channel auto-creation
 *     (a code change elsewhere handles that; this script only cleans up
 *     the existing DB state).
 *
 * Every action is logged to channel_migration_333_audit (created by the
 * companion .sql migration).
 *
 * Idempotent: safe to re-run. Skips creators already consolidated.
 *
 * Usage:
 *   docker exec pnptv-bot node apps/backend/migrations/333_channel_consolidation.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../..', '.env') });

const { query, getPool } = require('../config/postgres');
const logger = require('../utils/logger');

const AUTO_EXCLUSIVE_SLUG_RE = /-exclusive-[a-z0-9]{4}$/i;

async function audit(row) {
  await query(
    `INSERT INTO channel_migration_333_audit
       (creator_id, action, channel_id, canonical_channel_id, post_count, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      row.creator_id,
      row.action,
      row.channel_id ?? null,
      row.canonical_channel_id ?? null,
      row.post_count ?? 0,
      JSON.stringify(row.detail || {}),
    ]
  );
}

async function pickCanonicalChannel(creatorId) {
  const { rows } = await query(
    `SELECT id, name, slug, access_type, created_at, post_count
       FROM creator_channels
      WHERE creator_id = $1
        AND is_active = TRUE
        AND access_type IN ('subscription', 'paid')
      ORDER BY created_at ASC`,
    [creatorId]
  );
  if (rows.length === 0) return null;

  // Prefer the first user-created paid channel.
  const userCreated = rows.find((c) => !AUTO_EXCLUSIVE_SLUG_RE.test(c.slug || ''));
  return userCreated || rows[0];
}

async function migrateOneCreator(creator) {
  const creatorId = String(creator.id);
  const canonical = await pickCanonicalChannel(creatorId);

  const { rows: allChannels } = await query(
    `SELECT id, name, slug, access_type, hangout_group_id, post_count
       FROM creator_channels
      WHERE creator_id = $1 AND is_active = TRUE
      ORDER BY id`,
    [creatorId]
  );

  if (allChannels.length === 0) return { creatorId, skipped: 'no_channels' };

  // If no canonical, we still delete free channels (per Carlos's rule).
  // Non-canonical paid channels: only delete auto-provisioned ones when a
  // user-created paid exists (already handled by pickCanonicalChannel logic).
  const canonicalId = canonical?.id ?? null;

  const toRelocate = allChannels.filter((c) => c.id !== canonicalId);
  const relocatedIds = [];

  for (const c of toRelocate) {
    // 1. Move posts to canonical (if canonical exists).
    let moved = 0;
    if (canonicalId) {
      const forceExclusive = c.access_type === 'free';
      const { rowCount } = await query(
        `UPDATE social_posts
            SET channel_id = $1
                ${forceExclusive ? `, is_exclusive = TRUE, content_tier = 'member'` : ''}
          WHERE channel_id = $2`,
        [canonicalId, c.id]
      );
      moved = rowCount || 0;
      if (moved > 0) {
        await audit({
          creator_id: creatorId,
          action: 'moved_posts',
          channel_id: c.id,
          canonical_channel_id: canonicalId,
          post_count: moved,
          detail: { from_access_type: c.access_type, force_exclusive: forceExclusive },
        });
      }
    } else if (c.post_count > 0) {
      // No canonical to move into. Detach posts so they still show on the
      // creator's wall but aren't tied to a dead channel.
      const { rowCount } = await query(
        `UPDATE social_posts SET channel_id = NULL WHERE channel_id = $1`,
        [c.id]
      );
      moved = rowCount || 0;
      if (moved > 0) {
        await audit({
          creator_id: creatorId,
          action: 'detached_posts',
          channel_id: c.id,
          canonical_channel_id: null,
          post_count: moved,
          detail: { from_access_type: c.access_type },
        });
      }
    }

    // 2. Delete the channel (unlink hangout FK first if it holds one).
    if (c.hangout_group_id) {
      // Move the hangout FK to the canonical channel so the private
      // subscribers hangout still points at a valid paid channel.
      if (canonicalId && canonicalId !== c.id) {
        await query(
          `UPDATE creator_channels SET hangout_group_id = $1 WHERE id = $2`,
          [c.hangout_group_id, canonicalId]
        );
        await query(
          `UPDATE hangout_groups SET channel_id = $1 WHERE id = $2`,
          [canonicalId, c.hangout_group_id]
        );
      }
      await query(
        `UPDATE creator_channels SET hangout_group_id = NULL WHERE id = $1`,
        [c.id]
      );
    }

    // Downstream tables that reference channel: null out or cascade.
    await query(`DELETE FROM channel_subscribers WHERE channel_id = $1`, [c.id]);
    await query(`UPDATE channel_videos SET channel_id = NULL WHERE channel_id = $1`, [c.id]).catch(() => {});
    await query(`UPDATE creator_channels SET is_active = FALSE WHERE id = $1`, [c.id]);
    await query(`DELETE FROM creator_channels WHERE id = $1`, [c.id]);

    await audit({
      creator_id: creatorId,
      action: 'deleted',
      channel_id: c.id,
      canonical_channel_id: canonicalId,
      post_count: moved,
      detail: { name: c.name, access_type: c.access_type, slug: c.slug },
    });
    relocatedIds.push(c.id);
  }

  // 3. Backfill exclusive posts with NULL channel_id → canonical (if any).
  if (canonicalId) {
    const { rowCount: backfilled } = await query(
      `UPDATE social_posts
          SET channel_id = $1
        WHERE user_id = $2
          AND is_exclusive = TRUE
          AND channel_id IS NULL`,
      [canonicalId, creatorId]
    );
    if (backfilled > 0) {
      await audit({
        creator_id: creatorId,
        action: 'backfilled_exclusive',
        channel_id: null,
        canonical_channel_id: canonicalId,
        post_count: backfilled,
        detail: {},
      });
    }

    // 4. Refresh canonical's post_count.
    await query(
      `UPDATE creator_channels
          SET post_count = (SELECT COUNT(*) FROM social_posts WHERE channel_id = $1 AND is_deleted = FALSE)
        WHERE id = $1`,
      [canonicalId]
    );

    await audit({
      creator_id: creatorId,
      action: 'kept_canonical',
      channel_id: canonicalId,
      canonical_channel_id: canonicalId,
      post_count: 0,
      detail: { name: canonical.name, slug: canonical.slug, was_auto: AUTO_EXCLUSIVE_SLUG_RE.test(canonical.slug || '') },
    });
  }

  return {
    creatorId,
    canonicalId,
    deletedCount: relocatedIds.length,
    channelsBefore: allChannels.length,
  };
}

async function main() {
  logger.info('[migration 333] channel consolidation starting');

  // Only creators with active status.
  const { rows: creators } = await query(
    `SELECT id, username
       FROM users
      WHERE creator_status = 'active'
        AND is_deleted IS NOT TRUE`
  );
  logger.info(`[migration 333] processing ${creators.length} active creators`);

  let ok = 0, skipped = 0, failed = 0;
  const summary = [];
  for (const c of creators) {
    try {
      const result = await migrateOneCreator(c);
      if (result.skipped) {
        skipped++;
        summary.push({ username: c.username, skipped: result.skipped });
      } else {
        ok++;
        summary.push({
          username: c.username,
          canonicalId: result.canonicalId,
          deletedCount: result.deletedCount,
        });
      }
    } catch (err) {
      failed++;
      logger.error(`[migration 333] creator ${c.username} failed`, { error: err.message });
      summary.push({ username: c.username, error: err.message });
    }
  }

  logger.info(`[migration 333] done: ok=${ok} skipped=${skipped} failed=${failed}`);
  console.log(JSON.stringify({ ok, skipped, failed, summary }, null, 2));
  await getPool().end();
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) main();

module.exports = { migrateOneCreator, pickCanonicalChannel };
