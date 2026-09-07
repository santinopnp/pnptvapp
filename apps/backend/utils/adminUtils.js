const logger = require('./logger');

const getAdminIds = () => {
  const ids = process.env.ADMIN_USER_IDS || '';
  return ids.split(',').map(id => id.trim()).filter(Boolean);
};

async function isAdmin(ctx) {
  try {
    if (!ctx) return false;
    const userId = String(typeof ctx === 'object' && ctx.from ? ctx.from.id : ctx);
    const adminIds = getAdminIds();
    if (adminIds.includes(userId)) return true;

    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') && ctx.getChatMember) {
      const member = await ctx.getChatMember(userId).catch(() => null);
      if (member && (member.status === 'creator' || member.status === 'administrator')) {
        return true;
      }
    }
    return false;
  } catch (err) {
    logger.error('isAdmin check error:', err);
    return false;
  }
}

function isGroupChat(ctx) {
  return !!(ctx && ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup'));
}

function getUserFromContext(ctx) {
  if (ctx.message?.reply_to_message?.from) {
    return ctx.message.reply_to_message.from;
  }
  return ctx.from || null;
}

module.exports = {
  isAdmin,
  isGroupChat,
  getUserFromContext,
  getAdminIds,
};
