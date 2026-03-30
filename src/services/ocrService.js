const mindee = require('mindee');
const logger = require('../utils/logger');

const mindeeClient = new mindee.Client({
  apiKey: process.env.MINDEE_API_KEY,
});

const extractTextFromImage = async (imagePath) => {
  try {
    logger.info(`[OCR] Processing image: ${imagePath}`);

    const inputSource = new mindee.PathInput({ inputPath: imagePath });

    const response = await mindeeClient.enqueueAndGetResult(
      mindee.product.Extraction,
      inputSource,
      {
        modelId: '0a6b0d8b-4adf-4fa6-a1f3-ea34bc3f593c',
      }
    );

    // ✅ USE RAW DATA (IMPORTANT)
    const fields = response.rawHttp.inference.result.fields;

    const structured = extractRequiredFields(fields);

    logger.info('[OCR] FINAL OUTPUT:\n' + JSON.stringify(structured, null, 2));

    return {
      rawText: JSON.stringify(structured),
      confidence: 0.95,
      structured,
    };
  } catch (error) {
    logger.error('[OCR] Error:', error.message);
    throw new Error(`OCR processing failed: ${error.message}`);
  }
};

// ─────────────────────────────────────────────

// ✅ ONLY REQUIRED DATA EXTRACTION
const extractRequiredFields = (fields) => {
  // Basic fields
  const invoiceNumber = fields.invoice_number?.value || null;
  const invoiceDate   = fields.date?.value || null;
  const vendorName    = fields.supplier_name?.value || null;
  const totalAmount   = fields.total_amount?.value || 0;

  // GSTIN
  let gstin =
    fields.supplier_company_registration?.items?.[0]?.fields?.number?.value ||
    null;

  // Fallback regex if needed
  if (!gstin) {
    const allText = JSON.stringify(fields);
    const match = allText.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}\b/);
    gstin = match ? match[0] : null;
  }

  // Taxes
  const taxes = fields.taxes?.items || [];

  let cgst = 0, sgst = 0, igst = 0;

  if (taxes.length >= 2) {
    cgst = taxes[0]?.fields?.amount?.value || 0;
    sgst = taxes[1]?.fields?.amount?.value || 0;
  }

  if (taxes.length >= 3) {
    igst = taxes[2]?.fields?.amount?.value || 0;
  }

  return {
    invoiceNumber,
    invoiceDate,
    vendorName,
    totalAmount,
    gstin,
    cgst,
    sgst,
    igst,
  };
};

module.exports = { extractTextFromImage };