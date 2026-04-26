/**
 * controllers/invoiceController.js — Invoice CRUD + OCR processing
 */

const Invoice = require('../models/Invoice');
const { extractTextFromImage } = require('../services/ocrService');
const { calculateGST, calculateMonthlySummary } = require('../services/gstCalculationService');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const fs = require('fs');
const User = require('../models/User'); // add at top of file
const trackEvent = require('../utils/trackEvent');


// ─── POST /api/invoices/upload ─────────────────────────────────────────────────
const uploadInvoice = async (req, res, next) => {
  const imagePath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const { rawText, confidence, structured } = await extractTextFromImage(imagePath);

    const invoiceType = req.body.invoiceType || 'input';
    let parsedData = mapMindeeToInvoice(structured);

    // 🔧 Normalize data
    parsedData.invoiceNumber = parsedData.invoiceNumber?.trim().toUpperCase();
    parsedData.gstin = parsedData.gstin?.trim().toUpperCase();

    // ❌ Validation
    if (!parsedData.invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number is required',
      });
    }

    // 🧠 Clean GSTIN
    if (!parsedData.gstin || parsedData.gstin.length < 10) {
      parsedData.gstin = null;
    }

    // 🛡️ Safe date handling (FIXED BUG)
    const invoiceDate = parsedData.invoiceDate || new Date();

    // 🔍 DUPLICATE CHECK (FIXED LOGIC)
    const query = {
      userId: req.user.id,
      invoiceNumber: parsedData.invoiceNumber,
      totalAmount: parsedData.totalAmount,
      invoiceType,
    };

    if (parsedData.gstin) {
      query.gstin = parsedData.gstin;
    }

    const existingInvoice = await Invoice.findOne({
      ...query,
      invoiceDate: {
        $gte: new Date(invoiceDate.getTime() - 24 * 60 * 60 * 1000),
        $lte: new Date(invoiceDate.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    if (existingInvoice) {
      logger.warn(`Duplicate invoice attempt: ${parsedData.invoiceNumber}`);

await trackEvent(req.user.id, "duplicate_invoice_attempt", {
  invoiceNumber: parsedData.invoiceNumber,
});
      return res.status(409).json({
        success: false,
        message: 'Duplicate invoice detected ⚠️',
        duplicate: true,
        existingInvoiceId: existingInvoice._id,
      });
    }

    // 🧮 GST Calculation
    const gstCalc = calculateGST({ ...parsedData, invoiceType });

    const invoice = new Invoice({
      userId: req.user.id,
      ...parsedData,
      ...gstCalc,
      invoiceType,
      imageUrl: `/uploads/${req.file.filename}`,
      rawOcrText: rawText,
      ocrConfidence: confidence,
    });

    await invoice.save();
    logger.info(`Invoice saved: ${invoice._id}`);
     trackEvent(req.user.id, "invoice_uploaded", {
  amount: invoice.totalAmount,
  gst: invoice.totalGst,
  type: invoice.invoiceType,
}).catch(() => {});
const user = await User.findById(req.user.id);

await user.resetScansIfNeeded();
user.monthlyScansUsed += 1;
await user.save();
trackEvent(req.user.id, "scan_used", {
  scansUsed: user.monthlyScansUsed,
}).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Invoice processed successfully',
      data: invoice,
    });
  } catch (error) {
    if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    next(error);
  }
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const mapMindeeToInvoice = (structured = {}) => ({
  gstin: structured.gstin || null,
  invoiceNumber: structured.invoiceNumber || null,
  invoiceDate: parseDateSafe(structured.invoiceDate) || new Date(),
  vendorName: structured.vendorName || null,
  totalAmount: toNumber(structured.totalAmount),
  cgst: toNumber(structured.cgst),
  sgst: toNumber(structured.sgst),
  igst: toNumber(structured.igst),
});

const parseDateSafe = (dateStr) => {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d)) return d;

    const [dd, mm, yyyy] = dateStr.split(/[\/\-]/);
    if (dd && mm && yyyy) {
      const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const toNumber = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

// ─── GET /api/invoices ─────────────────────────────────────────────────────────
const getInvoices = async (req, res, next) => {
  try {
    const { month, type, page = 1, limit = 20 } = req.query;

    const filter = { userId: req.user.id };

    if (month) {
      const [year, mon] = month.split('-').map(Number);
      filter.invoiceDate = {
        $gte: new Date(year, mon - 1, 1),
        $lt: new Date(year, mon, 1),
      };
    }

    if (type) {
      filter.invoiceType = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Invoice.countDocuments(filter),
    ]);
trackEvent(req.user.id, "invoice_list_viewed").catch(() => {});
    res.json({
      success: true,
      data: invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/invoices/summary ─────────────────────────────────────────────────
const getSummary = async (req, res, next) => {
  try {
    const { month } = req.query;

    let year, mon;

    const filter = { userId: req.user.id };

    if (month) {
      [year, mon] = month.split('-').map(Number);
      filter.invoiceDate = {
        $gte: new Date(year, mon - 1, 1),
        $lt: new Date(year, mon, 1),
      };
    }

    const invoices = await Invoice.find(filter).lean();
    const summary = calculateMonthlySummary(invoices);

    const dateFilter = month
      ? {
          invoiceDate: {
            $gte: new Date(year, mon - 1, 1),
            $lt: new Date(year, mon, 1),
          },
        }
      : {};

    const breakdown = await Invoice.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: '$invoiceType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          totalGst: { $sum: '$totalGst' },
        },
      },
    ]);
 trackEvent(req.user.id, "summary_viewed", {
  month: month || "all",
}).catch(() => {});
    res.json({
      success: true,
      data: {
        ...summary,
        month: month || 'all',
        breakdown,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /api/invoices/:id ─────────────────────────────────────────────────────
const editInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const allowedFields = [
      'gstin',
      'invoiceNumber',
      'invoiceDate',
      'vendorName',
      'totalAmount',
      'cgst',
      'sgst',
      'igst',
      'invoiceType',
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const taxFieldsChanged = ['cgst', 'sgst', 'igst', 'invoiceType'].some(
      (f) => updates[f] !== undefined
    );

    if (taxFieldsChanged) {
      const existing = await Invoice.findOne({ _id: id, userId: req.user.id });

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const merged = { ...existing.toObject(), ...updates };
      const gstCalc = calculateGST(merged);
      Object.assign(updates, gstCalc);
    }

    updates.isEdited = true;

    const invoice = await Invoice.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
trackEvent(req.user.id, "invoice_edited", {
  invoiceId: id,
}).catch(() => {});
    res.json({
      success: true,
      message: 'Invoice updated',
      data: invoice,
    });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/invoices/:id ──────────────────────────────────────────────────
const deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
 trackEvent(req.user.id, "invoice_deleted", {
  invoiceId: req.params.id,
}).catch(() => {});
    res.json({
      success: true,
      message: 'Invoice permanently deleted',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadInvoice,
  getInvoices,
  getSummary,
  editInvoice,
  deleteInvoice,
};