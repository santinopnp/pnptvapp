require('dotenv').config({ allowEmptyValues: true });
const path = require('path');
const cron = require('node-cron');

// Use absolute paths based on script location
const basePath = __dirname;
const backendPath = path.join(basePath, '..');

const { initializeRedis } = require(path.join(backendPath, 'config/redis'));
const { initializePostgres } = require(path.join(backendPath, 'config/postgres'));
const UserService = require(path.join(backendPath, 'services/userService'));
const MembershipCleanupService = require(path.join(backendPath, 'services/membershipCleanupService'));
const TutorialReminderService = require(path.join(backendPath, 'services/tutorialReminderService'));
const CultEventService = require(path.join(backendPath, 'services/cultEventService'));
const logger = require(path.join(backendPath, 'utils/logger'));
const PaymentRecoveryService = require(path.join(backendPath, 'services/paymentRecoveryService'));
const { expireAbandonedBookings } = require(path.join(backendPath, 'services/callCheckoutService'));
const MediaCleanupService = require(path.join(backendPath, 'services/mediaCleanupService'));
const CreatorService = require(path.join(backendPath, 'services/creatorService'));
const CreatorPayoutService = require(path.join(backendPath, 'services/creatorPayoutService'));
const SubscriptionReminderEmailService = require(path.join(backendPath, 'services/subscriptionReminderEmailService'));
const TelegramSubscriptionReminderService = require(path.join(backendPath, 'services/subscriptionReminderService'));
const NotificationDigestScheduler = require(path.join(backendPath, 'services/notificationDigestScheduler'));
const AppUserService = require(path.join(backendPath, 'services/userService'));
const CristinaFeedService = require(path.join(backendPath, 'services/cristinaFeedService'));
const StreamRecordingService = require(path.join(backendPath, 'services/streamRecordingService'));
const { failStuckVideoUploads } = require(path.join(backendPath, 'services/channelVideoService'));
const { sendPendingNotifications, reconcileReminders } = require(path.join(backendPath, 'services/callNotificationService'));
const PrivateCallBookingService = require(path.join(backendPath, 'services/privateCallBookingService'));
const autoReplyService = require(path.join(backendPath, 'services/autoReplyService'));

/**
 * Initialize and start cron jobs
 *
 * Wave 5 (BullMQ migration): Most jobs below are now also registered as BullMQ
 * repeatable jobs in services/queueService.js and executed by services/workers/index.js.
 * During the transition period both paths run in parallel (safe — all jobs are idempotent).
 * Once BullMQ is confirmed stable, the cron.schedule() blocks below will be removed.
 *
 * Jobs migrated to BullMQ (cron-jobs + compliance-checks queues):
 *   membership-cleanup, membership-sync, payment-cleanup, call-booking-expire,
 *   btcpay-reconcile, nowpayments-reconcile, lifetime100-rescue, meru-reconcile,
 *   meru-token-reconcile, video-leak-detector, channel-video-sweep, video-log-cleanup,
 *   btcpay-webhook-probe, performer-eligibility, media-cleanup, creator-eligibility,
 *   creator-sub-expiry, creator-renewal, channel-hangout-renewal, creator-payout-monthly,
 *   creator-payout-remind, creator-weekly-proposal, creator-weekly-deadline,
 *   reconcile-stuck-payouts, earnings-maturation, notification-cleanup, sub-expiry-email,
 *   sub-reengagement, notification-digest, cristina-wellness, cristina-tutorial1/2,
 *   cristina-promo, recording-expiry, live-stream-sweep, channel-video-stuck,
 *   channel-post-count-reconcile, booking-auto-complete, meru-reservation-cleanup,
 *   access-logs-retention, call-notifications, call-overdue-end, call-no-shows,
 *   weekly-log-retention, auto-reply-poll, creator-avail-expiry-notify,
 *   slack-avail-poll, 2257-enforcement, content-compliance-enforce
 *
 * NOT migrated (stateful — must stay here):
 *   stream-health-monitor (uses in-memory Map + seed flag that doesn't survive restarts)
 */
const startCronJobs = async (bot = null) => {
  try {
    logger.info('Initializing cron jobs...');

    // Initialize dependencies
    initializeRedis();
    await initializePostgres();

    // H-06: Re-schedule in-memory call reminders for all confirmed future bookings.
    // Must run after DB is ready so setTimeout-based reminders lost during container
    // restart are restored immediately on startup.
    reconcileReminders().catch((err) =>
      logger.error('[cron] reconcileReminders startup failed', { error: err.message })
    );

    // M-13: Reconcile call sessions that completed while the container was down.
    // Flips 'scheduled' sessions that are 15+ min past their end time to 'completed'
    // and fires the post-call hook for each so earnings and survey prompts are sent.
    (async () => {
      try {
        const { query: pgQueryStartup } = require(path.join(backendPath, 'config/postgres'));
        const { rows: staleSessions } = await pgQueryStartup(`
          UPDATE call_sessions
          SET status = 'completed', ended_at = NOW()
          WHERE status = 'scheduled'
            AND booking_id IN (
              SELECT id FROM bookings
              WHERE end_time_utc < NOW() - INTERVAL '15 minutes'
            )
          RETURNING booking_id
        `);
        if (staleSessions.length > 0) {
          logger.info('[cron] reconciled stale call sessions on startup', { count: staleSessions.length });
          for (const row of staleSessions) {
            PrivateCallBookingService._onCallCompleted(row.booking_id).catch((err) =>
              logger.warn('[cron] startup _onCallCompleted failed', { bookingId: row.booking_id, error: err.message })
            );
          }
        }
      } catch (err) {
        logger.warn('[cron] startup session reconciliation failed', { error: err.message });
      }
    })();

    // MembershipCleanupService is initialized in bot.js before startCronJobs is called.
    // TutorialReminderService — DISABLED (spam prevention per admin request)

    // TelegramSubscriptionReminderService — DISABLED (spam prevention per admin request)

    // Daimo payment recovery — DISABLED (Daimo retired, all checkout surfaces
    // moved to Dash/BTCPay). Webhook handler at /api/webhooks/daimo stays
    // wired so any straggler settlement still credits the user, but the
    // 5-min polling loop is gone. Zero pending Daimo rows existed at cutover
    // (verified via DB query). To re-enable temporarily during incident
    // response, uncomment and set DAIMO_RECOVERY_CRON in env.

    // ePayco payment recovery cron REMOVED 2026-07-17. ePayco was retired
    // 2026-06-27; processStuckPayments filters `WHERE provider = 'epayco'`
    // and always returned `checked: 0`, burning a Redis lock every 15 min
    // for zero work. Live NP/BTCPay recovery runs in reconcileNowPayments +
    // reconcileBtcpayInvoices below.

    // Abandoned payment cleanup - every 2 hours
    // Step 0: expire no-card-entry ePayco rows at 2h mark (fast cleanup for bounced sessions)
    // Step 1: mark all remaining pending ePayco rows > 24h as abandoned (3DS timeout)
    cron.schedule(process.env.PAYMENT_CLEANUP_CRON || '0 */2 * * *', async () => {
      try {
        logger.info('Running abandoned payment cleanup...');
        const results = await PaymentRecoveryService.cleanupAbandonedPayments();
        logger.info('Abandoned payment cleanup completed', {
          cleaned: results.cleaned,
          errors: results.errors,
        });
      } catch (error) {
        logger.error('Error in abandoned payment cleanup cron:', error);
      }
    });

    // Private call booking expiry — every hour at :30
    // Expires bookings stuck in 'awaiting_payment' for > 2 hours (ePayco/BTCPay
    // checkouts the user abandoned without paying). Frees the calendar slot and
    // marks the payment 'abandoned' so recovery crons skip it.
    cron.schedule(process.env.CALL_BOOKING_EXPIRE_CRON || '30 * * * *', async () => {
      try {
        const results = await expireAbandonedBookings();
        if (results.expired > 0 || results.errors > 0) {
          logger.info('Call booking expiry completed', results);
        }
      } catch (error) {
        logger.error('Error in call booking expiry cron:', error);
      }
    });

    // Wallet-checkout renewal reminders — daily at 15:00 UTC (10am ET / 7am PT).
    // Web-pushes wallet-linked pnp-members whose entitlements expire in ≤3 days
    // with a 1-click renew link. Dedupes per-entitlement per-day so cron can
    // safely re-fire on process restart. See subscriptionReminderService.
    cron.schedule(process.env.WALLET_RENEWAL_REMINDER_CRON || '0 15 * * *', async () => {
      try {
        const results = await TelegramSubscriptionReminderService.fireWalletRenewalReminders();
        if (results.picked > 0 || results.error) {
          logger.info('Wallet renewal reminders cycle done', results);
        }
      } catch (error) {
        logger.error('Error in wallet renewal reminders cron:', error);
      }
    });

    // Dash/BTCPay reconciliation — RETIRED 2026-07-31 (BTCPay removed)
    // cron.schedule kept as comment so schedule slot is not accidentally reused.

    // NOWPayments reconciler — polls NP API for stuck pending/confirming orders
    // Extracts payment_id from the notes column (written on confirming/sending transitions)
    // and calls the NP API directly to check if the payment reached 'finished'.
    cron.schedule(process.env.NOWPAYMENTS_RECONCILE_CRON || '*/15 * * * *', async () => {
      try {
        const results = await PaymentRecoveryService.processStuckNowpaymentsOrders();
        if (results.settled > 0 || results.errors > 0) {
          logger.info('NOWPayments reconciler completed', results);
        }
      } catch (err) {
        logger.error('NOWPayments reconciler cron failed', { error: err.message });
      }
    });

    // Lifetime100 abandoned-cart rescue dispatcher — runs at 7/22/37/52 of each
    // hour so the NowPayments + BTCPay reconcilers (above) have had a chance to
    // mark stale waiting invoices as expired first. Sends a Santino DM with a
    // fresh $95 NowPayments invoice + Banxa walkthrough to users whose lifetime100
    // checkout expired and who don't already hold a pnp-member/prime entitlement.
    // Self-skips users rescued in the last 30 days (cooldown via metadata.source).
    cron.schedule(process.env.LIFETIME100_RESCUE_CRON || '7,22,37,52 * * * *', async () => {
      try {
        const { runOnce: runLifetime100Rescue } = require('./rescue-lifetime100-2026-06-26');
        const result = await runLifetime100Rescue({ maxBatch: 50, verbose: false });
        if (!result.ok) {
          logger.warn('Lifetime100 rescue: failed', { error: result.error });
        } else if (result.cohortSize > 0) {
          logger.info('Lifetime100 rescue: dispatch complete', {
            cohortSize: result.cohortSize,
            tgSent: result.stats.tgSent,
            emailSent: result.stats.emailSent,
            invoiceFail: result.stats.invoiceFail,
          });
        }
      } catch (err) {
        logger.error('Lifetime100 rescue cron failed', { error: err.message });
      }
    });

    // Meru reconciliation — RETIRED 2026-08 (Meru removed)
    // cron.schedule kept as comment so schedule slots are not accidentally reused.

    // Video leak detector — every hour at :17
    // Scans video_fetch_log over the last 60 min for two real leak signatures:
    //   A) Same user_id from 4+ distinct IPs (shared cookie / handed creds to friends)
    //   B) 100+ total fetches on a single URL (URL posted publicly, hotlinked)
    //
    // The previous thresholds ("3+ distinct users" / "5+ distinct IPs") fired
    // on every popular new PRIME post — 3 paying subscribers from 3 countries
    // is product-market fit, not a leak. The new signals look for the actual
    // misuse pattern instead of healthy organic traffic.
    cron.schedule(process.env.VIDEO_LEAK_DETECTOR_CRON || '17 * * * *', async () => {
      try {
        const { query } = require(path.join(backendPath, 'config/postgres'));
        const { rows: suspects } = await query(`
          WITH per_user_ip AS (
            SELECT vfl.media_url,
                   vfl.user_id,
                   COUNT(DISTINCT vfl.ip_address) AS ips_for_user
            FROM video_fetch_log vfl
            WHERE vfl.fetched_at > NOW() - INTERVAL '60 minutes'
              AND vfl.user_id IS NOT NULL
              AND vfl.ip_address IS NOT NULL
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
          SELECT ut.media_url,
                 ut.distinct_users,
                 ut.distinct_ips,
                 ut.total_fetches,
                 COALESCE(MAX(pui.ips_for_user), 0) AS max_ips_per_user,
                 CASE
                   WHEN COALESCE(MAX(pui.ips_for_user), 0) >= 4 THEN 'shared_cookie'
                   ELSE 'mass_fetch'
                 END AS signal_type
          FROM url_totals ut
          JOIN social_posts sp ON sp.media_url = ut.media_url
          LEFT JOIN per_user_ip pui ON pui.media_url = ut.media_url
          WHERE (sp.is_exclusive = true OR COALESCE(sp.content_tier, 'free') = 'prime')
            AND sp.is_deleted = false
          GROUP BY ut.media_url, ut.distinct_users, ut.distinct_ips, ut.total_fetches
          HAVING COALESCE(MAX(pui.ips_for_user), 0) >= 4
              OR ut.total_fetches >= 100
          ORDER BY max_ips_per_user DESC, total_fetches DESC
          LIMIT 10
        `);

        if (suspects.length === 0) {
          logger.info('Video leak detector: no suspicious patterns in the last hour');
          return;
        }

        // Throttle alerts to one per 6h per URL via Redis.
        const { cache } = require(path.join(backendPath, 'config/redis'));
        const fresh = [];
        for (const s of suspects) {
          const tk = `videoLeakAlert:${s.media_url}`;
          const got = await cache.acquireLock(tk, 6 * 3600);
          if (got) fresh.push(s);
        }
        if (fresh.length === 0) return;

        const BusinessNotificationService = require(path.join(backendPath, 'services/businessNotificationService'));
        const lines = [
          '🟠 <b>Possible video URL leak detected</b>',
          '',
          `${fresh.length} exclusive video URL(s) hit a real leak signature in the last hour:`,
          '',
          ...fresh.map(s => {
            const sig = s.signal_type === 'shared_cookie'
              ? `🔑 same user from ${s.max_ips_per_user} IPs (shared cookie)`
              : `📢 ${s.total_fetches} fetches (URL likely posted publicly)`;
            return `• <code>${s.media_url}</code>\n  ${sig}\n  ${s.distinct_users} users, ${s.distinct_ips} IPs, ${s.total_fetches} fetches`;
          }),
          '',
          'shared_cookie → identify the user_id, revoke their session, force password reset.',
          'mass_fetch → URL is in the wild; rotate the post or take it down.',
        ].join('\n');
        await BusinessNotificationService.send(lines);
        logger.warn('Video leak detector: alert dispatched', { count: fresh.length });
      } catch (error) {
        logger.error('Error in video leak detector cron:', error);
      }
    });

    // Channel-videos stuck-processing sweeper — hourly at :47
    // Upload pipeline (ffmpeg GIF + Directus upload) sometimes hangs after a bot
    // crash mid-flight, leaving rows in 'processing' forever. Anything older than
    // 1h is definitively stuck.
    cron.schedule(process.env.CHANNEL_VIDEO_SWEEP_CRON || '47 * * * *', async () => {
      try {
        const { query } = require(path.join(backendPath, 'config/postgres'));
        const result = await query(
          `UPDATE channel_videos
             SET status = 'failed', updated_at = NOW()
           WHERE status = 'processing'
             AND updated_at < NOW() - INTERVAL '1 hour'
           RETURNING id`
        );
        if (result.rowCount > 0) {
          logger.warn('Channel-videos sweeper: flipped stuck rows to failed', {
            count: result.rowCount, ids: result.rows.map(r => r.id),
          });
        }
      } catch (error) {
        logger.error('Error in channel-videos sweeper cron:', error);
      }
    });

    // Video fetch log retention — daily at 03:13 UTC
    cron.schedule(process.env.VIDEO_LOG_CLEANUP_CRON || '13 3 * * *', async () => {
      try {
        const { query } = require(path.join(backendPath, 'config/postgres'));
        const result = await query(
          `DELETE FROM video_fetch_log WHERE fetched_at < NOW() - INTERVAL '14 days'`
        );
        logger.info('Video fetch log retention sweep completed', { deleted: result.rowCount });
      } catch (error) {
        logger.error('Error in video log cleanup cron:', error);
      }
    });

    // BTCPay webhook probe — RETIRED 2026-07-31 (BTCPay removed)
    // cron.schedule kept as comment so schedule slot is not accidentally reused.

    // Full membership cleanup daily at midnight
    // Updates statuses (active/churned/free) and kicks expired users from PRIME channel
    cron.schedule(process.env.MEMBERSHIP_CLEANUP_CRON || '0 0 * * *', async () => {
      try {
        logger.info('Running daily membership cleanup...');
        const results = await MembershipCleanupService.runFullCleanup();
        logger.info('Membership cleanup completed', {
          statusUpdates: results.statusUpdates,
          channelKicks: results.channelKicks
        });
      } catch (error) {
        logger.error('Error in membership cleanup cron:', error);
      }
    });

    // Comprehensive membership status sync - runs twice daily (6 AM and 6 PM UTC)
    // Ensures all users have correct status/tier based on plan_expiry
    cron.schedule(process.env.MEMBERSHIP_SYNC_CRON || '0 6,18 * * *', async () => {
      try {
        logger.info('Running membership status sync (twice daily)...');
        const results = await MembershipCleanupService.syncAllMembershipStatuses();
        logger.info('Membership status sync completed', {
          toActive: results.toActive,
          toChurned: results.toChurned,
          toFree: results.toFree,
          errors: results.errors
        });
      } catch (error) {
        logger.error('Error in membership sync cron:', error);
      }
    });

    // Performer eligibility enforcement — daily at 7 AM UTC
    // Revokes creator role from performers who no longer have a profile photo
    // or whose activity score drops below the top 10% threshold.
    cron.schedule('0 7 * * *', async () => {
      try {
        logger.info('Running performer eligibility enforcement...');
        const results = await AppUserService.enforcePerformerEligibility();
        logger.info('Performer eligibility enforcement completed', {
          revoked: results.revoked.length,
          kept: results.kept.length,
          threshold: results.threshold,
          revokedUsers: results.revoked.map(r => r.username),
        });
      } catch (error) {
        logger.error('Error in performer eligibility cron:', error);
      }
    });

    // Subscription expiry check removed — MembershipCleanupService handles this at 03:00 UTC.

    // Media cleanup - daily at 3 AM UTC
    // Deletes old avatars, orphaned post media, and stale DM media files.
    cron.schedule(process.env.MEDIA_CLEANUP_CRON || '0 3 * * *', async () => {
      try {
        logger.info('Running media cleanup job...');
        await MediaCleanupService.cleanupOldAvatars();
        await MediaCleanupService.cleanupOldPostMedia(90); // Keep posts 90 days
        await MediaCleanupService.cleanupOldDmMedia(parseInt(process.env.DM_MEDIA_RETENTION_DAYS, 10) || 30);
        logger.info('Media cleanup completed');
      } catch (error) {
        logger.error('Error in media cleanup cron:', error);
      }
    });

    // NOTE: Tutorial reminders are handled by TutorialReminderService.startScheduling() in bot.js
    // Do NOT duplicate them here to avoid exceeding the 6 messages/day rate limit
    // The service alternates between health tips and PRIME feature tutorials every 4 hours

    // Cult event reminders (daily)
    if (bot) {
      cron.schedule(process.env.CULT_EVENT_REMINDERS_CRON || '0 15 * * *', async () => {
        try {
          logger.info('Running cult event reminders...');
          await CultEventService.processReminders(bot);
        } catch (error) {
          logger.error('Error in cult event reminders cron:', error);
        }
      });
    }

    // NOTE: The recurring-payments cron schedules (VisaCybersourceService.processDuePayments)
    // were removed with the rest of the visaCybersource cleanup. The service never
    // worked in production — config/payment.config.js did not exist so the axios
    // endpoint was always `undefined/...`. Real recurring renewals happen via the
    // ePayco / Daimo / BTCPay webhook paths which call grantEntitlementsForPlan
    // with the payment row's metadata.

    // Creator eligibility batch check - daily at 03:10 UTC (staggered from media cleanup at 03:00)
    cron.schedule('10 3 * * *', async () => {
      try {
        logger.info('Running creator eligibility batch check...');
        const results = await CreatorService.runBatchEligibilityCheck();
        logger.info('Creator eligibility check completed', results);
      } catch (error) {
        logger.error('Error in creator eligibility cron:', error);
      }
    });

    // Creator subscription expiry - every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      try {
        logger.info('Running creator subscription expiry check...');
        const results = await CreatorService.expireCreatorSubscriptions();
        logger.info('Creator subscription expiry completed', results);
      } catch (error) {
        logger.error('Error in creator subscription expiry cron:', error);
      }
    });

    // ── Creator Subscription Renewals — daily at 09:00 UTC ──────────────────
    // Finds active subscriptions expiring within 3 days with auto_renew=true.
    // Creates a Daimo checkout session per subscriber; extends expires_at by 30 days
    // and records earnings on session creation. Cancels subscription on failure.
    cron.schedule(process.env.CREATOR_RENEWAL_CRON || '0 9 * * *', async () => {
      try {
        logger.info('Running creator subscription renewal...');
        const results = await CreatorPayoutService.runSubscriptionRenewals();
        logger.info('Creator subscription renewal completed', results);
      } catch (error) {
        logger.error('Error in creator subscription renewal cron:', error);
      }
    });

    // ── Channel/Hangout Subscription Renewals — daily at 09:15 UTC ──────────
    // Mirrors the creator renewal pattern for channel-access and hangout-access
    // entitlements. Creates a Dash invoice 3 days before expiry and notifies
    // the subscriber. expires_at extends only when BTCPay webhook confirms payment.
    // Runs 15 min after creator renewal to spread DB load.
    cron.schedule(process.env.CHANNEL_HANGOUT_RENEWAL_CRON || '15 9 * * *', async () => {
      try {
        logger.info('Running channel/hangout scoped subscription renewal...');
        const results = await CreatorPayoutService.runScopedSubscriptionRenewals();
        logger.info('Channel/hangout renewal completed', results);
      } catch (error) {
        logger.error('Error in channel/hangout renewal cron:', error);
      }
    });

    // ── Creator Monthly Payouts — 1st of month at 00:00 UTC ─────────────────
    // Groups all `available` creator_earnings by creator, creates ONE BTCPay
    // Pull Payment in Dash per creator (creator claims via emailed link).
    // Falls back to fiat off-ramp via Peer Protocol when payout_method='fiat'.
    // Skips creators with no Dash address + no fiat method (notifies them).
    // Minimum threshold: $1.00. Earnings below threshold roll over automatically.
    cron.schedule(process.env.CREATOR_PAYOUT_CRON || '0 0 1 * *', async () => {
      try {
        logger.info('Running monthly creator payouts...');
        const results = await CreatorPayoutService.runMonthlyPayouts();
        logger.info('Monthly creator payouts completed', results);
      } catch (error) {
        logger.error('Error in monthly creator payout cron:', error);
      }
    });

    // ── Creator payout readiness reminder — 28th of month at 18:00 UTC ─────────
    // Notifies creators who have available earnings but no Dash address or fiat
    // method that the 1st-of-month payout batch runs in ~3 days, giving them time
    // to add a payout method before they get skipped.
    cron.schedule(process.env.CREATOR_PAYOUT_REMIND_CRON || '0 18 28 * *', async () => {
      try {
        logger.info('Running creator payout readiness reminders...');
        const results = await CreatorPayoutService.runPayoutReadinessReminders();
        logger.info('Creator payout readiness reminders completed', results);
      } catch (error) {
        logger.error('Error in creator payout readiness reminder cron:', error);
      }
    });

    // ── Weekly payout proposal — Mondays 09:00 America/Bogota ─────────────
    // Snapshots each creator's available earnings + preferred method, sends
    // email + Telegram DM asking them to approve before the 16:00 deadline.
    cron.schedule(process.env.CREATOR_WEEKLY_PROPOSAL_CRON || '0 9 * * 1', async () => {
      try {
        logger.info('Running weekly creator payout proposals...');
        const results = await CreatorPayoutService.runWeeklyPayoutProposals();
        logger.info('Weekly creator payout proposals completed', results);
      } catch (error) {
        logger.error('Error in weekly creator payout proposal cron:', error);
      }
    }, { timezone: 'America/Bogota' });

    // ── Weekly approval deadline — Mondays 16:00 America/Bogota ───────────
    // Any 'proposed' row still open at deadline is expired; its reserved
    // earnings roll back to 'available' for next Monday's batch.
    cron.schedule(process.env.CREATOR_WEEKLY_DEADLINE_CRON || '0 16 * * 1', async () => {
      try {
        logger.info('Running weekly creator payout deadline sweep...');
        const results = await CreatorPayoutService.runWeeklyApprovalDeadline();
        logger.info('Weekly creator payout deadline sweep completed', results);
      } catch (error) {
        logger.error('Error in weekly creator payout deadline cron:', error);
      }
    }, { timezone: 'America/Bogota' });

    // ── FIX 9: Reconcile stuck in_payout earnings — daily at 03:00 UTC ──────
    // Finds creator_earnings stuck in 'in_payout' for 48h+ with no active payout
    // record. Rolls them back to 'available' so creators can re-request payout.
    cron.schedule('0 3 * * *', async () => {
      try {
        const NowPaymentsPayoutSvc = require(path.join(backendPath, 'services/nowpaymentsPayoutService'));
        const count = await NowPaymentsPayoutSvc.reconcileStuckPayouts();
        if (count > 0) {
          logger.warn(`[cron] Reconciled ${count} creators with stuck in_payout earnings`);
        }
      } catch (err) {
        logger.error('[cron] reconcileStuckPayouts failed', { error: err.message });
      }
    });

    // ── Creator earnings maturation — hourly ─────────────────────────────────
    // Flips 'holding' earnings rows to 'available' once their available_at has passed.
    // This enforces the 72-hour hold window between earning record insertion and payout eligibility.
    const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
    cron.schedule('0 * * * *', async () => {
      try {
        const { rows } = await pgQuery(`
          UPDATE creator_earnings
             SET status = 'available'
           WHERE status = 'holding'
             AND available_at <= NOW()
          RETURNING id, creator_id, amount_creator
        `);
        if (rows.length > 0) {
          logger.info('creator earnings matured', { count: rows.length });
        }
      } catch (error) {
        logger.error('Error in creator earnings maturation cron:', error);
      }
    });

    // Hangout subgroup inactivity cleanup — DISABLED 2026-06-18 (permanent hangouts policy)
    // Was: delete user-created groups inactive for 72+ hours. Removed per user request.

    // Notification cleanup — daily at 03:20 UTC (staggered from media cleanup at 03:00)
    // Removes read notifications older than 90 days and all hangout_call
    // notifications older than 30 days (they become stale very quickly).
    cron.schedule('20 3 * * *', async () => {
      try {
        logger.info('Running notification cleanup job...');

        const { rows: oldReadRows } = await pgQuery(
          `DELETE FROM notifications
           WHERE is_read = TRUE
             AND created_at < NOW() - INTERVAL '90 days'
           RETURNING id`
        );
        const deletedRead = oldReadRows.length;

        const { rows: oldCallRows } = await pgQuery(
          `DELETE FROM notifications
           WHERE type = 'hangout_call'
             AND created_at < NOW() - INTERVAL '30 days'
           RETURNING id`
        );
        const deletedCalls = oldCallRows.length;

        logger.info('Notification cleanup completed', {
          deletedReadOlderThan90Days: deletedRead,
          deletedHangoutCallsOlderThan30Days: deletedCalls,
          totalDeleted: deletedRead + deletedCalls,
        });
      } catch (error) {
        logger.error('Error in notification cleanup cron:', error);
      }
    });

    // Subscription expiry email reminders — daily at 10 AM UTC
    // Targets users with subscriptions expiring in 7-14 days
    cron.schedule(process.env.SUB_EXPIRY_EMAIL_CRON || '0 10 * * *', async () => {
      try {
        logger.info('Running subscription expiry email reminders...');
        const results = await SubscriptionReminderEmailService.sendExpiryReminders();
        logger.info('Subscription expiry email reminders sent', results);
      } catch (error) {
        logger.error('Error in subscription expiry email reminder cron:', error);
      }
    });

    // Re-engagement emails to churned users — weekly on Monday at 11 AM UTC
    // Targets users who haven't paid in 30+ days
    cron.schedule(process.env.SUB_REENGAGEMENT_CRON || '0 11 * * 1', async () => {
      try {
        logger.info('Running re-engagement email campaign...');
        const results = await SubscriptionReminderEmailService.sendReEngagementEmails();
        logger.info('Re-engagement emails sent', results);
      } catch (error) {
        logger.error('Error in re-engagement email cron:', error);
      }
    });

    // Telegram subscription reminders — DISABLED (spam prevention per admin request)

    // Daily notification digest email — runs at 10 AM UTC
    // Sends an HTML summary of unread notifications to inactive users with verified emails
    cron.schedule(process.env.NOTIFICATION_DIGEST_CRON || '0 10 * * *', async () => {
      try {
        logger.info('Running daily notification digest...');
        await NotificationDigestScheduler.runDigest();
      } catch (error) {
        logger.error('Error in notification digest cron:', error);
      }
    });

    // ── Cristina AI social feed posts ─────────────────────────────────────────
    // Posts rotate: wellness → feature tutorial → PRIME promo → feature tutorial
    // Spread across the day to keep the feed lively without spamming.

    // Wellness tip — 10:00 AM UTC (morning check-in)
    cron.schedule(process.env.CRISTINA_WELLNESS_CRON || '0 10 * * *', async () => {
      try {
        logger.info('CristinaFeed: posting wellness tip...');
        await CristinaFeedService.postWellness();
      } catch (error) {
        logger.error('CristinaFeed: wellness cron error', { error: error.message });
      }
    });

    // Feature tutorial #1 — 2:00 PM UTC (afternoon engagement)
    cron.schedule(process.env.CRISTINA_TUTORIAL1_CRON || '0 14 * * *', async () => {
      try {
        logger.info('CristinaFeed: posting feature tutorial...');
        await CristinaFeedService.postFeatureTutorial();
      } catch (error) {
        logger.error('CristinaFeed: tutorial cron error', { error: error.message });
      }
    });

    // PRIME promo — 6:00 PM UTC (evening conversion window)
    cron.schedule(process.env.CRISTINA_PROMO_CRON || '0 18 * * *', async () => {
      try {
        logger.info('CristinaFeed: posting PRIME promo...');
        await CristinaFeedService.postPrimePromo();
      } catch (error) {
        logger.error('CristinaFeed: promo cron error', { error: error.message });
      }
    });

    // Feature tutorial #2 — 10:00 PM UTC (late-night engagement)
    cron.schedule(process.env.CRISTINA_TUTORIAL2_CRON || '0 22 * * *', async () => {
      try {
        logger.info('CristinaFeed: posting feature tutorial...');
        await CristinaFeedService.postFeatureTutorial();
      } catch (error) {
        logger.error('CristinaFeed: tutorial cron error', { error: error.message });
      }
    });

    // VOD recording retention — daily at 03:35 UTC (staggered from media cleanup at 03:00)
    // Deletes completed recordings older than 7 days and removes their HLS files.
    cron.schedule(process.env.RECORDING_EXPIRY_CRON || '35 3 * * *', async () => {
      try {
        logger.info('Running VOD recording retention cleanup...');
        await StreamRecordingService.expireOldRecordings(7);
      } catch (error) {
        logger.error('Error in VOD recording retention cron:', error);
      }
    });

    // Live-stream dead-man sweep — every 5 minutes
    // Marks `live_streams` rows as 'ended' when the bot crashed mid-stream and
    // both the disconnect handler and recording finalizer were skipped. A row
    // is stuck if status='live', ended_at IS NULL, started_at > 15min ago, AND
    // Redis has no `live:streaming:<host_id>` lock confirming the session.
    cron.schedule(process.env.LIVE_STREAM_SWEEP_CRON || '*/5 * * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const { getRedis } = require(path.join(backendPath, 'config/redis'));
        const redis = getRedis();
        const { rows } = await pgQuery(
          `SELECT id, host_id FROM live_streams
            WHERE status = 'live'
              AND ended_at IS NULL
              AND started_at < NOW() - INTERVAL '15 minutes'
            LIMIT 50`
        );
        let swept = 0;
        for (const row of rows) {
          if (redis) {
            const locked = await redis.exists(`live:streaming:${row.host_id}`).catch(() => 0);
            if (locked) continue; // session is actually alive
          }
          await pgQuery(
            `UPDATE live_streams
                SET status = 'ended',
                    ended_at = NOW(),
                    updated_at = NOW()
              WHERE id = $1 AND ended_at IS NULL`,
            [row.id]
          );
          swept++;
        }
        if (swept > 0) {
          logger.warn(`[liveStreamSweep] marked ${swept} stuck row(s) as ended`);
        }
      } catch (error) {
        logger.error('Error in live-stream sweep cron:', { error: error.message });
      }
    });

    // Channel video stuck-processing cleanup — hourly at :45
    // Flips channel_videos rows that have been in 'processing' for >1 hour to 'failed'.
    // GIF generation times out at 60 s; any row older than 1h is definitively stuck.
    cron.schedule(process.env.CHANNEL_VIDEO_STUCK_CRON || '45 * * * *', async () => {
      try {
        const flipped = await failStuckVideoUploads();
        if (flipped > 0) {
          logger.warn('[channelVideos] Flipped stuck processing rows to failed', { count: flipped });
        }
      } catch (error) {
        logger.error('[channelVideos] Stuck-video cleanup cron error', { error: error.message });
      }
    });

    // CH-01: Reconcile creator_channels.post_count against actual social_posts rows.
    // Runs nightly at 03:17 UTC. Fixes drift caused by any delete/move path that
    // missed a counter update. Only touches rows where the count is wrong.
    cron.schedule(process.env.CHANNEL_POST_COUNT_RECONCILE_CRON || '17 3 * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const result = await pgQuery(`
          UPDATE creator_channels cc
             SET post_count = sub.actual
            FROM (
                   SELECT channel_id,
                          COUNT(*)::int AS actual
                     FROM social_posts
                    WHERE is_deleted = false
                      AND channel_id IS NOT NULL
                 GROUP BY channel_id
                 ) sub
           WHERE cc.id = sub.channel_id
             AND cc.post_count IS DISTINCT FROM sub.actual
          RETURNING cc.id
        `);
        if (result.rowCount > 0) {
          logger.info('[channels] post_count reconciled', { fixedChannels: result.rowCount });
        }
      } catch (error) {
        logger.error('[channels] post_count reconciliation cron error', { error: error.message });
      }
    });

    // M-05: Auto-complete confirmed bookings that ended more than 30 minutes ago.
    // Transitions confirmed → completed and increments quantity_used on the credit
    // so surveys can be submitted and earnings can be tallied. Runs every 15 minutes.
    cron.schedule('*/15 * * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const expired = await pgQuery(`
          SELECT b.id, b.credit_id FROM bookings b
          WHERE b.status = 'confirmed'
            AND b.end_time_utc IS NOT NULL
            AND b.end_time_utc < NOW() - INTERVAL '30 minutes'
        `);
        for (const row of expired.rows) {
          try {
            // Use status = 'confirmed' guard to ensure idempotency
            const updated = await pgQuery(
              `UPDATE bookings SET status = 'completed', updated_at = NOW()
               WHERE id = $1 AND status = 'confirmed'
               RETURNING id`,
              [row.id]
            );
            if (updated.rowCount === 0) continue; // already transitioned by another runner
            if (row.credit_id) {
              await pgQuery(
                `UPDATE call_credits
                 SET quantity_used = quantity_used + 1,
                     quantity_scheduled = GREATEST(0, quantity_scheduled - 1),
                     updated_at = NOW()
                 WHERE id = $1`,
                [row.credit_id]
              );
            }
            // M-03: Fire post-call hook — records earnings + sends survey prompt
            PrivateCallBookingService._onCallCompleted(row.id).catch((err) =>
              logger.error('[cron] _onCallCompleted failed', { creditId: row.id, error: err.message })
            );
          } catch (innerErr) {
            logger.error('[Cron] Auto-complete booking error', { bookingId: row.id, error: innerErr.message });
          }
        }
        if (expired.rows.length > 0) {
          logger.info('[Cron] Auto-completed past-end bookings', { count: expired.rows.length });
        }
      } catch (err) {
        logger.error('[Cron] Auto-complete bookings cron error', { error: err.message });
      }
    });

    // Meru reservation cleanup — RETIRED 2026-08 (Meru removed)
    // cron.schedule kept as comment so schedule slot is not accidentally reused.

    // ── 18 U.S.C. § 2257 grace-period enforcement — daily at 09:00 UTC ──────
    // Suspends active creators whose grace deadline has passed and who have not
    // completed identity verification. Soft-deletes their social posts and
    // notifies the operator via Telegram.
    cron.schedule('0 9 * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const { rows } = await pgQuery(`
          SELECT id, username, first_name
          FROM users
          WHERE creator_status = 'active'
            AND identity_verified = false
            AND identity_verification_required_by IS NOT NULL
            AND identity_verification_required_by < NOW()
        `);

        if (rows.length === 0) {
          logger.info('[2257] Grace-period enforcement: no expired creators');
          return;
        }

        const sendSystemDM = require(path.join(backendPath, 'services/sendSystemDM'));
        const SYSTEM_SENDER_ID = process.env.SYSTEM_DM_SENDER_ID || '8552451957';

        for (const creator of rows) {
          try {
            await pgQuery(
              `UPDATE users SET creator_status = 'suspended', updated_at = NOW() WHERE id = $1`,
              [creator.id]
            );
            await pgQuery(
              `UPDATE social_posts SET deleted_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL`,
              [creator.id]
            );
            logger.warn('[2257] Grace period expired — creator suspended', {
              userId: creator.id,
              username: creator.username,
            });

            // DM the creator so they know why their account changed
            const dmText = `Tu cuenta de creator fue pausada / Your creator account was paused\n\n`
              + `Tu verificación 2257 no llegó antes del deadline — es requisito legal (18 U.S.C. § 2257) para publicar contenido en PNPtv.\n\n`
              + `Your 2257 identity verification wasn't submitted before the deadline — it's a legal requirement (18 U.S.C. § 2257) to publish content on PNPtv.\n\n`
              + `Para reactivar: sube tu ID + selfie en https://pnptv.app/creators/setup — aprobamos en 24-48h.\n`
              + `To reactivate: upload your ID + selfie at https://pnptv.app/creators/setup — we approve within 24-48h.\n\n`
              + `— PNPtv! Support`;
            await sendSystemDM(SYSTEM_SENDER_ID, String(creator.id), dmText, pgQuery).catch((dmErr) =>
              logger.warn('[2257] Failed to DM suspended creator', { userId: creator.id, error: dmErr.message })
            );

            // Notify creator in their personal Slack channel — enqueue via BullMQ
            // so a Slack outage won't block the suspension loop.
            try {
              const { addJob } = require(path.join(backendPath, 'services/queueService'));
              addJob('notifications', 'slack_creator.notify2257Expiring', {
                type: 'slack_creator',
                fn: 'notify2257Expiring',
                args: [creator.id, { daysUntilExpiry: 0, renewLink: 'https://pnptv.app/settings/verification' }],
              }).catch(() => {});
            } catch (_) {}
          } catch (innerErr) {
            logger.error('[2257] Enforcement error for creator', {
              userId: creator.id,
              error: innerErr.message,
            });
          }
        }

        // Persistent admin alert (survives bot restart, unlike TG DM)
        try {
          await pgQuery(
            `INSERT INTO admin_alerts (alert_type, severity, title, message, details) VALUES ($1,$2,$3,$4,$5)`,
            [
              '2257_enforcement',
              'high',
              '2257 grace period enforcement fired',
              `${rows.length} creator(s) auto-suspended for expired 2257 grace period`,
              JSON.stringify({ count: rows.length, users: rows.map((r) => ({ id: r.id, username: r.username })) }),
            ]
          );
        } catch (alertErr) {
          logger.warn('[2257] Failed to insert admin_alert', { error: alertErr.message });
        }

        // Notify operator via Telegram (best-effort)
        const adminId = process.env.ADMIN_ID;
        if (adminId && bot) {
          const names = rows.map((r) => r.username || r.first_name || r.id).join(', ');
          await bot.telegram.sendMessage(
            adminId,
            `⚠️ 2257 ENFORCEMENT: ${rows.length} creator(s) suspended for expired grace period: ${names}`
          ).catch(() => {});
        }
      } catch (err) {
        logger.error('[2257] Enforcement cron error', { error: err.message });
      }
    });

    // ── Creator content-compliance: deadline enforcement — daily at 09:05 UTC ──
    // (5 min offset from the 2257 job above to avoid resource contention.)
    // Suspends creators whose 7-day content-compliance grace deadline has passed
    // without reaching 4+ minutes of exclusive video content, cancels their
    // compliance_hold'd subscriptions, and refunds those subscribers in tokens
    // at CONTENT_COMPLIANCE_REFUND_MULTIPLIER (105%) of what they paid. See
    // services/contentComplianceService.js and migrations/318_creator_content_compliance.sql.
    cron.schedule('5 9 * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const { cache } = require(path.join(backendPath, 'config/redis'));
        const ContentComplianceService = require(path.join(backendPath, 'services/contentComplianceService'));
        const NotificationEmitter = require(path.join(backendPath, 'services/notificationEmitter'));
        const EmailService = require(path.join(backendPath, 'services/emailservice'));
        const {
          CONTENT_COMPLIANCE_SUSPENSION_MONTHS,
          CONTENT_COMPLIANCE_REFUND_MULTIPLIER,
        } = require(path.join(backendPath, 'config/monetizationConfig'));

        const { rows } = await pgQuery(`
          SELECT id, username, first_name, email, email_verified
          FROM users
          WHERE creator_content_compliance_status = 'pending'
            AND creator_content_compliance_deadline < NOW()
        `);

        if (rows.length === 0) {
          logger.info('[compliance] Deadline enforcement: no expired creators');
        }

        let suspendedCount = 0;
        const suspendedNames = [];

        for (const creator of rows) {
          try {
            // Defensive race-check: markCompliantIfNewlyQualified() should already
            // have cleared 'pending' if the creator just qualified. If that hasn't
            // run yet, don't suspend — leave the row for the unlock path to clear.
            const compliant = await ContentComplianceService.isCompliant(creator.id);
            if (compliant) {
              logger.info('[compliance] Creator already compliant at deadline check — skipping suspension', {
                userId: creator.id,
              });
              continue;
            }

            // Idempotent: guarded by "suspension_reason IS DISTINCT FROM 'content_compliance'"
            // so a creator who is re-selected on a later run (deadline/status are
            // intentionally left untouched below) doesn't get re-suspended,
            // re-notified, or have creator_suspended_until pushed out again.
            const { rowCount } = await pgQuery(
              `UPDATE users
                 SET creator_status = 'suspended',
                     creator_suspended_until = NOW() + ($2 || ' months')::interval,
                     creator_suspension_reason = 'content_compliance',
                     creator_content_compliance_status = 'pending',
                     updated_at = NOW()
               WHERE id = $1
                 AND creator_suspension_reason IS DISTINCT FROM 'content_compliance'`,
              [creator.id, String(CONTENT_COMPLIANCE_SUSPENSION_MONTHS)]
            );

            if (rowCount === 0) {
              logger.info('[compliance] Creator already suspended for content compliance — skipping', {
                userId: creator.id,
              });
              continue;
            }

            // Atomically flip each held subscription so this can't double-fire.
            const { rows: heldSubs } = await pgQuery(
              `UPDATE creator_subscriptions
                 SET status = 'cancelled', compliance_hold = false
               WHERE creator_id = $1 AND compliance_hold = true
               RETURNING id, subscriber_id, price_usd`,
              [creator.id]
            );

            for (const sub of heldSubs) {
              try {
                const priceUsd = parseFloat(sub.price_usd) || 0;
                // 6 tokens = $1 USD base rate (see services/dashTokenService.js header).
                const tokens = Math.round(priceUsd * 6 * CONTENT_COMPLIANCE_REFUND_MULTIPLIER);

                await pgQuery(
                  `INSERT INTO user_token_wallets (user_id, balance_tokens)
                        VALUES ($1, $2)
                   ON CONFLICT (user_id) DO UPDATE
                     SET balance_tokens = user_token_wallets.balance_tokens + $2,
                         updated_at = NOW()`,
                  [String(sub.subscriber_id), tokens]
                );

                await Promise.all([
                  cache.del(`wallet:${sub.subscriber_id}`).catch(() => {}),
                  cache.del(`wallet:obj:${sub.subscriber_id}`).catch(() => {}),
                ]);

                await pgQuery(
                  `UPDATE user_entitlements
                     SET expires_at = NOW()
                   WHERE user_id = $1 AND add_on_id = 'creator-subscription' AND creator_id = $2`,
                  [String(sub.subscriber_id), String(creator.id)]
                );

                try {
                  const EntitlementAccessService = require(path.join(backendPath, 'services/entitlementAccessService'));
                  await EntitlementAccessService.invalidateCache(String(sub.subscriber_id));
                } catch (cacheErr) {
                  logger.warn('[compliance] entitlement cache invalidation failed (non-fatal)', {
                    subscriberId: sub.subscriber_id,
                    error: cacheErr.message,
                  });
                }

                const refundMessage = `The creator you subscribed to didn't meet the platform's content requirement in time, so their new membership hold could not be lifted. Your subscription has been cancelled and we've credited your wallet with ${tokens} tokens (105% of what you paid) as an apology for the inconvenience.`;

                NotificationEmitter.emit({
                  type: 'creator_compliance_refund',
                  category: 'commerce',
                  priority: 'high',
                  actorId: null,
                  targetUserId: String(sub.subscriber_id),
                  entityType: 'user',
                  entityId: String(creator.id),
                  message: refundMessage,
                  metadata: {
                    url: '/wallet',
                    pushTitle: 'Subscription refunded in tokens',
                    pushBody: `You've been credited ${tokens} tokens after a creator's subscription was cancelled.`,
                  },
                }).catch(() => {});

                try {
                  const { rows: subRows } = await pgQuery(
                    'SELECT email, email_verified FROM users WHERE id = $1',
                    [sub.subscriber_id]
                  );
                  const subUser = subRows[0];
                  if (subUser?.email && subUser.email_verified) {
                    await EmailService.send({
                      to: subUser.email,
                      subject: 'Your subscription was cancelled and refunded in tokens',
                      html: `
                        <p>Hi,</p>
                        <p>The creator you recently subscribed to did not meet our platform's content requirement (at least 4 minutes of exclusive video content) within the required time window.</p>
                        <p>As a result, their new-subscriber hold could not be lifted, and your subscription has been cancelled.</p>
                        <p>We've credited your wallet with <strong>${tokens} tokens</strong> — 105% of what you paid — to make this right.</p>
                        <p>We're sorry for the inconvenience. Please don't hesitate to reach out if you have any questions.</p>
                      `,
                    });
                  }
                } catch (emailErr) {
                  logger.warn('[compliance] subscriber refund email failed (non-fatal)', {
                    subscriberId: sub.subscriber_id,
                    error: emailErr.message,
                  });
                }
              } catch (subErr) {
                logger.error('[compliance] Failed to process held subscription refund (non-fatal, continuing)', {
                  creatorId: creator.id,
                  subscriptionId: sub.id,
                  error: subErr.message,
                });
              }
            }

            const reinstateDate = new Date(
              Date.now() + CONTENT_COMPLIANCE_SUSPENSION_MONTHS * 30 * 24 * 60 * 60 * 1000
            ).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const suspensionMessage = `You've been suspended from the Creator Program for 6 months for not meeting the platform's content requirement (4+ minutes of exclusive video content) within the grace period. You'll be eligible to rejoin around ${reinstateDate}.`;

            NotificationEmitter.emit({
              type: 'creator_compliance_suspended',
              category: 'commerce',
              priority: 'high',
              actorId: null,
              targetUserId: String(creator.id),
              entityType: 'user',
              entityId: String(creator.id),
              message: suspensionMessage,
              metadata: {
                url: '/creator-studio',
                pushTitle: 'Creator Program suspension',
                pushBody: suspensionMessage,
              },
            }).catch(() => {});

            try {
              if (creator.email && creator.email_verified) {
                await EmailService.send({
                  to: creator.email,
                  subject: 'Your Creator Program account has been suspended',
                  html: `
                    <p>Hi,</p>
                    <p>Your Creator Program account has been suspended for 6 months because our platform's content requirement (at least 4 minutes of exclusive video content) was not met within the required grace period.</p>
                    <p>Your held subscriber(s) have been refunded in tokens and their subscription(s) cancelled.</p>
                    <p>You'll be eligible to rejoin the Creator Program around <strong>${reinstateDate}</strong>.</p>
                    <p>If you believe this is a mistake, please contact support.</p>
                  `,
                });
              }
            } catch (emailErr) {
              logger.warn('[compliance] creator suspension email failed (non-fatal)', {
                userId: creator.id,
                error: emailErr.message,
              });
            }

            suspendedCount++;
            suspendedNames.push(creator.username || creator.first_name || creator.id);
            logger.warn('[compliance] Creator suspended for missed content-compliance deadline', {
              userId: creator.id,
              username: creator.username,
              refundedSubs: heldSubs.length,
            });
          } catch (innerErr) {
            logger.error('[compliance] Deadline enforcement error for creator', {
              userId: creator.id,
              error: innerErr.message,
            });
          }
        }

        // Notify operator — mirrors the 2257 enforcement job's admin-ping style above.
        if (suspendedCount > 0) {
          const adminId = process.env.ADMIN_ID;
          if (adminId && bot) {
            await bot.telegram.sendMessage(
              adminId,
              `⚠️ CONTENT COMPLIANCE: ${suspendedCount} creator(s) suspended for missing the content deadline: ${suspendedNames.join(', ')}`
            ).catch(() => {});
          }
        }
      } catch (err) {
        logger.error('[compliance] Deadline enforcement cron error', { error: err.message });
      }
    });

    // ── Creator content-compliance: deadline reminder — daily at 09:05 UTC ──
    // One-time reminder (this window naturally fires once per creator since the
    // job runs daily) for creators whose compliance deadline is 1-2 days out.
    cron.schedule('5 9 * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const NotificationEmitter = require(path.join(backendPath, 'services/notificationEmitter'));
        const EmailService = require(path.join(backendPath, 'services/emailservice'));

        const { rows } = await pgQuery(`
          SELECT id, username, email, email_verified, creator_content_compliance_deadline
          FROM users
          WHERE creator_content_compliance_status = 'pending'
            AND creator_content_compliance_deadline BETWEEN NOW() + INTERVAL '1 day' AND NOW() + INTERVAL '2 days'
        `);

        if (rows.length === 0) {
          logger.info('[compliance] Deadline reminder: no creators in reminder window');
          return;
        }

        let sentCount = 0;
        const reminded = [];

        for (const creator of rows) {
          try {
            const deadlineStr = new Date(creator.creator_content_compliance_deadline).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            });
            const message = `Reminder: you have until ${deadlineStr} to upload at least 4 minutes of exclusive video content, or your Creator Program account will be suspended for 6 months and your held subscriber(s) refunded.`;

            NotificationEmitter.emit({
              type: 'creator_compliance_reminder',
              category: 'commerce',
              priority: 'high',
              actorId: null,
              targetUserId: String(creator.id),
              entityType: 'user',
              entityId: String(creator.id),
              message,
              metadata: {
                url: '/creator-studio/content',
                pushTitle: 'Reminder — content deadline approaching',
                pushBody: `Upload 4+ min of exclusive video by ${deadlineStr} to avoid suspension.`,
              },
            }).catch(() => {});

            if (creator.email && creator.email_verified) {
              await EmailService.send({
                to: creator.email,
                subject: 'Reminder — your content compliance deadline is approaching',
                html: `
                  <p>Hi,</p>
                  <p>This is a reminder that you have until <strong>${deadlineStr}</strong> to upload at least 4 minutes of exclusive video content to your creator profile.</p>
                  <p>If the deadline passes without enough content, your Creator Program account will be suspended for 6 months, and your held subscriber(s) will be refunded in tokens.</p>
                  <p>Upload now to activate your held subscriber's membership and start earning.</p>
                `,
              });
            }

            sentCount++;
            reminded.push(creator.username || creator.id);
          } catch (innerErr) {
            logger.error('[compliance] Reminder error for creator', {
              userId: creator.id,
              error: innerErr.message,
            });
          }
        }

        logger.info('[compliance] Deadline reminders sent', { count: sentCount });

        const adminId = process.env.ADMIN_ID;
        if (adminId && bot && sentCount > 0) {
          await bot.telegram.sendMessage(
            adminId,
            `ℹ️ CONTENT COMPLIANCE: sent ${sentCount} deadline-approaching reminder(s): ${reminded.join(', ')}`
          ).catch(() => {});
        }
      } catch (err) {
        logger.error('[compliance] Deadline reminder cron error', { error: err.message });
      }
    });

    // ── Creator content-compliance: auto-reinstatement — daily at 09:05 UTC ──
    // Reinstates creators whose 6-month content-compliance suspension has elapsed.
    // No notification per the plan (out of scope) — log line only.
    cron.schedule('5 9 * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));

        const { rows } = await pgQuery(`
          SELECT id, username
          FROM users
          WHERE creator_suspension_reason = 'content_compliance'
            AND creator_suspended_until < NOW()
        `);

        if (rows.length === 0) {
          logger.info('[compliance] Auto-reinstatement: no creators due');
          return;
        }

        let reinstatedCount = 0;
        const reinstated = [];

        for (const creator of rows) {
          try {
            // Also clear compliance_status/deadline (not just the suspension fields) —
            // otherwise Phase A's "status='pending' AND deadline < NOW()" would match
            // this creator again on the very next run and re-suspend them in a loop.
            // Reinstated creators fall back to "not yet evaluated"; the clock only
            // restarts on their next new subscription, same as any grandfathered creator.
            await pgQuery(
              `UPDATE users
                 SET creator_status = 'active',
                     creator_suspended_until = NULL,
                     creator_suspension_reason = NULL,
                     creator_content_compliance_status = NULL,
                     creator_content_compliance_deadline = NULL,
                     updated_at = NOW()
               WHERE id = $1`,
              [creator.id]
            );
            reinstatedCount++;
            reinstated.push(creator.username || creator.id);
            logger.info('[compliance] Creator auto-reinstated after content-compliance suspension', {
              userId: creator.id,
              username: creator.username,
            });
          } catch (innerErr) {
            logger.error('[compliance] Auto-reinstatement error for creator', {
              userId: creator.id,
              error: innerErr.message,
            });
          }
        }

        logger.info('[compliance] Auto-reinstatement complete', { count: reinstatedCount });

        const adminId = process.env.ADMIN_ID;
        if (adminId && bot && reinstatedCount > 0) {
          await bot.telegram.sendMessage(
            adminId,
            `✅ CONTENT COMPLIANCE: ${reinstatedCount} creator(s) auto-reinstated after 6-month suspension: ${reinstated.join(', ')}`
          ).catch(() => {});
        }
      } catch (err) {
        logger.error('[compliance] Auto-reinstatement cron error', { error: err.message });
      }
    });

    // ── user_access_logs retention — daily at 03:50 UTC (staggered from media cleanup at 03:00) ──
    // Keeps 14 days — sufficient for security forensics; table grows ~377K rows/day.
    cron.schedule('50 3 * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        let total = 0;
        let deleted;
        do {
          const res = await pgQuery(
            `DELETE FROM user_access_logs WHERE id IN (
               SELECT id FROM user_access_logs WHERE created_at < $1 LIMIT 10000
             )`,
            [cutoff]
          );
          deleted = res.rowCount || 0;
          total += deleted;
        } while (deleted === 10000);
        if (total > 0) logger.info('[retention] user_access_logs purged', { deleted: total });
      } catch (err) {
        logger.error('[retention] user_access_logs purge error', { error: err.message });
      }
    });

    // DB-scheduled call notification reminders — every 5 minutes
    // Dispatches booking_notifications rows whose scheduled_for has passed.
    // Covers reminder_60, reminder_15, reminder_5 for both member and performer.
    cron.schedule('*/5 * * * *', async () => {
      try {
        await sendPendingNotifications();
      } catch (err) {
        logger.error('[callNotifications] sendPendingNotifications cron error', { error: err.message });
      }
    });

    // H-05: Auto-end overdue live (and stuck-scheduled) call sessions — every 5 min.
    // CallSessionModel.getOverdueSessions now catches both 'live' and 'scheduled' rows
    // that are 15+ min past their end time (H-09 fix), so this single cron handles both.
    cron.schedule('*/5 * * * *', async () => {
      try {
        await PrivateCallBookingService.autoEndOverdueCalls();
      } catch (err) {
        logger.error('[cron] autoEndOverdueCalls error', { error: err.message });
      }
    });

    // H-05: Detect no-shows — every 15 min.
    // Marks confirmed bookings as no_show when the grace period has elapsed with no join.
    cron.schedule('*/15 * * * *', async () => {
      try {
        await PrivateCallBookingService.checkNoShows();
      } catch (err) {
        logger.error('[cron] checkNoShows error', { error: err.message });
      }
    });

    // Weekly log-table retention — runs every Sunday at 03:17 UTC.
    // Keeps user_access_logs and video_fetch_log lean so INSERT stays fast.
    // Deletes in 50K-row batches with a short sleep between iterations to
    // avoid holding a long transaction against live traffic.
    cron.schedule('17 3 * * 0', async () => {
      const { getPool } = require('../config/postgres');
      const pool = getPool();
      for (const [table, interval] of [
        ['user_access_logs', '30 days'],
        ['video_fetch_log', '90 days'],
      ]) {
        let total = 0;
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const r = await pool.query(
              `DELETE FROM ${table} WHERE id IN (
                 SELECT id FROM ${table}
                 WHERE created_at < NOW() - INTERVAL '${interval}'
                 LIMIT 50000
               )`
            );
            total += r.rowCount;
            if (r.rowCount === 0) break;
            await new Promise(res => setTimeout(res, 100));
          }
          if (total > 0) logger.info(`[retention] purged ${table}`, { rows: total, interval });
        } catch (e) {
          logger.error(`[retention] purge failed: ${table}`, { error: e.message });
        }
      }
    });

    // Every 5 min: poll hello/support/legal inboxes and send per-mailbox auto-replies
    cron.schedule('*/5 * * * *', async () => {
      try {
        await autoReplyService.startAutoReplyPolling();
      } catch (err) {
        logger.error('[autoReply] cron error', { error: err.message });
      }
    });

    // ── Creator availability expiry in-app notification — every 2 minutes ────
    // When a creator's accepting-calls TTL drops into the 600–720s window
    // (10–12 min remaining), insert an in-app notification prompting them to
    // renew. Uses Redis SET NX (avail:webapp_pinged:<userId>) as dedup guard
    // with 720s TTL so each availability window gets at most one notification.
    // Replaces the Telegram DM that creatorAvailabilityPingScheduler sent.
    cron.schedule('*/2 * * * *', async () => {
      try {
        const { getRedis } = require(path.join(backendPath, 'config/redis'));
        const redis = getRedis();
        if (!redis) return;

        const PING_WINDOW_MIN = 600;
        const PING_WINDOW_MAX = 720;
        const DEDUP_TTL = 720;
        const APP_URL = process.env.APP_PUBLIC_URL || 'https://pnptv.app';

        // SCAN for all accepting-calls keys
        const keys = [];
        let cursor = '0';
        do {
          const [nextCursor, batch] = await redis.scan(
            cursor, 'MATCH', 'user:*:accepting_calls', 'COUNT', '200'
          );
          cursor = nextCursor;
          keys.push(...batch);
        } while (cursor !== '0');

        if (keys.length === 0) return;

        const toNotify = [];
        for (const key of keys) {
          const ttl = await redis.ttl(key);
          if (ttl < PING_WINDOW_MIN || ttl > PING_WINDOW_MAX) continue;

          const userId = key.slice('user:'.length, -':accepting_calls'.length);
          const dedupKey = `avail:webapp_pinged:${userId}`;
          const acquired = await redis.set(dedupKey, '1', 'EX', DEDUP_TTL, 'NX');
          if (!acquired) continue;
          toNotify.push(userId);
        }

        if (toNotify.length === 0) return;

        // Verify they are still active creators before notifying
        const { query: pgQ } = require(path.join(backendPath, 'config/postgres'));
        const { rows: creators } = await pgQ(
          `SELECT id FROM users
           WHERE id = ANY($1::text[])
             AND creator_status = 'active'`,
          [toNotify]
        );

        if (creators.length === 0) return;

        const MESSAGE = 'Your availability window expires in ~10 minutes. Tap to renew.';
        const ENTITY_TYPE = 'creator_availability';

        for (const creator of creators) {
          const userId = String(creator.id);
          // entity_id scoped to the current 12-min window (Unix minute, rounded to 12)
          const windowId = String(Math.floor(Date.now() / (720 * 1000)));
          try {
            await pgQ(
              `INSERT INTO notifications
                 (type, category, priority, actor_id, target_user_id,
                  entity_type, entity_id, message, metadata)
               VALUES
                 ($1, 'system', 'high', NULL, $2,
                  $3, $4, $5, $6)
               ON CONFLICT DO NOTHING`,
              [
                'availability_expiring',
                userId,
                ENTITY_TYPE,
                windowId,
                MESSAGE,
                JSON.stringify({ url: `${APP_URL}/creators/availability` }),
              ]
            );
          } catch (insertErr) {
            logger.warn('[availWebappPing] notification insert failed', {
              userId, error: insertErr.message,
            });
          }
        }

        logger.info(`[availWebappPing] Sent in-app expiry notification to ${creators.length} creator(s)`);
      } catch (err) {
        logger.error('[availWebappPing] cron error', { error: err.message });
      }
    });

    // ── Weekly group activity rank + PRIME grants (bot-independent) ──────────
    // Runs Friday 23:00 UTC + Wed/Thu 18:00 UTC standings nudge.
    // Only registered here when there is NO bot instance — when the bot IS alive,
    // bot.js calls startWeeklyRankScheduler(bot) directly (with full Telegram access)
    // and this block is skipped to prevent double-scheduling the same cron expression.
    // After bot deprecation (Aug 2026), this path runs the hangout-native rewards
    // without any Telegram dependency.
    if (!bot) {
      try {
        const { startWeeklyRankScheduler } = require(path.join(basePath, '../bot/core/schedulers/weeklyRankScheduler'));
        startWeeklyRankScheduler(null);
        logger.info('✓ Weekly group rank scheduler started (hangout-native path, no bot)');
      } catch (err) {
        logger.warn('Weekly group rank scheduler failed to start', { error: err.message });
      }
    }

    // ── Restreamer stream health monitor — every 2 minutes ───────────────────
    // Tracks per-stream state transitions: running↔stopped, failed alerts.
    // Map value: { state, startedAt: number|null, isRunning: bool }
    // _seeded: true after first tick — prevents Slack flood on bot restart
    // (first tick silently populates state without sending notifications).
    const _streamHealthState = new Map();
    let _streamHealthSeeded = false;
    cron.schedule('*/2 * * * *', async () => {
      try {
        const restreamer = require(path.join(backendPath, 'services/restreamerService'));
        const slackLive = require(path.join(backendPath, 'services/slackLiveService'));
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const streams = await restreamer.getStreamHealthSummary();
        const seen = new Set();

        // Resolve display names — users.display_name does not exist; use username
        const refIds = streams.map(s => s.refId).filter(Boolean);
        let displayNames = {};
        let creatorUserIds = {};
        if (refIds.length > 0) {
          try {
            const nameRes = await pgQuery(
              `SELECT live_channel, id, COALESCE(username, first_name, live_channel) AS display_name FROM users WHERE live_channel = ANY($1::text[])`,
              [refIds]
            );
            for (const row of nameRes.rows) {
              displayNames[row.live_channel] = row.display_name;
              creatorUserIds[row.live_channel] = row.id;
            }
          } catch (_) {}
        }
        const _name = (refId) => displayNames[refId] || refId;

        // First tick after startup: seed state silently (no Slack posts) so
        // we don't flood the channel with fake "X went live" for all running streams.
        if (!_streamHealthSeeded) {
          for (const s of streams) {
            _streamHealthState.set(s.streamId, { state: s.state, startedAt: s.isLive ? Date.now() : null, isRunning: s.isLive });
          }
          _streamHealthSeeded = true;
          return;
        }

        for (const s of streams) {
          seen.add(s.streamId);
          const prev = _streamHealthState.get(s.streamId);

          if (s.isLive && !prev?.isRunning) {
            // Transition TO live
            _streamHealthState.set(s.streamId, { state: s.state, startedAt: Date.now(), isRunning: true });
            slackLive.notifyStreamLive(s.refId, _name(s.refId)).catch(() => {});
            const goLiveCreatorId = creatorUserIds[s.refId];
            if (goLiveCreatorId) {
              require(path.join(backendPath, 'services/slackCreatorNotifyService'))
                .notifyGoingLive(goLiveCreatorId, { channelRef: s.refId }).catch(() => {});
            }
          } else if (!s.isLive && prev?.isRunning) {
            // Transition FROM live
            const durationMinutes = Math.round((Date.now() - prev.startedAt) / 60000);
            _streamHealthState.set(s.streamId, { state: s.state, startedAt: null, isRunning: false });
            slackLive.notifyStreamEnd(s.refId, _name(s.refId), durationMinutes).catch(() => {});
            if (s.isFailed) {
              slackLive.notifyStreamHealth(s.refId, _name(s.refId), s.state).catch(() => {});
            }
          } else if (s.isFailed && !prev?.isRunning && prev?.state !== s.state) {
            // Failed without ever being tracked as running (e.g. first poll shows failed)
            slackLive.notifyStreamHealth(s.refId, _name(s.refId), s.state).catch(() => {});
            _streamHealthState.set(s.streamId, { state: s.state, startedAt: null, isRunning: false });
          } else {
            // No transition — update state field only
            _streamHealthState.set(s.streamId, { ...(prev || { startedAt: null, isRunning: false }), state: s.state });
          }
        }
        // Remove state for streams that no longer exist; fire end notification if was running
        for (const [id, entry] of _streamHealthState.entries()) {
          if (!seen.has(id)) {
            if (entry.isRunning) {
              const durationMinutes = Math.round((Date.now() - entry.startedAt) / 60000);
              slackLive.notifyStreamEnd(id, _name(id), durationMinutes).catch(() => {});
            }
            _streamHealthState.delete(id);
          }
        }
      } catch (_) {}
    });

    // Slack availability poller moved to BullMQ (services/workers/index.js
    // case 'slack-avail-poll'), scheduled by services/queueService.js. The
    // BullMQ version is authoritative — SET (not SET NX) + DEL on unavailable,
    // so status changes propagate within one poll cycle.

    // Call reminder — every 5 minutes, fires for bookings starting in 55–65 min
    // Window avoids double-firing: confirmed bookings only, tight 10-min band.
    cron.schedule('*/5 * * * *', async () => {
      try {
        const { query: pgQuery } = require(path.join(backendPath, 'config/postgres'));
        const slackOps = require(path.join(backendPath, 'services/slackOpsService'));
        const result = await pgQuery(
          `SELECT b.id, b.duration_minutes, b.start_time_utc,
                  u.username  AS client_username,
                  u2.username AS creator_username
             FROM bookings b
             JOIN users u       ON u.id  = b.user_id
             JOIN performers pf ON pf.id = b.performer_id
             JOIN users u2      ON u2.id = pf.user_id
            WHERE b.status = 'confirmed'
              AND b.start_time_utc BETWEEN NOW() + INTERVAL '58 minutes'
                                       AND NOW() + INTERVAL '63 minutes'`
        );
        for (const row of result.rows) {
          slackOps.notifyCallReminder({
            bookingId: row.id,
            clientUsername: row.client_username,
            creatorUsername: row.creator_username,
            durationMinutes: row.duration_minutes,
            startTimeCol: row.start_time_utc
              ? new Date(row.start_time_utc).toLocaleString('en-US', { timeZone: 'America/Bogota', hour12: false })
              : 'N/A',
          }).catch(() => {});
        }
      } catch (e) {
        logger.warn('[callReminder] cron error', { error: e.message });
      }
    });

    logger.info('✓ Cron jobs started successfully');
    return true;
  } catch (error) {
    logger.error('Failed to start cron jobs:', error);
    logger.error('Application will continue running without cron jobs');
    return false;
  }
};

// NOTE: Cron jobs are started from bot.js via startCronJobs(bot)
// Do NOT start them here to avoid double execution
// The bot instance is needed for services like MembershipCleanupService

module.exports = { startCronJobs };
