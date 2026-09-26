import cacheService from './cacheService.js';
import { getExactCacheKey } from './cacheKey.js';

const DEFAULT_TTL_SECONDS = parseInt(process.env.RAG_CACHE_TTL_SECONDS || '3600', 10);

/**
 * Exact Query Cache Service
 * Handles storing and retrieving identical normalized queries in Redis
 */
class ExactQueryCache {
  /**
   * Look up response for exact normalized query
   * @param {object} params
   * @param {string} params.query
   * @param {object} [params.user]
   * @param {number} params.version
   * @param {boolean} [params.isPublic=true]
   * @returns {Promise<object|null>}
   */
  async get({ query, user = null, version = 1, isPublic = true }) {
    try {
      const { key, normalizedQuery } = getExactCacheKey({
        query,
        version,
        userId: user?._id?.toString?.() || user?.id,
        isPublic,
      });

      const cachedRaw = await cacheService.get(key);

      if (!cachedRaw) {
        console.log(`[RAG CACHE] exact MISS: "${normalizedQuery.slice(0, 45)}..."`);
        await cacheService.incrementMetric('exact_misses');
        return null;
      }

      const parsed = JSON.parse(cachedRaw);
      console.log(`[RAG CACHE] exact HIT: "${normalizedQuery.slice(0, 45)}..." (key: ${key})`);
      await cacheService.incrementMetric('exact_hits');

      return {
        ...parsed,
        cache: {
          hit: true,
          type: 'exact',
          key,
        },
      };
    } catch (err) {
      console.warn(`[RAG CACHE] Exact lookup failed: ${err.message}`);
      await cacheService.incrementMetric('cache_bypasses');
      return null;
    }
  }

  /**
   * Store verified successful RAG response into exact cache
   * @param {object} params
   * @param {string} params.query
   * @param {object} [params.user]
   * @param {number} params.version
   * @param {boolean} [params.isPublic=true]
   * @param {object} params.response - Result containing answer and sources
   * @param {number} [params.ttlSeconds]
   * @returns {Promise<boolean>}
   */
  async set({ query, user = null, version = 1, isPublic = true, response, ttlSeconds = DEFAULT_TTL_SECONDS }) {
    if (!response || !response.answer) {
      return false; // Never cache empty or invalid answers
    }

    try {
      const { key, normalizedQuery } = getExactCacheKey({
        query,
        version,
        userId: user?._id?.toString?.() || user?.id,
        isPublic,
      });

      const cachePayload = {
        answer: response.answer,
        sources: response.sources || [],
        cachedAt: new Date().toISOString(),
        version,
        query: normalizedQuery,
      };

      const success = await cacheService.set(key, JSON.stringify(cachePayload), ttlSeconds);
      if (success) {
        console.log(`[RAG CACHE] storing response (exact) for key: ${key}`);
      }
      return success;
    } catch (err) {
      console.warn(`[RAG CACHE] Exact store failed: ${err.message}`);
      return false;
    }
  }
}

export const exactQueryCache = new ExactQueryCache();
export default exactQueryCache;
