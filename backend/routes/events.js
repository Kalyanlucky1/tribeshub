const express = require('express');
const router = express.Router();
const { upload } = require('../utils/cloudinary');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  createEvent,
  getEvents,
  getEventById,
  joinEvent,
  leaveEvent,
  getUserEvents,
  updateEvent,
  deleteEvent
} = require('../controllers/eventController');

// Public/Optional auth routes
router.get('/', optionalAuth, getEvents);
router.get('/:id', optionalAuth, getEventById);

// Protected routes
router.post('/', authenticateToken, upload.single('image'), createEvent);
router.post('/:id/join', authenticateToken, joinEvent);
router.delete('/:id/leave', authenticateToken, leaveEvent);
router.get('/user/my-events', authenticateToken, getUserEvents);
router.put('/:id', authenticateToken, upload.single('image'), updateEvent);
router.delete('/:id', authenticateToken, deleteEvent);

module.exports = router;