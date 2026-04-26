const Event = require('../models/Event');

const trackEvent = async (userId, event, metadata = {}) => {
  try {
    await Event.create({
      userId,
      event,
      metadata,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("Tracking error:", err.message);
  }
};

module.exports = trackEvent;