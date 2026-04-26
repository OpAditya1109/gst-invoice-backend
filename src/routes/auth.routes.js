/**
 * routes/auth.routes.js
 */

const express = require('express');
const {
  register,
  login,
  getMe,
  saveDeviceToken,
  forgotPassword,
  verifyOtp,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { sendTestNotification } = require('../controllers/testController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/device-token', protect, saveDeviceToken);
router.get('/test-notification', protect, sendTestNotification);

// Password reset via email OTP
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

module.exports = router;
