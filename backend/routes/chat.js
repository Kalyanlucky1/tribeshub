const express = require('express');
const router = express.Router();
const { upload } = require('../utils/cloudinary');
const { authenticateToken } = require('../middleware/auth');
const {
  sendMessage,
  getDirectMessages,
  getCommunityMessages,
  getConversations,
  deleteMessage,
  markAsRead
} = require('../controllers/chatController');

// All chat routes require authentication
router.use(authenticateToken);

// Message routes
router.post('/send', upload.single('image'), sendMessage);
router.get('/conversations', getConversations);
router.get('/direct/:user_id', getDirectMessages);
router.get('/community/:community_id', getCommunityMessages);
router.delete('/message/:id', deleteMessage);
router.post('/mark-read', markAsRead);

module.exports = router;