const express = require('express');
const router = express.Router();

const {
  getPlans,
  getCurrentPlan,
  subscribe,
  contactSales,
} = require('../controllers/planController');

const { protect: auth } = require('../middleware/auth');
// Public
router.get('/', getPlans);

// Protected
router.get('/current', auth, getCurrentPlan);
router.post('/subscribe', auth, subscribe);

// Optional auth
router.post('/contact-sales', contactSales);

module.exports = router;