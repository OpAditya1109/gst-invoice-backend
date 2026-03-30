/**
 * routes/invoice.routes.js — Invoice API routes
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const {
  uploadInvoice,
  getInvoices,
  getSummary,
  editInvoice,
  deleteInvoice,
} = require('../controllers/invoiceController');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ─── Multer Configuration ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const uniqueName = `invoice_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueName}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP and PDF files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024 },
});

// ─── Routes (all protected) ───────────────────────────────────────────────────
router.use(protect); // All invoice routes require authentication

router.post('/upload', upload.single('invoice'), uploadInvoice);
router.get('/', getInvoices);
router.get('/summary', getSummary);
router.put('/:id', editInvoice);
router.delete('/:id', deleteInvoice);

module.exports = router;