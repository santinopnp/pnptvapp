'use strict';

const { query } = require('../config/postgres');
const logger = require('../utils/logger');

function getBot() {
  try {
    const { getBotInstance } = require('../bot/core/bot');
    return getBotInstance();
  } catch (e) {
    return null;
  }
}

async function getTelegramId(creatorId) {
  try {
    const { rows } = await query(
      `SELECT telegram AS telegram_id FROM users WHERE id = $1`,
      [creatorId]
    );
    return rows[0]?.telegram_id || null;
  } catch {
    return null;
  }
}

async function sendDm(telegramId, text, replyMarkup = null) {
  const bot = getBot();
  if (!bot || !telegramId) return;
  try {
    await bot.telegram.sendMessage(telegramId, text, {
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  } catch (err) {
    const code = err.response?.error_code;
    if (code === 403 || code === 400) return; // blocked or chat not found
    logger.warn('[parcheNotification] Telegram DM failed', { telegramId, code, error: err.message });
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function sendParcheInvite(inviteeUser, inviterCreator, parche) {
  const telegramId = inviteeUser.telegram_id || await getTelegramId(inviteeUser.id);
  if (!telegramId) return;

  const cityPart = parche.location_city ? ` in ${parche.location_city}` : '';
  const inviterName = inviterCreator.display_name || inviterCreator.username || 'A creator';
  const text = [
    `🎉 <b>${inviterName}</b> is putting together a Parche called <b>"${parche.name}"</b>${cityPart} and wants you in!`,
    '',
    `A Parche lets you offer group calls together — you set the packages and pricing as a crew. Interested?`,
  ].join('\n');

  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ I\'m in!', callback_data: `parche_accept_${parche.id}` },
      { text: 'Not right now', callback_data: `parche_decline_${parche.id}` },
    ]],
  };

  await sendDm(telegramId, text, replyMarkup);
}

async function sendInviteAccepted(ownerUser, joinedCreator, parche, isNowActive) {
  const telegramId = ownerUser.telegram_id || await getTelegramId(ownerUser.id);
  if (!telegramId) return;

  const joinerName = joinedCreator.display_name || joinedCreator.username || 'A creator';
  const activeLine = isNowActive
    ? '\n\nYour Parche is now active! Head to your Creator Studio to open it for bookings. 🚀'
    : '';

  const text = `🎊 <b>${joinerName}</b> joined your Parche <b>"${parche.name}"</b>!${activeLine}`;
  await sendDm(telegramId, text);
}

async function sendBookingConfirmed(parcheMembers, buyer, booking, parche, packageData) {
  const buyerName = buyer.display_name || buyer.username || 'Someone';
  const durationLabel = packageData.durationMinutes ? `${packageData.durationMinutes}-min` : '';
  const pkgTitle = packageData.title || `${durationLabel} Group Call`;

  let scheduleInfo = '';
  if (booking.scheduled_at) {
    const dt = new Date(booking.scheduled_at);
    scheduleInfo = `\n📅 Scheduled: <b>${dt.toUTCString()}</b>`;
  }

  const text = [
    `📞 New Parche booking!`,
    `<b>${buyerName}</b> booked <b>"${pkgTitle}"</b> with <b>${parche.name}</b>.${scheduleInfo}`,
    '',
    `Join via your Creator Studio when it's time.`,
  ].join('\n');

  for (const member of parcheMembers) {
    if (!member.telegram_id) continue;
    await sendDm(member.telegram_id, text);
  }
}

// ── Callback handlers ─────────────────────────────────────────────────────────

function registerParcheCallbacks(bot) {
  bot.action(/^parche_accept_(.+)$/, async (ctx) => {
    try {
      const parcheId = ctx.match[1];
      const telegramId = ctx.from?.id;
      if (!telegramId) return ctx.answerCbQuery('Could not identify you.');

      const { rows } = await query(
        `SELECT id FROM users WHERE telegram = $1 LIMIT 1`,
        [String(telegramId)]
      );
      if (!rows.length) return ctx.answerCbQuery('Account not found.');

      const creatorId = rows[0].id;
      const parcheService = require('./parcheService');
      await parcheService.respondToInvite(parcheId, creatorId, true);

      await ctx.editMessageText('🎊 Welcome to the crew! Head to your Creator Studio to set up the Parche.', {
        parse_mode: 'HTML',
      }).catch(() => {});
      await ctx.answerCbQuery('You joined the Parche!');
    } catch (err) {
      logger.warn('[parcheNotification] accept callback error', { error: err.message });
      await ctx.answerCbQuery(err.message || 'Something went wrong').catch(() => {});
    }
  });

  bot.action(/^parche_decline_(.+)$/, async (ctx) => {
    try {
      const parcheId = ctx.match[1];
      const telegramId = ctx.from?.id;
      if (!telegramId) return ctx.answerCbQuery('Could not identify you.');

      const { rows } = await query(
        `SELECT id FROM users WHERE telegram = $1 LIMIT 1`,
        [String(telegramId)]
      );
      if (!rows.length) return ctx.answerCbQuery('Account not found.');

      const creatorId = rows[0].id;
      const parcheService = require('./parcheService');
      await parcheService.respondToInvite(parcheId, creatorId, false);

      await ctx.editMessageText('Got it, no worries! The invite has been declined.', {
        parse_mode: 'HTML',
      }).catch(() => {});
      await ctx.answerCbQuery('Invite declined');
    } catch (err) {
      logger.warn('[parcheNotification] decline callback error', { error: err.message });
      await ctx.answerCbQuery(err.message || 'Something went wrong').catch(() => {});
    }
  });

  logger.info('✓ Parche Telegram callbacks registered');
}

module.exports = {
  sendParcheInvite,
  sendInviteAccepted,
  sendBookingConfirmed,
  registerParcheCallbacks,
};
