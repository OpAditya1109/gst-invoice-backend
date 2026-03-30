/**
 * server.js — Application entry point
 * Bootstraps Express app, connects to MongoDB, starts HTTP server
 */

require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;
console.log("MINDEE_API_KEY set:", !!process.env.MINDEE_API_KEY);
console.log("First 10 chars:", process.env.MINDEE_API_KEY?.substring(0, 10));
console.log("Length:", process.env.MINDEE_API_KEY?.length);
// Connect to MongoDB then start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  })
  .catch((err) => {
    logger.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  process.exit(0);
});