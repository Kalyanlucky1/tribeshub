const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  getDashboardStats,
  getAllUsers,
  getAllCommunities,
  getAllEvents,
  getActivityLogsEndpoint,
  getActivityStatsEndpoint,
  toggleUserSuspension,
  deleteUser,
  deleteCommunityAdmin,
  deleteEventAdmin,
  getSystemAnalytics
} = require('../controllers/adminController');

// All admin routes require authentication and admin privileges
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard overview
router.get('/stats', getDashboardStats);
router.get('/analytics', getSystemAnalytics);

// User management
router.get('/users', getAllUsers);
router.put('/users/:userId/suspend', toggleUserSuspension);
router.delete('/users/:userId', deleteUser);

// Community management
router.get('/communities', getAllCommunities);
router.delete('/communities/:communityId', deleteCommunityAdmin);

// Event management
router.get('/events', getAllEvents);
router.delete('/events/:eventId', deleteEventAdmin);

// Activity monitoring
router.get('/activity/logs', getActivityLogsEndpoint);
router.get('/activity/stats', getActivityStatsEndpoint);

module.exports = router;