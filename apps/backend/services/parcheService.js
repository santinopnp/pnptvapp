'use strict';

const { query, getPool } = require('../config/postgres');
const { getRedis } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const PaymentModel = require('../models/paymentModel');
const PaymentSecurityService = require('./paymentSecurityService');
const livekitService = require('./livekitService');

const MAX_MEMBERS = 5;
const MAX_PACKAGES = 8;
const ALLOWED_DURATIONS = [30, 60, 90, 120];

// ── Slug helpers ──────────────────────────────────────────────────────────────

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 45);
}

async function ensureUniqueSlug(base) {
  const { rows } = await query('SELECT 1 FROM parches WHERE slug = $1', [base]);
  if (rows.length === 0) return base;
  const suffix = Math.random().toString(36).slice(2, 7);
  const candidate = `${base.slice(0, 40)}-${suffix}`;
  const { rows: r2 } = await query('SELECT 1 FROM parches WHERE slug = $1', [candidate]);
  if (r2.length === 0) return candidate;
  throw Object.assign(new Error('Could not generate unique slug — try a different name'), { code: 'SLUG_CONFLICT' });
}

async function generatePackageSku(slug, durationMinutes) {
  const base = `PARCHE-${slug.toUpperCase().replace(/-/g, '_').slice(0, 20)}-${durationMinutes}M`;
  const { rows } = await query('SELECT 1 FROM parche_packages WHERE sku = $1', [base]);
  if (rows.length === 0) return base;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${suffix}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireOwner(parcheId, creatorId) {
  const { rows } = await query(
    `SELECT 1 FROM parche_members
     WHERE parche_id = $1 AND creator_id = $2 AND role = 'owner' AND invite_status = 'accepted'`,
    [parcheId, creatorId]
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Only the Parche owner can do this'), { code: 'NOT_OWNER', status: 403 });
  }
}

async function getAcceptedCount(parcheId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS cnt FROM parche_members
     WHERE parche_id = $1 AND invite_status = 'accepted'`,
    [parcheId]
  );
  return rows[0].cnt;
}

async function enrichMembers(members) {
  if (!members.length) return members;
  const redis = getRedis();
  const presenceKeys = members.map((m) => `presence:online:${m.creator_id}`);
  const presenceResults = await redis.mget(...presenceKeys);
  return members.map((m, i) => ({
    id: m.id,
    creatorId: m.creator_id,
    displayName: m.display_name || m.username || 'Creator',
    username: m.username,
    photoUrl: m.photo_file_id || null,
    role: m.role,
    inviteStatus: m.invite_status,
    isOnline: presenceResults[i] !== null,
  }));
}

function formatParche(parche, members, packages) {
  return {
    id: parche.id,
    slug: parche.slug,
    name: parche.name,
    description: parche.description || null,
    locationCity: parche.location_city || null,
    status: parche.status,
    isOpen: parche.is_open,
    createdBy: parche.created_by,
    maxMembers: parche.max_members,
    previewMedia: parche.preview_media || [],
    members: members,
    packages: (packages || []).map((p) => ({
      id: p.id,
      parcheId: p.parche_id,
      title: p.title,
      description: p.description || null,
      durationMinutes: p.duration_minutes,
      priceUsd: p.price_usd,
      sku: p.sku,
      isActive: p.is_active,
    })),
    createdAt: parche.created_at,
    updatedAt: parche.updated_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

async function createParche(creatorId, { name, description, locationCity, slug } = {}) {
  if (!name || !name.trim()) {
    throw Object.assign(new Error('Parche name is required'), { code: 'MISSING_NAME', status: 400 });
  }

  // Validate creator is active
  const { rows: creatorRows } = await query(
    `SELECT id FROM users WHERE id = $1 AND creator_status = 'active'`,
    [creatorId]
  );
  if (!creatorRows.length) {
    throw Object.assign(new Error('Only active creators can start a Parche'), { code: 'NOT_CREATOR', status: 403 });
  }

  // One active parche per creator at a time
  const { rows: existing } = await query(
    `SELECT p.id FROM parches p
     JOIN parche_members pm ON pm.parche_id = p.id
     WHERE pm.creator_id = $1
       AND pm.invite_status = 'accepted'
       AND p.status IN ('forming','active','paused')
     LIMIT 1`,
    [creatorId]
  );
  if (existing.length > 0) {
    throw Object.assign(new Error('You are already in an active Parche'), { code: 'ALREADY_IN_PARCHE', status: 409 });
  }

  const base = slug ? toSlug(slug) : toSlug(name);
  const finalSlug = await ensureUniqueSlug(base);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: parcheRows } = await client.query(
      `INSERT INTO parches (slug, name, description, location_city, created_by, status, is_open, max_members)
       VALUES ($1, $2, $3, $4, $5, 'forming', false, $6)
       RETURNING *`,
      [finalSlug, name.trim(), description || null, locationCity || null, creatorId, MAX_MEMBERS]
    );
    const parche = parcheRows[0];

    await client.query(
      `INSERT INTO parche_members (parche_id, creator_id, role, invite_status, responded_at)
       VALUES ($1, $2, 'owner', 'accepted', NOW())`,
      [parche.id, creatorId]
    );

    await client.query('COMMIT');

    logger.info('[parcheService] Parche created', { parcheId: parche.id, slug: finalSlug, creatorId });
    return getParche(parche.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getParche(parcheIdOrSlug) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(parcheIdOrSlug);
  const { rows } = await query(
    `SELECT * FROM parches WHERE ${isUuid ? 'id' : 'slug'} = $1`,
    [parcheIdOrSlug]
  );
  if (!rows.length) return null;
  const parche = rows[0];

  const { rows: memberRows } = await query(
    `SELECT pm.*,
            TRIM(COALESCE(u.first_name || ' ' || u.last_name, u.first_name, u.username)) AS display_name,
            u.username, u.photo_file_id
     FROM parche_members pm
     JOIN users u ON u.id = pm.creator_id
     WHERE pm.parche_id = $1
     ORDER BY pm.id ASC`,
    [parche.id]
  );

  const { rows: pkgRows } = await query(
    `SELECT * FROM parche_packages WHERE parche_id = $1 AND is_active = true ORDER BY id ASC`,
    [parche.id]
  );

  const members = await enrichMembers(memberRows);
  return formatParche(parche, members, pkgRows);
}

async function getPublicInfo(slug) {
  const { rows } = await query(
    `SELECT * FROM parches WHERE slug = $1 AND status = 'active'`,
    [slug]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Parche not found'), { code: 'NOT_FOUND', status: 404 });
  }
  const parche = rows[0];

  const { rows: memberRows } = await query(
    `SELECT pm.*,
            TRIM(COALESCE(u.first_name || ' ' || u.last_name, u.first_name, u.username)) AS display_name,
            u.username, u.photo_file_id
     FROM parche_members pm
     JOIN users u ON u.id = pm.creator_id
     WHERE pm.parche_id = $1 AND pm.invite_status = 'accepted'
     ORDER BY pm.role DESC, pm.id ASC`,
    [parche.id]
  );

  const { rows: pkgRows } = await query(
    `SELECT * FROM parche_packages WHERE parche_id = $1 AND is_active = true ORDER BY price_usd ASC`,
    [parche.id]
  );

  const members = await enrichMembers(memberRows);
  return formatParche(parche, members, pkgRows);
}

async function getActiveListings() {
  const { rows } = await query(
    `SELECT p.*,
       (SELECT COUNT(*)::int FROM parche_members WHERE parche_id = p.id AND invite_status = 'accepted') AS member_count,
       (SELECT COUNT(*)::int FROM parche_packages WHERE parche_id = p.id AND is_active = true) AS active_package_count
     FROM parches p
     WHERE p.status = 'active' AND p.is_open = true
     ORDER BY p.created_at DESC`,
    []
  );

  const parcheIds = rows.map((r) => r.id);
  if (!parcheIds.length) return [];

  const { rows: memberRows } = await query(
    `SELECT pm.parche_id, u.photo_file_id,
            TRIM(COALESCE(u.first_name || ' ' || u.last_name, u.first_name, u.username)) AS display_name
     FROM parche_members pm
     JOIN users u ON u.id = pm.creator_id
     WHERE pm.parche_id = ANY($1) AND pm.invite_status = 'accepted'
     ORDER BY pm.id ASC`,
    [parcheIds]
  );

  const membersByParche = {};
  for (const m of memberRows) {
    if (!membersByParche[m.parche_id]) membersByParche[m.parche_id] = [];
    membersByParche[m.parche_id].push({ photoUrl: m.photo_file_id || null, displayName: m.display_name || 'Creator' });
  }

  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    locationCity: p.location_city || null,
    memberCount: p.member_count,
    memberPreviews: (membersByParche[p.id] || []).slice(0, 5),
    activePackageCount: p.active_package_count,
    isOpen: p.is_open,
  }));
}

async function getMyParches(creatorId) {
  const { rows } = await query(
    `SELECT DISTINCT p.*
     FROM parches p
     JOIN parche_members pm ON pm.parche_id = p.id
     WHERE pm.creator_id = $1
       AND pm.invite_status IN ('accepted','pending')
       AND p.status NOT IN ('disbanded')
     ORDER BY p.created_at DESC`,
    [creatorId]
  );

  const results = [];
  for (const p of rows) {
    const full = await getParche(p.id);
    if (full) results.push(full);
  }
  return results;
}

async function updateParche(parcheId, creatorId, { name, description, locationCity }) {
  await requireOwner(parcheId, creatorId);
  const sets = [];
  const vals = [];
  let i = 1;
  if (name !== undefined) {
    if (!name || !name.trim()) throw Object.assign(new Error('Parche name cannot be empty'), { code: 'MISSING_NAME', status: 400 });
    sets.push(`name = $${i++}`); vals.push(name.trim());
  }
  if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
  if (locationCity !== undefined) { sets.push(`location_city = $${i++}`); vals.push(locationCity || null); }
  if (!sets.length) return getParche(parcheId);
  vals.push(parcheId);
  await query(`UPDATE parches SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  return getParche(parcheId);
}

async function setOpen(parcheId, creatorId, isOpen) {
  await requireOwner(parcheId, creatorId);
  const { rows } = await query(`SELECT status FROM parches WHERE id = $1`, [parcheId]);
  if (!rows.length) throw Object.assign(new Error('Parche not found'), { code: 'NOT_FOUND', status: 404 });
  if (rows[0].status !== 'active') {
    throw Object.assign(new Error('Parche must be active before opening for bookings'), { code: 'NOT_ACTIVE', status: 409 });
  }
  await query(`UPDATE parches SET is_open = $1 WHERE id = $2`, [isOpen, parcheId]);
  logger.info('[parcheService] Parche open status changed', { parcheId, isOpen, creatorId });
  return { success: true };
}

// ── Invitations ───────────────────────────────────────────────────────────────

async function inviteCreator(parcheId, ownerCreatorId, targetHandle) {
  await requireOwner(parcheId, ownerCreatorId);

  const { rows: parcheRows } = await query(
    `SELECT id, name, location_city, max_members, status FROM parches WHERE id = $1`,
    [parcheId]
  );
  if (!parcheRows.length) throw Object.assign(new Error('Parche not found'), { code: 'NOT_FOUND', status: 404 });
  const parche = parcheRows[0];

  if (!['forming', 'active'].includes(parche.status)) {
    throw Object.assign(new Error('Cannot invite to a disbanded or paused Parche'), { code: 'INVALID_STATUS', status: 409 });
  }

  const accepted = await getAcceptedCount(parcheId);
  if (accepted >= parche.max_members) {
    throw Object.assign(new Error(`Parche is full (max ${parche.max_members} members)`), { code: 'PARCHE_FULL', status: 409 });
  }

  // Resolve target by username
  const { rows: targetRows } = await query(
    `SELECT id,
            TRIM(COALESCE(first_name || ' ' || last_name, first_name, username)) AS display_name,
            username, telegram AS telegram_id
     FROM users
     WHERE LOWER(username) = LOWER($1) AND creator_status = 'active'`,
    [targetHandle.replace('@', '')]
  );
  if (!targetRows.length) {
    throw Object.assign(new Error(`Creator @${targetHandle} not found or not active`), { code: 'TARGET_NOT_FOUND', status: 404 });
  }
  const target = targetRows[0];

  if (target.id === ownerCreatorId) {
    throw Object.assign(new Error('You cannot invite yourself'), { code: 'SELF_INVITE', status: 400 });
  }

  // Target must not be in another active parche
  const { rows: conflictRows } = await query(
    `SELECT p.id FROM parches p
     JOIN parche_members pm ON pm.parche_id = p.id
     WHERE pm.creator_id = $1
       AND pm.invite_status = 'accepted'
       AND p.status IN ('forming','active','paused')
     LIMIT 1`,
    [target.id]
  );
  if (conflictRows.length > 0) {
    throw Object.assign(new Error(`@${targetHandle} is already in another Parche`), { code: 'TARGET_IN_PARCHE', status: 409 });
  }

  // Check for existing invite (any status)
  const { rows: existingInvite } = await query(
    `SELECT id, invite_status FROM parche_members WHERE parche_id = $1 AND creator_id = $2`,
    [parcheId, target.id]
  );
  if (existingInvite.length > 0) {
    if (existingInvite[0].invite_status === 'accepted') {
      throw Object.assign(new Error(`@${targetHandle} is already in this Parche`), { code: 'ALREADY_MEMBER', status: 409 });
    }
    if (existingInvite[0].invite_status === 'pending') {
      throw Object.assign(new Error(`@${targetHandle} already has a pending invite`), { code: 'PENDING_INVITE', status: 409 });
    }
    // Re-invite if they previously declined
    await query(
      `UPDATE parche_members SET invite_status = 'pending', invited_at = NOW(), responded_at = NULL
       WHERE parche_id = $1 AND creator_id = $2`,
      [parcheId, target.id]
    );
  } else {
    await query(
      `INSERT INTO parche_members (parche_id, creator_id, role, invite_status)
       VALUES ($1, $2, 'member', 'pending')`,
      [parcheId, target.id]
    );
  }

  // Send Telegram DM notification (non-fatal)
  try {
    const { rows: ownerRows } = await query(
      `SELECT TRIM(COALESCE(first_name || ' ' || last_name, first_name, username)) AS display_name, username FROM users WHERE id = $1`,
      [ownerCreatorId]
    );
    const owner = ownerRows[0] || {};
    const parcheNotificationService = require('./parcheNotificationService');
    await parcheNotificationService.sendParcheInvite(target, owner, parche);
  } catch (notifErr) {
    logger.warn('[parcheService] invite notification failed', { parcheId, targetId: target.id, error: notifErr.message });
  }

  logger.info('[parcheService] Creator invited to Parche', { parcheId, targetId: target.id, ownerCreatorId });
  return getParche(parcheId);
}

async function respondToInvite(parcheId, creatorId, accept) {
  const pool = getPool();
  const client = await pool.connect();
  let isNowActive = false;

  try {
    await client.query('BEGIN');

    // Lock the member row to prevent concurrent double-accept
    const { rows } = await client.query(
      `SELECT id, invite_status FROM parche_members
       WHERE parche_id = $1 AND creator_id = $2
       FOR UPDATE`,
      [parcheId, creatorId]
    );
    if (!rows.length) {
      throw Object.assign(new Error('No invite found for this Parche'), { code: 'NOT_INVITED', status: 404 });
    }
    if (rows[0].invite_status !== 'pending') {
      throw Object.assign(new Error('This invite is no longer pending'), { code: 'INVITE_NOT_PENDING', status: 409 });
    }

    // Also lock the parche row so two concurrent accepts cannot both see max_members as not exceeded
    const { rows: parcheRows } = await client.query(
      `SELECT status, max_members FROM parches WHERE id = $1 FOR UPDATE`,
      [parcheId]
    );

    if (accept) {
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM parche_members
         WHERE parche_id = $1 AND invite_status = 'accepted'`,
        [parcheId]
      );
      if (countRows[0].cnt >= parcheRows[0].max_members) {
        throw Object.assign(new Error('Parche is already full'), { code: 'PARCHE_FULL', status: 409 });
      }
    }

    const newStatus = accept ? 'accepted' : 'declined';
    await client.query(
      `UPDATE parche_members SET invite_status = $1, responded_at = NOW()
       WHERE parche_id = $2 AND creator_id = $3`,
      [newStatus, parcheId, creatorId]
    );

    if (accept) {
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM parche_members
         WHERE parche_id = $1 AND invite_status = 'accepted'`,
        [parcheId]
      );
      if (parcheRows[0].status === 'forming' && countRows[0].cnt >= 2) {
        await client.query(`UPDATE parches SET status = 'active' WHERE id = $1`, [parcheId]);
        isNowActive = true;
        logger.info('[parcheService] Parche activated', { parcheId, accepted: countRows[0].cnt });
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (accept) {
    // Notify owner (non-fatal, outside transaction)
    try {
      const { rows: ownerRows } = await query(
        `SELECT u.telegram AS telegram_id,
                TRIM(COALESCE(u.first_name || ' ' || u.last_name, u.first_name, u.username)) AS display_name
         FROM parche_members pm
         JOIN users u ON u.id = pm.creator_id
         WHERE pm.parche_id = $1 AND pm.role = 'owner'`,
        [parcheId]
      );
      const { rows: joinerRows } = await query(
        `SELECT TRIM(COALESCE(first_name || ' ' || last_name, first_name, username)) AS display_name FROM users WHERE id = $1`,
        [creatorId]
      );
      const { rows: pRows } = await query(`SELECT name FROM parches WHERE id = $1`, [parcheId]);
      const parcheNotificationService = require('./parcheNotificationService');
      if (ownerRows[0] && joinerRows[0]) {
        await parcheNotificationService.sendInviteAccepted(
          ownerRows[0],
          joinerRows[0],
          { name: pRows[0]?.name },
          isNowActive
        );
      }
    } catch (notifErr) {
      logger.warn('[parcheService] accept notification failed', { parcheId, creatorId, error: notifErr.message });
    }
  }

  logger.info('[parcheService] Invite response', { parcheId, creatorId, accept });
  return getParche(parcheId);
}

async function leaveParche(parcheId, creatorId) {
  const { rows: memberRows } = await query(
    `SELECT id, role, invite_status FROM parche_members
     WHERE parche_id = $1 AND creator_id = $2`,
    [parcheId, creatorId]
  );
  if (!memberRows.length) {
    throw Object.assign(new Error('You are not in this Parche'), { code: 'NOT_MEMBER', status: 404 });
  }

  const isOwner = memberRows[0].role === 'owner';
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (isOwner) {
      // Transfer ownership to next accepted member, or disband
      const { rows: otherMembers } = await client.query(
        `SELECT creator_id FROM parche_members
         WHERE parche_id = $1 AND creator_id != $2 AND invite_status = 'accepted'
         ORDER BY id ASC LIMIT 1`,
        [parcheId, creatorId]
      );

      if (otherMembers.length > 0) {
        await client.query(
          `UPDATE parche_members SET role = 'owner' WHERE parche_id = $1 AND creator_id = $2`,
          [parcheId, otherMembers[0].creator_id]
        );
      } else {
        await client.query(
          `UPDATE parches SET status = 'disbanded', is_open = false WHERE id = $1`,
          [parcheId]
        );
      }
    }

    await client.query(
      `DELETE FROM parche_members WHERE parche_id = $1 AND creator_id = $2`,
      [parcheId, creatorId]
    );

    // If < 2 accepted members remain, drop back to forming
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM parche_members
       WHERE parche_id = $1 AND invite_status = 'accepted'`,
      [parcheId]
    );
    if (countRows[0].cnt < 2) {
      await client.query(
        `UPDATE parches SET status = 'forming', is_open = false
         WHERE id = $1 AND status NOT IN ('disbanded')`,
        [parcheId]
      );
    }

    await client.query('COMMIT');
    logger.info('[parcheService] Creator left Parche', { parcheId, creatorId, wasOwner: isOwner });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Packages ──────────────────────────────────────────────────────────────────

async function createPackage(parcheId, creatorId, { title, description, durationMinutes, priceUsd }) {
  await requireOwner(parcheId, creatorId);

  if (!ALLOWED_DURATIONS.includes(Number(durationMinutes))) {
    throw Object.assign(
      new Error(`Duration must be one of ${ALLOWED_DURATIONS.join(', ')} minutes`),
      { code: 'INVALID_DURATION', status: 400 }
    );
  }
  if (!priceUsd || Number(priceUsd) <= 0) {
    throw Object.assign(new Error('Price must be greater than 0'), { code: 'INVALID_PRICE', status: 400 });
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS cnt FROM parche_packages WHERE parche_id = $1 AND is_active = true`,
    [parcheId]
  );
  if (countRows[0].cnt >= MAX_PACKAGES) {
    throw Object.assign(new Error(`Max ${MAX_PACKAGES} packages per Parche`), { code: 'MAX_PACKAGES', status: 409 });
  }

  if (!title || !title.trim()) {
    throw Object.assign(new Error('Package title is required'), { code: 'MISSING_TITLE', status: 400 });
  }

  const { rows: parcheRows } = await query(`SELECT slug FROM parches WHERE id = $1`, [parcheId]);
  const sku = await generatePackageSku(parcheRows[0].slug, durationMinutes);

  const { rows } = await query(
    `INSERT INTO parche_packages (parche_id, title, description, duration_minutes, price_usd, sku)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [parcheId, title.trim(), description || null, Number(durationMinutes), Number(priceUsd), sku]
  );

  const pkg = rows[0];
  return {
    id: pkg.id,
    parcheId: pkg.parche_id,
    title: pkg.title,
    description: pkg.description || null,
    durationMinutes: pkg.duration_minutes,
    priceUsd: pkg.price_usd,
    sku: pkg.sku,
    isActive: pkg.is_active,
  };
}

async function updatePackage(packageId, creatorId, { title, description, priceUsd }) {
  // Verify caller is owner of the parche that owns this package
  const { rows } = await query(
    `SELECT pp.parche_id FROM parche_packages pp
     JOIN parche_members pm ON pm.parche_id = pp.parche_id
     WHERE pp.id = $1 AND pm.creator_id = $2 AND pm.role = 'owner' AND pm.invite_status = 'accepted'`,
    [packageId, creatorId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Package not found or permission denied'), { code: 'FORBIDDEN', status: 403 });
  }

  const sets = [];
  const vals = [];
  let i = 1;
  if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title.trim()); }
  if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
  if (priceUsd !== undefined) {
    if (Number(priceUsd) <= 0) throw Object.assign(new Error('Price must be greater than 0'), { code: 'INVALID_PRICE', status: 400 });
    sets.push(`price_usd = $${i++}`); vals.push(Number(priceUsd));
  }
  if (!sets.length) return { success: true };
  vals.push(packageId);
  await query(`UPDATE parche_packages SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  return { success: true };
}

async function deactivatePackage(packageId, creatorId) {
  const { rows } = await query(
    `SELECT pp.parche_id FROM parche_packages pp
     JOIN parche_members pm ON pm.parche_id = pp.parche_id
     WHERE pp.id = $1 AND pm.creator_id = $2 AND pm.role = 'owner' AND pm.invite_status = 'accepted'`,
    [packageId, creatorId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Package not found or permission denied'), { code: 'FORBIDDEN', status: 403 });
  }
  await query(`UPDATE parche_packages SET is_active = false WHERE id = $1`, [packageId]);
  return { success: true };
}

// ── Booking ───────────────────────────────────────────────────────────────────

async function createBooking(parcheId, packageId, buyerId, { scheduledAt, buyerNote, provider = 'wallet_usdc' } = {}) {
  if (provider !== 'wallet_usdc') {
    throw Object.assign(new Error('Unsupported payment provider — only wallet_usdc is supported'), { code: 'INVALID_PROVIDER', status: 400 });
  }

  // Validate parche is open
  const { rows: parcheRows } = await query(
    `SELECT id, name, is_open, status FROM parches WHERE id = $1`,
    [parcheId]
  );
  if (!parcheRows.length || !parcheRows[0].is_open || parcheRows[0].status !== 'active') {
    throw Object.assign(new Error('This Parche is not currently accepting bookings'), { code: 'NOT_OPEN', status: 409 });
  }
  const parche = parcheRows[0];

  // Guard: buyer cannot be a member of this parche
  const { rows: memberCheck } = await query(
    `SELECT 1 FROM parche_members WHERE parche_id = $1 AND creator_id = $2 AND invite_status = 'accepted'`,
    [parcheId, buyerId]
  );
  if (memberCheck.length > 0) {
    throw Object.assign(new Error('Parche members cannot book their own Parche'), { code: 'MEMBER_SELF_BOOKING', status: 400 });
  }

  // Guard: idempotency — buyer already has a pending/confirmed booking for this Parche
  const { rows: existingBooking } = await query(
    `SELECT id FROM parche_bookings WHERE parche_id = $1 AND buyer_id = $2 AND status IN ('awaiting_payment', 'confirmed') LIMIT 1`,
    [parcheId, buyerId]
  );
  if (existingBooking.length > 0) {
    throw Object.assign(new Error('You already have an active booking for this Parche'), { code: 'DUPLICATE_BOOKING', status: 409 });
  }

  // Validate package
  const { rows: pkgRows } = await query(
    `SELECT * FROM parche_packages WHERE id = $1 AND parche_id = $2 AND is_active = true`,
    [packageId, parcheId]
  );
  if (!pkgRows.length) {
    throw Object.assign(new Error('Package not found'), { code: 'PACKAGE_NOT_FOUND', status: 404 });
  }
  const pkg = pkgRows[0];
  const priceUsd = Number(pkg.price_usd);
  const priceCents = Math.round(priceUsd * 100);

  // Create payment record
  const payment = await PaymentModel.create({
    userId: buyerId,
    planId: null,
    provider: 'wallet_usdc',
    sku: pkg.sku,
    amount: priceUsd,
    currency: 'USD',
    status: 'pending',
    metadata: {
      type: 'parche_booking',
      parcheId,
      packageId: pkg.id,
      packageSku: pkg.sku,
      durationMinutes: pkg.duration_minutes,
    },
  });

  PaymentSecurityService.setPaymentTimeout(payment.id, 3600).catch((err) => {
    logger.error('[parcheService] Failed to set payment timeout', { paymentId: payment.id, error: err.message });
  });

  // Create booking row
  const { rows: bookingRows } = await query(
    `INSERT INTO parche_bookings (parche_id, package_id, buyer_id, payment_id, status, scheduled_at, duration_minutes, price_cents, buyer_note)
     VALUES ($1, $2, $3, $4, 'awaiting_payment', $5, $6, $7, $8)
     RETURNING *`,
    [parcheId, packageId, buyerId, payment.id, scheduledAt || null, pkg.duration_minutes, priceCents, buyerNote || null]
  );
  const booking = bookingRows[0];

  // Persist bookingId back into payment metadata
  await query(
    `UPDATE payments SET metadata = metadata || $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [payment.id, JSON.stringify({ bookingId: booking.id })]
  );

  // Parche payments use the Privy/WalletPayCard USDC-on-Base rail.
  // The wallet checkout route creates the intent and returns the address.
  // checkoutUrl is null — the caller must use the wallet flow.
  const webappUrl = process.env.WEBAPP_URL || 'https://pnptv.app';
  const orderId = `parche-${buyerId.slice(0, 8)}-${booking.id.replace(/-/g, '').slice(0, 8)}-${Date.now()}`;
  const checkoutUrl = null;
  logger.info('[parcheService] Parche booking created (wallet_usdc path — no invoice URL)', { bookingId: booking.id, orderId });

  logger.info('[parcheService] Parche booking created', { bookingId: booking.id, parcheId, packageId, buyerId, orderId });

  return {
    bookingId: booking.id,
    paymentId: payment.id,
    checkoutUrl,
    invoiceId: orderId,
    amount: priceUsd,
    currency: 'USD',
    sku: pkg.sku,
  };
}

async function confirmBooking(bookingId) {
  const { rows } = await query(
    `SELECT pb.*, pp.duration_minutes, p.name AS parche_name, p.id AS parche_uuid
     FROM parche_bookings pb
     JOIN parche_packages pp ON pp.id = pb.package_id
     JOIN parches p ON p.id = pb.parche_id
     WHERE pb.id = $1`,
    [bookingId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Booking not found'), { code: 'NOT_FOUND', status: 404 });
  }
  const booking = rows[0];

  if (booking.status === 'confirmed') {
    logger.info('[parcheService] confirmBooking: already confirmed (idempotent)', { bookingId });
    return { bookingId, roomName: booking.livekit_room_name, status: 'confirmed' };
  }
  if (booking.status !== 'awaiting_payment') {
    throw Object.assign(
      new Error(`Cannot confirm booking in status '${booking.status}'`),
      { code: 'INVALID_STATUS', status: 409 }
    );
  }

  const roomName = `parche-${booking.parche_uuid.replace(/-/g, '').slice(0, 16)}-${booking.id.replace(/-/g, '').slice(0, 8)}`;

  const updateRes = await query(
    `UPDATE parche_bookings SET status = 'confirmed', livekit_room_name = $1
     WHERE id = $2 AND status = 'awaiting_payment'
     RETURNING id`,
    [roomName, bookingId]
  );
  if (!updateRes.rows.length) {
    logger.warn('[parcheService] confirmBooking: concurrent update won — skipping', { bookingId });
    return { bookingId, roomName, status: 'confirmed' };
  }

  // Notify all accepted parche members (non-fatal)
  try {
    const { rows: memberRows } = await query(
      `SELECT u.telegram AS telegram_id,
              TRIM(COALESCE(u.first_name || ' ' || u.last_name, u.first_name, u.username)) AS display_name
       FROM parche_members pm
       JOIN users u ON u.id = pm.creator_id
       WHERE pm.parche_id = $1 AND pm.invite_status = 'accepted'`,
      [booking.parche_uuid]
    );
    const { rows: buyerRows } = await query(
      `SELECT TRIM(COALESCE(first_name || ' ' || last_name, first_name, username)) AS display_name, username FROM users WHERE id = $1`,
      [booking.buyer_id]
    );
    const parcheNotificationService = require('./parcheNotificationService');
    await parcheNotificationService.sendBookingConfirmed(
      memberRows,
      buyerRows[0] || {},
      booking,
      { name: booking.parche_name },
      { title: `${booking.duration_minutes}-min Group Call`, durationMinutes: booking.duration_minutes }
    );
  } catch (notifErr) {
    logger.warn('[parcheService] booking confirm notification failed', { bookingId, error: notifErr.message });
  }

  logger.info('[parcheService] Parche booking confirmed', { bookingId, roomName });
  return { bookingId, roomName, status: 'confirmed' };
}

async function getLiveKitToken(bookingId, userId) {
  const { rows } = await query(
    `SELECT pb.*, pm.invite_status, pm.role
     FROM parche_bookings pb
     LEFT JOIN parche_members pm ON pm.parche_id = pb.parche_id AND pm.creator_id = $2
     WHERE pb.id = $1`,
    [bookingId, userId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Booking not found'), { code: 'NOT_FOUND', status: 404 });
  }
  const booking = rows[0];

  if (booking.status !== 'confirmed') {
    throw Object.assign(new Error('Booking is not confirmed'), { code: 'NOT_CONFIRMED', status: 409 });
  }
  if (!booking.livekit_room_name) {
    throw Object.assign(new Error('LiveKit room not assigned yet'), { code: 'NO_ROOM', status: 409 });
  }

  const isMember = booking.invite_status === 'accepted';
  const isBuyer = booking.buyer_id === userId;

  if (!isMember && !isBuyer) {
    throw Object.assign(new Error('Access denied'), { code: 'FORBIDDEN', status: 403 });
  }

  const { rows: userRows } = await query(
    `SELECT display_name, username FROM users WHERE id = $1`,
    [userId]
  );
  const displayName = userRows[0]?.display_name || userRows[0]?.username || userId;

  const token = await livekitService.generateToken(
    booking.livekit_room_name,
    userId,
    displayName,
    isMember // creators are moderators
  );

  return {
    token,
    roomName: booking.livekit_room_name,
    wsUrl: process.env.LIVEKIT_WS_URL || 'wss://livekit.pnptv.app',
  };
}

module.exports = {
  createParche,
  getParche,
  getPublicInfo,
  getActiveListings,
  getMyParches,
  updateParche,
  setOpen,
  inviteCreator,
  respondToInvite,
  leaveParche,
  createPackage,
  updatePackage,
  deactivatePackage,
  createBooking,
  confirmBooking,
  getLiveKitToken,
};
