import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

/**
 * Connect to MongoDB database with optimized connection pool for high concurrency
 */
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 100,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected Successfully (${conn.connection.host}) [Pool Size: 10-100]`);
    return conn;
  } catch (error) {
    console.log(`⚠️  MongoDB Connection Notice: ${error.message}`);
    return null;
  }
};

