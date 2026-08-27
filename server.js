import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './src/app.js';
import { connectDB } from './src/config/db.js';

const PORT = process.env.PORT || 5000;

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
};

startServer();
