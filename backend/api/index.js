import app from '../src/app.js';
import connectDB from '../src/config/db.js';
import { connectRedis } from '../src/config/redis.js';

let isInitialized = false;

async function init() {
  if (!isInitialized) {
    try {
      await connectDB();
      await connectRedis();
      isInitialized = true;
    } catch (err) {
      console.error('[Serverless Init Error]', err);
    }
  }
}

export default async function handler(req, res) {
  await init();
  return app(req, res);
}
