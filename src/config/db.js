import dotenv from 'dotenv';
dotenv.config();

import dns from 'dns';
import mongoose from 'mongoose';

// Ensure reliable DNS resolution for MongoDB Atlas SRV strings
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (dnsErr) {
  // Gracefully fallback if setServers is restricted in current runtime
}

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
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    };

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.warn("⚠️ MONGODB_URI is not defined in environment variables.");
      return null;
    }

    cached.promise = mongoose.connect(mongoUri, opts).then((m) => {
      console.log(`✅ MongoDB Connected Successfully (${m.connection.host}, db: ${m.connection.name})`);
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

