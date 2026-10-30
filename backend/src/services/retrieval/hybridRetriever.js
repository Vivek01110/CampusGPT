import { analyzeQuery, expandQuery } from '../query/queryAnalyzer.js';
import { retrieveVectorCandidates } from './vectorRetriever.js';
import { retrieveKeywordCandidates } from './keywordRetriever.js';
import { reciprocalRankFusion } from './fusion.js';
import { rerank } from './reranker.js';
import { generateEmbedding, generateEmbeddings } from '../ai/embeddingService.js';

/**
 * Orchestrates the complete Phase 3 Hybrid Retrieval Pipeline with Multi-Query Expansion:
 * 1. Query Decomposition (Extract intent, entities, requested fields, academic year, confident metadata filters)
 * 2. Query Expansion (Generate 2-4 targeted variants using university terminology)
 * 3. Multi-Query Parallel Vector Search (Qdrant) + Keyword Search (BM25)
 * 4. Reciprocal Rank Fusion (RRF) candidate merge
 * 5. Cross-Feature Reranking
 * 6. Returns final top-K grounded chunks with diagnostics and analysis
 * 
 * @param {string} rawQuery - Student inquiry
 * @param {object} options - Retrieval options (vectorTopK, keywordTopK, finalTopK, filters, enableExpansion)
 * @returns {Promise<{ chunks: Array<object>, diagnostics: object, analysis: object, expandedQueries: Array<string> }>}
 */
export const retrieveHybridContext = async (rawQuery, options = {}) => {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return {
      chunks: [],
      diagnostics: { totalCandidates: 0, finalCount: 0 },
      analysis: {},
      expandedQueries: [],
    };
  }

  const startTime = Date.now();
  console.log(`\n======================================================`);
  console.log(`[RAG] Query: "${rawQuery.trim()}"`);

  // 1. Query Decomposition & Analysis
  const analysis = analyzeQuery(rawQuery);
  // Keep filters non-restrictive to prevent discarding high-relevance cross-year or general policies
  const activeFilters = {
    ...options.filters,
  };

  console.log(`[QUERY ANALYSIS] Intent: ${analysis.intent || 'generic'}`);
  console.log(`[QUERY ANALYSIS] Requested Fields: ${JSON.stringify(analysis.requestedFields)}`);
  console.log(`[QUERY ANALYSIS] Search query: "${analysis.searchQuery}"`);
  console.log(`[QUERY ANALYSIS] Filters: ${JSON.stringify(activeFilters)}`);

  // 2. Query Expansion (2 to 4 variants)
  const expandedQueries = options.enableExpansion !== false ? expandQuery(rawQuery, analysis) : [];
  const retrievalQueries = [analysis.searchQuery || rawQuery, ...expandedQueries].slice(0, 4);

  console.log(`[MULTI-QUERY] Expanded into ${retrievalQueries.length} query variant(s):`);
  retrievalQueries.forEach((q, idx) => console.log(`   [Q${idx + 1}] "${q}"`));

  const vectorLimit = options.vectorTopK || parseInt(process.env.RAG_VECTOR_TOP_K, 10) || 25;
  const keywordLimit = options.keywordTopK || parseInt(process.env.RAG_KEYWORD_TOP_K, 10) || 25;
  const finalLimit = options.finalTopK || parseInt(process.env.RAG_FINAL_TOP_K, 10) || 8;

  // 3. Multi-Query Retrieval across Vector & Keyword Engines
  // Keyword BM25 queries run across all variants in parallel (fast in-memory)
  const keywordPromises = retrievalQueries.map((queryVariant) =>
    retrieveKeywordCandidates(queryVariant, analysis, {
      limit: keywordLimit,
      filters: activeFilters,
    })
  );

  // Vector queries: Reuse precomputed embedding for main query, batch-embed remaining variants in 1 call
  const vectorQueriesToRun = retrievalQueries.slice(0, 2);
  const embeddingsMap = new Map();

  if (options.precomputedEmbedding && Array.isArray(options.precomputedEmbedding) && options.precomputedEmbedding.length > 0) {
    embeddingsMap.set(rawQuery.trim().toLowerCase(), options.precomputedEmbedding);
    if (analysis.searchQuery) {
      embeddingsMap.set(analysis.searchQuery.trim().toLowerCase(), options.precomputedEmbedding);
    }
  }

  const queriesNeedingEmbedding = vectorQueriesToRun.filter(
    (q) => !embeddingsMap.has(q.trim().toLowerCase())
  );

  if (queriesNeedingEmbedding.length > 0) {
    try {
      if (queriesNeedingEmbedding.length === 1) {
        const emb = await generateEmbedding(queriesNeedingEmbedding[0]);
        if (emb) embeddingsMap.set(queriesNeedingEmbedding[0].trim().toLowerCase(), emb);
      } else {
        // Embed query variants in a single batch call
        const embs = await generateEmbeddings(queriesNeedingEmbedding);
        queriesNeedingEmbedding.forEach((q, idx) => {
          if (embs[idx]) embeddingsMap.set(q.trim().toLowerCase(), embs[idx]);
        });
      }
    } catch (embErr) {
      console.warn(`[HYBRID RETRIEVER] Query variant embedding failed: ${embErr.message}`);
    }
  }

  // Execute vector queries in parallel with precomputed vectors
  const vectorPromises = vectorQueriesToRun.map(async (queryVariant) => {
    try {
      const precomputedVector = embeddingsMap.get(queryVariant.trim().toLowerCase()) || null;
      const candidates = await retrieveVectorCandidates(queryVariant, {
        limit: vectorLimit,
        filters: activeFilters,
        precomputedVector,
      });
      return Array.isArray(candidates) ? candidates : [];
    } catch (err) {
      console.warn(`[HYBRID RETRIEVER] Vector search variant failed: ${err.message}`);
      return [];
    }
  });

  // Run keyword and vector searches concurrently
  const [keywordResults, vectorResultBatches] = await Promise.all([
    Promise.all(keywordPromises),
    Promise.all(vectorPromises),
  ]);

  const keywordCandidates = keywordResults.flat();
  const vectorCandidates = vectorResultBatches.flat();

  let combinedVectorCandidates = vectorCandidates;
  let combinedKeywordCandidates = keywordCandidates;

  // Deduplicate before fusion while preserving highest initial scores
  const dedupMap = (candidates) => {
    const map = new Map();
    for (const c of candidates) {
      const key = c.documentId && c.chunkIndex !== undefined ? `${c.documentId}:${c.chunkIndex}` : c.text.slice(0, 100);
      if (!map.has(key) || (c.score && c.score > map.get(key).score)) {
        map.set(key, c);
      }
    }
    return Array.from(map.values());
  };

  const dedupedVector = dedupMap(combinedVectorCandidates);
  const dedupedKeyword = dedupMap(combinedKeywordCandidates);

  console.log(`[MULTI-QUERY POOL] Vector: ${dedupedVector.length} | Keyword: ${dedupedKeyword.length}`);

  // 4. Candidate Fusion via Reciprocal Rank Fusion (RRF)
  const fusedCandidates = reciprocalRankFusion(dedupedVector, dedupedKeyword, {
    k: parseInt(process.env.RAG_RRF_K, 10) || 60,
  });

  console.log(`[HYBRID RRF] Fused Candidates: ${fusedCandidates.length}`);

  // Graceful fallback if strict filters yielded 0 results: try without restrictive category/dept filters
  let candidatesToRerank = fusedCandidates;
  if (candidatesToRerank.length === 0 && Object.keys(activeFilters).length > 0) {
    console.log('[RAG] No candidates found with strict filters. Executing graceful relaxation...');
    const relaxedResults = await Promise.all([
      retrieveVectorCandidates(analysis.searchQuery || rawQuery, { limit: vectorLimit }),
      retrieveKeywordCandidates(rawQuery, analysis, { limit: keywordLimit }),
    ]);
    candidatesToRerank = reciprocalRankFusion(relaxedResults[0], relaxedResults[1], {
      k: parseInt(process.env.RAG_RRF_K, 10) || 60,
    });
    console.log(`[RAG RELAXED] Fused Candidates: ${candidatesToRerank.length}`);
  }

  // 5. Reranking (Cross-feature scorer / Gemini with safe fallback)
  const finalChunks = await rerank(rawQuery, candidatesToRerank, {
    topK: finalLimit,
    provider: process.env.RERANKER_PROVIDER || 'local',
  });

  const durationMs = Date.now() - startTime;
  console.log(`[RERANK] Candidates: ${candidatesToRerank.length} -> Final: ${finalChunks.length} (${durationMs}ms)`);
  console.log(`======================================================\n`);

  const diagnostics = {
    query: rawQuery,
    analyzedSearchQuery: analysis.searchQuery,
    appliedFilters: activeFilters,
    expandedQueries,
    regulationNumber: analysis.regulationNumber,
    courseCode: analysis.courseCode,
    vectorCount: dedupedVector.length,
    keywordCount: dedupedKeyword.length,
    fusedCandidateCount: fusedCandidates.length,
    finalChunkCount: finalChunks.length,
    durationMs,
  };

  return {
    chunks: finalChunks,
    diagnostics,
    analysis,
    expandedQueries,
  };
};

export default {
  retrieveHybridContext,
};
