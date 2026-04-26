/**
 * controllers/authController.js — Authentication
 */

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const trackEvent = require('../utils/trackEvent');

// ─── Email transporter (configure via .env) ───────────────────────────────────
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─── Generate JWT ─────────────────────────────────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// ─── POST /api/auth/register ───────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    let { phone, email, password, name, businessName, gstin, referCode } = req.body;

    phone = phone?.trim();
    email = email?.toLowerCase().trim();
    referCode = referCode?.toUpperCase().trim();

    if (!phone && !email) {
      return res.status(400).json({ success: false, message: 'Phone or Email is required' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const query = [];
    if (phone) query.push({ phone });
    if (email) query.push({ email });

    const existingUser = await User.findOne({ $or: query });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Phone or Email already registered' });
    }

    const user = await User.create({
      phone, email, password, name, businessName, gstin,
      referCode: referCode || null,
    });

    const token = generateToken(user._id);
    logger.info(`New user registered: ${user._id} | referCode: ${referCode || 'none'}`);

    await trackEvent(user._id, 'user_registered', { plan: user.plan, referCode: referCode || null });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        email: user.email || undefined,
        name: user.name,
        businessName: user.businessName,
        plan: user.plan,
        referCode: user.referCode,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    let { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password required' });
    }

    identifier = identifier.trim();

    let user;
    if (identifier.includes('@')) {
      user = await User.findOne({ email: identifier.toLowerCase() }).select('+password');
    } else {
      user = await User.findOne({ phone: identifier }).select('+password');
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    await trackEvent(user._id, 'user_login');
    user.lastActiveAt = new Date();
    await user.save();

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        email: user.email || undefined,
        name: user.name,
        businessName: user.businessName,
        plan: user.plan,
        referCode: user.referCode,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// ─── SAVE DEVICE TOKEN ─────────────────────────────────────────────────────────
const saveDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });
    await User.findByIdAndUpdate(req.user.id, { deviceToken: token });
    res.json({ success: true, message: 'Device token saved' });
  } catch (err) {
    console.error('Token save error:', err);
    res.status(500).json({ success: false });
  }
};

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────
const forgotPassword = async (req, res, next) => {
  try {
    let { email } = req.body;
    email = email?.toLowerCase().trim();

    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) {
      // Return success to prevent email enumeration
      return res.json({ success: true, message: 'If that email is registered, an OTP has been sent.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    user.resetOtp = otp;
    user.resetOtpExpires = expires;
    await user.save({ validateBeforeSave: false });

    await transporter.sendMail({
      from: `"GST Invoice" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Password Reset OTP',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0F0E2A;color:#fff;border-radius:16px;">
          <h2 style="color:#8B5CF6;margin-bottom:8px;">Password Reset</h2>
          <p style="color:rgba(255,255,255,0.6);margin-bottom:24px;">Use the OTP below to reset your password. It expires in <strong>10 minutes</strong>.</p>
          <div style="background:rgba(108,99,255,0.15);border:1px solid rgba(108,99,255,0.3);border-radius:12px;padding:24px;text-align:center;letter-spacing:10px;font-size:36px;font-weight:900;color:#A78BFA;">
            ${otp}
          </div>
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:24px;text-align:center;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    logger.info(`Password reset OTP sent to ${email}`);
    res.json({ success: true, message: 'If that email is registered, an OTP has been sent.' });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
const verifyOtp = async (req, res, next) => {
  try {
    let { email, otp } = req.body;
    email = email?.toLowerCase().trim();

    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

    const user = await User.findOne({ email }).select('+resetOtp +resetOtpExpires');

    if (!user || !user.resetOtp || !user.resetOtpExpires) {
      return res.status(400).json({ success: false, message: 'OTP not requested or already used' });
    }

    if (new Date() > user.resetOtpExpires) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (user.resetOtp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Issue short-lived reset token (5 min)
    const resetToken = jwt.sign({ id: user._id, purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: '5m' });

    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, resetToken });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/auth/reset-password ────────────────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ success: false, message: 'Reset token and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or expired. Please start over.' });
    }

    if (decoded.purpose !== 'reset') {
      return res.status(400).json({ success: false, message: 'Invalid reset token' });
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.password = newPassword;
    await user.save();

    logger.info(`Password reset for user: ${user._id}`);
    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  saveDeviceToken,
  forgotPassword,
  verifyOtp,
  resetPassword,
};