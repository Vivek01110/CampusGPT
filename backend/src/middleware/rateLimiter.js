import cacheService from '../services/cache/cacheService.js';
import { isRedisReady } from '../config/redis.js';

/**
 * Factory function creating Redis-backed rate limiting middleware
 * Uses fixed/sliding window counters with automatic expiration
 * 
 * @param {object} options
 * @param {string} options.action - Namespace identifier (e.g. 'chat', 'login', 'register')
 * @param {number} [options.windowSeconds=60] - Window duration in seconds
 * @param {number} [options.maxRequests=30] - Max allowed requests within window
 * @returns {import('express').RequestHandler}
 */
export const createRateLimiter = ({
  action = 'general',
  windowSeconds = 60,
  maxRequests = 30,
}) => {
  return async (req, res, next) => {
    // Fail-open: If Redis is offline, allow the request to proceed
    if (!isRedisReady()) {
      return next();
    }

    try {
      // Determine client identifier
      let identifier = 'unknown';
      if (req.user && (req.user._id || req.user.id)) {
        identifier = `user_${req.user._id || req.user.id}`;
      } else {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded
          ? forwarded.split(',')[0].trim()
          : req.ip || req.socket?.remoteAddress || 'unknown';
        identifier = `ip_${ip.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
      }

      const key = `ratelimit:${action}:${identifier}`;

      // Increment counter in Redis
      const current = await cacheService.increment(key);

      // If counter is 1, set window expiration
      if (current === 1) {
        await cacheService.expire(key, windowSeconds);
      }

      // Check if threshold exceeded
      if (current > maxRequests) {
        console.warn(`[RATE LIMIT] blocked ${action} for ${identifier} (${current}/${maxRequests})`);
        await cacheService.incrementMetric('rate_limit_blocks');

        res.set('Retry-After', String(windowSeconds));
        return res.status(429).json({
          success: false,
          message: 'Too many requests. Please try again later.',
        });
      }

      console.log(`[RATE LIMIT] allowed ${action} for ${identifier} (${current}/${maxRequests})`);
      return next();
    } catch (err) {
      console.warn(`[RATE LIMIT] Error in limiter middleware (${err.message}). Failing open.`);
      return next();
    }
  };
};

// Preset rate limiters with environment-configurable thresholds
export const chatRateLimiter = createRateLimiter({
  action: 'chat',
  windowSeconds: parseInt(process.env.CHAT_RATE_LIMIT_WINDOW_SECONDS || '60', 10),
  maxRequests: parseInt(process.env.CHAT_RATE_LIMIT_MAX_REQUESTS || '30', 10),
});

export const authRateLimiter = createRateLimiter({
  action: 'auth',
  windowSeconds: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS || '60', 10),
  maxRequests: parseInt(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS || '10', 10),
});

export default {
  createRateLimiter,
  chatRateLimiter,
  authRateLimiter,
};
