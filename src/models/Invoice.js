/**
 * models/Invoice.js — Mongoose schema for GST Invoice
 */

const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema(
  {
    // ── Owner ────────────────────────────────────────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Invoice Core Fields ───────────────────────────────────────────────────
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      // ⚠️ Relaxed validation (OCR safe)
      match: [/^[0-9A-Z]{10,15}$/, 'Invalid GSTIN format'],
    },

    invoiceNumber: {
      type: String,
      trim: true,
      required: true, // ✅ important for duplicate detection
    },

    invoiceDate: {
      type: Date,
      default: Date.now,
    },

    vendorName: {
      type: String,
      trim: true,
    },

    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── GST Breakdown ────────────────────────────────────────────────────────
    cgst: {
      type: Number,
      default: 0,
      min: 0,
    },

    sgst: {
      type: Number,
      default: 0,
      min: 0,
    },

    igst: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Computed Fields ──────────────────────────────────────────────────────
    totalGst: {
      type: Number,
      default: 0,
    },

    transactionType: {
      type: String,
      enum: ['intra-state', 'inter-state', 'unknown'],
      default: 'unknown',
    },

    invoiceType: {
      type: String,
      enum: ['input', 'output'],
      default: 'input',
    },

    itcEligible: {
      type: Boolean,
      default: true,
    },

    // ── Image & OCR Metadata ─────────────────────────────────────────────────
    imageUrl: {
      type: String,
    },

    rawOcrText: {
      type: String,
    },

    ocrConfidence: {
      type: Number,
      min: 0,
      max: 1,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    // ── Soft Delete ──────────────────────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// ── PERFORMANCE INDEXES ───────────────────────────────────────────────────────

// Dashboard queries
InvoiceSchema.index({ userId: 1, invoiceDate: -1 });
InvoiceSchema.index({ userId: 1, invoiceType: 1, invoiceDate: -1 });

// 🔥 Duplicate protection (PRODUCTION SAFE)
InvoiceSchema.index(
  { userId: 1, invoiceNumber: 1, gstin: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

// ⚡ Fast duplicate lookup
InvoiceSchema.index({ gstin: 1, invoiceNumber: 1 });

// ── VIRTUALS ──────────────────────────────────────────────────────────────────
InvoiceSchema.virtual('monthYear').get(function () {
  if (!this.invoiceDate) return null;
  const d = new Date(this.invoiceDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});

module.exports = mongoose.model('Invoice', InvoiceSchema);