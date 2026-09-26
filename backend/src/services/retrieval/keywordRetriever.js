import Chunk from '../../models/Chunk.js';

/**
 * Tokenize text preserving technical tokens (regulation numbers like 4.2.3, course codes like CS302, years)
 * @param {string} text - Input text
 * @returns {string[]} Array of normalized tokens
 */
export const tokenize = (text) => {
  if (!text || typeof text !== 'string') return [];

  // Match:
  // 1. Technical codes/regulations: e.g. "4.2.3", "CS302", "CS-401"
  // 2. Alphanumeric words (length >= 2)
  const tokens = [];
  const regex = /\b[A-Za-z]+[-_]?[0-9]+(?:\.[0-9]+)*\b|\b[0-9]+(?:\.[0-9]+)+\b|\b[A-Za-z0-9_]{2,}\b/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0].toLowerCase());
  }

  return tokens;
};

/**
 * In-memory BM25 Index Structure
 */
class BM25Index {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.documents = []; // Array of chunk objects
    this.docLengths = []; // Length in tokens for each doc
    this.avgDocLength = 0;
    this.docCount = 0;
    this.termFreqs = []; // Array of Map<term, count> per doc
    this.invertedIndex = new Map(); // term -> Set of docIndices
  }

  /**
   * Build index from array of chunk records
   * @param {Array<object>} chunks
   */
  build(chunks) {
    this.documents = chunks;
    this.docCount = chunks.length;
    this.docLengths = new Array(this.docCount);
    this.termFreqs = new Array(this.docCount);
    this.invertedIndex.clear();

    let totalLength = 0;

    for (let i = 0; i < this.docCount; i++) {
      const chunk = chunks[i];
      const tokens = tokenize(chunk.text + ' ' + (chunk.documentTitle || ''));
      const length = tokens.length;
      this.docLengths[i] = length;
      totalLength += length;

      const tf = new Map();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);

        let posting = this.invertedIndex.get(t);
        if (!posting) {
          posting = new Set();
          this.invertedIndex.set(t, posting);
        }
        posting.add(i);
      }
      this.termFreqs[i] = tf;
    }

    this.avgDocLength = this.docCount > 0 ? totalLength / this.docCount : 0;
  }

  /**
   * Score all documents matching query terms using BM25
   * @param {string[]} queryTokens
   * @param {object} analysis - query analysis metadata (regulationNumber, exactPhrases, courseCode)
   * @param {object} filterOptions - category, department, etc.
   * @returns {Array<{ index: number, score: number }>}
   */
  search(queryTokens, analysis = {}, filterOptions = {}) {
    if (this.docCount === 0 || queryTokens.length === 0) return [];

    const scores = new Map();

    for (const token of queryTokens) {
      const posting = this.invertedIndex.get(token);
      if (!posting) continue;

      const n = posting.size; // Document frequency
      // Robertson-Spärck Jones IDF formula
      const idf = Math.log((this.docCount - n + 0.5) / (n + 0.5) + 1);

      for (const docIdx of posting) {
        const doc = this.documents[docIdx];

        if (filterOptions.includeInactive !== true && doc.isActive === false) continue;
        // Phase 7: For automated website-crawled documents, strictly restrict to 2025-26
        if (doc.sourceType === 'website' && doc.academicYear && doc.academicYear !== '2025-26') continue;

        // Apply metadata filters if provided
        if (filterOptions.category && doc.category !== filterOptions.category) continue;
        if (filterOptions.department && filterOptions.department !== 'General' && doc.department !== filterOptions.department) continue;
        if (filterOptions.documentType && doc.documentType !== filterOptions.documentType) continue;
        if (filterOptions.year && doc.year && doc.year !== filterOptions.year) continue;

        const tf = this.termFreqs[docIdx].get(token) || 0;
        const dl = this.docLengths[docIdx];
        const denom = tf + this.k1 * (1 - this.b + this.b * (dl / (this.avgDocLength || 1)));
        const termScore = idf * ((tf * (this.k1 + 1)) / denom);

        scores.set(docIdx, (scores.get(docIdx) || 0) + termScore);
      }
    }

    // Boost scores for exact phrases, regulation numbers, or course codes
    const candidates = [];
    for (const [docIdx, bm25Score] of scores.entries()) {
      let finalScore = bm25Score;
      const doc = this.documents[docIdx];
      const docTextLower = (doc.text + ' ' + (doc.documentTitle || '')).toLowerCase();

      // Bonus for exact regulation number match (e.g. "4.2.3" or "1.1")
      if (analysis.regulationNumber) {
        const regLower = analysis.regulationNumber.toLowerCase();
        if (docTextLower.includes(regLower)) {
          finalScore += 8.0; // Significant lexical boost for exact regulation
        }
      }

      // Bonus for exact course code match (e.g. "CS302")
      if (analysis.courseCode) {
        const codeLower = analysis.courseCode.toLowerCase();
        if (docTextLower.includes(codeLower)) {
          finalScore += 6.0;
        }
      }

      // Bonus for exact phrases
      if (analysis.exactPhrases && analysis.exactPhrases.length > 0) {
        for (const phrase of analysis.exactPhrases) {
          if (docTextLower.includes(phrase.toLowerCase())) {
            finalScore += 4.0;
          }
        }
      }

      candidates.push({ docIdx, score: finalScore });
    }

    // Sort descending by score
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }
}

// Singleton in-memory index
const globalBM25Index = new BM25Index();
let isIndexBuilt = false;
let lastIndexTime = 0;
let syncPromise = null;

/**
 * Ensure index is loaded with chunks from MongoDB
 */
export const syncBM25Index = async (force = false) => {
  const now = Date.now();
  // Throttle re-indexing to every 60 seconds unless forced
  if (isIndexBuilt && !force && now - lastIndexTime < 60000) {
    return;
  }

  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    try {
      const chunks = await Chunk.find({ isActive: { $ne: false } }).lean();
      globalBM25Index.build(chunks);
      isIndexBuilt = true;
      lastIndexTime = Date.now();
      console.log(`[KEYWORD RETRIEVER] BM25 Index synchronized: ${chunks.length} chunk(s) indexed.`);
    } catch (err) {
      console.error(`[KEYWORD RETRIEVER ERROR] Failed to sync BM25 index: ${err.message}`);
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
};

/**
 * Retrieve candidates using BM25 Lexical Keyword Search
 * @param {string} query - Student inquiry
 * @param {object} analysis - Extracted signals from queryAnalyzer
 * @param {object} options - Retrieval options (limit, filters)
 * @returns {Promise<Array<object>>} Common retrieval candidates
 */
export const retrieveKeywordCandidates = async (query, analysis = {}, options = {}) => {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  await syncBM25Index();

  const limit = options.limit || parseInt(process.env.RAG_KEYWORD_TOP_K, 10) || 20;
  const tokens = tokenize(analysis.searchQuery || query);

  // If query analysis detected extra exact phrases, tokenize them too
  if (analysis.exactPhrases) {
    for (const phrase of analysis.exactPhrases) {
      tokens.push(...tokenize(phrase));
    }
  }

  const uniqueTokens = [...new Set(tokens)];
  const filters = options.filters || {};

  let matches = globalBM25Index.search(uniqueTokens, analysis, filters);

  // Fallback: If filtered search returned zero matches but filters were specified, retry without filters
  if (matches.length === 0 && filters && Object.keys(filters).length > 0) {
    console.log('[KEYWORD RETRIEVER] Filtered search produced 0 matches. Retrying without restrictive filter...');
    matches = globalBM25Index.search(uniqueTokens, analysis, {});
  }

  const topMatches = matches.slice(0, limit);

  console.log(`[KEYWORD RETRIEVER] Retrieved ${topMatches.length} candidates (BM25 top score: ${topMatches[0]?.score?.toFixed(2) || 0})`);

  return topMatches.map((match, rank) => {
    const doc = globalBM25Index.documents[match.docIdx];
    return {
      chunkId: doc.qdrantPointId || doc._id?.toString() || `kw-${rank}`,
      documentId: doc.documentId?.toString() || '',
      documentTitle: doc.documentTitle || 'University Document',
      category: doc.category || 'general',
      department: doc.department || 'General',
      documentType: doc.documentType || 'regulation',
      sourceType: doc.sourceType || 'upload',
      year: doc.year || null,
      academicYear: doc.academicYear || null,
      pageNumber: doc.pageNumber || 1,
      chunkIndex: doc.chunkIndex ?? rank,
      text: doc.text || '',
      sourceUrl: doc.sourceUrl || '',
      sourcePageUrl: doc.sourcePageUrl || '',
      knowledgeBaseScope: doc.knowledgeBaseScope || 'student',
      score: match.score,
      scoreType: 'keyword',
      keywordRank: rank + 1,
    };
  });
};

export const searchKeywords = (query, limit = 20) => retrieveKeywordCandidates(query, {}, { limit });

export default {
  retrieveKeywordCandidates,
  searchKeywords,
  syncBM25Index,
  tokenize,
};
