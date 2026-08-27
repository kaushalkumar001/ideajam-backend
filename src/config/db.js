import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

/**
 * Connect to MongoDB database
 */
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ideajam2026', {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(` MongoDB Connected Successfully (${conn.connection.host})`);
    return conn;
  } catch (error) {
    console.log(`⚠️  MongoDB Connection Notice: ${error.message}`);
    return null;
  }
};
