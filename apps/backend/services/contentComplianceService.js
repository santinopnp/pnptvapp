const { query } = require('../config/postgres');
const logger = require('../utils/logger');
const NotificationEmitter = require('./notificationEmitter');
const EmailService = require('./emailservice');
const {
  CONTENT_COMPLIANCE_MIN_SECONDS,
  CONTENT_COMPLIANCE_GRACE_DAYS,
  CONTENT_COMPLIANCE_EXEMPT_USER_IDS,
  CREATOR_REVENUE_RATE,
  PLATFORM_COMMISSION_RATE,
  EARNINGS_HOLD_HOURS,
} = require('../config/monetizationConfig');

class ContentComplianceService {
  static isExempt(creatorId) {
    return CONTENT_COMPLIANCE_EXEMPT_USER_IDS.includes(String(creatorId));
  }

  static async getExclusiveContentSeconds(creatorId) {
    const { rows } = await query(
      `SELECT COALESCE(SUM(duration_seconds), 0)::int AS seconds
       FROM creator_media
       WHERE creator_id = $1 AND is_premium = true AND media_type = 'video'`,
      [creatorId]
    );
    return rows[0]?.seconds || 0;
  }

  static async isCompliant(creatorId) {
    if (this.isExempt(creatorId)) return true;
    const seconds = await this.getExclusiveContentSeconds(creatorId);
    return seconds >= CONTENT_COMPLIANCE_MIN_SECONDS;
  }

  // Idempotent: guarded by "deadline IS NULL" both in JS and in the UPDATE's
  // WHERE clause so two concurrent callers can't both start the clock.
  static async startComplianceClockIfNeeded(creatorId) {
    if (this.isExempt(creatorId)) return { started: false };

    const { rows } = await query(
      'SELECT creator_content_compliance_deadline FROM users WHERE id = $1',
      [creatorId]
    );
    if (!rows[0] || rows[0].creator_content_compliance_deadline !== null) {
      return { started: false };
    }

    if (await this.isCompliant(creatorId)) return { started: false };

    const { rowCount, rows: updatedRows } = await query(
      `UPDATE users
         SET creator_content_compliance_status = 'pending',
             creator_content_compliance_deadline = NOW() + ($2 || ' days')::interval
       WHERE id = $1 AND creator_content_compliance_deadline IS NULL
       RETURNING creator_content_compliance_deadline`,
      [creatorId, String(CONTENT_COMPLIANCE_GRACE_DAYS)]
    );

    if (rowCount === 0) return { started: false };

    const deadline = updatedRows[0].creator_content_compliance_deadline;

    try {
      await this._sendComplianceStartedNotice(creatorId, deadline);
    } catch (notifyErr) {
      logger.warn('startComplianceClockIfNeeded: notice failed (non-fatal)', {
        creatorId,
        error: notifyErr.message,
      });
    }

    return { started: true, deadline };
  }

  // Idempotent: guarded by "status = 'pending'" both in JS and in the UPDATE's
  // WHERE clause so this only fires once per compliance cycle.
  static async markCompliantIfNewlyQualified(creatorId) {
    if (!(await this.isCompliant(creatorId))) return { unlocked: 0 };

    const { rowCount } = await query(
      `UPDATE users
         SET creator_content_compliance_status = 'compliant',
             creator_content_compliance_deadline = NULL
       WHERE id = $1 AND creator_content_compliance_status = 'pending'`,
      [creatorId]
    );

    if (rowCount === 0) return { unlocked: 0 };

    const { rows: heldSubs } = await query(
      `SELECT id, subscriber_id, price_usd, held_duration_days, payment_id
       FROM creator_subscriptions
       WHERE creator_id = $1 AND compliance_hold = true`,
      [creatorId]
    );

    let unlockedCount = 0;

    for (const sub of heldSubs) {
      try {
        const durationDays = sub.held_duration_days || 30;

        await query(
          `UPDATE creator_subscriptions
             SET expires_at = NOW() + ($2 || ' days')::interval,
                 compliance_hold = false
           WHERE id = $1`,
          [sub.id, String(durationDays)]
        );

        await query(
          `UPDATE user_entitlements
             SET expires_at = NOW() + ($3 || ' days')::interval
           WHERE user_id = $1 AND add_on_id = 'creator-subscription' AND creator_id = $2`,
          [String(sub.subscriber_id), String(creatorId), String(durationDays)]
        );

        // Same 70/30 split + hold-period computation as CreatorService.subscribeToCreator.
        const priceUsd = parseFloat(sub.price_usd);
        const amountCreator = Math.round(priceUsd * CREATOR_REVENUE_RATE * 100) / 100;
        const amountPlatform = Math.round(priceUsd * PLATFORM_COMMISSION_RATE * 100) / 100;

        await query(
          `INSERT INTO creator_earnings (creator_id, subscription_id, amount_gross, amount_creator, amount_platform, status, available_at, source_payment_id, period_month)
           VALUES ($1, $2, $3, $4, $5, 'holding', NOW() + ($6 || ' hours')::interval, $7, date_trunc('month', CURRENT_DATE)::date)
           ON CONFLICT (source_payment_id, creator_id) WHERE source_payment_id IS NOT NULL DO NOTHING`,
          [creatorId, sub.id, priceUsd, amountCreator, amountPlatform, String(EARNINGS_HOLD_HOURS), sub.payment_id || null]
        );

        try {
          const EntitlementAccessService = require('./entitlementAccessService');
          await EntitlementAccessService.invalidateCache(String(sub.subscriber_id));
        } catch (cacheErr) {
          logger.warn('markCompliantIfNewlyQualified: cache invalidation failed (non-fatal)', {
            subscriberId: sub.subscriber_id,
            error: cacheErr.message,
          });
        }

        // Notify subscriber that their held membership is now active.
        // Mirrors the hold-start notice sent from creatorService.subscribeToCreator.
        try {
          const { rows: creatorRows } = await query(
            'SELECT COALESCE(first_name, username, $1) AS name FROM users WHERE id = $1',
            [String(creatorId)]
          );
          const creatorName = creatorRows[0]?.name || 'the creator';
          NotificationEmitter.emit({
            type: 'creator_subscription_activated',
            category: 'commerce',
            priority: 'high',
            actorId: String(creatorId),
            targetUserId: String(sub.subscriber_id),
            entityType: 'creator_subscription',
            entityId: String(sub.id),
            message: `Your subscription to ${creatorName} is now active — full access for the next ${durationDays} days.`,
            metadata: {
              url: `/c/${creatorId}`,
              pushTitle: 'Subscription activated',
              pushBody: `${creatorName} unlocked your access — enjoy!`,
            },
          }).catch(() => {});
        } catch (activateNotifyErr) {
          logger.warn('markCompliantIfNewlyQualified: subscriber activate-notice failed (non-fatal)', {
            subscriberId: sub.subscriber_id, error: activateNotifyErr.message,
          });
        }

        unlockedCount++;
      } catch (rowErr) {
        logger.error('markCompliantIfNewlyQualified: failed to unlock held subscription (non-fatal, continuing)', {
          creatorId,
          subscriptionId: sub.id,
          error: rowErr.message,
        });
      }
    }

    try {
      await this._sendComplianceAchievedNotice(creatorId, unlockedCount);
    } catch (notifyErr) {
      logger.warn('markCompliantIfNewlyQualified: achieved notice failed (non-fatal)', {
        creatorId,
        error: notifyErr.message,
      });
    }

    return { unlocked: unlockedCount };
  }

  // ── Notifications (DRAFT copy — see scripts/CONTENT_COMPLIANCE_NOTICE_COPY.md; ──
  // ── nothing goes out to real creators until a human reviews/approves wording) ──

  static async _sendComplianceStartedNotice(creatorId, deadline) {
    const deadlineStr = new Date(deadline).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const message = `You have a new subscriber, but per platform guidelines your profile needs at least 4 minutes of exclusive video content before their membership starts. You have until ${deadlineStr} to upload — please complete this by then to avoid a 6-month suspension from the Creator Program.`;

    NotificationEmitter.emit({
      type: 'creator_compliance_started',
      category: 'commerce',
      priority: 'high',
      actorId: null,
      targetUserId: String(creatorId),
      entityType: 'user',
      entityId: String(creatorId),
      message,
      metadata: {
        url: '/creator-studio/content',
        pushTitle: 'Action required — new subscriber on hold',
        pushBody: `Upload 4+ min of exclusive video by ${deadlineStr} to activate your new subscriber's membership.`,
      },
    }).catch(() => {});

    try {
      const { rows } = await query(
        'SELECT email, email_verified FROM users WHERE id = $1',
        [creatorId]
      );
      const user = rows[0];
      if (user?.email && user.email_verified) {
        await EmailService.send({
          to: user.email,
          subject: 'Action required — your new subscriber is on hold',
          html: `
            <p>Hi,</p>
            <p>You have a new paid subscriber! Before we can start their membership and your earnings, our platform guidelines require your creator profile to have at least <strong>4 minutes</strong> of exclusive video content.</p>
            <p>You currently do not meet this minimum. Please upload qualifying exclusive video content by <strong>${deadlineStr}</strong>.</p>
            <p>If you upload in time, your subscriber's membership (and your earnings) will start automatically as soon as you qualify — no action needed beyond uploading.</p>
            <p>If the deadline passes without enough content, your Creator Program account will be suspended for 6 months, and the held subscriber will be refunded.</p>
            <p>Thanks for helping us keep the platform's content standards consistent for everyone.</p>
          `,
        });
      }
    } catch (emailErr) {
      logger.warn('_sendComplianceStartedNotice: email send failed (non-fatal)', {
        creatorId,
        error: emailErr.message,
      });
    }
  }

  static async _sendComplianceAchievedNotice(creatorId, unlockedCount) {
    const message = unlockedCount > 0
      ? `You're now compliant with the content requirement — your held subscriber${unlockedCount === 1 ? "'s" : "s'"} membership has officially started. Earnings will follow the normal hold schedule.`
      : `You're now compliant with the content requirement. Any future subscribers will start immediately.`;

    NotificationEmitter.emit({
      type: 'creator_compliance_achieved',
      category: 'commerce',
      priority: 'normal',
      actorId: null,
      targetUserId: String(creatorId),
      entityType: 'user',
      entityId: String(creatorId),
      message,
      metadata: {
        url: '/creator-studio',
        pushTitle: "You're compliant!",
        pushBody: message,
      },
    }).catch(() => {});

    try {
      const { rows } = await query(
        'SELECT email, email_verified FROM users WHERE id = $1',
        [creatorId]
      );
      const user = rows[0];
      if (user?.email && user.email_verified) {
        await EmailService.send({
          to: user.email,
          subject: "You're compliant — your subscriber's membership has started",
          html: `
            <p>Hi,</p>
            <p>Good news — your profile now meets the platform's content requirement. Your held subscriber${unlockedCount === 1 ? "'s" : "s'"} membership has officially started.</p>
            <p>Your earnings from this subscription will follow the normal hold schedule and become available as usual.</p>
            <p>Thanks for getting this done!</p>
          `,
        });
      }
    } catch (emailErr) {
      logger.warn('_sendComplianceAchievedNotice: email send failed (non-fatal)', {
        creatorId,
        error: emailErr.message,
      });
    }
  }
}

module.exports = ContentComplianceService;
