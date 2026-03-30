/**
 * config/database.js — MongoDB connection using Mongoose
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  await mongoose.connect(uri, {
    // Connection pool for production scalability
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  logger.info(`✅ MongoDB connected: ${mongoose.connection.host}`);

  // Handle connection events
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect...');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err);
  });
};

module.exports = connectDB;