import app from '../src/app.js';
import connectDB from '../src/config/db.js';
import { connectRedis } from '../src/config/redis.js';

let isInitialized = false;

app.use(async (req, res, next) => {
  if (!isInitialized) {
    try {
      await Promise.allSettled([connectDB(), connectRedis()]);
      isInitialized = true;
    } catch (err) {
      console.error('[Serverless Init Error]', err);
    }
  }
  next();
});

export default app;
