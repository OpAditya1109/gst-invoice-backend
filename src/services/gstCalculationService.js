/**
 * services/gstCalculationService.js — GST Business Logic
 *
 * Computes:
 *  - Transaction type (intra-state vs inter-state)
 *  - Total GST
 *  - ITC eligibility
 *  - Monthly GST payable = Output GST - Input GST
 */

/**
 * Calculate GST fields from parsed invoice data
 * @param {Object} invoiceData - { cgst, sgst, igst, gstin, invoiceType }
 * @returns {Object} enriched GST calculation result
 */
const calculateGST = (invoiceData) => {
  const { cgst = 0, sgst = 0, igst = 0 } = invoiceData;

  // Determine transaction type
  // Rule: If CGST + SGST present → intra-state; if IGST → inter-state
  let transactionType = 'unknown';
  if (cgst > 0 || sgst > 0) {
    transactionType = 'intra-state';
  } else if (igst > 0) {
    transactionType = 'inter-state';
  }

  // Total GST
  const totalGst = transactionType === 'inter-state'
    ? igst
    : cgst + sgst;

  // Basic ITC eligibility logic
  // In production: add blocked credit categories (Section 17(5) of CGST Act)
  const itcEligible = determineITCEligibility(invoiceData);

  return {
    transactionType,
    totalGst: parseFloat(totalGst.toFixed(2)),
    itcEligible,
  };
};

/**
 * Determine ITC eligibility (simplified)
 * Full implementation would check:
 *  - Section 17(5) blocked credits (motor vehicles, food, club memberships etc.)
 *  - Supplier GSTIN validity
 *  - Whether supplier filed GSTR-1
 *
 * @param {Object} invoice
 * @returns {boolean}
 */
const determineITCEligibility = (invoice) => {
  // Rule 1: Must have valid GSTIN
  if (!invoice.gstin) return false;

  // Rule 2: Only input invoices (purchases) have ITC
  if (invoice.invoiceType === 'output') return false;

  // Rule 3: Must have GST amount > 0
  const totalGst = (invoice.cgst || 0) + (invoice.sgst || 0) + (invoice.igst || 0);
  if (totalGst <= 0) return false;

  // Default: eligible (add more specific rules as needed)
  return true;
};

/**
 * Calculate monthly GST summary from a list of invoices
 * @param {Array} invoices - Invoice documents from DB
 * @returns {Object} monthly summary
 */
const calculateMonthlySummary = (invoices) => {
  let inputGST = 0;   // GST paid on purchases (ITC)
  let outputGST = 0;  // GST collected on sales

  invoices.forEach((inv) => {
    const gstAmount = inv.totalGst || 0;

    if (inv.invoiceType === 'input' && inv.itcEligible) {
      inputGST += gstAmount;
    } else if (inv.invoiceType === 'output') {
      outputGST += gstAmount;
    }
  });

  // GST Payable = Output GST - Input GST (ITC offset)
  const gstPayable = Math.max(0, outputGST - inputGST);
  const itcCarryForward = Math.max(0, inputGST - outputGST);

  return {
    inputGST: parseFloat(inputGST.toFixed(2)),
    outputGST: parseFloat(outputGST.toFixed(2)),
    gstPayable: parseFloat(gstPayable.toFixed(2)),
    itcCarryForward: parseFloat(itcCarryForward.toFixed(2)),
    totalInvoices: invoices.length,
  };
};

module.exports = { calculateGST, calculateMonthlySummary };