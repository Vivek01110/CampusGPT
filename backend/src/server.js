import dotenv from 'dotenv';
dotenv.config();
import dns from "node:dns";
import app from './app.js';
import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';

const PORT = process.env.PORT || 5000;
dns.setServers(["8.8.8.8", "8.8.4.4"]);
// Connect to Database & Cache
await connectDB();
await connectRedis();

// Start Server Listener
const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` AskCampusAi Backend Server Running on Port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health Check: http://localhost:${PORT}/api/health`);
  console.log(`===============================================`);
});

// Process error listeners
process.on('unhandledRejection', (err) => {
  console.error(`[UnhandledRejection] ${err?.message || err}`);
});

process.on('uncaughtException', (err) => {
  console.error(`[UncaughtException] ${err?.message || err}`);
});

export { app, server };
