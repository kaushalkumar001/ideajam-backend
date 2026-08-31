import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

/**
 * Connect to MongoDB database with optimized connection pool & serverless caching
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.warn("⚠️ MONGODB_URI is not defined in environment variables.");
      return null;
    }

    cached.promise = mongoose.connect(mongoUri, opts).then((m) => {
      console.log(`✅ MongoDB Connected Successfully (${m.connection.host})`);
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error("⚠️ MongoDB Connection Error:", e.message);
  }

  return cached.conn;
};
