import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { getRedisStatus } from './config/redis.js';
import { getCollectionInfo } from './services/vector/qdrantService.js';

const app = express();

// Security HTTP headers
app.use(helmet());

// Cross-Origin Resource Sharing
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman) or matched allowed origins / local dev ports
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check API - Multi-service status monitoring
app.get('/api/health', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'ok' : 'error';
  const redisRaw = getRedisStatus();
  const redisStatus = redisRaw === 'ok' || redisRaw === 'mock_connected' ? 'ok' : 'error';

  let qdrantStatus = 'ok';
  try {
    await getCollectionInfo();
  } catch (err) {
    qdrantStatus = 'error';
  }

  return res.status(200).json({
    success: true,
    api: 'ok',
    mongodb: mongoStatus,
    redis: redisStatus,
    qdrant: qdrantStatus,
    phase: 'Phase 4 - Redis Caching, Semantic Caching & Rate Limiting',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    data: {
      api: 'ok',
      mongodb: mongoStatus,
      redis: redisStatus,
      qdrant: qdrantStatus,
      phase: 'Phase 4 - Redis Caching, Semantic Caching & Rate Limiting',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// 404 & Centralized Error Handlers
app.use(notFound);
app.use(errorHandler);

export default app;
