import crypto from 'crypto';

/**
 * Cache Key & Query Normalization Utilities
 */

/**
 * Normalizes query string for robust cache matching:
 * - Trims leading/trailing whitespace
 * - Collapses repeated spaces into a single space
 * - Lowercases characters
 * - Strips harmless ending punctuation like '?', '!', '.'
 *
 * Example: "  What is the minimum attendance requirement?  "
 * -> "what is the minimum attendance requirement"
 *
 * @param {string} query
 * @returns {string} Normalized query
 */
export const normalizeQuery = (query) => {
  if (!query || typeof query !== 'string') return '';
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[?!.]+$/, '')
    .trim();
};

/**
 * Generates SHA-256 hash of normalized query
 * @param {string} normalizedQuery
 * @returns {string} Hex hash string
 */
export const hashQuery = (normalizedQuery) => {
  return crypto.createHash('sha256').update(normalizedQuery).digest('hex');
};

/**
 * Determines whether a query is safe for shared/public caching
 * Queries with personal identifiers ("my attendance", "my grades", "my fee balance")
 * must never be shared across users in public or semantic cache.
 *
 * @param {string} query
 * @param {object} [context={}]
 * @returns {boolean}
 */
export const isSemanticCacheEligible = (query, context = {}) => {
  if (!query || typeof query !== 'string') return false;

  const lower = query.toLowerCase();
  
  // Conservative safety check: personal / private queries bypass shared semantic cache
  const personalKeywords = [
    'my attendance',
    'my grade',
    'my grades',
    'my fee',
    'my fees',
    'my balance',
    'my cgpa',
    'my gpa',
    'my marks',
    'my transcript',
    'my roll',
    'my result',
    'my results',
    'my profile',
    'my account',
    'my password',
  ];

  for (const keyword of personalKeywords) {
    if (lower.includes(keyword)) {
      return false;
    }
  }

  // If query explicitly requests private documents or user-scoped retrieval
  if (context.isPrivate || context.scope === 'user') {
    return false;
  }

  return true;
};

/**
 * Constructs structured exact cache key
 * Format:
 *   Public: rag:v{version}:public:{hash}
 *   User:   rag:v{version}:user:{userId}:{hash}
 *
 * @param {object} params
 * @param {string} params.query
 * @param {string|number} params.version
 * @param {string} [params.userId]
 * @param {boolean} [params.isPublic=true]
 * @returns {{ key: string, normalizedQuery: string, hash: string }}
 */
export const getExactCacheKey = ({ query, version = 1, userId = null, isPublic = true }) => {
  const normalized = normalizeQuery(query);
  const hash = hashQuery(normalized);

  const scopePrefix = isPublic || !userId ? 'public' : `user:${userId}`;
  const key = `rag:v${version}:${scopePrefix}:${hash}`;

  return {
    key,
    normalizedQuery: normalized,
    hash,
  };
};

export default {
  normalizeQuery,
  hashQuery,
  isSemanticCacheEligible,
  getExactCacheKey,
};
