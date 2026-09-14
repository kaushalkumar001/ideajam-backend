import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './src/app.js';
import { connectDB } from './src/config/db.js';

const PORT = process.env.PORT || 5000;

// Process level safety handlers
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION! Shutting down gracefully...', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION! At:', promise, 'reason:', reason);
});

// Start Servers
const startServer = async () => {
  // Connect to Database
  await connectDB();

  const server = http.createServer(app);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Port ${PORT} is already in use by another running process.`);
      console.log(`💡 Tip: Close the existing terminal running the backend or change PORT in .env.`);
    } else {
      console.error('❌ Server error:', err.message);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`🚀 Backend Server Started Successfully on http://localhost:${PORT}`);
  });

  // Graceful shutdown handlers
  const shutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}. Closing HTTP server gracefully...`);
    server.close(() => {
      console.log('✅ HTTP server closed successfully.');
      process.exit(0);
    });

    // Force close after 10s if connections stick open
    setTimeout(() => {
      console.error('⚠️  Forced exit after shutdown timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startServer();

