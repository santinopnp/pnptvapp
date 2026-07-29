'use strict';

/**
 * TokenActivationService
 *
 * Orchestrates the Meru-payment → activation-code → token-credit flow for
 * /live token purchases.  Mirrors the lifetime100 pattern:
 *   reserve  → email user Meru link (link picked at random from the pool)
 *   poll     → getTokenActivationStatus (frontend polls after Meru payment)
 *   activate → verify Meru PAID, atomic DB claim, credit tokens
 *
 * Activation code = the Meru URL's last path segment (already stored on the
 * row as `code`). No separate 12-char code is generated — the URL suffix IS
 * the code. The legacy `activation_code` column is still accepted on lookup
 * so any in-flight reservations from the old flow keep working.
 */

const { query, getClient } = require('../config/postgres');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');
const DashTokenService = require('./dashTokenService');
const meruLinkService = require('./meruLinkService');
const meruPaymentService = require('./meruPaymentService');

// Token packages — mirrors DashTokenService.TOKEN_PACKAGES but keyed by id for O(1) lookup.
// Source of truth is DashTokenService; we derive the map from it rather than duplicating numbers.
// Meru-only packages (tokens_250, tokens_500) are appended below — they use pre-provisioned
// Meru payment links stored in meru_payment_links.product AS-IS (no "token_" prefix).
const _pkgMap = (() => {
  const map = {};
  for (const p of DashTokenService.TOKEN_PACKAGES) {
    map[p.id] = { tokens: p.tokens, usd: p.usd, product: `token_${p.id}`, label: p.label };
  }
  // Meru-only packages — product name in meru_payment_links matches the id verbatim
  // Meru-only card packs — 6 tokens per $1 USD (matches DashTokenService base rate).
  // Product IDs stay 'tokens_250' / 'tokens_500' (they key Meru payment links by $USD).
  map.tokens_250 = { tokens: 1500, usd: 250, product: 'tokens_250', label: '1,500 tokens' };
  map.tokens_500 = { tokens: 3000, usd: 500, product: 'tokens_500', label: '3,000 tokens' };
  return map;
})();

const TOKEN_PACKAGES = _pkgMap;

// (Legacy 12-char code generator removed — the Meru URL suffix is now the
// activation code, matching what admins actually paste in when configuring
// links via the admin panel.)

class TokenActivationService {
  /**
   * Reserve a Meru link for a token package and email the user an activation code.
   *
   * @param {{ userId: string, packageKey: string, email: string, language?: string }} opts
   * @returns {Promise<
   *   { code: string, activationCode: string, meruUrl: string, activationUrl: string,
   *     expiresAt: Date, tokens: number, usdAmount: number } |
   *   { error: 'NO_LINKS_AVAILABLE' | 'INVALID_PACKAGE' }
   * >}
   */
  static async reserveTokenActivation({ userId, packageKey, email, language = 'es' }) {
    const pkg = TOKEN_PACKAGES[packageKey];
    if (!pkg) {
      return { error: 'INVALID_PACKAGE' };
    }

    // Atomically reserve a Meru link for the specific product pool
    const reservation = await meruLinkService.reserveRandomLink({
      product: pkg.product,
      email,
      userId,
      minutes: 60,
    });

    if (!reservation) {
      logger.warn('[tokenActivation] No links available', { packageKey, product: pkg.product, userId });
      return { error: 'NO_LINKS_AVAILABLE' };
    }

    // Activation code = the Meru URL suffix. Already stored on the row by the
    // randomizer as `code`; no separate code to generate. Mirror it into
    // `activation_code` too so downstream lookups (reconciler, legacy paths)
    // continue to resolve the row either way.
    const activationCode = reservation.code;
    try {
      await query(
        `UPDATE meru_payment_links
            SET activation_code = $1
          WHERE code = $1
            AND (activation_code IS NULL OR activation_code <> $1)`,
        [activationCode]
      );
    } catch (updateErr) {
      // Non-fatal — the row is already reserved, the reconciler can heal by code.
      logger.warn('[tokenActivation] Failed to mirror code into activation_code', {
        code: reservation.code, error: updateErr.message,
      });
    }

    const activationUrl = `https://pnptv.app/live?activate=${encodeURIComponent(activationCode)}`;

    // Send email non-blocking
    setImmediate(async () => {
      try {
        const emailService = require('./emailservice');
        await emailService.sendTokenActivationEmail({
          to: email,
          language,
          activationCode,
          meruUrl: reservation.meru_link,
          activationUrl,
          packageLabel: `${pkg.tokens} tokens ($${pkg.usd})`,
          tokens: pkg.tokens,
          usdAmount: pkg.usd,
          expiresAt: reservation.reserved_until,
        });
      } catch (emailErr) {
        logger.warn('[tokenActivation] Email send failed (non-fatal)', {
          userId, activationCode, error: emailErr.message,
        });
      }
    });

    return {
      code: reservation.code,          // the Meru link code (internal)
      activationCode,                   // the 12-char user-facing code
      meruUrl: reservation.meru_link,
      activationUrl,
      expiresAt: reservation.reserved_until,
      tokens: pkg.tokens,
      usdAmount: pkg.usd,
    };
  }

  /**
   * Activate a token purchase using the 12-char activation code.
   *
   * @param {{ userId: string, activationCode: string }} opts
   * @returns {Promise<
   *   { ok: true, tokensCredited: number, newBalance: number } |
   *   { error: string, statusCode: number }
   * >}
   */
  static async activateTokenCode({ userId, activationCode }) {
    // Sanitise. The code is now the Meru URL suffix — Meru's format is
    // A-Z, a-z, 0-9, `_`, `-`. We keep original casing (Meru suffixes are
    // case-sensitive) but accept a trailing slash / whitespace from paste.
    const code = String(activationCode || '').trim().replace(/\/+$/, '');
    if (!code || code.length > 64 || !/^[A-Za-z0-9_\-]+$/.test(code)) {
      return { error: 'INVALID_CODE', statusCode: 400 };
    }

    // Look up the row: prefer the Meru URL suffix (`code`), fall back to the
    // legacy `activation_code` column for reservations issued under the old
    // 12-char flow (or its uppercased variant).
    const upper = code.toUpperCase();
    const { rows } = await query(
      `SELECT id, code, meru_link, product, status, reserved_for_user_id,
              reserved_until, activation_code
         FROM meru_payment_links
        WHERE code = $1
           OR activation_code = $1
           OR activation_code = $2
        LIMIT 1`,
      [code, upper]
    );

    if (rows.length === 0) {
      return { error: 'CODE_NOT_FOUND', statusCode: 404 };
    }

    const row = rows[0];

    // Ownership check — reserved_for_user_id must match caller
    if (row.reserved_for_user_id && String(row.reserved_for_user_id) !== String(userId)) {
      return { error: 'UNAUTHORIZED', statusCode: 401 };
    }

    // Expiry check
    if (row.status !== 'active' && row.status !== 'reserved') {
      return { error: 'ALREADY_USED', statusCode: 409 };
    }
    if (row.reserved_until && new Date(row.reserved_until) < new Date()) {
      return { error: 'EXPIRED', statusCode: 410 };
    }

    // Verify payment on Meru
    const verification = await meruPaymentService.verifyPayment(row.code);
    if (!verification.isPaid) {
      return { error: 'PAYMENT_REQUIRED', statusCode: 402 };
    }

    // Determine token count from product name
    const packageKey = row.product.replace(/^token_/, ''); // e.g. 'token_pkg_10' → 'pkg_10'
    const pkg = TOKEN_PACKAGES[packageKey];
    if (!pkg) {
      logger.error('[tokenActivation] Unknown product on row', { product: row.product, code });
      return { error: 'UNKNOWN_PRODUCT', statusCode: 500 };
    }

    const tokens = pkg.tokens;
    const usdAmount = pkg.usd;

    // Atomic claim — flip status 'active'/'reserved' → 'used' in one UPDATE
    // WHERE status = 'active' OR status = 'reserved' so a concurrent activate
    // (reconciler or double-click) gets 0 rows and we return 409.
    const claimResult = await query(
      `UPDATE meru_payment_links
          SET status = 'used',
              used_at = NOW(),
              used_by = $2
        WHERE id = $1
          AND status IN ('active', 'reserved')
        RETURNING id`,
      [row.id, userId]
    );

    if (claimResult.rowCount === 0) {
      return { error: 'ALREADY_USED', statusCode: 409 };
    }

    // Idempotency key for token_purchases — scoped to the activation_code so the
    // reconciler can re-use the same path without double-crediting.
    const idempotencyKey = `meru:activation:${code}`;

    try {
      // Insert pending purchase row (creditTokens requires one)
      await DashTokenService.recordPurchase(userId, tokens, usdAmount, idempotencyKey);

      // Atomic credit — flips 'pending' → 'paid' and credits wallet
      const creditResult = await DashTokenService.creditTokens(
        userId, tokens, idempotencyKey,
        { provider: 'meru_activation', usdAmount }
      );

      logger.info('[tokenActivation] Tokens credited via activation code', {
        userId, activationCode: code, tokens, newBalance: creditResult.newBalance,
      });

      return { ok: true, tokensCredited: tokens, newBalance: creditResult.newBalance };
    } catch (creditErr) {
      // Credit failed after we claimed the row. Revert the claim so a retry
      // (by the user or the reconciler) can succeed. creditTokens is idempotent
      // via `meru:activation:${code}`, so a second attempt cannot double-credit
      // even if the first partially succeeded.
      try {
        await query(
          `UPDATE meru_payment_links
              SET status = 'active', used_at = NULL, used_by = NULL
            WHERE id = $1 AND status = 'used' AND used_by = $2`,
          [row.id, userId]
        );
        logger.warn('[tokenActivation] Credit failed — row reverted to active for retry', {
          userId, activationCode: code, meruCode: row.code, error: creditErr.message,
        });
      } catch (revertErr) {
        logger.error('[tokenActivation] CRITICAL: credit failed AND revert failed — manual grant required', {
          userId, activationCode: code, meruCode: row.code, tokens,
          creditError: creditErr.message, revertError: revertErr.message,
        });
      }
      throw creditErr;
    }
  }

  /**
   * Poll activation status — called by the frontend while the user is on Meru.
   *
   * @param {string} activationCode
   * @returns {Promise<{ status: 'reserved'|'paid_pending_activation'|'used'|'expired', expiresAt: Date|null, tokens: number|null }>}
   */
  static async getTokenActivationStatus(activationCode) {
    // Preserve case (Meru URL suffix is case-sensitive) and strip trailing "/".
    const code = String(activationCode || '').trim().replace(/\/+$/, '');
    if (!code) return { status: 'expired', expiresAt: null, tokens: null };
    const upper = code.toUpperCase();

    const { rows } = await query(
      `SELECT id, code, product, status, reserved_until, reserved_for_user_id
         FROM meru_payment_links
        WHERE code = $1
           OR activation_code = $1
           OR activation_code = $2
        LIMIT 1`,
      [code, upper]
    );

    if (rows.length === 0) {
      return { status: 'expired', expiresAt: null, tokens: null };
    }

    const row = rows[0];
    const packageKey = row.product.replace(/^token_/, '');
    const pkg = TOKEN_PACKAGES[packageKey] || null;

    if (row.status === 'used') {
      return { status: 'used', expiresAt: null, tokens: pkg?.tokens ?? null };
    }

    const isExpired = row.reserved_until && new Date(row.reserved_until) < new Date();
    if (row.status === 'expired' || isExpired) {
      return { status: 'expired', expiresAt: row.reserved_until, tokens: pkg?.tokens ?? null };
    }

    // Row is active/reserved — check Meru live to distinguish "waiting" from "paid"
    try {
      const verification = await meruPaymentService.verifyPayment(row.code);
      if (verification.isPaid) {
        return {
          status: 'paid_pending_activation',
          expiresAt: row.reserved_until,
          tokens: pkg?.tokens ?? null,
        };
      }
    } catch (verifyErr) {
      // Non-fatal — return 'reserved' as safe default
      logger.warn('[tokenActivation] status verifyPayment failed (non-fatal)', {
        code, error: verifyErr.message,
      });
    }

    return {
      status: 'reserved',
      expiresAt: row.reserved_until,
      tokens: pkg?.tokens ?? null,
    };
  }

  /**
   * Expose package map for routes validation (avoids duplicating the list).
   */
  static get TOKEN_PACKAGES() {
    return TOKEN_PACKAGES;
  }
}

module.exports = TokenActivationService;
