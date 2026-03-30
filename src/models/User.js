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

    // Subscription tier (for future monetization)
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },

    // Monthly invoice scan limits (per plan)
    monthlyScansUsed: {
      type: Number,
      default: 0,
    },

    lastScanResetDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);