'use strict';
const callPackageService = require('../../../services/callPackageService');
const CallBookingService = require('../../../services/CallBookingService');
const callNotificationService = require('../../../services/callNotificationService');
const moment = require('moment-timezone');

const logger = require('../../../utils/logger');

/**
 * GET /api/webapp/creators/:creatorId/call-packages
 * Returns active call packages for a creator. Public — no auth required.
 */
async function listPackages(req, res) {
  try {
    const { creatorId } = req.params;
    const packages = await callPackageService.getPackages(creatorId);
    res.json({ success: true, packages });
  } catch (err) {
    logger.error('listPackages error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve packages' });
  }
}

/**
 * POST /api/webapp/admin/creators/:creatorId/call-packages
 * Create a call package for a creator. Admin only.
 * Body: { durationMinutes: 30|60, quantity: number, priceUsd: number, title?: string }
 */
async function createPackage(req, res) {
  try {
    const { creatorId } = req.params;
    const { durationMinutes, quantity, priceUsd, title } = req.body;

    if (![30, 60].includes(Number(durationMinutes))) {
      return res.status(400).json({ error: 'durationMinutes must be 30 or 60' });
    }
    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }
    if (!priceUsd || Number(priceUsd) <= 0) {
      return res.status(400).json({ error: 'priceUsd must be a positive number' });
    }
    if (title !== undefined && (typeof title !== 'string' || title.length > 200)) {
      return res.status(400).json({ error: 'Title must be a string under 200 characters' });
    }

    const pkg = await callPackageService.createPackage(creatorId, {
      durationMinutes: Number(durationMinutes),
      quantity: Number(quantity),
      priceUsd: Number(priceUsd),
      title: title || null,
    });
    res.status(201).json({ success: true, package: pkg });
  } catch (err) {
    logger.error('createPackage error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create package' });
  }
}

/**
 * DELETE /api/webapp/admin/creators/:creatorId/call-packages/:packageId
 * Deactivate a call package. Admin only.
 */
async function deactivatePackage(req, res) {
  try {
    const { creatorId, packageId } = req.params;
    const ok = await callPackageService.deactivatePackage(packageId, creatorId);
    if (!ok) return res.status(404).json({ error: 'Package not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('deactivatePackage error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to deactivate package' });
  }
}

/**
 * GET /api/webapp/book-call/:creatorId/options
 * Returns booking options (next 5 slots, paginated) for the authenticated member.
 * Query: ?duration=30|60  (default 30)
 *        ?offset=0        (default 0 — zero-based slot offset for pagination)
 *
 * When the creator's accepting_calls flag is set AND they are online, near-term
 * slots (now+5min through now+60min, 5-min granularity) are injected at the
 * front of the list — filtered against existing bookings AND the creator's
 * weekly availability schedule. These slots appear on page 0 only (offset=0)
 * to avoid confusing pagination arithmetic; subsequent pages return only the
 * standard future slots.
 */
async function getBookingOptions(req, res) {
  try {
    const { creatorId } = req.params;
    const durationMinutes = Number(req.query.duration) || 30;
    const offset = Math.max(0, Number(req.query.offset) || 0);

    if (![30, 60].includes(durationMinutes)) {
      return res.status(400).json({ error: 'duration must be 30 or 60' });
    }

    // Check online presence and accepting-calls flag
    const { getRedis } = require('../../../config/redis');
    const { query: dbQuery } = require('../../../config/postgres');
    const redis = getRedis();
    const [onlineRaw, acceptingRaw] = await Promise.all([
      redis.get(`user:${creatorId}:active`),
      redis.get(`user:${creatorId}:accepting_calls`),
    ]);
    const isOnline = onlineRaw !== null && onlineRaw !== '0';
    // REGLA B — accepting_calls es OPT-OUT: solo bloquea si vale exactamente
    // '0'. Ausente significa disponible, así el caso normal no exige que el
    // creador active nada.
    const optedOut = acceptingRaw === '0';

    // REGLA B — estar en vivo es lo que DA disponibilidad (antes la quitaba).
    // Se consulta live_streams y no la clave redis mainstage:live:{id}: a esa
    // nadie le hace DEL al terminar, expira sola a las 4 h, y dejaría al
    // creador "disponible" mucho después de haberse ido.
    let isLiveNow = false;
    if (isOnline) {
      try {
        const liveCheck = await dbQuery(
          `SELECT 1 FROM live_streams
            WHERE host_id = $1::text
              AND status IN ('live', 'active')
              AND started_at IS NOT NULL
              AND ended_at IS NULL
            LIMIT 1`,
          [creatorId]
        );
        isLiveNow = liveCheck.rowCount > 0;
      } catch (liveErr) {
        logger.warn('[getBookingOptions] live_streams check failed (non-fatal)', { creatorId, error: liveErr.message });
      }
    }
    const isAcceptingCalls = isOnline && isLiveNow && !optedOut;

    const fromDate = moment.utc().toDate();
    const toDate = moment.utc().add(14, 'days').toDate();
    // REGLA B — la disponibilidad es presencia, no calendario: sin directo no
    // se ofrece ningún hueco. Las reservas YA confirmadas no se tocan (viven en
    // bookings y se honran); esto solo controla lo que se ofrece de nuevo.
    // Dos vias: en vivo da huecos inmediatos (los near-term de abajo) y el
    // horario semanal sigue captando reservas cuando el creador no emite.
    const slots = await CallBookingService.getAvailableSlots(creatorId, fromDate, toDate, durationMinutes);

    // ── Near-term slot injection (only when accepting_calls is active) ────────
    let nearTermSlots = [];
    if (isAcceptingCalls && offset === 0) {
      const nowMs = Date.now();
      // Minimum lead time: 5 minutes (gives crypto payment time to confirm)
      const windowStart = nowMs + 5 * 60 * 1000;
      // Window end: 60 minutes from now
      const windowEnd = nowMs + 60 * 60 * 1000;

      // Fetch the creator's weekly availability schedule to respect off-days/hours
      const schedResult = await dbQuery(
        `SELECT day_of_week, start_time, end_time, timezone
           FROM creator_availability_schedules
          WHERE creator_id = $1 AND is_active = true
          ORDER BY day_of_week, start_time`,
        [creatorId]
      );
      // Build a lookup: Map<dayOfWeek, [{startMinutes, endMinutes}]>
      const scheduleByDay = new Map();
      for (const row of schedResult.rows) {
        const dow = row.day_of_week;
        if (!scheduleByDay.has(dow)) scheduleByDay.set(dow, []);
        const [sh, sm] = String(row.start_time).split(':').map(Number);
        const [eh, em] = String(row.end_time).split(':').map(Number);
        scheduleByDay.get(dow).push({
          startMinutes: sh * 60 + sm,
          endMinutes: eh * 60 + em,
        });
      }
      // REGLA B — ya no se exige horario semanal: la presencia en vivo es la
      // única condición. scheduleByDay queda sin uso a propósito.
      {
        // Fetch existing bookings that could overlap the near-term window
        const nearWindowStart = new Date(windowStart).toISOString();
        const nearWindowEnd = new Date(windowEnd + durationMinutes * 60 * 1000).toISOString();
        const existingResult = await dbQuery(
          `SELECT start_time_utc, end_time_utc
             FROM bookings
            WHERE (
                    SELECT user_id FROM performers WHERE id = bookings.performer_id
                  ) = $1::text
              AND status IN ('held', 'awaiting_payment', 'confirmed')
              AND start_time_utc < $2
              AND end_time_utc > $3`,
          [creatorId, nearWindowEnd, nearWindowStart]
        );
        const existingBookings = existingResult.rows.map((r) => ({
          startMs: new Date(r.start_time_utc).getTime(),
          endMs: new Date(r.end_time_utc).getTime(),
        }));

        // Also exclude near-term slots that duplicate slots already in `slots` array
        const existingSlotStarts = new Set(slots.map((s) => new Date(s.startUtc).getTime()));

        // Generate candidates at 5-minute granularity
        // Round windowStart up to the next 5-min boundary
        const FIVE_MIN = 5 * 60 * 1000;
        let candidateMs = Math.ceil(windowStart / FIVE_MIN) * FIVE_MIN;

        while (candidateMs + durationMinutes * 60 * 1000 <= windowEnd) {
          const candidateEnd = candidateMs + durationMinutes * 60 * 1000;
          const candidateDate = new Date(candidateMs);
          const dowUtc = candidateDate.getUTCDay();
          const minuteOfDayUtc = candidateDate.getUTCHours() * 60 + candidateDate.getUTCMinutes();
          const endMinuteOfDayUtc = minuteOfDayUtc + durationMinutes;

          // Check if this candidate falls within the creator's availability for this day-of-week
          // Note: schedule timezones are stored but availability slots represent the same day
          // in the creator's local tz. Since we only look ~60 min ahead and most creators in the
          // same day-of-week context, using the schedule's day_of_week (UTC-aligned) is an
          // acceptable approximation; the 5-min granularity prevents edge-of-day issues.
          // REGLA B — sin filtro de horario. Se conserva el cálculo de minutos
          // por si se quisiera reintroducir una ventana, pero no restringe.
          void dowUtc; void minuteOfDayUtc; void endMinuteOfDayUtc;
          const withinSchedule = true;

          if (withinSchedule) {
            // Check for conflicts with existing bookings
            const hasConflict = existingBookings.some(
              (b) => candidateMs < b.endMs && candidateEnd > b.startMs
            );
            // Skip if already in the regular slots array (avoid duplicate)
            const isDuplicate = existingSlotStarts.has(candidateMs);

            if (!hasConflict && !isDuplicate) {
              nearTermSlots.push({
                startUtc: new Date(candidateMs).toISOString(),
                endUtc: new Date(candidateEnd).toISOString(),
                durationMinutes,
                available: true,
                isNearTerm: true,
              });
            }
          }

          candidateMs += FIVE_MIN;
        }
      }
    }

    // Merge near-term slots at the front, then standard slots, sorted ascending
    const allSlots = [...nearTermSlots, ...slots].sort(
      (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
    );

    // Sin huecos: anotar el intento para avisar cuando vuelva a estar disponible.
    if (!slots.length && !nearTermSlots.length) {
      const viewerId = String(req.session?.user?.id || req.user?.id || req.user?.userId || '');
      if (viewerId) {
        require('../../../services/callWaitlistService')
          .recordMiss({ memberId: viewerId, creatorId, durationMinutes })
          .catch(() => {});
      }
    }

    const PAGE_SIZE = 5;
    const pageSlots = allSlots.slice(offset, offset + PAGE_SIZE);
    const hasMore = allSlots.length > offset + PAGE_SIZE;

    res.json({
      success: true,
      slots: pageSlots,
      hasMore,
      isOnline,
      isAcceptingCalls,
      isLive: false,
      liveMessage: null,
      type: 'slots',
    });
  } catch (err) {
    logger.error('getBookingOptions error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve booking options' });
  }
}

/**
 * POST /api/webapp/book-call
 * Book a call using a call credit.
 * Body: { creatorId, startAt, creditId, durationMinutes }
 */
async function bookCall(req, res) {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser?.id) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const memberId = String(sessionUser.id);
    const { creatorId, startAt, creditId, durationMinutes } = req.body;

    if (!creatorId || !startAt || creditId == null) {
      return res.status(400).json({ error: 'creatorId, startAt, and creditId are required' });
    }

    if (memberId === String(creatorId)) {
      return res.status(400).json({ success: false, error: 'You cannot book a call with yourself' });
    }

    // Block bookings while creator is in the temporary onboarding-lock state.
    try {
      const CreatorService = require('../../../services/creatorService');
      await CreatorService.assertCreatorUnlocked(creatorId);
    } catch (lockErr) {
      if (lockErr.code === 'CREATOR_LOCKED') {
        return res.status(lockErr.statusCode || 423).json({
          success: false,
          error: lockErr.message,
          code: 'CREATOR_LOCKED',
        });
      }
      throw lockErr;
    }

    const parsedDuration = Number(durationMinutes);
    if (![30, 60].includes(parsedDuration)) {
      return res.status(400).json({ error: 'durationMinutes must be 30 or 60' });
    }

    // Validate startAt is a valid future ISO string
    if (!moment(startAt, moment.ISO_8601, true).isValid() || moment.utc(startAt).isBefore(moment.utc())) {
      return res.status(400).json({ error: 'startAt must be a valid future ISO timestamp' });
    }
    if (moment.utc(startAt).isAfter(moment.utc().add(90, 'days'))) {
      return res.status(400).json({ error: 'Cannot book more than 90 days in advance' });
    }

    // BC-C-03: Re-verify near-term/live availability from Redis before booking.
    // Scheduled future slots are allowed while offline; "available now" slots
    // depend on the creator still being online and accepting calls at submit.
    const { getRedis } = require('../../../config/redis');
    const redis = getRedis();
    const [creatorOnline, acceptingRaw] = await Promise.all([
      redis.get(`user:${creatorId}:active`),
      redis.get(`user:${creatorId}:accepting_calls`),
    ]);
    const isNearTermSlot = moment.utc(startAt).isBefore(moment.utc().add(65, 'minutes'));
    if (isNearTermSlot && (!creatorOnline || creatorOnline === '0' || acceptingRaw === '0')) {
      logger.warn('bookCall: near-term slot rejected; creator no longer available', {
        creatorId,
        memberId,
        startAt,
        creatorOnline,
        acceptingRaw,
      });
      return res.status(409).json({
        success: false,
        error: 'Creator is no longer available. Please choose another time.',
        code: 'CREATOR_NOT_AVAILABLE',
      });
    }

    const booking = await CallBookingService.createBooking({
      memberId,
      creatorId,
      startAt,
      creditId: Number(creditId),
      durationMinutes: parsedDuration,
    });

    // ── Post-booking orchestration (fire-and-forget) ───────────────────────
    // Send confirmations and schedule reminders. LiveKit tokens are issued
    // on-demand at join time (see callBookingController.getBooking) — not here.
    // Failures here must NOT block the booking response.
    (async () => {
      try {
        const { query: dbQuery } = require('../../../config/postgres');
        const [memberResult, creatorResult] = await Promise.all([
          dbQuery('SELECT username, display_name FROM users WHERE id = $1', [memberId]),
          dbQuery('SELECT username, display_name FROM users WHERE id = $1', [creatorId]),
        ]);
        const member = memberResult.rows[0] || {};
        const creator = creatorResult.rows[0] || {};

        // Send confirmations to both parties (no token — token issued at join time)
        await Promise.allSettled([
          callNotificationService.sendBookingConfirmationToMember(
            memberId,
            { creator_name: creator.display_name || creator.username, start_at: startAt, duration_minutes: parsedDuration },
            null
          ),
          callNotificationService.sendBookingConfirmationToCreator(
            creatorId,
            { start_at: startAt, duration_minutes: parsedDuration },
            { username: member.username, display_name: member.display_name },
            null
          ),
        ]);

        // Schedule 1h + 15min pre-call reminders + end-of-call countdown warnings
        callNotificationService.scheduleCallReminders(
          Number(creditId), creatorId, memberId, startAt, null, parsedDuration
        );

        // Create the call_sessions row so joinBooking can flip it to 'live'
        // and checkNoShows has a real "did anyone join?" signal. Without this
        // row the no-show sweep mislabels every credit-spend booking.
        try {
          const CallSessionModel = require('../../../models/callSessionModel');
          const safeCreatorName = (creator.display_name || creator.username || 'creator')
            .toString().replace(/[^\w\s-]/g, '').slice(0, 60) || 'creator';
          await CallSessionModel.create({
            bookingId: booking.id,
            roomProvider: 'jitsi',
            roomId: `booking-${booking.id}`,
            roomName: `Private Call - ${safeCreatorName}`,
            maxParticipants: 2,
            recordingDisabled: true,
          });
        } catch (sessionErr) {
          if (sessionErr.code !== '23505') {
            logger.warn('bookCall: call_sessions row creation failed (non-fatal)', {
              bookingId: booking.id, error: sessionErr.message,
            });
          }
        }
      } catch (postErr) {
        logger.warn('bookCall: post-booking orchestration error (non-fatal)', {
          creditId, memberId, creatorId, error: postErr.message,
        });
      }
    })();

    res.status(201).json({ success: true, booking });
  } catch (err) {
    logger.error('bookCall error', { error: err.message, code: err.code });
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    return res.status(500).json({ success: false, error: 'Failed to book call' });
  }
}

/**
 * GET /api/webapp/my-call-credits
 * Returns the authenticated member's available call credits.
 * Query: ?creatorId=  (optional — filter by creator)
 */
async function myCallCredits(req, res) {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser?.id) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const memberId = String(sessionUser.id);
    const creatorId = req.query.creatorId ? String(req.query.creatorId) : null;

    const credits = await callPackageService.getMemberCredits(memberId, creatorId);
    res.json({ success: true, credits });
  } catch (err) {
    logger.error('myCallCredits error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to retrieve call credits' });
  }
}

/**
 * GET /api/webapp/creator/call-packages
 * Returns the logged-in creator's own active packages.
 */
async function listMyPackages(req, res) {
  try {
    const creatorId = String(req.session.user.id);
    const packages = await callPackageService.getPackages(creatorId);
    res.json({ success: true, packages });
  } catch (err) {
    logger.error('listMyPackages error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load packages' });
  }
}

/**
 * POST /api/webapp/creator/call-packages
 * Creator creates their own call package.
 * Body: { durationMinutes: 30|60, quantity: number, priceUsd: number, title?: string }
 */
async function createMyPackage(req, res) {
  try {
    const sessionUser = req.session.user;
    const creatorId = String(sessionUser.id);
    const { durationMinutes, quantity, priceUsd, title } = req.body;

    if (![30, 60].includes(Number(durationMinutes))) {
      return res.status(400).json({ success: false, error: 'Duration must be 30 or 60 minutes' });
    }
    if (!quantity || Number(quantity) < 1 || Number(quantity) > 20) {
      return res.status(400).json({ success: false, error: 'Quantity must be 1-20' });
    }
    if (!priceUsd || Number(priceUsd) <= 0 || Number(priceUsd) > 1000) {
      return res.status(400).json({ success: false, error: 'Price must be $0.01-$1000' });
    }
    if (title !== undefined && (typeof title !== 'string' || title.length > 200)) {
      return res.status(400).json({ success: false, error: 'Title must be a string under 200 characters' });
    }

    const pkg = await callPackageService.createPackage(creatorId, {
      durationMinutes: Number(durationMinutes),
      quantity: Number(quantity),
      priceUsd: Number(priceUsd),
      title: title || null,
    });
    res.json({ success: true, package: pkg });
  } catch (err) {
    logger.error('createMyPackage error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create package' });
  }
}

/**
 * PUT /api/webapp/creator/call-packages/:packageId
 * Update price and/or title of own package.
 * Body: { priceUsd?: number, title?: string }
 */
async function updateMyPackage(req, res) {
  try {
    const creatorId = String(req.session.user.id);
    const packageId = Number(req.params.packageId);
    const { priceUsd, title } = req.body;

    // Verify ownership by fetching creator's own packages
    const packages = await callPackageService.getPackages(creatorId);
    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    // CRIT-02: Explicit whitelist SET clauses — no dynamic column names
    // MED-03: Validate title type + 200-char cap
    // MED-04: Validate priceUsd: reject NaN, <=0, >1000
    const setClauses = [];
    const values = [];
    let paramIdx = 1;

    if (priceUsd !== undefined) {
      const numPrice = Number(priceUsd);
      if (isNaN(numPrice) || numPrice <= 0 || numPrice > 1000) {
        return res.status(400).json({ success: false, error: 'Price must be $0.01-$1000' });
      }
      setClauses.push(`price_usd = $${paramIdx++}`);
      values.push(numPrice);
    }

    if (title !== undefined) {
      if (typeof title !== 'string' || title.length > 200) {
        return res.status(400).json({ success: false, error: 'Title must be a string under 200 characters' });
      }
      setClauses.push(`title = $${paramIdx++}`);
      values.push(title);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    setClauses.push('updated_at = NOW()');
    values.push(packageId, creatorId);

    const { query } = require('../../../config/postgres');
    await query(
      `UPDATE call_packages SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND creator_id = $${paramIdx + 1}`,
      values
    );

    res.json({ success: true });
  } catch (err) {
    logger.error('updateMyPackage error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update package' });
  }
}

/**
 * DELETE /api/webapp/creator/call-packages/:packageId
 * Deactivate own package. Ownership enforced at the DB level.
 */
async function deactivateMyPackage(req, res) {
  try {
    const creatorId = String(req.session.user.id);
    const packageId = Number(req.params.packageId);
    const ok = await callPackageService.deactivatePackage(packageId, creatorId);
    if (!ok) return res.status(404).json({ success: false, error: 'Package not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('deactivateMyPackage error', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to deactivate package' });
  }
}

/**
 * GET /api/webapp/book-call/by-channel/:channelRef/packages
 * Resolves a Restreamer channel ref (e.g. "pnptv-santino") to the creator's active call packages.
 * Auth: requireSessionAuth (member must be logged in to see booking options).
 */
async function getPackagesByChannelRef(req, res) {
  try {
    const { query: dbQuery } = require('../../../config/postgres');
    const { channelRef } = req.params;
    if (!channelRef || typeof channelRef !== 'string' || channelRef.length > 100) {
      return res.status(400).json({ success: false, error: 'Invalid channel ref' });
    }

    const userResult = await dbQuery(
      `SELECT id, username FROM users WHERE live_channel = $1 AND is_deleted = FALSE LIMIT 1`,
      [channelRef]
    );
    const creator = userResult.rows[0];
    if (!creator) {
      return res.json({ success: true, packages: [], creatorId: null });
    }

    const pkgResult = await dbQuery(
      `SELECT id, duration_minutes, price_usd, quantity, title, sku
       FROM call_packages
       WHERE creator_id = $1 AND is_active = TRUE AND quantity = 1
       ORDER BY duration_minutes ASC`,
      [String(creator.id)]
    );

    return res.json({
      success: true,
      creatorId: String(creator.id),
      creatorUsername: creator.username,
      packages: pkgResult.rows.map((p) => ({
        id: p.id,
        durationMinutes: p.duration_minutes,
        priceUsd: parseFloat(p.price_usd),
        // 6 Tokens = $1 USD (see memory feedback_token_rate.md)
        tokenCost: Math.round(parseFloat(p.price_usd) * 6),
        quantity: p.quantity,
        title: p.title,
        sku: p.sku,
      })),
    });
  } catch (err) {
    logger.error('[callPackageController] getPackagesByChannelRef error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to load call packages' });
  }
}

module.exports = {
  listPackages,
  createPackage,
  deactivatePackage,
  getBookingOptions,
  bookCall,
  myCallCredits,
  listMyPackages,
  createMyPackage,
  updateMyPackage,
  deactivateMyPackage,
  getPackagesByChannelRef,
};
