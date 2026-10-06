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
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Cross-Origin Resource Sharing
const configuredOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    const isExplicitlyAllowed = allowedOrigins.includes(origin) || allowedOrigins.includes('*');
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isCommonDeployment =
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.netlify.app') ||
      origin.endsWith('.onrender.com');

    if (
      isExplicitlyAllowed ||
      isLocalhost ||
      isCommonDeployment ||
      !process.env.NODE_ENV ||
      process.env.NODE_ENV !== 'production'
    ) {
      return callback(null, true);
    }

    console.warn(`[CORS Warning] Origin denied: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check API - Multi-service status monitoring

app.get('/api/wakeuprender', async (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString()
  });

})
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
