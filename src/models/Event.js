const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  event: { type: String, required: true },
  metadata: { type: Object },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Event', EventSchema);  