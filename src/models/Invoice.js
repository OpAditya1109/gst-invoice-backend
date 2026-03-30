/**
 * models/Invoice.js — Mongoose schema for GST Invoice
 *
 * Stores all OCR-extracted data + user edits + GST computation results.
 * Indexed by userId and date for fast dashboard queries.
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

    // ── Invoice Core Fields (OCR-extracted, user-editable) ───────────────────
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      // GSTIN format: 2-digit state code + 10-char PAN + 1 entity + 1 Z + 1 check
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format'],
    },

    invoiceNumber: {
      type: String,
      trim: true,
    },

    invoiceDate: {
      type: Date,
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

    // ── Computed Fields (set by GSTService) ──────────────────────────────────
    totalGst: {
      type: Number,
      default: 0,
    },

    transactionType: {
      type: String,
      enum: ['intra-state', 'inter-state', 'unknown'],
      default: 'unknown',
    },

    // Input = purchase invoice (GST paid), Output = sale invoice (GST collected)
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
      type: String, // relative path or cloud URL
    },

    rawOcrText: {
      type: String, // Full Vision API text output (for debugging/reparse)
    },

    ocrConfidence: {
      type: Number, // 0–1, average confidence from Vision API
      min: 0,
      max: 1,
    },

    // Track if user manually edited OCR results
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
    timestamps: true, // adds createdAt, updatedAt
    toJSON: { virtuals: true },
  }
);

// ── Compound index for dashboard queries (user + month filter) ─────────────────
InvoiceSchema.index({ userId: 1, invoiceDate: -1 });
InvoiceSchema.index({ userId: 1, invoiceType: 1, invoiceDate: -1 });

// ── Virtual: formatted month string for grouping ───────────────────────────────
InvoiceSchema.virtual('monthYear').get(function () {
  if (!this.invoiceDate) return null;
  const d = new Date(this.invoiceDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});

module.exports = mongoose.model('Invoice', InvoiceSchema);