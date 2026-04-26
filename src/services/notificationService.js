const sendExpoPush = async (expoToken, title, body) => {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: expoToken,
        sound: 'default',
        title,
        body,
      }),
    });
  } catch (err) {
    console.log("Push error:", err.message);
  }
};

module.exports = { sendExpoPush };