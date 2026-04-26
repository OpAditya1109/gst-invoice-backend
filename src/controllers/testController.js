const User = require('../models/User');
const { sendExpoPush } = require('../services/notificationService');

const sendTestNotification = async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user.deviceToken) {
    return res.json({ message: "No device token" });
  }

  await sendExpoPush(
    user.deviceToken,
    "Test Notification 🚀",
    "Your notification system is working!"
  );

  res.json({ success: true });
};

module.exports = { sendTestNotification };