const express = require('express');
const { downloadGSTReport } = require('../controllers/reportController');

const router = express.Router();

router.get('/gst-report', downloadGSTReport);

module.exports = router;