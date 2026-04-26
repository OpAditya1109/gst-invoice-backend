const User = require('../models/User');
const logger = require('../utils/logger');
const trackEvent = require('../utils/trackEvent');
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'INR',
    scanLimit: 5,
    historyMonths: 1,
    features: ['5 invoice scans/month', 'Basic GST calculation', 'PDF & image upload'],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 1499,
    currency: 'INR',
    scanLimit: 50,
    historyMonths: 6,
    features: ['100 invoice scans/month', 'Full GST report export', 'Invoice history (6 months)', 'Email support'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 3999,
    currency: 'INR',
    scanLimit: 250,
    historyMonths: null,
    features: ['500 invoice scans/month', 'Advanced analytics', 'Full invoice history', 'Priority support'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    currency: 'INR',
    scanLimit: null,
    historyMonths: null,
    features: ['Unlimited scans', 'Dedicated account manager', 'Custom integrations'],
  },
};

// ─── GET PLANS ─────────────────────────────
const getPlans = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      plans: Object.values(PLANS),
    });
  } catch (error) {
    logger.error('getPlans error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch plans' });
  }
};

// ─── GET CURRENT PLAN ──────────────────────
const getCurrentPlan = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'plan planExpiresAt monthlyScansUsed'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const planDetails = PLANS[user.plan] || PLANS.free;

    res.status(200).json({
      success: true,
      currentPlan: {
        ...planDetails,
        expiresAt: user.planExpiresAt,
        scansUsed: user.monthlyScansUsed || 0,
        scansRemaining:
          planDetails.scanLimit !== null
            ? Math.max(0, planDetails.scanLimit - (user.monthlyScansUsed || 0))
            : null,
      },
    });
  } catch (error) {
    logger.error('getCurrentPlan error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch current plan' });
  }
};

// ─── SUBSCRIBE ─────────────────────────────
const subscribe = async (req, res) => {
  try {
    const { planId } = req.body;

    if (!planId || !PLANS[planId]) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }

    if (planId === 'enterprise') {
      return res.status(400).json({
        success: false,
        message: 'Contact sales for Enterprise plan',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.plan === planId) {
      return res.status(400).json({
        success: false,
        message: `Already on ${PLANS[planId].name}`,
      });
    }

    const planExpiresAt =
      planId !== 'free'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;

    user.plan = planId;
    user.planExpiresAt = planExpiresAt;
    user.monthlyScansUsed = 0; // ✅ FIXED
    await user.save();

    logger.info(`User ${user._id} subscribed to ${planId}`);
trackEvent(user._id, "plan_subscribed", {
  planId,
  price: PLANS[planId].price,
}).catch(() => {});
    res.status(200).json({
      success: true,
      message: `Subscribed to ${PLANS[planId].name}`,
      plan: {
        ...PLANS[planId],
        expiresAt: planExpiresAt,
      },
    });
  } catch (error) {
    logger.error('subscribe error:', error);
    res.status(500).json({ success: false, message: 'Subscription failed' });
  }
};

// ─── CONTACT SALES ─────────────────────────
const contactSales = async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name & email required' });
    }

    res.status(200).json({
      success: true,
      message: 'Sales team will contact you soon',
    });
  } catch (error) {
    logger.error('contactSales error:', error);
    res.status(500).json({ success: false, message: 'Failed' });
  }
};

// ─── CHECK SCAN LIMIT ──────────────────────
const checkScanLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select(
      'plan monthlyScansUsed planExpiresAt'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const plan = PLANS[user.plan] || PLANS.free;

 // Expiry check
if (user.plan !== 'free' && user.planExpiresAt && new Date() > user.planExpiresAt) {

  // ✅ STORE OLD PLAN FIRST
  const oldPlan = user.plan;

  user.plan = 'free';
  user.monthlyScansUsed = 0;
  await user.save();

  // ✅ USE OLD PLAN
  trackEvent(user._id, "plan_expired", {
    previousPlan: oldPlan,
  }).catch(() => {});

  return res.status(403).json({
    success: false,
    message: 'Plan expired. Upgrade to continue.',
    code: 'PLAN_EXPIRED',
  });
}

    // Unlimited
    if (plan.scanLimit === null) return next();

  if ((user.monthlyScansUsed || 0) >= plan.scanLimit) {
    trackEvent(user._id, "scan_limit_reached", {
  plan: user.plan,
  limit: plan.scanLimit,
  used: user.monthlyScansUsed,
}).catch(() => {});
  return res.status(403).json({
    success: false,
    message: `Limit reached (${plan.scanLimit}/month)`,
    code: 'SCAN_LIMIT_REACHED',
    scansUsed: user.monthlyScansUsed || 0,
    scansTotal: plan.scanLimit,
    planName: plan.name,        // ← add this
    redirect: '/pricing',
  });
}

    next();
  } catch (error) {
    logger.error('checkScanLimit error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getPlans,
  getCurrentPlan,
  subscribe,
  contactSales,
  checkScanLimit,
  PLANS,
};