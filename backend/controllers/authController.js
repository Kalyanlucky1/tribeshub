const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { sendEmailOTP, sendSMSOTP, verifyOTP } = require('../utils/otpService');
const { uploadProfilePicture } = require('../utils/cloudinary');
const { logUserSignup, logUserLogin, logPasswordChange } = require('../utils/activityLogger');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Register user
const register = async (req, res) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const {
      name,
      username,
      email,
      phone,
      password,
      interests,
      country,
      state,
      city
    } = req.body;

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Handle profile picture upload
    let profilePicUrl = null;
    if (req.file) {
      try {
        const uploadResult = await uploadProfilePicture(req.file.buffer);
        profilePicUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error('Profile picture upload error:', uploadError);
      }
    }

    // Parse interests array
    const interestsArray = Array.isArray(interests) ? interests : 
                          (typeof interests === 'string' ? interests.split(',') : []);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (
        name, username, email, phone, password_hash, 
        profile_pic, interests, country, state, city
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING id, name, username, email, phone, profile_pic, interests, country, state, city, points, created_at`,
      [name, username, email, phone, hashedPassword, profilePicUrl, interestsArray, country, state, city]
    );

    const user = result.rows[0];

    // Send verification OTPs
    if (email) {
      try {
        await sendEmailOTP(email, 'registration');
      } catch (error) {
        console.error('Email OTP error:', error);
      }
    }

    if (phone) {
      try {
        await sendSMSOTP(phone, 'registration');
      } catch (error) {
        console.error('SMS OTP error:', error);
      }
    }

    // Log activity
    await logUserSignup(user.id, user);

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'User registered successfully. Please verify your email and phone.',
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        profile_pic: user.profile_pic,
        interests: user.interests,
        country: user.country,
        state: user.state,
        city: user.city,
        points: user.points,
        created_at: user.created_at
      },
      token,
      needsVerification: true
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or username

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }

    // Find user by email or username
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR username = $1',
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if account is suspended
    if (user.is_suspended) {
      return res.status(403).json({ error: 'Account suspended. Please contact support.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login time
    await pool.query(
      'UPDATE users SET last_login_time = NOW() WHERE id = $1',
      [user.id]
    );

    // Log activity
    await logUserLogin(user.id, { loginMethod: 'password' });

    // Generate token
    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        profile_pic: user.profile_pic,
        interests: user.interests,
        country: user.country,
        state: user.state,
        city: user.city,
        points: user.points,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
        is_admin: user.is_admin
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

// Verify OTP
const verifyOTPEndpoint = async (req, res) => {
  try {
    const { identifier, otp, type } = req.body; // type: 'email' or 'phone'

    if (!identifier || !otp || !type) {
      return res.status(400).json({ error: 'Identifier, OTP, and type are required' });
    }

    const verificationResult = await verifyOTP(identifier, otp, type);

    if (!verificationResult.success) {
      return res.status(400).json({ error: verificationResult.message });
    }

    // Update user verification status
    const updateField = type === 'email' ? 'email_verified' : 'phone_verified';
    const identifierField = type === 'email' ? 'email' : 'phone';
    
    await pool.query(
      `UPDATE users SET ${updateField} = TRUE WHERE ${identifierField} = $1`,
      [identifier]
    );

    res.json({
      message: `${type === 'email' ? 'Email' : 'Phone'} verified successfully`,
      verified: true
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    const { identifier, type } = req.body; // type: 'email' or 'phone'

    if (!identifier || !type) {
      return res.status(400).json({ error: 'Identifier and type are required' });
    }

    if (type === 'email') {
      await sendEmailOTP(identifier);
    } else if (type === 'phone') {
      await sendSMSOTP(identifier);
    } else {
      return res.status(400).json({ error: 'Invalid type. Use "email" or "phone"' });
    }

    res.json({
      message: `OTP sent to ${type === 'email' ? 'email' : 'phone number'}`,
      sent: true
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// Check username availability
const checkUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    res.json({
      available: result.rows.length === 0,
      username
    });

  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ error: 'Failed to check username' });
  }
};

// Forgot password - send OTP
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found with this email' });
    }

    await sendEmailOTP(email, 'password_reset');

    res.json({
      message: 'Password reset OTP sent to your email',
      sent: true
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to send password reset OTP' });
  }
};

// Reset password with OTP
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    // Verify OTP
    const verificationResult = await verifyOTP(email, otp, 'email');
    
    if (!verificationResult.success) {
      return res.status(400).json({ error: verificationResult.message });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2 RETURNING id',
      [hashedPassword, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log activity
    await logPasswordChange(result.rows[0].id);

    res.json({
      message: 'Password reset successfully',
      success: true
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// Change password (authenticated user)
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, otp } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword || !otp) {
      return res.status(400).json({ error: 'Current password, new password, and OTP are required' });
    }

    // Get user
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Verify OTP
    const verificationResult = await verifyOTP(user.email, otp, 'email');
    
    if (!verificationResult.success) {
      return res.status(400).json({ error: verificationResult.message });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );

    // Log activity
    await logPasswordChange(userId);

    res.json({
      message: 'Password changed successfully',
      success: true
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// Send OTP for password change
const sendChangePasswordOTP = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user email
    const result = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    await sendEmailOTP(user.email, 'password_change');

    res.json({
      message: 'OTP sent to your email for password change verification',
      sent: true
    });

  } catch (error) {
    console.error('Send change password OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

// Validation rules
const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 255 }).withMessage('Name must be 2-255 characters'),
  body('username').trim().isLength({ min: 3, max: 100 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Username must be 3-100 characters and contain only letters, numbers, and underscores'),
  body('email').isEmail().withMessage('Invalid email format'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number format')
];

module.exports = {
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
};