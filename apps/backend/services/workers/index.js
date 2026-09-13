'use strict';

/**
 * BullMQ Workers — thin dispatchers that call existing service functions.
 *
 * Each Worker is a separate process-level consumer on a named queue.
 * Processors catch all errors so the Worker loop is never killed by a bad job.
 * DLQ alerting fires via businessNotificationService when a job exhausts retries.
 *
 * Import paths from services/workers/ to services/:  require('../X')
 */

const { Worker } = require('bullmq');
const { makeBullConnection } = require('../queueService');
const logger = require('../../utils/logger');

let _workers = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _safeRequire(modPath) {
  try { return require(modPath); } catch (e) {
    logger.warn(`[BullMQ] safeRequire failed for ${modPath}: ${e.message}`);
    return null;
  }
}

// ─── payment-fulfillment processor ───────────────────────────────────────────
async function paymentProcessor(job) {
  if (job.name === 'post-grant-hooks') {
    const { userId, planId, source, sourcePaymentId, addOns, grantedCount } = job.data;
    if (!userId || !planId || grantedCount < 1) return;

    // Notification to the operator channel
    try {
      const BNS = _safeRequire('../businessNotificationService');
      if (BNS && typeof BNS.notifyEntitlementGrant === 'function') {
        await BNS.notifyEntitlementGrant({
          userId,
          planId,
          addOns: addOns || [],
          source: source || 'payment',
          sourcePaymentId: sourcePaymentId || null,
        });
      }
    } catch (err) {
      logger.warn('[BullMQ] paymentProcessor: BNS.notifyEntitlementGrant failed', { error: err.message });
    }

    // Payment confirmation email/in-app to the user
    try {
      const PaymentNotificationService = _safeRequire('../paymentNotificationService');
      if (PaymentNotificationService && typeof PaymentNotificationService.sendPaymentConfirmation === 'function') {
        await PaymentNotificationService.sendPaymentConfirmation({
          userId,
          planId,
          paymentId: sourcePaymentId,
          provider: source || 'nowpayments',
        });
      }
    } catch (err) {
      logger.warn('[BullMQ] paymentProcessor: PaymentNotificationService failed', { error: err.message });
    }
    return;
  }

  logger.warn(`[BullMQ] paymentProcessor: unhandled job name "${job.name}"`);
}

// ─── notifications processor ──────────────────────────────────────────────────
async function notificationsProcessor(job) {
  const { type, fn, args } = job.data || {};

  switch (job.name) {
    case 'in-app': {
      // Direct DB+Socket.IO emit — call NotificationEmitter._emitSync if available
      // otherwise call the full emit() (which will loop back to BullMQ but attempts
      // will be capped, preventing infinite queue growth).
      const NotificationEmitter = _safeRequire('../notificationEmitter');
      if (!NotificationEmitter) throw new Error('NotificationEmitter not available');
      if (typeof NotificationEmitter._emitSync === 'function') {
        await NotificationEmitter._emitSync(job.data);
      } else {
        // Fallback: call emit but without re-enqueueing (emit will try BullMQ first,
        // but since we're already inside the worker the circular call will hit the
        // sync fallback on any subsequent attempt if the queue is unavailable).
        await NotificationEmitter.emit(job.data);
      }
      return;
    }

    case 'slack':
    case 'slack_ops': {
      const svc = _safeRequire('../slackOpsService');
      // Prefer _direct_${fn} — the exported `${fn}` is a queued wrapper that
      // re-enqueues, which caused a ~463k-job runaway loop on 2026-08-31.
      const direct = svc && (svc[`_direct_${fn}`] || svc[fn]);
      if (typeof direct !== 'function') {
        logger.warn(`[BullMQ] notificationsProcessor: slackOpsService.${fn} not found`);
        return;
      }
      await direct(...(args || []));
      return;
    }

    case 'slack_creator': {
      const svc = _safeRequire('../slackCreatorNotifyService');
      const direct = svc && (svc[`_direct_${fn}`] || svc[fn]);
      if (typeof direct !== 'function') {
        logger.warn(`[BullMQ] notificationsProcessor: slackCreatorNotifyService.${fn} not found`);
        return;
      }
      await direct(...(args || []));
      return;
    }

    case 'slack_live': {
      const svc = _safeRequire('../slackLiveService');
      const direct = svc && (svc[`_direct_${fn}`] || svc[fn]);
      if (typeof direct !== 'function') {
        logger.warn(`[BullMQ] notificationsProcessor: slackLiveService.${fn} not found`);
        return;
      }
      await direct(...(args || []));
      return;
    }

    case 'slack_support': {
      const svc = _safeRequire('../slackSupportService');
      const direct = svc && (svc[`_direct_${fn}`] || svc[fn]);
      if (typeof direct !== 'function') {
        logger.warn(`[BullMQ] notificationsProcessor: slackSupportService.${fn} not found`);
        return;
      }
      await direct(...(args || []));
      return;
    }

    case 'email':
    case 'email.send': {
      const EmailService = _safeRequire('../emailservice');
      if (!EmailService) throw new Error('emailservice not available');
      const payload = args ? args[0] : job.data;
      await EmailService.send(payload);
      return;
    }

    case 'push': {
      const PushNotificationService = _safeRequire('../pushNotificationService');
      if (!PushNotificationService) {
        logger.warn('[BullMQ] notificationsProcessor: pushNotificationService not available');
        return;
      }
      const { targetUserId, title, body, url, tag } = job.data;
      if (targetUserId) {
        await PushNotificationService.sendToUser(targetUserId, { title, body, url, tag });
      }
      return;
    }

    default: {
      // Legacy type-based dispatch (old addJob callers that set data.type)
      if (type) {
        const legacyJob = { name: type, data: job.data };
        await notificationsProcessor(legacyJob);
        return;
      }
      logger.warn(`[BullMQ] notificationsProcessor: unhandled job name "${job.name}"`);
    }
  }
}

// ─── ai-tasks processor ───────────────────────────────────────────────────────
async function aiProcessor(job) {
  if (job.name === 'cristina') {
    const CristinaAIService = _safeRequire('../cristinaAIService');
    if (!CristinaAIService) { logger.warn('[BullMQ] aiProcessor: cristinaAIService not found'); return; }
    const { userId, message, context } = job.data;
    if (typeof CristinaAIService.processMessage === 'function') {
      await CristinaAIService.processMessage(userId, message, context);
    } else {
      logger.warn('[BullMQ] aiProcessor: CristinaAIService.processMessage not found');
    }
    return;
  }

  if (job.name === 'grok-moderation') {
    const grokService = _safeRequire('../grokService');
    if (!grokService) { logger.warn('[BullMQ] aiProcessor: grokService not found'); return; }
    const { content, context, postId } = job.data;
    if (typeof grokService.moderateContent === 'function') {
      await grokService.moderateContent(content, context, postId);
    } else {
      logger.warn('[BullMQ] aiProcessor: grokService.moderateContent not found');
    }
    return;
  }

  logger.warn(`[BullMQ] aiProcessor: unhandled job name "${job.name}"`);
}

// ─── broadcast-emails processor ───────────────────────────────────────────────
async function broadcastProcessor(job) {
  if (job.name === 'email-broadcast') {
    const { subject, html, audienceFilter, creatorId, batchSize } = job.data;

    const EnhancedBroadcastService = _safeRequire('../enhancedBroadcastService');
    if (EnhancedBroadcastService && typeof EnhancedBroadcastService.sendBroadcast === 'function') {
      await EnhancedBroadcastService.sendBroadcast({ subject, html, audienceFilter, creatorId, batchSize });
      return;
    }

    // Fallback to direct emailservice for simple sends
    const EmailService = _safeRequire('../emailservice');
    if (EmailService && job.data.to) {
      await EmailService.send({ to: job.data.to, subject, html });
      return;
    }

    logger.warn('[BullMQ] broadcastProcessor: no broadcast service available for job', { jobId: job.id });
    return;
  }

  logger.warn(`[BullMQ] broadcastProcessor: unhandled job name "${job.name}"`);
}

// ─── compliance-checks processor ─────────────────────────────────────────────
// AUTO-SUSPENSION DISABLED 2026-08-10 (Santino sign-off required for any suspension).
// All enforcement jobs are no-ops — suspensions are human decisions only.
async function complianceProcessor(job) {
  logger.info(`[BullMQ] complianceProcessor: job "${job.name}" received but enforcement is disabled — skipping`);
}

// ─── media-processing processor ───────────────────────────────────────────────
async function mediaProcessor(job) {
  if (job.name === 'thumbnail') {
    const channelVideoService = _safeRequire('../channelVideoService');
    if (!channelVideoService) { logger.warn('[BullMQ] mediaProcessor: channelVideoService not found'); return; }
    const { videoId, videoPath } = job.data;
    if (typeof channelVideoService.generateThumbnail === 'function') {
      await channelVideoService.generateThumbnail(videoId, videoPath);
    } else {
      logger.warn('[BullMQ] mediaProcessor: channelVideoService.generateThumbnail not found');
    }
    return;
  }

  if (job.name === 'transcode') {
    // Transcoding is tightly coupled to the upload flow — log as not-yet-extractable
    logger.warn('[BullMQ] mediaProcessor: transcode job received but no standalone processor exists — skipping');
    return;
  }

  logger.warn(`[BullMQ] mediaProcessor: unhandled job name "${job.name}"`);
}

// ─── cron-jobs processor ──────────────────────────────────────────────────────
// Each handler is extracted from the cron.js block it replaces.
// All DB/service calls match the original cron.js implementation exactly.
async function cronProcessor(job) {
  const { query: pgQuery, getPool } = require('../../config/postgres');

  switch (job.name) {
    case 'membership-cleanup': {
      const MembershipCleanupService = _safeRequire('../membershipCleanupService');
      if (!MembershipCleanupService) { logger.warn('[BullMQ] membership-cleanup: service not found'); return; }
      const results = await MembershipCleanupService.runFullCleanup();
      logger.info('Membership cleanup completed', results);
      return;
    }

    case 'membership-sync': {
      const MembershipCleanupService = _safeRequire('../membershipCleanupService');
      if (!MembershipCleanupService) { logger.warn('[BullMQ] membership-sync: service not found'); return; }
      const results = await MembershipCleanupService.syncAllMembershipStatuses();
      logger.info('Membership status sync completed', results);
      return;
    }

    case 'payment-cleanup': {
      const PaymentRecoveryService = _safeRequire('../paymentRecoveryService');
      if (!PaymentRecoveryService) { logger.warn('[BullMQ] payment-cleanup: service not found'); return; }
      const results = await PaymentRecoveryService.cleanupAbandonedPayments();
      logger.info('Abandoned payment cleanup completed', results);
      return;
    }

    case 'call-booking-expire': {
      const { expireAbandonedBookings } = _safeRequire('../callCheckoutService') || {};
      if (typeof expireAbandonedBookings !== 'function') { logger.warn('[BullMQ] call-booking-expire: expireAbandonedBookings not found'); return; }
      const results = await expireAbandonedBookings();
      if (results.expired > 0 || results.errors > 0) logger.info('Call booking expiry completed', results);
      return;
    }

    case 'btcpay-reconcile': {
      // BTCPay/Dash retired 2026-07-31. Worker kept in registry so existing BullMQ jobs drain cleanly.
      logger.info('[BullMQ] btcpay-reconcile: BTCPay retired — no-op');
      return;
    }

    case 'nowpayments-reconcile': {
      const PaymentRecoveryService = _safeRequire('../paymentRecoveryService');
      if (!PaymentRecoveryService) { logger.warn('[BullMQ] nowpayments-reconcile: service not found'); return; }
      const results = await PaymentRecoveryService.processStuckNowpaymentsOrders();
      if (results.settled > 0 || results.errors > 0) logger.info('NOWPayments reconciler completed', results);
      return;
    }

    case 'monetization-daily-report': {
      const adAnalytics = _safeRequire('../adAnalyticsService');
      const slackOps = _safeRequire('../slackOpsService');
      if (!adAnalytics || !slackOps) { logger.warn('[BullMQ] monetization-daily-report: dep missing'); return; }
      try {
        const [summary, cohort] = await Promise.all([
          adAnalytics.getDailySummary(24),
          adAnalytics.getConversionCohort(24),
        ]);
        const totalImp = summary.slots.reduce((s, r) => s + Number(r.impressions || 0), 0);
        const totalClicks = summary.slots.reduce((s, r) => s + Number(r.clicks || 0), 0);
        const totalUpgradeShown = summary.slots.reduce((s, r) => s + Number(r.upgrade_shown || 0), 0);
        const totalUpgradeClick = summary.slots.reduce((s, r) => s + Number(r.upgrade_click || 0), 0);
        const ctr = totalImp > 0 ? ((totalClicks / totalImp) * 100).toFixed(2) : '0.00';
        const upgradeCtaCtr = totalUpgradeShown > 0 ? ((totalUpgradeClick / totalUpgradeShown) * 100).toFixed(2) : '0.00';
        const cohortAvgImp = cohort.length > 0
          ? Math.round(cohort.reduce((s, r) => s + Number(r.impressions_prior_30d || 0), 0) / cohort.length)
          : 0;

        const topSlots = summary.slots.slice(0, 5)
          .map(r => `• \`${r.slot_id}\`: ${r.impressions} imp / ${r.clicks} clk`)
          .join('\n') || '(sin actividad)';

        const text = `📊 *Monetización 24h — ${new Date().toISOString().slice(0, 10)}*\n\n`
          + `*Ads*\n`
          + `• Impresiones: ${totalImp.toLocaleString()}\n`
          + `• Clicks: ${totalClicks.toLocaleString()} (CTR ${ctr}%)\n`
          + `• Users únicos con ads: ${summary.uniqueUsersServedAds.toLocaleString()}\n\n`
          + `*Upgrade funnel*\n`
          + `• Upgrade CTA shown: ${totalUpgradeShown}\n`
          + `• Upgrade CTA clicked: ${totalUpgradeClick} (CTR ${upgradeCtaCtr}%)\n\n`
          + `*Subscripciones nuevas (Prime)*\n`
          + `• Nuevas conversiones: ${summary.newPrimeSubs}\n`
          + `• Promedio impresiones vistas antes del upgrade: ${cohortAvgImp}\n\n`
          + `*Top 5 slots por impresiones*\n${topSlots}`;

        // Post directly (bypass wrap to avoid queue loop when queue is us)
        const channel = process.env.SLACK_OPS_ADS_CHANNEL;
        if (channel && process.env.SLACK_BOT_TOKEN) {
          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
            body: JSON.stringify({ channel, text }),
            signal: AbortSignal.timeout(5000),
          }).catch(() => {});
        }
        logger.info('[monetization-daily-report] posted', {
          totalImp, totalClicks, newPrime: summary.newPrimeSubs, cohortSize: cohort.length,
        });
      } catch (err) {
        logger.warn('[monetization-daily-report] failed', { err: err.message });
      }
      return;
    }

    case 'ads-health-check': {
      // In-process health check for /api/ads/config. Silent on OK; posts to
      // #ops-ads-monitor via slackOpsService on any anomaly. Anonymous view
      // (no session) exercises the same code path a public visitor hits.
      const adUnlockService = _safeRequire('../adUnlockService');
      const slackOps = _safeRequire('../slackOpsService');
      if (!adUnlockService || !slackOps) { logger.warn('[BullMQ] ads-health-check: dependency missing'); return; }
      const notify = slackOps._direct_notifyAdsHealthFail || (() => {});
      try {
        const flagOn = await adUnlockService.isFeatureEnabled();
        if (!flagOn) return; // operator disabled ads on purpose — silent
        const expectedSlots = 16;
        const port = process.env.PORT || 3001;
        const url = `http://127.0.0.1:${port}/api/ads/config`;
        let status = 0, body = null;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          status = res.status;
          body = await res.json().catch(() => null);
        } catch (netErr) {
          await notify({ reason: 'exception', detail: `fetch failed: ${netErr.message}` });
          return;
        }
        if (status !== 200) {
          await notify({ reason: 'http_status', httpStatus: status, detail: `Endpoint returned HTTP ${status}` });
          return;
        }
        if (!body || body.ok !== true) {
          await notify({ reason: 'exception', httpStatus: status, detail: 'Response body missing or ok=false' });
          return;
        }
        if (body.showAds !== true) {
          await notify({ reason: 'showAds_off', httpStatus: status, showAds: body.showAds, detail: 'Flag Redis está ON pero endpoint devuelve showAds=false — desync entre config del bot y estado real' });
          return;
        }
        const slotsCount = Object.keys(body.slots || {}).length;
        if (slotsCount < expectedSlots) {
          await notify({ reason: 'slots_short', httpStatus: status, showAds: body.showAds, slotsCount, scriptUrl: body.scriptUrl, detail: `Se esperaban ${expectedSlots} slots, llegaron ${slotsCount}. Chequear env vars EXO_ZONE_* y per-slot kill switches en Redis.` });
          return;
        }
        if (!body.scriptUrl) {
          await notify({ reason: 'script_missing', httpStatus: status, showAds: body.showAds, slotsCount, detail: 'scriptUrl vacío — EXO_AD_PROVIDER_URL no seteado o purgado del env' });
          return;
        }
        // All good — silent
      } catch (err) {
        await notify({ reason: 'exception', detail: `worker threw: ${err.message}` });
      }
      return;
    }

    case 'lifetime100-rescue': {
      try {
        const path = require('path');
        const { runOnce } = require(path.join(__dirname, '../../scripts/rescue-lifetime100-2026-06-26'));
        const result = await runOnce({ maxBatch: 50, verbose: false });
        if (!result.ok) logger.warn('Lifetime100 rescue failed', { error: result.error });
        else if (result.cohortSize > 0) logger.info('Lifetime100 rescue complete', result.stats);
      } catch (err) {
        logger.error('Lifetime100 rescue cron error', { error: err.message });
      }
      return;
    }

    case 'meru-reconcile': {
      // Meru retired 2026-08. Worker kept so existing BullMQ jobs drain cleanly.
      logger.info('[BullMQ] meru-reconcile: Meru retired — no-op');
      return;
    }

    case 'meru-token-reconcile': {
      // Meru retired 2026-08. Worker kept so existing BullMQ jobs drain cleanly.
      logger.info('[BullMQ] meru-token-reconcile: Meru retired — no-op');
      return;
    }

    case 'crystal-pass-sweep': {
      try {
        const CreatorService = require('../creatorService');
        const r = await CreatorService.sweepExpiredCrystalPasses();
        if (r.passesSwept || r.usersSwept) logger.info('Crystal pass sweep', r);
      } catch (err) {
        logger.error('Crystal pass sweep cron error', { error: err.message });
      }
      return;
    }

    case 'crystal-renewal-reminder': {
      try {
        const CreatorService = require('../creatorService');
        const r = await CreatorService.sendCrystalRenewalReminders();
        if (r.sent || r.failed) logger.info('Crystal renewal reminders sent', r);
      } catch (err) {
        logger.error('Crystal renewal reminder cron error', { error: err.message });
      }
      return;
    }

    case 'crystal-services-overdue': {
      try {
        const CrystalSvc = require('../crystalServiceService');
        const r = await CrystalSvc.sweepOverdueCustomContent();
        if (r.overdue || r.alerted) logger.info('Crystal services overdue sweep', r);
      } catch (err) {
        logger.error('Crystal services overdue cron error', { error: err.message });
      }
      return;
    }

    case 'video-leak-detector': {
      const { cache } = require('../../config/redis');
      const BusinessNotificationService = _safeRequire('../businessNotificationService');

      const { rows: suspects } = await pgQuery(`
        WITH per_user_ip AS (
          SELECT vfl.media_url, vfl.user_id, COUNT(DISTINCT vfl.ip_address) AS ips_for_user
          FROM video_fetch_log vfl
          WHERE vfl.fetched_at > NOW() - INTERVAL '60 minutes'
            AND vfl.user_id IS NOT NULL AND vfl.ip_address IS NOT NULL
          GROUP BY vfl.media_url, vfl.user_id
        ),
        url_totals AS (
          SELECT vfl.media_url,
                 COUNT(DISTINCT vfl.user_id) FILTER (WHERE vfl.user_id IS NOT NULL) AS distinct_users,
                 COUNT(DISTINCT vfl.ip_address) FILTER (WHERE vfl.ip_address IS NOT NULL) AS distinct_ips,
                 COUNT(*) AS total_fetches
          FROM video_fetch_log vfl
          WHERE vfl.fetched_at > NOW() - INTERVAL '60 minutes'
          GROUP BY vfl.media_url
        )
        SELECT ut.media_url, ut.distinct_users, ut.distinct_ips, ut.total_fetches,
               COALESCE(MAX(pui.ips_for_user), 0) AS max_ips_per_user,
               CASE WHEN COALESCE(MAX(pui.ips_for_user), 0) >= 4 THEN 'shared_cookie' ELSE 'mass_fetch' END AS signal_type
        FROM url_totals ut
        JOIN social_posts sp ON sp.media_url = ut.media_url
        LEFT JOIN per_user_ip pui ON pui.media_url = ut.media_url
        WHERE (sp.is_exclusive = true OR COALESCE(sp.content_tier, 'free') = 'prime')
          AND sp.is_deleted = false
        GROUP BY ut.media_url, ut.distinct_users, ut.distinct_ips, ut.total_fetches
        HAVING COALESCE(MAX(pui.ips_for_user), 0) >= 4 OR ut.total_fetches >= 100
        ORDER BY max_ips_per_user DESC, total_fetches DESC
        LIMIT 10
      `);
      if (suspects.length === 0) { logger.info('Video leak detector: no suspicious patterns'); return; }
      const fresh = [];
      for (const s of suspects) {
        const got = await cache.acquireLock(`videoLeakAlert:${s.media_url}`, 6 * 3600);
        if (got) fresh.push(s);
      }
      if (fresh.length === 0) return;
      if (BusinessNotificationService) {
        const lines = [
          '🟠 <b>Possible video URL leak detected</b>', '',
          `${fresh.length} exclusive video URL(s) hit a real leak signature in the last hour:`, '',
          ...fresh.map(s => {
            const sig = s.signal_type === 'shared_cookie'
              ? `🔑 same user from ${s.max_ips_per_user} IPs (shared cookie)`
              : `📢 ${s.total_fetches} fetches (URL likely posted publicly)`;
            return `• <code>${s.media_url}</code>\n  ${sig}\n  ${s.distinct_users} users, ${s.distinct_ips} IPs`;
          }),
          '', 'shared_cookie → identify user_id, revoke session, force password reset.',
          'mass_fetch → URL is in the wild; rotate post or take it down.',
        ].join('\n');
        await BusinessNotificationService.send(lines);
      }
      logger.warn('Video leak detector: alert dispatched', { count: fresh.length });
      return;
    }

    case 'channel-video-sweep': {
      const result = await pgQuery(
        `UPDATE channel_videos SET status = 'failed', updated_at = NOW()
         WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '1 hour'
         RETURNING id`
      );
      if (result.rowCount > 0) {
        logger.warn('Channel-videos sweeper: flipped stuck rows to failed', { count: result.rowCount });
      }
      return;
    }

    case 'video-log-cleanup': {
      const result = await pgQuery(`DELETE FROM video_fetch_log WHERE fetched_at < NOW() - INTERVAL '14 days'`);
      logger.info('Video fetch log retention sweep completed', { deleted: result.rowCount });
      return;
    }

    case 'notifications-group-message-prune': {
      // FIX 7 (audit 2026-09-04): drop stale group_message notifications in
      // 10k-row batches so the index lock never held longer than a few ms per
      // pass. Loop until a batch comes back empty.
      let totalDeleted = 0;
      let iterations = 0;
      // Hard cap: never spin forever if the table balloons — 200 iterations
      // = up to 2M rows per nightly run, which is well past any real load.
      const MAX_ITER = 200;
      while (iterations < MAX_ITER) {
        const { rowCount } = await pgQuery(`
          DELETE FROM notifications
           WHERE id IN (
             SELECT id FROM notifications
              WHERE type = 'group_message'
                AND created_at < NOW() - INTERVAL '14 days'
              LIMIT 10000
           )`);
        if (!rowCount) break;
        totalDeleted += rowCount;
        iterations++;
      }
      logger.info('Notifications group_message prune completed', { deleted: totalDeleted, batches: iterations });
      return;
    }

    case 'featured-creator-promo': {
      const svc = _safeRequire('../featuredCreatorPromoService');
      if (!svc) { logger.warn('[BullMQ] featured-creator-promo: service not found'); return; }
      const summary = await svc.runDailyPromo();
      logger.info('Featured creator promo run completed', summary);
      return;
    }

    case 'btcpay-webhook-probe': {
      // BTCPay/Dash retired 2026-07-31. Worker kept so existing BullMQ jobs drain cleanly.
      logger.info('[BullMQ] btcpay-webhook-probe: BTCPay retired — no-op');
      return;
    }

    case 'media-cleanup': {
      const MediaCleanupService = _safeRequire('../mediaCleanupService');
      if (!MediaCleanupService) { logger.warn('[BullMQ] media-cleanup: service not found'); return; }
      await MediaCleanupService.cleanupOldAvatars();
      await MediaCleanupService.cleanupOldPostMedia(90);
      await MediaCleanupService.cleanupOldDmMedia(parseInt(process.env.DM_MEDIA_RETENTION_DAYS, 10) || 30);
      logger.info('Media cleanup completed');
      return;
    }

    case 'creator-eligibility': {
      const CreatorService = _safeRequire('../creatorService');
      if (!CreatorService) { logger.warn('[BullMQ] creator-eligibility: service not found'); return; }
      const results = await CreatorService.runBatchEligibilityCheck();
      logger.info('Creator eligibility check completed', results);
      return;
    }

    case 'creator-sub-expiry': {
      const CreatorService = _safeRequire('../creatorService');
      if (!CreatorService) { logger.warn('[BullMQ] creator-sub-expiry: service not found'); return; }
      const results = await CreatorService.expireCreatorSubscriptions();
      logger.info('Creator subscription expiry completed', results);
      return;
    }

    case 'creator-renewal': {
      const CreatorPayoutService = _safeRequire('../creatorPayoutService');
      if (!CreatorPayoutService) { logger.warn('[BullMQ] creator-renewal: service not found'); return; }
      const results = await CreatorPayoutService.runSubscriptionRenewals();
      logger.info('Creator subscription renewal completed', results);
      return;
    }

    case 'creator-held-refund': {
      const CreatorPayoutService = _safeRequire('../creatorPayoutService');
      if (!CreatorPayoutService) { logger.warn('[BullMQ] creator-held-refund: service not found'); return; }
      const results = await CreatorPayoutService.runHeldSubscriptionRefunds();
      logger.info('Creator held-sub refund sweep completed', results);
      return;
    }

    case 'channel-hangout-renewal': {
      const CreatorPayoutService = _safeRequire('../creatorPayoutService');
      if (!CreatorPayoutService) { logger.warn('[BullMQ] channel-hangout-renewal: service not found'); return; }
      const results = await CreatorPayoutService.runScopedSubscriptionRenewals();
      logger.info('Channel/hangout renewal completed', results);
      return;
    }

    case 'creator-payout-monthly': {
      const CreatorPayoutService = _safeRequire('../creatorPayoutService');
      if (!CreatorPayoutService) { logger.warn('[BullMQ] creator-payout-monthly: service not found'); return; }
      const results = await CreatorPayoutService.runMonthlyPayouts();
      logger.info('Monthly creator payouts completed', results);
      return;
    }

    case 'creator-payout-remind': {
      const CreatorPayoutService = _safeRequire('../creatorPayoutService');
      if (!CreatorPayoutService) { logger.warn('[BullMQ] creator-payout-remind: service not found'); return; }
      const results = await CreatorPayoutService.runPayoutReadinessReminders();
      logger.info('Creator payout readiness reminders completed', results);
      return;
    }

    case 'creator-weekly-proposal': {
      const CreatorPayoutService = _safeRequire('../creatorPayoutService');
      if (!CreatorPayoutService) { logger.warn('[BullMQ] creator-weekly-proposal: service not found'); return; }
      const results = await CreatorPayoutService.runWeeklyPayoutProposals();
      logger.info('Weekly creator payout proposals completed', results);
      return;
    }

    case 'creator-weekly-preview': {
      const CreatorPayoutService = _safeRequire('../creatorPayoutService');
      if (!CreatorPayoutService) { logger.warn('[BullMQ] creator-weekly-preview: service not found'); return; }
      const results = await CreatorPayoutService.runWeeklyPayoutPreview();
      logger.info('Weekly creator payout preview completed', results);
      return;
    }

    case 'creator-weekly-deadline': {
      const CreatorPayoutService = _safeRequire('../creatorPayoutService');
      if (!CreatorPayoutService) { logger.warn('[BullMQ] creator-weekly-deadline: service not found'); return; }
      const results = await CreatorPayoutService.runWeeklyApprovalDeadline();
      logger.info('Weekly creator payout deadline sweep completed', results);
      return;
    }

    case 'reconcile-stuck-payouts': {
      const NowPaymentsPayoutSvc = _safeRequire('../nowpaymentsPayoutService');
      if (!NowPaymentsPayoutSvc) { logger.warn('[BullMQ] reconcile-stuck-payouts: service not found'); return; }
      const count = await NowPaymentsPayoutSvc.reconcileStuckPayouts();
      if (count > 0) logger.warn(`[cron] Reconciled ${count} creators with stuck in_payout earnings`);
      return;
    }

    case 'earnings-maturation': {
      const { rows } = await pgQuery(`
        UPDATE creator_earnings SET status = 'available'
        WHERE status = 'holding' AND available_at <= NOW()
        RETURNING id, creator_id, amount_creator
      `);
      if (rows.length > 0) logger.info('creator earnings matured', { count: rows.length });
      return;
    }

    case 'notification-cleanup': {
      const { rows: oldReadRows } = await pgQuery(
        `DELETE FROM notifications WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '90 days' RETURNING id`
      );
      const { rows: oldCallRows } = await pgQuery(
        `DELETE FROM notifications WHERE type = 'hangout_call' AND created_at < NOW() - INTERVAL '30 days' RETURNING id`
      );
      logger.info('Notification cleanup completed', {
        deletedReadOlderThan90Days: oldReadRows.length,
        deletedHangoutCallsOlderThan30Days: oldCallRows.length,
        totalDeleted: oldReadRows.length + oldCallRows.length,
      });
      return;
    }

    case 'sub-expiry-email': {
      const SubscriptionReminderEmailService = _safeRequire('../subscriptionReminderEmailService');
      if (!SubscriptionReminderEmailService) { logger.warn('[BullMQ] sub-expiry-email: service not found'); return; }
      const results = await SubscriptionReminderEmailService.sendExpiryReminders();
      logger.info('Subscription expiry email reminders sent', results);
      return;
    }

    case 'sub-reengagement': {
      const SubscriptionReminderEmailService = _safeRequire('../subscriptionReminderEmailService');
      if (!SubscriptionReminderEmailService) { logger.warn('[BullMQ] sub-reengagement: service not found'); return; }
      const results = await SubscriptionReminderEmailService.sendReEngagementEmails();
      logger.info('Re-engagement emails sent', results);
      return;
    }

    case 'notification-digest': {
      const NotificationDigestScheduler = _safeRequire('../notificationDigestScheduler');
      if (!NotificationDigestScheduler) { logger.warn('[BullMQ] notification-digest: service not found'); return; }
      await NotificationDigestScheduler.runDigest();
      return;
    }

    case 'cristina-wellness': {
      const CristinaFeedService = _safeRequire('../cristinaFeedService');
      if (!CristinaFeedService) { logger.warn('[BullMQ] cristina-wellness: service not found'); return; }
      await CristinaFeedService.postWellness();
      return;
    }

    case 'cristina-tutorial1':
    case 'cristina-tutorial2': {
      const CristinaFeedService = _safeRequire('../cristinaFeedService');
      if (!CristinaFeedService) { logger.warn('[BullMQ] cristina-tutorial: service not found'); return; }
      await CristinaFeedService.postFeatureTutorial();
      return;
    }

    case 'cristina-promo': {
      const CristinaFeedService = _safeRequire('../cristinaFeedService');
      if (!CristinaFeedService) { logger.warn('[BullMQ] cristina-promo: service not found'); return; }
      await CristinaFeedService.postPrimePromo();
      return;
    }

    case 'recording-expiry': {
      const StreamRecordingService = _safeRequire('../streamRecordingService');
      if (!StreamRecordingService) { logger.warn('[BullMQ] recording-expiry: service not found'); return; }
      await StreamRecordingService.expireOldRecordings(7);
      return;
    }

    case 'live-stream-sweep': {
      const { getRedis } = require('../../config/redis');
      const redis = getRedis();
      const { rows } = await pgQuery(
        `SELECT id, host_id FROM live_streams
          WHERE status = 'live' AND ended_at IS NULL AND started_at < NOW() - INTERVAL '15 minutes'
          LIMIT 50`
      );
      let swept = 0;
      for (const row of rows) {
        if (redis) {
          const locked = await redis.exists(`live:streaming:${row.host_id}`).catch(() => 0);
          if (locked) continue;
        }
        await pgQuery(
          `UPDATE live_streams SET status = 'ended', ended_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND ended_at IS NULL`,
          [row.id]
        );
        swept++;
      }
      if (swept > 0) logger.warn(`[liveStreamSweep] marked ${swept} stuck row(s) as ended`);
      return;
    }

    case 'channel-video-stuck': {
      const { failStuckVideoUploads } = _safeRequire('../channelVideoService') || {};
      if (typeof failStuckVideoUploads !== 'function') { logger.warn('[BullMQ] channel-video-stuck: failStuckVideoUploads not found'); return; }
      const flipped = await failStuckVideoUploads();
      if (flipped > 0) logger.warn('[channelVideos] Flipped stuck processing rows to failed', { count: flipped });
      return;
    }

    case 'channel-post-count-reconcile': {
      const result = await pgQuery(`
        UPDATE creator_channels cc SET post_count = sub.actual
        FROM (
          SELECT channel_id, COUNT(*)::int AS actual
          FROM social_posts WHERE is_deleted = false AND channel_id IS NOT NULL
          GROUP BY channel_id
        ) sub
        WHERE cc.id = sub.channel_id AND cc.post_count IS DISTINCT FROM sub.actual
        RETURNING cc.id
      `);
      if (result.rowCount > 0) logger.info('[channels] post_count reconciled', { fixedChannels: result.rowCount });
      return;
    }

    case 'booking-auto-complete': {
      const PrivateCallBookingService = _safeRequire('../privateCallBookingService');
      const expired = await pgQuery(`
        SELECT b.id, b.credit_id FROM bookings b
        WHERE b.status = 'confirmed'
          AND b.end_time_utc IS NOT NULL
          AND b.end_time_utc < NOW() - INTERVAL '30 minutes'
      `);
      for (const row of expired.rows) {
        try {
          const updated = await pgQuery(
            `UPDATE bookings SET status = 'completed', updated_at = NOW()
             WHERE id = $1 AND status = 'confirmed' RETURNING id`,
            [row.id]
          );
          if (updated.rowCount === 0) continue;
          if (row.credit_id) {
            await pgQuery(
              `UPDATE call_credits SET quantity_used = quantity_used + 1,
               quantity_scheduled = GREATEST(0, quantity_scheduled - 1), updated_at = NOW()
               WHERE id = $1`,
              [row.credit_id]
            );
          }
          if (PrivateCallBookingService && typeof PrivateCallBookingService._onCallCompleted === 'function') {
            PrivateCallBookingService._onCallCompleted(row.id).catch((err) =>
              logger.error('[cron] _onCallCompleted failed', { bookingId: row.id, error: err.message })
            );
          }
        } catch (innerErr) {
          logger.error('[Cron] Auto-complete booking error', { bookingId: row.id, error: innerErr.message });
        }
      }
      if (expired.rows.length > 0) logger.info('[Cron] Auto-completed past-end bookings', { count: expired.rows.length });
      return;
    }

    case 'meru-reservation-cleanup': {
      // Meru retired 2026-08. Worker kept so existing BullMQ jobs drain cleanly.
      logger.info('[BullMQ] meru-reservation-cleanup: Meru retired — no-op');
      return;
    }

    case 'access-logs-retention': {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      let total = 0, deleted;
      do {
        const res = await pgQuery(
          `DELETE FROM user_access_logs WHERE id IN (
             SELECT id FROM user_access_logs WHERE created_at < $1 LIMIT 10000)`,
          [cutoff]
        );
        deleted = res.rowCount || 0;
        total += deleted;
      } while (deleted === 10000);
      if (total > 0) logger.info('[retention] user_access_logs purged', { deleted: total });
      return;
    }

    case 'call-notifications': {
      const { sendPendingNotifications } = _safeRequire('../callNotificationService') || {};
      if (typeof sendPendingNotifications !== 'function') { logger.warn('[BullMQ] call-notifications: function not found'); return; }
      await sendPendingNotifications();
      return;
    }

    case 'call-overdue-end': {
      const PrivateCallBookingService = _safeRequire('../privateCallBookingService');
      if (!PrivateCallBookingService) { logger.warn('[BullMQ] call-overdue-end: service not found'); return; }
      await PrivateCallBookingService.autoEndOverdueCalls();
      return;
    }

    case 'call-no-shows': {
      const PrivateCallBookingService = _safeRequire('../privateCallBookingService');
      if (!PrivateCallBookingService) { logger.warn('[BullMQ] call-no-shows: service not found'); return; }
      await PrivateCallBookingService.checkNoShows();
      return;
    }

    case 'weekly-log-retention': {
      const pool = getPool();
      // Each table stamps its rows with a differently-named timestamp column,
      // so a shared "created_at" hardcode 500'd the video_fetch_log branch.
      for (const [table, tsCol, interval] of [
        ['user_access_logs', 'created_at', '30 days'],
        ['video_fetch_log',  'fetched_at', '90 days'],
      ]) {
        let total = 0;
        try {
          while (true) {
            const r = await pool.query(
              `DELETE FROM ${table} WHERE id IN (
                 SELECT id FROM ${table} WHERE ${tsCol} < NOW() - INTERVAL '${interval}' LIMIT 50000)`
            );
            total += r.rowCount;
            if (r.rowCount === 0) break;
            await new Promise((res) => setTimeout(res, 100));
          }
          if (total > 0) logger.info(`[retention] purged ${table}`, { rows: total, interval });
        } catch (e) {
          logger.error(`[retention] purge failed: ${table}`, { error: e.message });
        }
      }
      return;
    }

    case 'auto-reply-poll': {
      const autoReplyService = _safeRequire('../autoReplyService');
      if (!autoReplyService) { logger.warn('[BullMQ] auto-reply-poll: service not found'); return; }
      await autoReplyService.startAutoReplyPolling();
      return;
    }

    case 'creator-avail-expiry-notify': {
      const { getRedis } = require('../../config/redis');
      const redis = getRedis();
      if (!redis) return;

      const PING_WINDOW_MIN = 600, PING_WINDOW_MAX = 720, DEDUP_TTL = 720;
      const APP_URL = process.env.APP_PUBLIC_URL || 'https://pnptv.app';

      const keys = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', 'user:*:accepting_calls', 'COUNT', '200');
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');
      if (keys.length === 0) return;

      const toNotify = [];
      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl < PING_WINDOW_MIN || ttl > PING_WINDOW_MAX) continue;
        const userId = key.slice('user:'.length, -':accepting_calls'.length);
        const acquired = await redis.set(`avail:webapp_pinged:${userId}`, '1', 'EX', DEDUP_TTL, 'NX');
        if (!acquired) continue;
        toNotify.push(userId);
      }
      if (toNotify.length === 0) return;

      const { rows: creators } = await pgQuery(
        `SELECT id FROM users WHERE id = ANY($1::text[]) AND creator_status = 'active'`,
        [toNotify]
      );
      if (creators.length === 0) return;

      const MESSAGE = 'Your availability window expires in ~10 minutes. Tap to renew.';
      for (const creator of creators) {
        const userId = String(creator.id);
        const windowId = String(Math.floor(Date.now() / (720 * 1000)));
        try {
          await pgQuery(
            `INSERT INTO notifications
               (type, category, priority, actor_id, target_user_id, entity_type, entity_id, message, metadata)
             VALUES ($1, 'system', 'high', NULL, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            ['availability_expiring', userId, 'creator_availability', windowId, MESSAGE,
              JSON.stringify({ url: `${APP_URL}/creators/availability` })]
          );
        } catch (insertErr) {
          logger.warn('[availWebappPing] notification insert failed', { userId, error: insertErr.message });
        }
      }
      logger.info(`[availWebappPing] Sent in-app expiry notification to ${creators.length} creator(s)`);
      return;
    }

    case 'stream-health-monitor': {
      // This job has complex in-memory state (Map + seed flag) that doesn't survive
      // worker restarts. Keep it in cron.js. Log and skip.
      logger.debug('[BullMQ] stream-health-monitor: stateful job — remains in cron.js');
      return;
    }

    case 'slack-avail-poll': {
      const token = process.env.SLACK_BOT_TOKEN;
      if (!token) return;
      const { getRedis } = require('../../config/redis');
      const redis = getRedis();
      if (!redis) return;

      const { rows: performers } = await pgQuery(
        `SELECT u.id, u.slack_member_id FROM users u
         WHERE u.slack_member_id IS NOT NULL AND u.creator_status = 'active'`
      );
      if (performers.length === 0) return;

      const SLACK_API = 'https://slack.com/api';
      const headers = { Authorization: `Bearer ${token}` };
      // Slack status = source of truth. Presence must be active AND status must match
      // one of the "available" markers below. Anything else → creator NOT accepting calls.
      // TTL 900s (15min) > 5min poll cadence, so an available creator stays available
      // between polls without gaps. Clearing status in Slack → key deleted next poll.
      const AVAIL_TTL_SECONDS = 900;
      for (const perf of performers) {
        const redisKey = `user:${perf.id}:accepting_calls`;
        try {
          const presRes = await fetch(`${SLACK_API}/users.getPresence?user=${encodeURIComponent(perf.slack_member_id)}`, { headers });
          const presData = await presRes.json().catch(() => ({}));
          if (!presData.ok || presData.presence !== 'active') {
            await redis.del(redisKey);
            continue;
          }

          const profRes = await fetch(`${SLACK_API}/users.profile.get?user=${encodeURIComponent(perf.slack_member_id)}`, { headers });
          const profData = await profRes.json().catch(() => ({}));
          const statusEmoji = profData.profile?.status_emoji || '';
          const statusText = (profData.profile?.status_text || '').toLowerCase();
          const slackSaysAvailable = statusEmoji === ':large_green_circle:' ||
            statusText.includes('available') || statusText.includes('disponible');
          if (!slackSaysAvailable) {
            await redis.del(redisKey);
            continue;
          }

          // SET (not SET NX): always refresh so status changes propagate within one poll cycle.
          await redis.set(redisKey, '1', 'EX', AVAIL_TTL_SECONDS);
        } catch (_) {}
      }
      return;
    }

    case 'crypto-expire': {
      const CryptoPaymentService = _safeRequire('../cryptoPaymentService');
      if (!CryptoPaymentService) { logger.warn('[BullMQ] crypto-expire: service not found'); return; }
      await CryptoPaymentService.expireStale();
      return;
    }

    case 'crypto-alert-stuck': {
      const CryptoPaymentService = _safeRequire('../cryptoPaymentService');
      if (!CryptoPaymentService) { logger.warn('[BullMQ] crypto-alert-stuck: service not found'); return; }
      await CryptoPaymentService.alertStuck();
      return;
    }

    case 'crypto-reconcile-grant-failed': {
      const CryptoPaymentService = _safeRequire('../cryptoPaymentService');
      if (!CryptoPaymentService) { logger.warn('[BullMQ] crypto-reconcile-grant-failed: service not found'); return; }
      await CryptoPaymentService.reconcileGrantFailed();
      return;
    }

    case 'channel-pass-expiry-sweep': {
      // ── Step 1: expire overdue rows inside a single transaction ──────────────
      const pool = getPool();
      const client = await pool.connect();
      let expiredSubs = [];
      let expiredEnts = [];
      try {
        await client.query('BEGIN');

        const subsResult = await client.query(`
          UPDATE creator_subscriptions
             SET status = 'expired', updated_at = NOW()
           WHERE status = 'active'
             AND expires_at IS NOT NULL
             AND expires_at < NOW()
          RETURNING id, creator_id, subscriber_id
        `);
        expiredSubs = subsResult.rows;

        const entsResult = await client.query(`
          UPDATE user_entitlements
             SET is_consumed = TRUE, updated_at = NOW()
           WHERE add_on_id = 'creator-subscription'
             AND is_consumed = FALSE
             AND expires_at IS NOT NULL
             AND expires_at < NOW()
          RETURNING user_id, creator_id
        `);
        expiredEnts = entsResult.rows;

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        logger.error('[channel-pass-expiry-sweep] Transaction failed', { error: txErr.message });
        client.release();
        throw txErr; // let BullMQ retry
      }
      client.release();

      logger.info({ expired_subs: expiredSubs.length, expired_ents: expiredEnts.length }, 'channel-pass-expiry-sweep');

      // ── Step 2: invalidate Redis entitlement cache for expired subscribers ───
      try {
        const { cache } = require('../../config/redis');
        for (const sub of expiredSubs) {
          const key = `channel_pass:${sub.subscriber_id}:${sub.creator_id}`;
          cache.del(key).catch(() => {});
        }
      } catch (redisErr) {
        logger.warn('[channel-pass-expiry-sweep] Redis cache invalidation error', { error: redisErr.message });
      }

      // ── Step 3: 3-day expiry warning pushes ──────────────────────────────────
      try {
        const { rows: expiringSoon } = await pgQuery(`
          SELECT cs.id AS sub_id,
                 cs.subscriber_id,
                 cs.creator_id,
                 cs.expires_at,
                 u.username AS creator_username
            FROM creator_subscriptions cs
            JOIN users u ON u.id = cs.creator_id
           WHERE cs.status = 'active'
             AND cs.expires_at IS NOT NULL
             AND cs.expires_at >= NOW() + INTERVAL '2 days'
             AND cs.expires_at <  NOW() + INTERVAL '3 days'
        `);

        if (expiringSoon.length > 0) {
          const { getRedis } = require('../../config/redis');
          const redis = getRedis();
          const PushNotificationService = _safeRequire('../pushNotificationService');
          const APP_URL = process.env.APP_PUBLIC_URL || 'https://pnptv.app';
          // Date-scoped dedup key so the warning fires once per calendar day even
          // if the job is retried. TTL is 25h to bridge the next 03:00 UTC run.
          const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
          const DEDUP_TTL = 25 * 3600;

          for (const row of expiringSoon) {
            try {
              const dedupKey = `channel_pass_expiry_warn:${row.sub_id}:${today}`;
              const acquired = redis
                ? await redis.set(dedupKey, '1', 'EX', DEDUP_TTL, 'NX').catch(() => null)
                : null;
              // If NX returned null another process (or today's earlier run) already sent it
              if (acquired === null && redis) continue;

              if (PushNotificationService) {
                const creatorHandle = row.creator_username ? `@${row.creator_username}` : 'your creator';
                await PushNotificationService.sendToUser(String(row.subscriber_id), {
                  title: 'Channel Pass expiring soon',
                  body: `Your Channel Pass for ${creatorHandle} expires in 3 days. Renew now to keep exclusive access.`,
                  url: `${APP_URL}/my-subscriptions`,
                  tag: `channel-pass-expiry-${row.sub_id}`,
                });
              }
            } catch (rowErr) {
              logger.warn('[channel-pass-expiry-sweep] Warning push failed for sub', {
                subId: row.sub_id, error: rowErr.message,
              });
            }
          }

          logger.info('[channel-pass-expiry-sweep] 3-day warning pushes dispatched', {
            candidates: expiringSoon.length,
          });
        }
      } catch (warnErr) {
        // Non-fatal: expiry writes already committed; push failures must not cause a retry
        logger.warn('[channel-pass-expiry-sweep] 3-day warning sweep error', { error: warnErr.message });
      }

      return;
    }

    default:
      logger.warn(`[BullMQ] cronProcessor: unhandled job name "${job.name}"`);
  }
}

// ─── DLQ alert helper ─────────────────────────────────────────────────────────
function _attachDlqAlert(worker) {
  worker.on('failed', (job, err) => {
    // Only alert when the job has exhausted all attempts
    if (job && job.attemptsMade < (job.opts?.attempts || 3)) return;
    logger.error(`[BullMQ] Job failed permanently`, {
      queue: job?.queueName, name: job?.name, id: job?.id,
      attempts: job?.attemptsMade, error: err?.message,
    });
    try {
      const bns = require('../businessNotificationService');
      bns.send(
        `🔴 BullMQ DLQ: \`${job?.queueName}/${job?.name}\` (id: ${job?.id}) failed after ${job?.attemptsMade} attempts: ${err?.message?.slice(0, 200)}`
      ).catch(() => {});
    } catch (_) {}
  });
  worker.on('error', (err) =>
    logger.error('[BullMQ] Worker error', { error: err?.message })
  );
  return worker;
}

// ─── startAllWorkers ──────────────────────────────────────────────────────────
async function startAllWorkers() {
  const BULL_PREFIX = 'pnpapp:bull';

  _workers = [
    new Worker('payment-fulfillment', paymentProcessor,  { connection: makeBullConnection(), prefix: BULL_PREFIX, concurrency: 1 }),
    new Worker('notifications',       notificationsProcessor, { connection: makeBullConnection(), prefix: BULL_PREFIX, concurrency: 5 }),
    new Worker('ai-tasks',            aiProcessor,        { connection: makeBullConnection(), prefix: BULL_PREFIX, concurrency: 2 }),
    new Worker('broadcast-emails',    broadcastProcessor, { connection: makeBullConnection(), prefix: BULL_PREFIX, concurrency: 1 }),
    new Worker('compliance-checks',   complianceProcessor,{ connection: makeBullConnection(), prefix: BULL_PREFIX, concurrency: 1 }),
    new Worker('media-processing',    mediaProcessor,     { connection: makeBullConnection(), prefix: BULL_PREFIX, concurrency: 2 }),
    new Worker('cron-jobs',           cronProcessor,      {
      connection: makeBullConnection(), prefix: BULL_PREFIX, concurrency: 1,
      stalledInterval: 30000, maxStalledCount: 1,
    }),
  ];

  for (const worker of _workers) {
    _attachDlqAlert(worker);
  }

  logger.info('[BullMQ] All workers started');
}

// ─── stopAllWorkers ───────────────────────────────────────────────────────────
async function stopAllWorkers() {
  await Promise.allSettled(_workers.map((w) => w.close()));
  _workers = [];
  logger.info('[BullMQ] All workers stopped');
}

module.exports = { startAllWorkers, stopAllWorkers };
