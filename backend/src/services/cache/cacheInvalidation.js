import cacheService from './cacheService.js';

const CACHE_VERSION_KEY = 'rag:config:cache_version';
let inMemoryVersionFallback = 1;

/**
 * Cache Invalidation Service
 * Implements Versioned Cache Namespace Strategy:
 * When documents change (upload, re-index, delete) or admin requests invalidation,
 * we bump the cache version in Redis (e.g., v1 -> v2).
 * All new requests read from the new namespace, while old keys naturally expire via TTL.
 */
class CacheInvalidationService {
  /**
   * Get the active cache version
   * @returns {Promise<number>}
   */
  async getCacheVersion() {
    try {
      const rawVersion = await cacheService.get(CACHE_VERSION_KEY);
      if (rawVersion) {
        const parsed = parseInt(rawVersion, 10);
        if (!isNaN(parsed) && parsed > 0) {
          inMemoryVersionFallback = parsed;
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`[CACHE] Could not fetch cache version from Redis, using fallback: ${err.message}`);
    }
    return inMemoryVersionFallback;
  }

  /**
   * Alias for getCacheVersion
   */
  async getCurrentCacheVersion() {
    return this.getCacheVersion();
  }

  /**
   * Bump cache version in Redis to invalidate all current caches
   * @param {string} [reason='Manual Invalidation']
   * @returns {Promise<number>} New version number
   */
  async incrementCacheVersion(reason = 'Manual Invalidation') {
    try {
      let newVersion = await cacheService.increment(CACHE_VERSION_KEY);
      if (!newVersion) {
        inMemoryVersionFallback += 1;
        newVersion = inMemoryVersionFallback;
        await cacheService.set(CACHE_VERSION_KEY, String(newVersion));
      } else {
        inMemoryVersionFallback = newVersion;
      }

      console.log(`[RAG CACHE] invalidated (${reason}). Cache version bumped to v${newVersion}`);
      return newVersion;
    } catch (err) {
      inMemoryVersionFallback += 1;
      console.warn(`[RAG CACHE] Invalidation error, bumped in-memory fallback to v${inMemoryVersionFallback}: ${err.message}`);
      return inMemoryVersionFallback;
    }
  }

  /**
   * Full cache invalidation triggered by Admin or Document lifecycle
   * @param {string} [reason]
   * @returns {Promise<{ success: boolean, oldVersion: number, newVersion: number, reason: string }>}
   */
  async invalidateRagCache(reason = 'Admin Invalidation') {
    const oldVersion = await this.getCacheVersion();
    const newVersion = await this.incrementCacheVersion(reason);
    return {
      success: true,
      oldVersion,
      newVersion,
      reason,
      timestamp: new Date().toISOString(),
    };
  }
}

export const cacheInvalidation = new CacheInvalidationService();
export default cacheInvalidation;
