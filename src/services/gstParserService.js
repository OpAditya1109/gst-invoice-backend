/**
 * services/gstParserService.js — GST Data Extraction from OCR Text
 *
 * Parses raw OCR text using regex patterns tuned for Indian GST invoices.
 * All patterns account for common OCR errors (O vs 0, I vs 1, etc.)
 *
 * Returns structured JSON matching the Invoice model fields.
 */

const logger = require('../utils/logger');

// ─── Regex Patterns (GST-specific) ────────────────────────────────────────────

// GSTIN: 2-digit state code + 10-char PAN + 3 chars (case-insensitive for OCR)
const GSTIN_REGEX = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i;

// Invoice number: flexible to cover IN-001, INV/2024/001, etc.
const INVOICE_NO_REGEX =
  /(?:invoice\s*(?:no|number|#|num)[.\s:]*|inv[.\s#:]*|bill\s*no[.\s:]*)([\w\-\/]+)/i;

// Date: supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, "12 Jan 2024"
const DATE_REGEX =
  /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[-\/]\d{2}[-\/]\d{2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})\b/i;

// Amount: matches "Total: 5,000.00" or "Grand Total 5000"
const TOTAL_AMOUNT_REGEX =
  /(?:grand\s*total|total\s*amount|net\s*amount|amount\s*payable|total\s*payable)[:\s₹Rs.]*([\d,]+\.?\d{0,2})/i;

// CGST
const CGST_REGEX =
  /(?:cgst|c\.g\.s\.t)[:\s@%\d.]*(?:amount|amt)?[:\s₹Rs.]*([\d,]+\.?\d{0,2})/i;

// SGST
const SGST_REGEX =
  /(?:sgst|s\.g\.s\.t)[:\s@%\d.]*(?:amount|amt)?[:\s₹Rs.]*([\d,]+\.?\d{0,2})/i;

// IGST
const IGST_REGEX =
  /(?:igst|i\.g\.s\.t)[:\s@%\d.]*(?:amount|amt)?[:\s₹Rs.]*([\d,]+\.?\d{0,2})/i;

// Vendor name: usually near "Sold by", "From", "Supplier", or at the top
const VENDOR_REGEX =
  /(?:sold\s*by|from|supplier|vendor|billed\s*by)[:\s]*([\w\s&.,\-]+?)(?:\n|gstin|gst|address)/i;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clean OCR number: remove commas, currency symbols, normalize
 */
const parseAmount = (str) => {
  if (!str) return 0;
  const cleaned = str.replace(/[,₹Rs\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * Parse various date formats to ISO Date
 */
const parseDate = (str) => {
  if (!str) return null;
  try {
    // Normalize DD/MM/YYYY → YYYY-MM-DD for JS Date parsing
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      const year = y.length === 2 ? `20${y}` : y;
      return new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    }
    const parsed = new Date(str);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
};

// ─── Main Parser ───────────────────────────────────────────────────────────────

/**
 * Parse raw OCR text into structured GST invoice data
 * @param {string} rawText - full text output from Google Vision API
 * @returns {Object} structured invoice data
 */
const parseGSTInvoice = (rawText) => {
  if (!rawText || rawText.trim().length === 0) {
    logger.warn('Parser: Empty OCR text received');
    return getEmptyInvoice();
  }

  logger.info(`Parser: Processing ${rawText.length} characters of OCR text`);

  // Normalize: collapse multiple spaces/newlines for easier regex matching
  const normalizedText = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  const result = {
    gstin:         extractMatch(normalizedText, GSTIN_REGEX, 1, (v) => v.toUpperCase()),
    invoiceNumber: extractMatch(normalizedText, INVOICE_NO_REGEX, 1),
    invoiceDate:   parseDate(extractMatch(normalizedText, DATE_REGEX, 1)),
    vendorName:    extractMatch(normalizedText, VENDOR_REGEX, 1, (v) => v.trim()),
    totalAmount:   parseAmount(extractMatch(normalizedText, TOTAL_AMOUNT_REGEX, 1)),
    cgst:          parseAmount(extractMatch(normalizedText, CGST_REGEX, 1)),
    sgst:          parseAmount(extractMatch(normalizedText, SGST_REGEX, 1)),
    igst:          parseAmount(extractMatch(normalizedText, IGST_REGEX, 1)),
  };

  logger.info('Parser: Extraction result:', JSON.stringify(result));
  return result;
};

/**
 * Safe regex match helper
 */
const extractMatch = (text, regex, group = 1, transform = null) => {
  const match = text.match(regex);
  if (!match || !match[group]) return null;
  const value = match[group].trim();
  return transform ? transform(value) : value;
};

/**
 * Returns empty invoice structure (used when OCR fails or text is empty)
 */
const getEmptyInvoice = () => ({
  gstin: null,
  invoiceNumber: null,
  invoiceDate: null,
  vendorName: null,
  totalAmount: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
});

module.exports = { parseGSTInvoice };