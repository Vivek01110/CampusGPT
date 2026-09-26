import { getRedisClient, isRedisReady } from '../../config/redis.js';

/**
 * Cache Service - Clean abstraction over Redis commands
 * Provides safe fallback when Redis is offline without crashing callers.
 */
class CacheService {
  /**
   * Get value by key
   * @param {string} key 
   * @returns {Promise<string|null>}
   */
  async get(key) {
    const client = getRedisClient();
    if (!client) return null;
    try {
      return await client.get(key);
    } catch (err) {
      console.warn(`[CACHE WARNING] Failed to GET key "${key}": ${err.message}`);
      return null;
    }
  }

  /**
   * Set value with optional TTL
   * @param {string} key 
   * @param {string} value 
   * @param {number} [ttlSeconds] 
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttlSeconds = null) {
    const client = getRedisClient();
    if (!client) return false;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, value, { EX: Math.floor(ttlSeconds) });
      } else {
        await client.set(key, value);
      }
      return true;
    } catch (err) {
      console.warn(`[CACHE WARNING] Failed to SET key "${key}": ${err.message}`);
      return false;
    }
  }

  /**
   * Delete key
   * @param {string} key 
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    const client = getRedisClient();
    if (!client) return false;
    try {
      const res = await client.del(key);
      return res > 0;
    } catch (err) {
      console.warn(`[CACHE WARNING] Failed to DEL key "${key}": ${err.message}`);
      return false;
    }
  }

  /**
   * Increment key value
   * @param {string} key 
   * @returns {Promise<number|null>}
   */
  async increment(key) {
    const client = getRedisClient();
    if (!client) return null;
    try {
      return await client.incr(key);
    } catch (err) {
      console.warn(`[CACHE WARNING] Failed to INCR key "${key}": ${err.message}`);
      return null;
    }
  }

  /**
   * Set expiration in seconds
   * @param {string} key 
   * @param {number} seconds 
   * @returns {Promise<boolean>}
   */
  async expire(key, seconds) {
    const client = getRedisClient();
    if (!client) return false;
    try {
      const res = await client.expire(key, Math.floor(seconds));
      return res === 1 || res === true;
    } catch (err) {
      console.warn(`[CACHE WARNING] Failed to EXPIRE key "${key}": ${err.message}`);
      return false;
    }
  }

  /**
   * Find keys matching a glob pattern
   * @param {string} pattern 
   * @returns {Promise<string[]>}
   */
  async keys(pattern) {
    const client = getRedisClient();
    if (!client) return [];
    try {
      return await client.keys(pattern);
    } catch (err) {
      console.warn(`[CACHE WARNING] Failed to query KEYS "${pattern}": ${err.message}`);
      return [];
    }
  }

  /**
   * Increment metric counter
   * @param {string} metricName 
   * @param {number} by 
   */
  async incrementMetric(metricName) {
    const fullKey = `metrics:rag:${metricName}`;
    return await this.increment(fullKey);
  }

  /**
   * Read all RAG and rate limit metrics from Redis counters
   * @returns {Promise<object>}
   */
  async getMetrics() {
    const client = getRedisClient();
    const defaultMetrics = {
      exactHits: 0,
      exactMisses: 0,
      semanticHits: 0,
      semanticMisses: 0,
      rateLimitBlocks: 0,
      cacheBypasses: 0,
      exactHitRate: '0.0%',
      semanticHitRate: '0.0%',
      overallHitRate: '0.0%',
      isRedisReady: isRedisReady(),
    };

    if (!client) return defaultMetrics;

    try {
      const [
        exactHitsRaw,
        exactMissesRaw,
        semanticHitsRaw,
        semanticMissesRaw,
        rateLimitBlocksRaw,
        cacheBypassesRaw,
      ] = await Promise.all([
        this.get('metrics:rag:exact_hits'),
        this.get('metrics:rag:exact_misses'),
        this.get('metrics:rag:semantic_hits'),
        this.get('metrics:rag:semantic_misses'),
        this.get('metrics:rag:rate_limit_blocks'),
        this.get('metrics:rag:cache_bypasses'),
      ]);

      const exactHits = parseInt(exactHitsRaw || '0', 10);
      const exactMisses = parseInt(exactMissesRaw || '0', 10);
      const semanticHits = parseInt(semanticHitsRaw || '0', 10);
      const semanticMisses = parseInt(semanticMissesRaw || '0', 10);
      const rateLimitBlocks = parseInt(rateLimitBlocksRaw || '0', 10);
      const cacheBypasses = parseInt(cacheBypassesRaw || '0', 10);

      const totalExactQueries = exactHits + exactMisses;
      const totalSemanticQueries = semanticHits + semanticMisses;
      const totalQueries = exactHits + semanticHits + semanticMisses; // cache lookup total

      const exactHitRate = totalExactQueries > 0 
        ? ((exactHits / totalExactQueries) * 100).toFixed(1) + '%' 
        : '0.0%';

      const semanticHitRate = totalSemanticQueries > 0 
        ? ((semanticHits / totalSemanticQueries) * 100).toFixed(1) + '%' 
        : '0.0%';

      const totalHits = exactHits + semanticHits;
      const overallHitRate = totalQueries > 0 
        ? ((totalHits / totalQueries) * 100).toFixed(1) + '%' 
        : '0.0%';

      return {
        exactHits,
        exactMisses,
        semanticHits,
        semanticMisses,
        rateLimitBlocks,
        cacheBypasses,
        exactHitRate,
        semanticHitRate,
        overallHitRate,
        isRedisReady: isRedisReady(),
      };
    } catch (err) {
      console.warn(`[CACHE WARNING] Failed to read metrics: ${err.message}`);
      return defaultMetrics;
    }
  }
}

export const cacheService = new CacheService();
export default cacheService;
