import { generateEmbedding } from '../ai/embeddingService.js';
import { searchPoints } from '../vector/qdrantService.js';

/**
 * Build Qdrant filter object from query analysis
 * @param {object} filterOptions - Optional metadata criteria
 * @returns {object|null} Qdrant filter syntax or null
 */
export const buildQdrantFilter = (filterOptions = {}) => {
  const must = [];

  if (filterOptions.category) {
    must.push({
      key: 'category',
      match: { value: filterOptions.category },
    });
  }

  if (filterOptions.department && filterOptions.department !== 'General') {
    must.push({
      key: 'department',
      match: { value: filterOptions.department },
    });
  }

  if (filterOptions.documentType) {
    must.push({
      key: 'documentType',
      match: { value: filterOptions.documentType },
    });
  }

  if (filterOptions.year) {
    must.push({
      key: 'year',
      match: { value: filterOptions.year },
    });
  }

  return must.length > 0 ? { must } : null;
};

/**
 * Retrieve candidates using Dense Vector Similarity Search
 * @param {string} query - Student inquiry
 * @param {object} options - Options (limit, scoreThreshold, filters)
 * @returns {Promise<Array<object>>} Common retrieval candidates
 */
export const retrieveVectorCandidates = async (query, options = {}) => {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  const cleanQuery = query.trim();
  const limit = options.limit || parseInt(process.env.RAG_VECTOR_TOP_K, 10) || 20;
  const scoreThreshold = options.scoreThreshold ?? parseFloat(process.env.RAG_MIN_SCORE || '0.35');

  try {
    // 1. Generate dense query embedding
    const queryVector = await generateEmbedding(cleanQuery);

    // 2. Build optional filter
    let qdrantFilter = options.filter || null;
    if (!qdrantFilter && options.filters) {
      qdrantFilter = buildQdrantFilter(options.filters);
    }

    // 3. Search points in Qdrant (with filter, then fallback to unfiltered if 0 hits or filter error)
    let hits = [];
    if (qdrantFilter) {
      try {
        hits = await searchPoints(queryVector, {
          limit,
          scoreThreshold,
          filter: qdrantFilter,
        });
      } catch (filterErr) {
        console.warn(`[VECTOR RETRIEVER] Filtered search error: ${filterErr.message}. Retrying unfiltered...`);
        hits = [];
      }
    }

    if (!hits || hits.length === 0) {
      hits = await searchPoints(queryVector, {
        limit,
        scoreThreshold,
        filter: null,
      });
    }

    console.log(`[VECTOR RETRIEVER] Retrieved ${hits.length} candidates (threshold: ${scoreThreshold})`);

    // 4. Transform to common representation and filter inactive versions
    const activeHits = hits.filter((h) => {
      if (options.includeInactive === true) return true;
      if (h.payload?.isActive === false) return false;
      // Phase 7: For automated website-crawled documents, strictly restrict to 2025-26
      if (h.payload?.sourceType === 'website' && h.payload?.academicYear && h.payload?.academicYear !== '2025-26') {
        return false;
      }
      // Phase 7: Exclude non-student scopes from default student RAG if specified
      if (options.studentKnowledgeBaseOnly !== false && h.payload?.knowledgeBaseScope === 'administrative') {
        return false;
      }
      return true;
    });

    return activeHits.map((hit, rank) => ({
      chunkId: hit.id || `vec-${rank}`,
      documentId: hit.payload?.documentId || '',
      documentVersionId: hit.payload?.documentVersionId || '',
      documentTitle: hit.payload?.documentTitle || 'University Document',
      category: hit.payload?.category || 'general',
      department: hit.payload?.department || 'General',
      documentType: hit.payload?.documentType || 'regulation',
      sourceType: hit.payload?.sourceType || 'upload',
      sourceAuthority: hit.payload?.sourceAuthority || 'official',
      year: hit.payload?.year || null,
      academicYear: hit.payload?.academicYear || null,
      pageNumber: hit.payload?.pageNumber || 1,
      chunkIndex: hit.payload?.chunkIndex ?? rank,
      text: hit.payload?.text || '',
      sourceUrl: hit.payload?.sourceUrl || '',
      sourcePageUrl: hit.payload?.sourcePageUrl || '',
      knowledgeBaseScope: hit.payload?.knowledgeBaseScope || 'student',
      score: hit.score,
      scoreType: 'vector',
      vectorRank: rank + 1,
    }));
  } catch (error) {
    console.error(`[VECTOR RETRIEVER ERROR] Vector retrieval failed: ${error.message}`);
    // Don't crash entire pipeline; return empty candidate set so keyword retrieval can continue
    return [];
  }
};

export default {
  retrieveVectorCandidates,
  buildQdrantFilter,
};
