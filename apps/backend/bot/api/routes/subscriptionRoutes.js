const express = require('express');
const subscriptionPaymentController = require('../controllers/subscriptionPaymentController');
const authGuard = require('../middleware/authGuard');
const channelPassService = require('../../../services/channelPassService');
const logger = require('../../../utils/logger');

const router = express.Router();

/**
 * Public Subscription Routes
 */

// GET /api/subscriptions/plans?role=user
router.get('/plans', subscriptionPaymentController.getPlans);

/**
 * Protected Subscription Routes
 */

// GET /api/subscriptions/my-subscription
router.get('/my-subscription', authGuard, subscriptionPaymentController.getMySubscription);

// POST /api/subscriptions/checkout
router.post('/checkout', authGuard, subscriptionPaymentController.createCheckout);

// POST /api/subscriptions/cancel
router.post('/cancel', authGuard, subscriptionPaymentController.cancelSubscription);

// GET /api/subscriptions/history
router.get('/history', authGuard, subscriptionPaymentController.getPaymentHistory);

// GET /api/subscriptions/feature-access?feature=unlimitedStreams
router.get('/feature-access', authGuard, subscriptionPaymentController.checkFeatureAccess);

// ── Channel Pass endpoints ────────────────────────────────────────────────

// GET /api/subscriptions/creators/:creatorId/channel-pass
// Auth optional: returns pass info; if authenticated also returns is_active.
router.get('/creators/:creatorId/channel-pass', async (req, res) => {
  try {
    const viewerId = req.session?.user?.id || null;
    const info = await channelPassService.getCreatorPassInfo(req.params.creatorId, viewerId);
    return res.json({ success: true, data: info });
  } catch (err) {
    logger.error('[channelPassRoute] getCreatorPassInfo error', { error: err.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch channel pass info.' } });
  }
});

// POST /api/subscriptions/creators/:creatorId/channel-pass/checkout
// Body: { provider: 'rush'|'wallet_usdc'|'nowpayments'|'stripe'|'moonpay', payCurrency?: string }
//
// Response shapes by provider:
//   rush         → { success, data: { expires_at, new_balance, subscription_id } }
//   wallet_usdc  → { success, data: { payment_id, receiving_address, amount_native,
//                                     amount_usdc, chain, token, contract_address, expires_at } }
//   nowpayments  → { success, data: { payment_url, order_id, nowpayments_invoice_id, pay_currency } }
//   stripe/moonpay → { success: false, error: { code: 'NOT_IMPLEMENTED_YET' } } (HTTP 501)
router.post('/creators/:creatorId/channel-pass/checkout', authGuard, async (req, res) => {
  const userId = req.session?.user?.id;
  const { creatorId } = req.params;
  const { provider, payCurrency } = req.body || {};

  const VALID_PROVIDERS = ['rush', 'stripe', 'moonpay', 'wallet_usdc', 'nowpayments'];
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PROVIDER', message: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` },
    });
  }

  try {
    if (provider === 'rush') {
      const result = await channelPassService.purchaseWithRush({ userId, creatorId });
      return res.json({ success: true, data: result });
    }

    if (provider === 'wallet_usdc') {
      const result = await channelPassService.purchaseWithFiat({ userId, creatorId, provider: 'wallet_usdc' });
      return res.json({ success: true, data: result });
    }

    if (provider === 'nowpayments') {
      const result = await channelPassService.purchaseWithFiat({
        userId,
        creatorId,
        provider: 'nowpayments',
        payCurrency: payCurrency || null,
      });
      return res.json({ success: true, data: result });
    }

    // stripe / moonpay — not yet implemented
    const result = await channelPassService.purchaseWithFiat({ userId, creatorId, provider });
    return res.status(501).json({ success: false, error: result });
  } catch (err) {
    if (err && err.code === 'SELF_SUBSCRIBE') {
      return res.status(403).json({ success: false, error: { code: 'SELF_SUBSCRIBE', message: err.message } });
    }
    if (err && err.code === 'PASS_NOT_ENABLED') {
      return res.status(400).json({ success: false, error: { code: 'PASS_NOT_ENABLED', message: err.message } });
    }
    if (err && err.code === 'INSUFFICIENT_FUNDS') {
      return res.status(402).json({ success: false, error: { code: 'INSUFFICIENT_FUNDS', message: 'Not enough Ru$h. Top up your wallet and try again.' } });
    }
    if (err && err.code === 'CRYPTO_INIT_FAILED') {
      return res.status(502).json({ success: false, error: { code: 'CRYPTO_INIT_FAILED', message: err.message } });
    }
    if (err && err.code === 'NOWPAYMENTS_ERROR') {
      return res.status(502).json({ success: false, error: { code: 'NOWPAYMENTS_ERROR', message: err.message } });
    }
    if (err && err.code === 'NOWPAYMENTS_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, error: { code: 'NOWPAYMENTS_NOT_CONFIGURED', message: err.message } });
    }
    logger.error('[channelPassRoute] checkout error', { userId, creatorId, provider, error: err.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Purchase failed. Please try again.' } });
  }
});

// POST /api/subscriptions/creator/settings/channel-pass
// Only the creator themselves can call this.
router.post('/creator/settings/channel-pass', authGuard, async (req, res) => {
  const userId = req.session?.user?.id;
  const { enabled, price_usd } = req.body || {};

  if (enabled === undefined) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: '`enabled` is required.' } });
  }

  try {
    const result = await channelPassService.setCreatorPassSettings({
      creatorId: userId,
      enabled,
      priceUsd: price_usd,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    if (err && err.code === 'INVALID_PRICE') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_PRICE', message: err.message } });
    }
    logger.error('[channelPassRoute] setCreatorPassSettings error', { userId, error: err.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update settings.' } });
  }
});

// GET /api/subscriptions/user/channel-passes
router.get('/user/channel-passes', authGuard, async (req, res) => {
  const userId = req.session?.user?.id;
  try {
    const passes = await channelPassService.listUserPasses(userId);
    return res.json({ success: true, data: passes });
  } catch (err) {
    logger.error('[channelPassRoute] listUserPasses error', { userId, error: err.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch your passes.' } });
  }
});

// POST /api/subscriptions/user/channel-passes/:subscriptionId/cancel
router.post('/user/channel-passes/:subscriptionId/cancel', authGuard, async (req, res) => {
  const userId = req.session?.user?.id;
  const { subscriptionId } = req.params;
  try {
    const result = await channelPassService.cancelPass({ userId, subscriptionId });
    return res.json({ success: true, data: result });
  } catch (err) {
    if (err && err.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
    }
    logger.error('[channelPassRoute] cancelPass error', { userId, subscriptionId, error: err.message });
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel pass.' } });
  }
});

module.exports = router;
