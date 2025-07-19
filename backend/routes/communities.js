const express = require('express');
const router = express.Router();
const { upload } = require('../utils/cloudinary');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  createCommunity,
  getCommunities,
  getCommunityById,
  joinCommunity,
  leaveCommunity,
  getUserCommunities,
  updateCommunity,
  deleteCommunity
} = require('../controllers/communityController');

// Public/Optional auth routes
router.get('/', optionalAuth, getCommunities);
router.get('/:id', optionalAuth, getCommunityById);

// Protected routes
router.post('/', authenticateToken, upload.single('image'), createCommunity);
router.post('/:id/join', authenticateToken, joinCommunity);
router.delete('/:id/leave', authenticateToken, leaveCommunity);
router.get('/user/my-communities', authenticateToken, getUserCommunities);
router.put('/:id', authenticateToken, upload.single('image'), updateCommunity);
router.delete('/:id', authenticateToken, deleteCommunity);

module.exports = router;