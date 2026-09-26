import cacheService from './cacheService.js';
import { generateEmbedding } from '../ai/embeddingService.js';
import { normalizeQuery, isSemanticCacheEligible } from './cacheKey.js';
import crypto from 'crypto';

const DEFAULT_THRESHOLD = parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD || '0.88');
const DEFAULT_TTL_SECONDS = parseInt(process.env.RAG_CACHE_TTL_SECONDS || '3600', 10);
const MAX_ENTRIES = parseInt(process.env.SEMANTIC_CACHE_MAX_ENTRIES || '100', 10);

/**
 * Compute cosine similarity between two numeric vectors
 * @param {number[]} a 
 * @param {number[]} b 
 * @returns {number} Cosine similarity between -1.0 and 1.0
 */
export const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Semantic Query Cache
 * Stores query embeddings and answers for high-similarity reuse without hitting full RAG pipeline
 */
class SemanticCache {
  /**
   * Helper to format index key per version
   * @param {number} version 
   * @returns {string}
   */
  _getIndexKey(version = 1) {
    return `rag:v${version}:semantic:index`;
  }

  /**
   * Find semantically similar cached query
   * @param {object} params
   * @param {string} params.query
   * @param {number[]} [params.queryEmbedding] - Precomputed query embedding if available
   * @param {number} [params.version=1]
   * @param {number} [params.threshold]
   * @returns {Promise<object|null>}
   */
  async findSimilar({ query, queryEmbedding = null, version = 1, threshold = DEFAULT_THRESHOLD }) {
    if (!isSemanticCacheEligible(query)) {
      return null;
    }

    try {
      const indexKey = this._getIndexKey(version);
      const rawIndex = await cacheService.get(indexKey);
      if (!rawIndex) {
        console.log(`[RAG CACHE] semantic MISS (empty index): "${query.slice(0, 45)}..."`);
        await cacheService.incrementMetric('semantic_misses');
        return null;
      }

      let entries = [];
      try {
        entries = JSON.parse(rawIndex);
      } catch (e) {
        return null;
      }

      if (!Array.isArray(entries) || entries.length === 0) {
        await cacheService.incrementMetric('semantic_misses');
        return null;
      }

      // Generate embedding if not already supplied
      const targetEmbedding = queryEmbedding || (await generateEmbedding(query));

      const now = Date.now();
      let bestMatch = null;
      let highestSim = -1;

      // Scan bounded entries list
      for (const entry of entries) {
        // Skip expired entry
        if (entry.expiresAt && now > entry.expiresAt) {
          continue;
        }

        const sim = cosineSimilarity(targetEmbedding, entry.embedding);
        if (sim > highestSim) {
          highestSim = sim;
          bestMatch = entry;
        }
      }

      if (bestMatch && highestSim >= threshold) {
        console.log(
          `[RAG CACHE] semantic HIT (score: ${highestSim.toFixed(4)} >= ${threshold}) for query "${query.slice(0, 40)}" matched "${bestMatch.query.slice(0, 40)}"`
        );
        await cacheService.incrementMetric('semantic_hits');

        return {
          answer: bestMatch.answer,
          sources: bestMatch.sources || [],
          cachedAt: bestMatch.createdAt,
          version,
          cache: {
            hit: true,
            type: 'semantic',
            similarity: parseFloat(highestSim.toFixed(4)),
            threshold,
            matchedQuery: bestMatch.query,
          },
        };
      }

      console.log(
        `[RAG CACHE] semantic MISS for "${query.slice(0, 40)}" (highest sim: ${highestSim.toFixed(4)} < ${threshold})`
      );
      await cacheService.incrementMetric('semantic_misses');
      return null;
    } catch (err) {
      console.warn(`[RAG CACHE] Semantic lookup error: ${err.message}`);
      await cacheService.incrementMetric('cache_bypasses');
      return null;
    }
  }

  /**
   * Store verified query, its embedding, and RAG answer into semantic cache
   * @param {object} params
   * @param {string} params.query
   * @param {number[]} [params.queryEmbedding]
   * @param {object} params.response - Result containing answer and sources
   * @param {number} [params.version=1]
   * @param {number} [params.ttlSeconds]
   * @returns {Promise<boolean>}
   */
  async store({
    query,
    queryEmbedding = null,
    response,
    version = 1,
    ttlSeconds = DEFAULT_TTL_SECONDS,
  }) {
    if (!response || !response.answer || !isSemanticCacheEligible(query)) {
      return false;
    }

    try {
      const targetEmbedding = queryEmbedding || (await generateEmbedding(query));
      const normalized = normalizeQuery(query);
      const indexKey = this._getIndexKey(version);

      let entries = [];
      const rawIndex = await cacheService.get(indexKey);
      if (rawIndex) {
        try {
          entries = JSON.parse(rawIndex);
        } catch (e) {
          entries = [];
        }
      }

      const now = Date.now();
      // Filter out expired items
      entries = entries.filter((e) => !e.expiresAt || now <= e.expiresAt);

      // Check if entry already exists (by normalized query) to avoid redundant duplicates
      const existingIdx = entries.findIndex((e) => e.query === normalized);

      const newEntry = {
        id: crypto.randomBytes(8).toString('hex'),
        query: normalized,
        embedding: targetEmbedding,
        answer: response.answer,
        sources: response.sources || [],
        createdAt: new Date().toISOString(),
        expiresAt: now + ttlSeconds * 1000,
      };

      if (existingIdx >= 0) {
        entries[existingIdx] = newEntry;
      } else {
        // Enforce bounded memory size: if at max capacity, evict oldest entry (FIFO)
        if (entries.length >= MAX_ENTRIES) {
          entries.shift();
        }
        entries.push(newEntry);
      }

      const success = await cacheService.set(indexKey, JSON.stringify(entries), ttlSeconds);
      if (success) {
        console.log(
          `[RAG CACHE] storing response (semantic) for "${normalized.slice(0, 40)}" (active entries: ${entries.length})`
        );
      }
      return success;
    } catch (err) {
      console.warn(`[RAG CACHE] Semantic store error: ${err.message}`);
      return false;
    }
  }
}

export const semanticCache = new SemanticCache();
export default semanticCache;
