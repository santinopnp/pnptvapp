'use strict';
/**
 * crystalEntitlementService — punto único de decisión del Crystal Creator Pass.
 *
 * Todo beneficio pregunta aquí. Antes cada uno resolvía por su cuenta (23
 * comprobaciones repartidas en 6 servicios), que es lo que permitía que uno
 * dijera sí y otro no para la misma persona.
 *
 * El saldo se DERIVA del libro crystal_grants; nunca se edita a mano. Si se
 * corrompe, se regenera.
 *
 * Durante la migración lee también users.crystal_creator_active_until y se
 * queda con el acceso más favorable, para que ningún creador legítimo pierda
 * beneficios mientras las dos fuentes conviven. Ese respaldo se retira en el
 * paso 6, cuando nada más lea la columna vieja.
 */
const { query } = require('../config/postgres');
const logger = require('../utils/logger');

/** Días que los beneficios siguen vivos tras caducar, si falla la renovación. */
const GRACE_DAYS = 3;

/**
 * Registro declarativo de beneficios. Un flag por beneficio, no uno global:
 * así se puede lanzar uno solo sin tocar los otros cinco.
 */
const BENEFITS = {
  replay_shows:   { enabled: true,  label: 'Shows pregrabados' },
  paid_services:  { enabled: true,  label: 'Servicios de pago' },
  featured_promo: { enabled: true,  label: 'Promoción destacada' },
  main_stage:     { enabled: true,  label: 'Presencia en Main Stage' },
  feed_priority:  { enabled: true,  label: 'Privilegios en el feed' },
  queue_priority: { enabled: true,  label: 'Prioridad en cola' },
};

function _isInfinite(raw) {
  return raw === Infinity || raw === 'infinity' ||
         (raw instanceof Date && !isFinite(raw.getTime()));
}

/**
 * Estado de titularidad de un creador.
 * @returns {{active:boolean, state:string, until:Date|null, graceUntil:Date|null, source:string}}
 */
async function getEntitlement(creatorId) {
  const id = String(creatorId || '');
  if (!id) return { active: false, state: 'none', until: null, graceUntil: null, source: 'none' };

  try {
    const { rows } = await query(
      `SELECT MAX(ends_at) AS entitled_until
         FROM crystal_grants
        WHERE creator_id = $1
          AND revoked_at IS NULL`,
      [id]
    );
    let until = rows[0]?.entitled_until ? new Date(rows[0].entitled_until) : null;
    let source = until ? 'ledger' : 'none';

    // Respaldo de migración: la columna vieja sigue siendo verdad operativa
    // para lo que aún no se ha migrado. Se toma el acceso MÁS favorable para
    // que nadie pierda beneficios mientras conviven.
    const legacy = await query(
      `SELECT crystal_creator_active_until AS until FROM users WHERE id = $1::text`,
      [id]
    );
    const raw = legacy.rows[0]?.until;
    if (raw != null) {
      if (_isInfinite(raw)) {
        return { active: true, state: 'active', until: null, graceUntil: null, source: 'legacy-infinite' };
      }
      const legacyUntil = new Date(raw);
      if (!isNaN(legacyUntil) && (!until || legacyUntil > until)) {
        until = legacyUntil;
        source = 'legacy';
      }
    }

    if (!until) return { active: false, state: 'none', until: null, graceUntil: null, source };

    const now = Date.now();
    const graceUntil = new Date(until.getTime() + GRACE_DAYS * 24 * 3600 * 1000);

    if (until.getTime() > now) return { active: true,  state: 'active',  until, graceUntil, source };
    if (graceUntil.getTime() > now) return { active: true, state: 'grace', until, graceUntil, source };
    return { active: false, state: 'expired', until, graceUntil, source };
  } catch (err) {
    // Fail-closed: ante un fallo de base no se regala acceso de pago.
    logger.error('[crystalEntitlement] fallo resolviendo titularidad', { creatorId: id, error: err.message });
    return { active: false, state: 'error', until: null, graceUntil: null, source: 'error' };
  }
}

/** ¿Puede este creador usar este beneficio ahora mismo? */
async function hasBenefit(creatorId, benefitKey) {
  const benefit = BENEFITS[benefitKey];
  if (!benefit) {
    logger.warn('[crystalEntitlement] beneficio desconocido', { benefitKey });
    return false;
  }
  if (!benefit.enabled) return false;
  const ent = await getEntitlement(creatorId);
  return ent.active === true;
}

/** Compat: sustituye a los isCrystalActive/isCrystalCreator sueltos. */
async function isCrystalActive(creatorId) {
  return (await getEntitlement(creatorId)).active;
}

/**
 * Registra una concesión. Único camino de escritura: el libro es append-only,
 * revocar es añadir, nunca editar ni borrar.
 */
async function grant({ creatorId, grantType, source, grantedBy, startsAt, endsAt, amountUsd = null, externalRef = null }) {
  if (!endsAt) throw new Error('ends_at es obligatorio — un acceso sin fecha no es auditable');
  const { rows } = await query(
    `INSERT INTO crystal_grants
       (creator_id, grant_type, source, granted_by, starts_at, ends_at, amount_usd, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, ends_at`,
    [String(creatorId), grantType, source, grantedBy || null,
     startsAt || new Date(), endsAt, amountUsd, externalRef]
  );
  logger.info('[crystalEntitlement] concesión registrada', {
    creatorId: String(creatorId), grantType, endsAt, grantId: rows[0].id,
  });
  return rows[0];
}

/**
 * Compra acumulable. Cada pase empieza donde acaba el acceso vigente, no hoy:
 * tres compras seguidas dan tres meses, no uno. Si el acceso ya caducó, arranca
 * ahora.
 *
 * @param months  meses que añade este pase (1 por defecto)
 */
async function purchaseMonths({ creatorId, months = 1, grantType = 'purchase', source = 'wallet', grantedBy, amountUsd = null, externalRef = null }) {
  const current = await getEntitlement(creatorId);
  const now = new Date();
  // Punto de partida: el final vigente si aún no ha pasado; si no, ahora.
  const startsAt = current.until && current.until > now ? current.until : now;
  const endsAt = new Date(startsAt.getTime());
  endsAt.setMonth(endsAt.getMonth() + Number(months));

  return grant({
    creatorId, grantType, source,
    grantedBy: grantedBy || creatorId,
    startsAt, endsAt, amountUsd, externalRef,
  });
}

async function revoke(grantId, reason) {
  await query(
    `UPDATE crystal_grants SET revoked_at = NOW(), revoked_reason = $2
      WHERE id = $1 AND revoked_at IS NULL`,
    [grantId, reason || 'sin motivo']
  );
  logger.info('[crystalEntitlement] concesión revocada', { grantId, reason });
}

/** Historial completo, para soporte y disputas. */
async function listGrants(creatorId) {
  const { rows } = await query(
    `SELECT id, grant_type, source, granted_by, starts_at, ends_at,
            revoked_at, revoked_reason, amount_usd, external_ref, created_at
       FROM crystal_grants WHERE creator_id = $1 ORDER BY created_at DESC`,
    [String(creatorId)]
  );
  return rows;
}

module.exports = {
  BENEFITS, GRACE_DAYS,
  getEntitlement, hasBenefit, isCrystalActive,
  grant, purchaseMonths, revoke, listGrants,
};
