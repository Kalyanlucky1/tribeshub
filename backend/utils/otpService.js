const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
const pool = require('../config/database');

// Initialize services
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const saveOTP = async (identifier, otpCode, type) => {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
  
  // Remove any existing OTPs for this identifier
  await pool.query(
    'DELETE FROM otps WHERE identifier = $1 AND type = $2',
    [identifier, type]
  );
  
  // Insert new OTP
  await pool.query(
    'INSERT INTO otps (identifier, otp_code, type, expires_at) VALUES ($1, $2, $3, $4)',
    [identifier, otpCode, type, expiresAt]
  );
  
  return otpCode;
};

const sendEmailOTP = async (email, purpose = 'verification') => {
  try {
    const otpCode = generateOTP();
    await saveOTP(email, otpCode, 'email');
    
    const msg = {
      to: email,
      from: process.env.FROM_EMAIL || 'noreply@tribeshub.com',
      subject: `TribesHub - Your OTP Code`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6366f1; margin: 0;">TribesHub</h1>
            <p style="color: #666; margin: 5px 0;">Connect. Create. Celebrate.</p>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border-radius: 12px; text-align: center;">
            <h2 style="color: #1f2937; margin-bottom: 20px;">Your Verification Code</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; color: #6366f1; letter-spacing: 4px;">${otpCode}</span>
            </div>
            <p style="color: #6b7280; margin: 20px 0;">
              This code will expire in <strong>10 minutes</strong>
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 12px;">
            <p>&copy; 2024 TribesHub. All rights reserved.</p>
          </div>
        </div>
      `
    };
    
    if (process.env.SENDGRID_API_KEY) {
      await sgMail.send(msg);
      console.log(`📧 OTP sent to email: ${email}`);
    } else {
      console.log(`📧 [DEV] OTP for ${email}: ${otpCode}`);
    }
    
    return otpCode;
  } catch (error) {
    console.error('Error sending email OTP:', error);
    throw new Error('Failed to send OTP email');
  }
};

const sendSMSOTP = async (phone, purpose = 'verification') => {
  try {
    const otpCode = generateOTP();
    await saveOTP(phone, otpCode, 'phone');
    
    const message = `Your TribesHub verification code is: ${otpCode}. This code expires in 10 minutes.`;
    
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
      });
      console.log(`📱 OTP sent to phone: ${phone}`);
    } else {
      console.log(`📱 [DEV] OTP for ${phone}: ${otpCode}`);
    }
    
    return otpCode;
  } catch (error) {
    console.error('Error sending SMS OTP:', error);
    throw new Error('Failed to send OTP SMS');
  }
};

const verifyOTP = async (identifier, otpCode, type) => {
  try {
    const result = await pool.query(
      'SELECT * FROM otps WHERE identifier = $1 AND otp_code = $2 AND type = $3 AND used = FALSE AND expires_at > NOW()',
      [identifier, otpCode, type]
    );
    
    if (result.rows.length === 0) {
      return { success: false, message: 'Invalid or expired OTP' };
    }
    
    // Mark OTP as used
    await pool.query(
      'UPDATE otps SET used = TRUE WHERE id = $1',
      [result.rows[0].id]
    );
    
    return { success: true, message: 'OTP verified successfully' };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return { success: false, message: 'Failed to verify OTP' };
  }
};

const cleanupExpiredOTPs = async () => {
  try {
    await pool.query('DELETE FROM otps WHERE expires_at < NOW()');
    console.log('🧹 Cleaned up expired OTPs');
  } catch (error) {
    console.error('Error cleaning up OTPs:', error);
  }
};

// Clean up expired OTPs every hour
setInterval(cleanupExpiredOTPs, 60 * 60 * 1000);

module.exports = {
  sendEmailOTP,
  sendSMSOTP,
  verifyOTP,
  cleanupExpiredOTPs
};