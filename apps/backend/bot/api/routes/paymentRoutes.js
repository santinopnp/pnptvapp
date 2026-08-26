const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateUser } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');

const { ensureEmailCredentials } = require('../../../services/userService');
const logger = require('../../../utils/logger');

const router = express.Router();

// Update email for a payment (collected on checkout page instead of subscribe page)
router.post('/:paymentId/email', authenticateUser, asyncHandler(async (req, res) => {
  const user = req.session?.user;
  if (!user?.id) return res.status(401).json({ success: false, error: 'Authentication required' });

  const { email } = req.body;
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) {
    return res.status(400).json({ success: false, error: 'A valid email address is required' });
  }

  const userId = String(user.telegramId || user.telegram_id || user.id);
  const language = user.language || 'es';

  try {
    await ensureEmailCredentials(userId, email.trim(), language);
    req.session.user = { ...req.session.user, email: email.trim() };
    res.json({ success: true });
  } catch (credErr) {
    if (credErr.message.includes('already associated')) {
      return res.status(409).json({ success: false, error: credErr.message });
    }
    logger.warn('ensureEmailCredentials failed (non-critical)', { userId, error: credErr.message });
    res.json({ success: true });
  }
}));

router.get('/confirm-payment/:token', asyncHandler(paymentController.confirmPaymentToken));

module.exports = router;
