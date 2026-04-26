/**
 * models/User.js — Mongoose schema for User
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'],
    },
    name: {
      type: String,
      trim: true,
    },
    email: {
  type: String,
  unique: true,
  sparse: true, // allows null values but enforces uniqueness if present
  lowercase: true,
  trim: true,
  match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
},
    businessName: {
      type: String,
      trim: true,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },

    // Password (optional if using OTP-only auth)
    password: {
      type: String,
      minlength: 6,
      select: false, // never returned in queries by default
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // ─── Subscription / Plan ──────────────────────────────────────────────────

    plan: {
      type: String,
      enum: ['free', 'starter', 'pro', 'enterprise'],
      default: 'free',
    },

    // Date when the current paid plan expires (null = free / lifetime)
    planExpiresAt: {
      type: Date,
      default: null,
    },

    // Razorpay / payment gateway subscription ID for renewals
    paymentSubscriptionId: {
      type: String,
      default: null,
      select: false,
    },

    // ─── Scan Usage ───────────────────────────────────────────────────────────

    // How many scans the user has consumed in the current billing month
    monthlyScansUsed: {
      type: Number,
      default: 0,
    },

    // Start of the current billing window — resets every 30 days
    lastScanResetDate: {
      type: Date,
      default: Date.now,
    },
    deviceToken: {
      type: String,
      default: null,
    },

    // ─── Referral ─────────────────────────────────────────────────────────────
    // Stores the referral/partner code entered at registration (no validation)
    referCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    // ─── Password Reset OTP ───────────────────────────────────────────────────
    resetOtp: {
      type: String,
      select: false,
    },
    resetOtpExpires: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true }
);

// ─── Plan Limits Map ─────────────────────────────────────────────────────────

UserSchema.statics.PLAN_LIMITS = {
  free:       { scanLimit: 5,   historyMonths: 1,    label: 'Free' },
  starter:    { scanLimit: 50, historyMonths: 6,    label: 'Starter' },
  pro:        { scanLimit: 250, historyMonths: null,  label: 'Pro' },       // null = unlimited history
  enterprise: { scanLimit: null, historyMonths: null, label: 'Enterprise' }, // null = unlimited scans
};

// ─── Instance Methods ─────────────────────────────────────────────────────────

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Returns true if the user is within their monthly scan quota
UserSchema.methods.canScan = function () {
  const limits = mongoose.model('User').PLAN_LIMITS[this.plan] || mongoose.model('User').PLAN_LIMITS.free;
  if (limits.scanLimit === null) return true; // enterprise — unlimited
  return this.monthlyScansUsed < limits.scanLimit;
};

// Returns how many scans remain this month (null = unlimited)
UserSchema.methods.scansRemaining = function () {
  const limits = mongoose.model('User').PLAN_LIMITS[this.plan] || mongoose.model('User').PLAN_LIMITS.free;
  if (limits.scanLimit === null) return null;
  return Math.max(0, limits.scanLimit - this.monthlyScansUsed);
};

// Resets monthly scan count if 30 days have passed since lastScanResetDate
UserSchema.methods.resetScansIfNeeded = async function () {
  const now = new Date();
  const daysSinceReset = (now - this.lastScanResetDate) / (1000 * 60 * 60 * 24);
  if (daysSinceReset >= 30) {
    this.monthlyScansUsed = 0;
    this.lastScanResetDate = now;
    await this.save();
  }
};

// Downgrades user to free plan if planExpiresAt has passed
UserSchema.methods.checkPlanExpiry = async function () {
  if (
    this.plan !== 'free' &&
    this.planExpiresAt &&
    new Date() > this.planExpiresAt
  ) {
    this.plan = 'free';
    this.planExpiresAt = null;
    this.paymentSubscriptionId = null;
    this.monthlyScansUsed = 0;
    await this.save();
    return true; // was expired
  }
  return false; // still valid
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

module.exports = mongoose.model('User', UserSchema);