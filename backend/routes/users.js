const express = require('express');
const router = express.Router();
const { upload } = require('../utils/cloudinary');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  getProfile,
  getUserByUsername,
  updateProfile,
  updatePoints,
  getDashboard,
  searchUsers
} = require('../controllers/userController');

// Profile routes
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, upload.single('profile_pic'), updateProfile);
router.get('/profile/:username', optionalAuth, getUserByUsername);

// Dashboard route
router.get('/dashboard', authenticateToken, getDashboard);

// Points route (for snap streaks)
router.post('/points', authenticateToken, updatePoints);

// Search users
router.get('/search', optionalAuth, searchUsers);

module.exports = router;