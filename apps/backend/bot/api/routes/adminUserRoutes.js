const express = require('express');
const AdminUserController = require('../controllers/adminUserController');
const usersController = require('../controllers/usersController');
const { adminGuard } = require('../../../middleware/guards');

const router = express.Router();

/**
 * Admin User Management Routes
 * All routes require admin authentication — enforced by adminGuard (DB re-fetch).
 */

router.use(adminGuard);

// Search users
router.get('/search', AdminUserController.searchUsers);

// Get user details
router.get('/:userId', AdminUserController.getUser);

// Update user (username, email, subscription, tier)
router.put('/:userId', AdminUserController.updateUser);

// Ban/Unban user
router.post('/:userId/ban', AdminUserController.toggleBan);

// Send direct message via customer service
router.post('/:userId/send-message', AdminUserController.sendDirectMessage);

// Hard-delete (Right to be Forgotten / GDPR erasure) — irreversible
// DELETE /api/admin/users/:userId/erase
router.delete('/:userId/erase', usersController.adminEraseUser);

// GET /api/admin/users/analytics/calls — survey + tip metrics (90-day window)
router.get('/analytics/calls', async (req, res) => {
  try {
    const { getCallAnalytics, getTipAnalytics } = require('../../../services/adminDashboardService');
    const [callAnalytics, tipAnalytics] = await Promise.all([
      getCallAnalytics(),
      getTipAnalytics(),
    ]);
    return res.json({ success: true, callAnalytics, tipAnalytics });
  } catch (err) {
    const logger = require('../../../utils/logger');
    logger.error('GET /analytics/calls error:', err);
    return res.status(500).json({ success: false, error: { code: 'ANALYTICS_ERROR', message: err.message } });
  }
});

module.exports = router;
