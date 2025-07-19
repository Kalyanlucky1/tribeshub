const express = require('express');
const router = express.Router();
const { upload } = require('../utils/cloudinary');
const { authenticateToken } = require('../middleware/auth');
const {
  register,
  login,
  verifyOTPEndpoint,
  resendOTP,
  checkUsername,
  forgotPassword,
  resetPassword,
  changePassword,
  sendChangePasswordOTP,
  registerValidation
} = require('../controllers/authController');

// Public routes
router.post('/register', upload.single('profile_pic'), registerValidation, register);
router.post('/login', login);
router.post('/verify-otp', verifyOTPEndpoint);
router.post('/resend-otp', resendOTP);
router.get('/check-username/:username', checkUsername);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.post('/change-password', authenticateToken, changePassword);
router.post('/send-change-password-otp', authenticateToken, sendChangePasswordOTP);

module.exports = router;