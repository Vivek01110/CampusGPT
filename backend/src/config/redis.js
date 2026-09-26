import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

let client = null;
let isReady = false;
let connectionAttempted = false;

// Simple in-memory fallback storage when Redis is offline or running tests without daemon
class InMemoryRedisFallback {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    this.counters = new Map();
  }

  _isExpired(key) {
    if (!this.ttls.has(key)) return false;
    if (Date.now() > this.ttls.get(key)) {
      this.store.delete(key);
      this.ttls.delete(key);
      return true;
    }
    return false;
  }

  async get(key) {
    if (this._isExpired(key)) return null;
    return this.store.get(key) || null;
  }

  async set(key, value, options = {}) {
    this.store.set(key, value);
    if (options.EX) {
      this.ttls.set(key, Date.now() + options.EX * 1000);
    }
    return 'OK';
  }

  async del(key) {
    const existed = this.store.has(key);
    this.store.delete(key);
    this.ttls.delete(key);
    this.counters.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key) {
    const existingVal = this.counters.has(key)
      ? this.counters.get(key)
      : parseInt(this.store.get(key), 10) || 0;
    const val = existingVal + 1;
    this.counters.set(key, val);
    this.store.set(key, String(val));
    return val;
  }

  async expire(key, seconds) {
    if (this.store.has(key) || this.counters.has(key)) {
      this.ttls.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  async keys(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matched = [];
    for (const key of this.store.keys()) {
      if (!this._isExpired(key) && regex.test(key)) {
        matched.push(key);
      }
    }
    return matched;
  }

  async ping() {
    return 'PONG';
  }
}

const memoryFallback = new InMemoryRedisFallback();

/**
 * Initialize and connect Redis client
 * @returns {Promise<object>} Redis client or fallback adapter
 */
export const connectRedis = async () => {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const useMock = process.env.REDIS_MOCK === 'true';

  if (useMock) {
    console.log('[REDIS] Mock mode enabled via REDIS_MOCK=true. Using in-memory Redis adapter.');
    isReady = true;
    return memoryFallback;
  }

  if (client && isReady) {
    return client;
  }

  try {
    connectionAttempted = true;
    client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 3000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            console.warn('[REDIS] Reconnection attempts exceeded threshold. Operating in fallback mode.');
            return false; // Stop reconnecting automatically
          }
          return Math.min(retries * 500, 2000);
        },
      },
    });

    client.on('error', (err) => {
      // Do not crash server on ECONNREFUSED
      isReady = false;
      if (err.code === 'ECONNREFUSED') {
        console.warn(`[REDIS] Server unreachable at ${redisUrl} (ECONNREFUSED). Phase 3 RAG will run without cache.`);
      } else {
        console.warn(`[REDIS Warning] ${err.message}`);
      }
    });

    client.on('connect', () => {
      console.log('[REDIS] Socket connected');
    });

    client.on('ready', () => {
      isReady = true;
      console.log(`===============================================`);
      console.log(` [REDIS] Connected successfully to: ${redisUrl.replace(/\/\/[^@]+@/, '//***@')}`);
      console.log(`===============================================`);
    });

    client.on('end', () => {
      isReady = false;
      console.log('[REDIS] Connection ended');
    });

    await client.connect();
    return client;
  } catch (error) {
    isReady = false;
    console.warn(`[REDIS] Unable to connect to Redis (${error.message}). Continuing with graceful cache bypass.`);
    return null;
  }
};

/**
 * Get active Redis client or in-memory fallback
 */
export const getRedisClient = () => {
  if (process.env.REDIS_MOCK === 'true') {
    return memoryFallback;
  }
  return isReady ? client : null;
};

/**
 * Check if Redis is connected and ready
 */
export const isRedisReady = () => {
  if (process.env.REDIS_MOCK === 'true') return true;
  return isReady;
};

/**
 * Get current Redis connection status for health checks
 */
export const getRedisStatus = () => {
  if (process.env.REDIS_MOCK === 'true') return 'mock_connected';
  if (isReady) return 'ok';
  return connectionAttempted ? 'error' : 'disconnected';
};

/**
 * Disconnect Redis gracefully on application shutdown
 */
export const disconnectRedis = async () => {
  if (client) {
    try {
      await client.quit();
    } catch (e) {
      // Ignore disconnect errors during teardown
    }
    client = null;
    isReady = false;
  }
};

export default {
  connectRedis,
  getRedisClient,
  isRedisReady,
  getRedisStatus,
  disconnectRedis,
};
