/**
 * controllers/authController.js — Authentication
 * Simple phone+password auth. OTP flow is stubbed for future integration.
 */

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// ─── POST /api/auth/register ───────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { phone, password, name, businessName, gstin } = req.body;

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Phone number already registered' });
    }

    const user = await User.create({ phone, password, name, businessName, gstin });
    const token = generateToken(user._id);

    logger.info(`New user registered: ${user._id}`);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        businessName: user.businessName,
        plan: user.plan,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        businessName: user.businessName,
        plan: user.plan,
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

module.exports = { register, login, getMe };