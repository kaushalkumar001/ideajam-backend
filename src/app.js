import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import registrationRoutes from './routes/registrationRoutes.js';
import { connectDB } from './config/db.js';

const app = express();

// Security & Parsing Middlewares
app.disable('x-powered-by');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(morgan('dev'));

// Ensure Database is connected for Serverless / Vercel functions
app.use(async (req, res, next) => {
  try {
    await connectDB();
  } catch (err) {
    console.error("Database connection error:", err.message);
  }
  next();
});

// Test & Root Routes
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🚀 IdeaJam 2026 Backend Server is running successfully!',
    timestamp: new Date().toISOString(),
  });
});

app.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: '✅ Backend Test Route is Working Successfully!',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api', registrationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'IdeaJam 2026 Registration & Notification API',
    timestamp: new Date().toISOString(),
  });
});

// 404 Route
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Duplicate key conflict detected.',
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
  });
});

export default app;

